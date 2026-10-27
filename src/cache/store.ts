/**
 * 天气数据缓存。
 *
 * 线上用两层：
 *   第一层 Cloudflare Cache API —— 每个机房各一份，读取最快，免费；只放"还新鲜"的数据。
 *   第二层 Workers KV —— 全球共享一份；新鲜数据之外，还保留一段时间的旧数据，供应商出错时兜底。
 *
 * 第一层只存到数据的新鲜截止时间（freshUntil）为止，过期就自然消失，下一次查找会落到 KV：
 * 其他机房刚取过的新数据在 KV 里，直接用，不再请求 Foreca。
 * （以前第一层也保留 6 小时旧数据，过期后代码看到本机房有旧的就直接请求 Foreca，不看 KV，
 *  同一城市在几个机房被访问，过期后就被请求几次。）
 *
 * Cloudflare 官方说明：Cache API 的内容不会复制到其他机房，也不支持分层缓存；KV 写入后其他地方最长约 60 秒可见。
 * 测试和本地开发用内存缓存。
 */

export interface CacheEntry<T> {
  value: T;
  /** 从供应商获取数据的时间（毫秒） */
  fetchedAt: number;
  /** 新鲜截止时间（毫秒）。旧版本写入的数据没有这个字段，由读取方按有效期推算。 */
  freshUntil?: number;
}

export interface PutOptions {
  /** 只写本机房（例如"刚才请求失败"这种短暂的记录，不值得写 KV） */
  localOnly?: boolean;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  /** 跳过本机房，直接读全球共享层（没有共享层时等同 get） */
  getShared<T>(key: string): Promise<CacheEntry<T> | null>;
  /** keepSeconds：共享层保留多久（= 新鲜期 + 允许使用旧数据的时长）。本机房层只保留到 freshUntil。 */
  put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number, options?: PutOptions): Promise<void>;
}

export class MemoryStore implements CacheStore {
  private readonly map = new Map<string, { entry: CacheEntry<unknown>; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.entry as CacheEntry<T>;
  }

  getShared<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.get<T>(key);
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    this.map.set(key, { entry, expiresAt: this.now() + keepSeconds * 1000 });
  }

  get size(): number {
    return this.map.size;
  }
}

export class KvStore implements CacheStore {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      return await this.kv.get<CacheEntry<T>>(key, 'json');
    } catch {
      return null;
    }
  }

  getShared<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.get<T>(key);
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    // KV 要求过期时间至少 60 秒
    await this.kv.put(key, JSON.stringify(entry), { expirationTtl: Math.max(60, Math.ceil(keepSeconds)) });
  }
}

export class CacheApiStore implements CacheStore {
  constructor(private readonly cache: Cache) {}

  private request(key: string): Request {
    return new Request(`https://weather-data.internal/${encodeURIComponent(key)}`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const res = await this.cache.match(this.request(key));
      return res ? ((await res.json()) as CacheEntry<T>) : null;
    } catch {
      return null;
    }
  }

  getShared<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.get<T>(key);
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    const res = new Response(JSON.stringify(entry), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.ceil(keepSeconds)}` },
    });
    await this.cache.put(this.request(key), res);
  }
}

/**
 * 两层缓存：local = 本机房（Cache API），shared = 全球共享（KV）。
 * - 读：本机房有、且还新鲜，直接用；否则读 KV，KV 的数据还新鲜时复制到本机房，存到它的新鲜截止时间为止。
 * - 写：KV 存"新鲜期 + 旧数据兜底期"；本机房只存到新鲜截止时间。
 */
export class TieredStore implements CacheStore {
  constructor(
    private readonly local: CacheStore,
    private readonly shared: CacheStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = await this.local.get<T>(key);
    if (hit && (hit.freshUntil ?? 0) > this.now()) return hit;
    const remote = await this.shared.get<T>(key);
    if (remote) {
      const left = this.freshSeconds(remote);
      if (left > 0) await this.local.put(key, remote, left).catch(() => undefined);
      return remote;
    }
    return hit;
  }

  getShared<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.shared.get<T>(key);
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number, options: PutOptions = {}): Promise<void> {
    const left = this.freshSeconds(entry);
    await Promise.all([
      left > 0 ? this.local.put(key, entry, left).catch(() => undefined) : undefined,
      options.localOnly ? undefined : this.shared.put(key, entry, keepSeconds).catch(() => undefined),
    ]);
  }

  /** 还剩多少秒新鲜（不足 1 秒按 0） */
  private freshSeconds(entry: CacheEntry<unknown>): number {
    const ms = (entry.freshUntil ?? 0) - this.now();
    return ms >= 1000 ? Math.floor(ms / 1000) : 0;
  }
}
