/**
 * 和"城市当地时间"有关的计算。浏览器和服务器共用这份代码。
 *
 * 原则（需求文档"和时间有关的显示必须由前端计算"）：
 * - 一切按城市的 IANA 时区计算，绝不用访客电脑或服务器的时区。
 * - 星期几只由城市当地日期 "YYYY-MM-DD" 决定：按该日期的 UTC 中午构造，再按 UTC 格式化，
 *   结果与运行环境的时区无关。这正是旧站"上海访问美国城市星期错一天"的修复方法。
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** 某个时刻在指定时区的年月日时分。 */
export function localParts(epochMs: number, timeZone: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(new Date(epochMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 某个时刻在城市时区的日期 "YYYY-MM-DD"。 */
export function localDate(epochMs: number, timeZone: string): string {
  const p = localParts(epochMs, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 城市当地下一个午夜的时刻（毫秒）。按分钟计算，误差在 1 分钟内；夏令时切换的日子也对。 */
export function nextLocalMidnight(epochMs: number, timeZone: string): number {
  const p = localParts(epochMs, timeZone);
  const minutesLeft = 24 * 60 - (p.hour * 60 + p.minute);
  let guess = Math.floor(epochMs / 60000) * 60000 + minutesLeft * 60000;
  // 当天拨了时钟（多或少一小时）：按算出的时刻在当地是几点再校正
  const q = localParts(guess, timeZone);
  if (q.hour !== 0 || q.minute !== 0) {
    const off = q.hour >= 12 ? (24 - q.hour) * 60 - q.minute : -(q.hour * 60 + q.minute);
    guess += off * 60000;
  }
  return guess;
}

/** 城市时区相对 UTC 的分钟数（东八区 = 480）。 */
export function offsetMinutes(epochMs: number, timeZone: string): number {
  const p = localParts(epochMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(epochMs / 60000) * 60000;
  return Math.round((asUtc - truncated) / 60000);
}

/** 某个时刻的城市当地 ISO 时间，如 "2026-10-22T14:00+08:00"（与 Foreca 返回格式一致）。 */
export function toLocalIso(epochMs: number, timeZone: string): string {
  const p = localParts(epochMs, timeZone);
  const off = offsetMinutes(epochMs, timeZone);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 从带时差的当地 ISO 时间里直接取"HH:MM"，不需要任何时区换算。 */
export function hourLabel(localIso: string): string {
  return localIso.slice(11, 16);
}

/** 从带时差的当地 ISO 时间里取日期 "YYYY-MM-DD"。 */
export function dateOf(localIso: string): string {
  return localIso.slice(0, 10);
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * 城市当地日期 → 星期几（按语言显示，如 "Thu"、"周四"）。与运行环境时区无关。
 */
export function weekdayLabel(date: string, intlLocale: string, style: 'short' | 'long' = 'short'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return '';
  const key = `${intlLocale}|${style}`;
  let f = weekdayFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale, { weekday: style, timeZone: 'UTC' });
    weekdayFormatters.set(key, f);
  }
  return f.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
}

/** "10-22" 这种月-日格式，用于往年同日气候查询。 */
export function monthDayOf(date: string): string {
  return date.slice(5, 10);
}

/**
 * 在一组逐小时数据里找到"现在"所在的那一小时（按城市时区）。
 * 返回下标；所有时间都已过去时返回 -1。
 */
export function currentHourIndex(times: string[], nowMs: number): number {
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i] ?? '');
    if (Number.isNaN(t)) continue;
    if (t + 3600_000 > nowMs) return i;
  }
  return -1;
}
