import type { UsageRecorder } from '../weather/service';

/** 这些数据的缓存键里第 4 段是城市 ID（地点坐标 near、搜索 search 不是） */
const CITY_KINDS = new Set(['loc', 'cur', 'hr', 'day', 'aq', 'clid', 'clim', 'nc']);

/** 攒够这么多次调用、或距上次写入超过这么久（毫秒），就写一次数据库 */
const FLUSH_EVERY_CALLS = 100;
const FLUSH_EVERY_MS = 30_000;

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Foreca 调用统计：先在内存里累加，攒一批再写进 D1（每次调用都写数据库太多了）。
 * 每个 Worker 实例各自累加；实例被回收时最多丢掉最后不到 30 秒的计数，用来估算月费足够。
 */
export class D1Usage implements UsageRecorder {
  private counts = new Map<string, number>();
  private cities = new Set<string>();
  private pending = 0;
  private lastFlush: number;

  constructor(
    private readonly db: D1Database,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.lastFlush = now();
  }

  record(kind: string, cityId: string | null, ok: boolean): void {
    const date = utcDate(this.now());
    const k = `${date}|${kind}|${ok ? 1 : 0}`;
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
    if (ok && cityId && CITY_KINDS.has(kind)) this.cities.add(`${date}|${cityId}`);
    this.pending++;
  }

  /** 该写数据库了吗（请求结束时由 app 检查） */
  due(): boolean {
    return this.pending > 0 && (this.pending >= FLUSH_EVERY_CALLS || this.now() - this.lastFlush >= FLUSH_EVERY_MS);
  }

  async flush(): Promise<void> {
    if (this.pending === 0) return;
    const counts = this.counts;
    const cities = this.cities;
    this.counts = new Map();
    this.cities = new Set();
    this.pending = 0;
    this.lastFlush = this.now();
    const stmts: D1PreparedStatement[] = [];
    for (const [k, n] of counts) {
      const [date, kind, ok] = k.split('|');
      stmts.push(
        this.db
          .prepare(
            `INSERT INTO usage_daily (date, kind, ok, calls) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (date, kind, ok) DO UPDATE SET calls = calls + excluded.calls`,
          )
          .bind(date, kind, Number(ok), n),
      );
    }
    for (const k of cities) {
      const [date, city] = k.split('|');
      stmts.push(this.db.prepare('INSERT OR IGNORE INTO usage_cities (date, city_id) VALUES (?1, ?2)').bind(date, city));
    }
    try {
      for (let i = 0; i < stmts.length; i += 50) await this.db.batch(stmts.slice(i, i + 50));
    } catch (err) {
      console.warn('[usage] write failed', err);
    }
  }

  /** 每天的定时任务：调用次数保留 400 天，城市列表保留 40 天 */
  static async cleanup(db: D1Database, nowMs: number): Promise<void> {
    await db.batch([
      db.prepare('DELETE FROM usage_daily WHERE date < ?1').bind(utcDate(nowMs - 400 * 86400_000)),
      db.prepare('DELETE FROM usage_cities WHERE date < ?1').bind(utcDate(nowMs - 40 * 86400_000)),
    ]);
  }
}
