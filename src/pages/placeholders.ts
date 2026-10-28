import type { CityFeatures } from '../features';
import { LIFE_INDEX_KEYS, type LifeIndex } from '../features/life';
import { offsetMinutes, toLocalIso } from '../time/cityTime';
import type { CityBundle } from '../weather/service';
import type { DailyPoint, HourlyPoint } from '../weather/types';

/**
 * 缺数据时的占位（Darren 2026-10-28）：页面区块一律保留、数值显示 "--"，不隐藏区块，
 * 避免同一页面因为数据有无而高度不同、内容跳动。
 * 占位的时间点图标为空字符串（页面画一个空的图标位），数值全为 null（页面显示 "--"）。
 */

export const PLACEHOLDER_HOURS = 72;
export const PLACEHOLDER_DAYS = 15;

export function isPlaceholder(x: { icon: string }): boolean {
  return x.icon === '';
}

function hourPlaceholder(time: string): HourlyPoint {
  return { time, symbol: null, icon: '', temperature: null, feelsLike: null, precipProb: null, precipAccum: null, windSpeed: null, windDir: null, humidity: null, uvIndex: null };
}

function dayPlaceholder(date: string): DailyPoint {
  return { date, symbol: null, icon: '', maxTemp: null, minTemp: null, precipProb: null, precipAccum: null, maxWindSpeed: null, uvIndex: null, sunrise: null, sunset: null };
}

/** 从现在这一小时开始的 n 个占位小时（城市当地时间） */
export function placeholderHours(nowMs: number, timezone: string, n = PLACEHOLDER_HOURS): HourlyPoint[] {
  // 按城市当地时间取整点（印度、尼泊尔等半点、45 分时区不能按 UTC 整点算）
  const minute = Math.floor(nowMs / 60_000) * 60_000;
  const start = minute - Number(toLocalIso(minute, timezone).slice(14, 16)) * 60_000;
  return Array.from({ length: n }, (_, i) => hourPlaceholder(toLocalIso(start + i * 3600_000, timezone)));
}

/** 某一天（城市当地日期）0 点开始的 24 个占位小时：逐小时预报覆盖不到那一天时用 */
export function placeholderDayHours(date: string, timezone: string): HourlyPoint[] {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  // 用这一刻的时差近似（夏令时切换当天可能差 1 小时，占位够用）
  const offsetMin = offsetMinutes(utcMidnight, timezone);
  return placeholderHours(utcMidnight - offsetMin * 60_000, timezone, 24).filter((h) => h.time.startsWith(date));
}

/** 从 today（YYYY-MM-DD）开始的 n 个占位日 */
export function placeholderDays(today: string, n = PLACEHOLDER_DAYS): DailyPoint[] {
  const base = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Array.from({ length: n }, (_, i) => dayPlaceholder(new Date(base + i * 86400_000).toISOString().slice(0, 10)));
}

/** 生活指数补齐 5 项；算不出来的那项评级为空、文案为空（页面显示 "--"） */
export function padLife(life: LifeIndex[]): LifeIndex[] {
  return LIFE_INDEX_KEYS.map((key) => life.find((x) => x.key === key) ?? { key, rating: null, summaryKey: '', reasonKey: '', vars: {} });
}

/** 页面用的数据：逐小时、每日预报、生活指数缺了就补占位。计算（往年对比、排行榜等）仍用真实数据。 */
export function withPlaceholders(bundle: CityBundle, features: CityFeatures, nowMs: number): { bundle: CityBundle; features: CityFeatures } {
  const hourly = bundle.hourly && bundle.hourly.data.length > 0 ? bundle.hourly : { data: placeholderHours(nowMs, bundle.location.timezone), fetchedAt: 0 };
  const days = features.days.length > 0 ? features.days : placeholderDays(bundle.today);
  const daily = bundle.daily && bundle.daily.data.length > 0 ? bundle.daily : { data: days, fetchedAt: 0 };
  return {
    bundle: { ...bundle, hourly, daily },
    features: { ...features, days, life: padLife(features.life) },
  };
}
