/**
 * 去年数据的待取队列（2026-10-29）。
 *
 * OpenWeather 4.0 一次请求要 40 多秒，页面等不起；页面返回后用 waitUntil 继续也不行（最多约 30 秒就被取消，
 * 数据永远存不进缓存）。所以页面发现缺某一块时只把它记进队列，由每 10 分钟一次的定时任务去取
 * （定时任务最长可以跑 15 分钟），取到后写进 KV，所有机房共用。
 *
 * 队列存在 KV：键 q:ly:<城市>:<块起始日期>，任务内容放在 metadata 里（list 一次就能拿到，不用逐个读）。
 * 三天没取到就自动消失（页面下次缺的时候会重新放进来）。
 */

export interface HistoryJob {
  cityId: string;
  lat: number;
  lon: number;
  /** 10 天块的第一天（去年的日期） */
  start: string;
  /** 已经失败的次数 */
  attempts: number;
}

export interface HistoryQueue {
  /** 放进队列（已经在队列里就不动） */
  add(job: Omit<HistoryJob, 'attempts'>): Promise<void>;
  /** 取出最多 limit 个待取任务（不删除，做完再 done） */
  take(limit: number): Promise<HistoryJob[]>;
  done(job: HistoryJob): Promise<void>;
  /** 这次没取到（临时故障）：失败次数 +1，太多次就放弃 */
  retry(job: HistoryJob): Promise<void>;
}

export const HISTORY_QUEUE_PREFIX = 'q:ly:';
/** 最多试几次（每 10 分钟一次） */
export const HISTORY_MAX_ATTEMPTS = 6;
const KEEP_SECONDS = 3 * 86400;

const keyOf = (j: Pick<HistoryJob, 'cityId' | 'start'>) => `${HISTORY_QUEUE_PREFIX}${j.cityId}:${j.start}`;

function validJob(v: unknown): HistoryJob | null {
  const j = v as Partial<HistoryJob> | null;
  if (!j || typeof j.cityId !== 'string' || typeof j.start !== 'string' || typeof j.lat !== 'number' || typeof j.lon !== 'number') return null;
  return { cityId: j.cityId, start: j.start, lat: j.lat, lon: j.lon, attempts: typeof j.attempts === 'number' ? j.attempts : 0 };
}

export class KvHistoryQueue implements HistoryQueue {
  constructor(private readonly kv: KVNamespace) {}

  async add(job: Omit<HistoryJob, 'attempts'>): Promise<void> {
    const key = keyOf(job);
    // 已经在队列里：不要重写（会把失败次数清零）
    if ((await this.kv.get(key)) !== null) return;
    await this.kv.put(key, '1', { expirationTtl: KEEP_SECONDS, metadata: { ...job, attempts: 0 } });
  }

  async take(limit: number): Promise<HistoryJob[]> {
    const res = await this.kv.list<HistoryJob>({ prefix: HISTORY_QUEUE_PREFIX, limit });
    return res.keys.map((k) => validJob(k.metadata)).filter((j): j is HistoryJob => j !== null);
  }

  async done(job: HistoryJob): Promise<void> {
    await this.kv.delete(keyOf(job));
  }

  async retry(job: HistoryJob): Promise<void> {
    const attempts = job.attempts + 1;
    if (attempts >= HISTORY_MAX_ATTEMPTS) return this.done(job);
    await this.kv.put(keyOf(job), '1', { expirationTtl: KEEP_SECONDS, metadata: { ...job, attempts } });
  }
}

/** 测试用 */
export class MemoryHistoryQueue implements HistoryQueue {
  readonly jobs = new Map<string, HistoryJob>();
  adds = 0;

  async add(job: Omit<HistoryJob, 'attempts'>): Promise<void> {
    this.adds++;
    const key = keyOf(job);
    if (!this.jobs.has(key)) this.jobs.set(key, { ...job, attempts: 0 });
  }

  async take(limit: number): Promise<HistoryJob[]> {
    return [...this.jobs.values()].slice(0, limit);
  }

  async done(job: HistoryJob): Promise<void> {
    this.jobs.delete(keyOf(job));
  }

  async retry(job: HistoryJob): Promise<void> {
    const attempts = job.attempts + 1;
    if (attempts >= HISTORY_MAX_ATTEMPTS) this.jobs.delete(keyOf(job));
    else this.jobs.set(keyOf(job), { ...job, attempts });
  }
}
