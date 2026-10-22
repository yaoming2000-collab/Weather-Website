/**
 * 天气数据缓存。
 *
 * 线上用两层：
 *   第一层 Cloudflare Cache API —— 每个机房各一份，读取最快，免费；
 *   第二层 Workers KV —— 全球共享一份，保证同一城市在全球只向 Foreca 请求一次。
 * 只用第一层的话，同一城市的访客分布在多个机房时，每个机房都会各请求一次 Foreca，调用量会成倍增加。
 * 测试和本地开发用内存缓存。
 */

export interface CacheEntry<T> {
  value: T;
  /** 从供应商获取数据的时间（毫秒） */
  fetchedAt: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  /** keepSeconds：存储层保留多久（= 新鲜期 + 允许使用旧数据的时长） */
  put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void>;
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

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    const res = new Response(JSON.stringify(entry), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.ceil(keepSeconds)}` },
    });
    await this.cache.put(this.request(key), res);
  }
}

/** 多层缓存：依次查找；在下层找到时回填上层。写入时每层都写。 */
export class TieredStore implements CacheStore {
  constructor(private readonly layers: CacheStore[]) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    for (let i = 0; i < this.layers.length; i++) {
      const hit = await this.layers[i]!.get<T>(key);
      if (hit) {
        // 回填上层时保留时长取一个较短值，避免上层长时间保留旧数据
        await Promise.all(this.layers.slice(0, i).map((l) => l.put(key, hit, 300).catch(() => undefined)));
        return hit;
      }
    }
    return null;
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    await Promise.all(this.layers.map((l) => l.put(key, entry, keepSeconds).catch(() => undefined)));
  }
}
