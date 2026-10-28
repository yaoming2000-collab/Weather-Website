/**
 * 浏览器端的时间处理。页面会被 CDN 缓存最多几分钟，数据也可能是一小时前取的，
 * 所以"现在"、"今天"、"X 分钟前"都在这里按当前时间和城市时区重新计算。
 */

/** 某一时刻在城市时区的日期 "YYYY-MM-DD" */
export function cityToday(nowMs: number, timeZone: string): string {
  // en-CA 的日期格式正好是 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowMs);
}

/** 逐小时数据里，已经过去的小时数（这些小时在页面上隐藏） */
export function pastHourCount(times: string[], nowMs: number): number {
  let n = 0;
  for (const t of times) {
    const ms = Date.parse(t);
    if (Number.isNaN(ms) || ms + 3600_000 > nowMs) break;
    n++;
  }
  return n;
}

export function minutesAgo(fetchedAt: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - fetchedAt) / 60_000));
}

export { STALE_AFTER_MIN } from '../../src/config/thresholds';

/** 当前天气数据超过此时长（毫秒）就在浏览器里补刷新，与服务器缓存时长一致 */
export const REFRESH_AFTER_MS = 20 * 60_000;
