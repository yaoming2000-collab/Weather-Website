/**
 * 连续猜对天数（Darren 2026-10-28）。存在浏览器 localStorage "weather.streak.v1"，按城市分别记：
 * - 猜对 +1；猜错归零；漏猜一天也断（"连续"的本义）
 * - 去年数据缺失、那天没出题：不算断（打开过往年对比页时记一笔"跳过"）
 * - 另外记"最长连续天数"
 * 日期都是城市当地日期 YYYY-MM-DD。纯函数，方便测试。
 */

export const STREAK_KEY = 'weather.streak.v1';

export interface Streak {
  /** 当前连续猜对天数 */
  cur: number;
  /** 最长连续天数 */
  best: number;
  /** 最后记过的一天（猜过或跳过） */
  last: string;
  /** last 那天是"没出题跳过"（之后同一天真的猜了，照样计入） */
  skipped?: boolean;
}

export type StreakBook = Record<string, Streak>;

export function readStreaks(raw: string | null): StreakBook {
  try {
    const j = JSON.parse(raw ?? '{}') as unknown;
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
    const out: StreakBook = {};
    for (const [k, v] of Object.entries(j as Record<string, Partial<Streak>>)) {
      if (v && typeof v.cur === 'number' && typeof v.best === 'number' && typeof v.last === 'string')
        out[k] = { cur: v.cur, best: v.best, last: v.last, ...(v.skipped ? { skipped: true } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

export function prevDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
}

/** 记下某天猜的结果；同一天重复记录、比最后记录更早的日期（旧页面）都不变 */
export function recordResult(s: Streak | undefined, date: string, correct: boolean): Streak {
  if (s && (date < s.last || (s.last === date && !s.skipped))) return s;
  // 当天先记了"跳过"（那时还没出题）又真的猜了：跳过是从昨天接过来的，照样算连着
  const continuing = !!s && (s.last === prevDate(date) || (s.last === date && !!s.skipped));
  const cur = correct ? (continuing ? s!.cur : 0) + 1 : 0;
  return { cur, best: Math.max(s?.best ?? 0, cur), last: date };
}

/** 那天没出题（去年数据缺失）：连着的话往后接一天，不加也不断 */
export function recordSkip(s: Streak | undefined, date: string): Streak | undefined {
  if (!s || s.last >= date) return s;
  return s.last === prevDate(date) ? { ...s, last: date, skipped: true } : s;
}

/** 今天看到的"已连续猜对 N 天"：最后记录是今天或昨天时还连着，否则已经断了 */
export function currentStreak(s: Streak | undefined, today: string): number {
  if (!s) return 0;
  return s.last === today || s.last === prevDate(today) ? s.cur : 0;
}
