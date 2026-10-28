import { GUESS, RANKING } from '../config/features';
import type { ClimateLevel, GuessChoice, TodayComparison } from './climate';

/**
 * 第 3 步新功能的小存储：猜一猜计数、排行榜数据。
 *
 * 线上用 Cloudflare D1（SQLite 数据库，表结构见 migrations/0001_features.sql）。
 * 为什么不用 KV：投票是"读出来加一再写回去"，KV 在并发时会丢票，而且同一个键每秒只能写一次；
 * D1 一条 SQL 就能原子地加一。
 * 没有绑定 D1 时（测试、预览环境）退回内存存储：数据只在单个 Worker 实例里，重启就清空。
 */

export interface GuessCounts {
  colder: number;
  same: number;
  warmer: number;
}

export interface AnomalyRecord {
  cityId: string;
  name: string;
  country: string | null;
  /** 城市当地日期 */
  date: string;
  deltaMax: number;
  maxTemp: number;
  avgMaxTemp: number;
  level: ClimateLevel;
  /** 写入时间（毫秒） */
  updatedAt: number;
  /** 这一天在城市当地结束的时刻（毫秒）。过了就不再算"今天"，不上榜。 */
  validUntil: number;
}

export interface Ranking {
  warmest: AnomalyRecord[];
  coldest: AnomalyRecord[];
  generatedAt: number;
}

export interface FeatureStore {
  readonly persistent: boolean;
  addGuess(cityId: string, date: string, choice: GuessChoice): Promise<GuessCounts>;
  guessCounts(cityId: string, date: string): Promise<GuessCounts>;
  /** 记录城市今天的偏差；同一城市 RANKING.recordEverySeconds 内只写一次 */
  recordAnomaly(rec: AnomalyRecord): Promise<void>;
  ranking(nowMs: number): Promise<Ranking>;
  /**
   * 定下城市当天的"和去年比"结果：第一次调用时存下传入的结果，以后同一城市同一天都返回第一次存的。
   * 今天的预报一天里会更新，答案中途翻转会让"连续猜对"不公平（Darren 2026-10-28）。
   */
  freezeComparison(cityId: string, comparison: TodayComparison): Promise<TodayComparison>;
  /** 只读：这个城市这一天已经定下的结果（今天的数据这次没取到时用） */
  frozenComparison(cityId: string, date: string): Promise<TodayComparison | null>;
  /** 删除过期数据（每天由定时任务调用） */
  cleanup(nowMs: number): Promise<void>;
}

export const EMPTY_COUNTS: GuessCounts = { colder: 0, same: 0, warmer: 0 };

export function totalVotes(c: GuessCounts): number {
  return c.colder + c.same + c.warmer;
}

/** "X% 的人猜对了"；票数不够时返回 null（需求文档：满 20 票才显示） */
export function percentCorrect(c: GuessCounts, answer: GuessChoice): number | null {
  const total = totalVotes(c);
  if (total < GUESS.minVotesForPercent) return null;
  return Math.round((c[answer] / total) * 100);
}

/**
 * 早于这个日期（YYYY-MM-DD）的猜一猜计数会被删除。
 * 按 UTC 算，比"7 天"多留一天，避开各地时区差。
 */
export function guessCutoffDate(nowMs: number): string {
  return new Date(nowMs - GUESS.keepDays * 86400_000).toISOString().slice(0, 10);
}

function sortRanking(rows: AnomalyRecord[], nowMs: number): Ranking {
  const since = nowMs - RANKING.windowHours * 3600_000;
  const recent = rows.filter((r) => r.updatedAt >= since && r.validUntil > nowMs);
  return {
    warmest: recent.filter((r) => r.deltaMax > 0).sort((a, b) => b.deltaMax - a.deltaMax).slice(0, RANKING.size),
    coldest: recent.filter((r) => r.deltaMax < 0).sort((a, b) => a.deltaMax - b.deltaMax).slice(0, RANKING.size),
    generatedAt: nowMs,
  };
}

/**
 * 同一个 Worker 实例里记住每个城市上次写入的时间，避免每次生成页面都写数据库。
 * 不同实例之间靠 SQL 里的 updated_at 条件去重。
 */
class RecentWrites {
  private readonly last = new Map<string, number>();
  shouldWrite(cityId: string, nowMs: number): boolean {
    const prev = this.last.get(cityId);
    if (prev !== undefined && nowMs - prev < RANKING.recordEverySeconds * 1000) return false;
    if (this.last.size > 5000) this.last.clear();
    this.last.set(cityId, nowMs);
    return true;
  }
}

// ---------------------------------------------------------------------------

export class MemoryFeatureStore implements FeatureStore {
  readonly persistent = false;
  private readonly guesses = new Map<string, GuessCounts>();
  private readonly anomalies = new Map<string, AnomalyRecord>();
  private readonly frozen = new Map<string, TodayComparison>();

  async freezeComparison(cityId: string, comparison: TodayComparison): Promise<TodayComparison> {
    const key = `${cityId}|${comparison.date}`;
    const existing = this.frozen.get(key);
    if (existing) return existing;
    this.frozen.set(key, comparison);
    return comparison;
  }

  async frozenComparison(cityId: string, date: string): Promise<TodayComparison | null> {
    return this.frozen.get(`${cityId}|${date}`) ?? null;
  }

  async addGuess(cityId: string, date: string, choice: GuessChoice): Promise<GuessCounts> {
    const key = `${cityId}|${date}`;
    const next = { ...(this.guesses.get(key) ?? EMPTY_COUNTS) };
    next[choice] += 1;
    this.guesses.set(key, next);
    return next;
  }

  async guessCounts(cityId: string, date: string): Promise<GuessCounts> {
    return { ...(this.guesses.get(`${cityId}|${date}`) ?? EMPTY_COUNTS) };
  }

  async recordAnomaly(rec: AnomalyRecord): Promise<void> {
    const prev = this.anomalies.get(rec.cityId);
    if (prev && rec.updatedAt - prev.updatedAt < RANKING.recordEverySeconds * 1000 && prev.date === rec.date) return;
    this.anomalies.set(rec.cityId, rec);
  }

  async ranking(nowMs: number): Promise<Ranking> {
    return sortRanking([...this.anomalies.values()], nowMs);
  }

  async cleanup(nowMs: number): Promise<void> {
    const cutoff = guessCutoffDate(nowMs);
    for (const key of this.guesses.keys()) if (key.split('|')[1]! < cutoff) this.guesses.delete(key);
    const keepFrom = nowMs - RANKING.keepDays * 86400_000;
    for (const [id, r] of this.anomalies) if (r.updatedAt < keepFrom) this.anomalies.delete(id);
    for (const key of this.frozen.keys()) if (key.split('|')[1]! < cutoff) this.frozen.delete(key);
  }
}

// ---------------------------------------------------------------------------

interface AnomalyRow {
  city_id: string;
  name: string;
  country: string | null;
  date: string;
  delta_max: number;
  max_temp: number;
  avg_max_temp: number;
  level: string;
  updated_at: number;
  valid_until: number;
}

function fromRow(r: AnomalyRow): AnomalyRecord {
  return {
    cityId: r.city_id,
    name: r.name,
    country: r.country,
    date: r.date,
    deltaMax: r.delta_max,
    maxTemp: r.max_temp,
    avgMaxTemp: r.avg_max_temp,
    level: r.level as ClimateLevel,
    updatedAt: r.updated_at,
    validUntil: r.valid_until,
  };
}

export class D1FeatureStore implements FeatureStore {
  readonly persistent = true;
  private readonly recent = new RecentWrites();

  constructor(private readonly db: D1Database) {}

  async addGuess(cityId: string, date: string, choice: GuessChoice): Promise<GuessCounts> {
    const inc = { colder: 0, same: 0, warmer: 0, [choice]: 1 };
    // 一条 SQL 原子地"没有就新建，有就加一"，并发投票不会丢
    const row = await this.db
      .prepare(
        `INSERT INTO guesses (city_id, date, colder, same, warmer) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (city_id, date) DO UPDATE SET
           colder = colder + excluded.colder,
           same = same + excluded.same,
           warmer = warmer + excluded.warmer
         RETURNING colder, same, warmer`,
      )
      .bind(cityId, date, inc.colder, inc.same, inc.warmer)
      .first<GuessCounts>();
    return row ?? { ...EMPTY_COUNTS, [choice]: 1 };
  }

  async guessCounts(cityId: string, date: string): Promise<GuessCounts> {
    const row = await this.db
      .prepare('SELECT colder, same, warmer FROM guesses WHERE city_id = ?1 AND date = ?2')
      .bind(cityId, date)
      .first<GuessCounts>();
    return row ?? { ...EMPTY_COUNTS };
  }

  async recordAnomaly(rec: AnomalyRecord): Promise<void> {
    if (!this.recent.shouldWrite(rec.cityId, rec.updatedAt)) return;
    const staleBefore = rec.updatedAt - RANKING.recordEverySeconds * 1000;
    await this.db
      .prepare(
        `INSERT INTO anomalies (city_id, name, country, date, delta_max, max_temp, avg_max_temp, level, updated_at, valid_until)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?11)
         ON CONFLICT (city_id) DO UPDATE SET
           name = excluded.name, country = excluded.country, date = excluded.date,
           delta_max = excluded.delta_max, max_temp = excluded.max_temp, avg_max_temp = excluded.avg_max_temp,
           level = excluded.level, updated_at = excluded.updated_at, valid_until = excluded.valid_until
         WHERE anomalies.updated_at < ?10 OR anomalies.date <> excluded.date`,
      )
      .bind(rec.cityId, rec.name, rec.country, rec.date, rec.deltaMax, rec.maxTemp, rec.avgMaxTemp, rec.level, rec.updatedAt, staleBefore, rec.validUntil)
      .run();
  }

  /** 同一个 Worker 实例里已经定下的结果，省掉重复的数据库往返（定下后不会再变） */
  private readonly frozenLocal = new Map<string, TodayComparison>();

  async frozenComparison(cityId: string, date: string): Promise<TodayComparison | null> {
    const key = `${cityId}|${date}`;
    const local = this.frozenLocal.get(key);
    if (local) return local;
    const row = await this.db.prepare('SELECT data FROM daily_comparisons WHERE city_id = ?1 AND date = ?2').bind(cityId, date).first<{ data: string }>();
    try {
      const v = row ? (JSON.parse(row.data) as TodayComparison) : null;
      if (v) this.remember(key, v);
      return v;
    } catch {
      return null;
    }
  }

  private remember(key: string, v: TodayComparison) {
    if (this.frozenLocal.size > 2000) this.frozenLocal.clear();
    this.frozenLocal.set(key, v);
  }

  async freezeComparison(cityId: string, comparison: TodayComparison): Promise<TodayComparison> {
    const key = `${cityId}|${comparison.date}`;
    const local = this.frozenLocal.get(key);
    if (local) return local;
    const v = await this.freezeInDb(cityId, comparison);
    this.remember(key, v);
    return v;
  }

  private async freezeInDb(cityId: string, comparison: TodayComparison): Promise<TodayComparison> {
    // 没有就写入，有就保持原样；然后读出当天的那一条（并发写入时也只有第一条生效）
    const [, read] = await this.db.batch<{ data: string }>([
      this.db
        .prepare('INSERT INTO daily_comparisons (city_id, date, data) VALUES (?1, ?2, ?3) ON CONFLICT (city_id, date) DO NOTHING')
        .bind(cityId, comparison.date, JSON.stringify(comparison)),
      this.db.prepare('SELECT data FROM daily_comparisons WHERE city_id = ?1 AND date = ?2').bind(cityId, comparison.date),
    ]);
    const raw = read?.results?.[0]?.data;
    try {
      return raw ? (JSON.parse(raw) as TodayComparison) : comparison;
    } catch {
      return comparison;
    }
  }

  async ranking(nowMs: number): Promise<Ranking> {
    const since = nowMs - RANKING.windowHours * 3600_000;
    const [warm, cold] = await this.db.batch<AnomalyRow>([
      this.db
        .prepare('SELECT * FROM anomalies WHERE updated_at >= ?1 AND valid_until > ?3 AND delta_max > 0 ORDER BY delta_max DESC LIMIT ?2')
        .bind(since, RANKING.size, nowMs),
      this.db
        .prepare('SELECT * FROM anomalies WHERE updated_at >= ?1 AND valid_until > ?3 AND delta_max < 0 ORDER BY delta_max ASC LIMIT ?2')
        .bind(since, RANKING.size, nowMs),
    ]);
    return {
      warmest: (warm?.results ?? []).map(fromRow),
      coldest: (cold?.results ?? []).map(fromRow),
      generatedAt: nowMs,
    };
  }

  async cleanup(nowMs: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM guesses WHERE date < ?1').bind(guessCutoffDate(nowMs)),
      this.db.prepare('DELETE FROM anomalies WHERE updated_at < ?1').bind(nowMs - RANKING.keepDays * 86400_000),
    ]);
    // 单独执行：还没执行迁移 0004 时不影响上面的清理
    await this.db
      .prepare('DELETE FROM daily_comparisons WHERE date < ?1')
      .bind(guessCutoffDate(nowMs))
      .run()
      .catch((e: unknown) => console.warn('[d1] daily_comparisons cleanup failed', e));
  }
}

/** 同一个 Worker 实例共用一份内存存储（没有 D1 时） */
const memory = new MemoryFeatureStore();

export function createFeatureStore(db: D1Database | undefined): FeatureStore {
  return db ? new D1FeatureStore(db) : memory;
}
