import { ICON_THRESHOLDS as T, SLEET_MODERATE_ICON_FIXED } from '../config/thresholds';

/**
 * 天气代码 → 我们自己的图标 key。
 *
 * Foreca 代码格式：[d|n][云量][降水强度][降水类型]，例如 d421。
 *   云量：0 晴，1 少云，2 半多云，3 多云，4 阴，5 高层薄云，6 雾
 *   降水强度：0 无，1 小量，2 阵性，3 持续，4 雷暴
 *   降水类型：0 雨，1 雨夹雪，2 雪
 *
 * 规则来自需求文档"天气图标与状态"的映射表。图片文件沿用旧站 frontend/src/assets/img。
 */

export const ICON_KEYS = [
  'sunny',
  'partly-cloudy',
  'mostly-cloudy',
  'cloudy',
  'foggy',
  'rainy-drizzle',
  'rainy-light',
  'rainy-shower-light',
  'rainy-moderate',
  'rainy-heavy',
  'rainy-freezing',
  'stormy-strong',
  'stormy-rain-light',
  'stormy-rain-medium',
  'stormy-rain-heavy',
  'sleet-light',
  'sleet-moderate',
  'sleet-heavy',
  'snowy-light',
  'snowy-flurries',
  'snowy-moderate',
  'snowy-heavy',
] as const;

export type DayIconKey = (typeof ICON_KEYS)[number];

export interface IconInput {
  symbol: string | null | undefined;
  /** 降水率 mm/h；没有时为 null，此时不做强度细分 */
  precipRate?: number | null;
  /** 气温 °C；用于判断冻雨 */
  temperature?: number | null;
}

interface ParsedSymbol {
  night: boolean;
  cloud: number;
  precip: number;
  type: number;
}

export function parseSymbol(symbol: string | null | undefined): ParsedSymbol | null {
  const m = /^([dn])(\d)(\d)(\d)$/.exec((symbol ?? '').trim().toLowerCase());
  if (!m) return null;
  return { night: m[1] === 'n', cloud: Number(m[2]), precip: Number(m[3]), type: Number(m[4]) };
}

function cloudOnly(cloud: number): DayIconKey {
  switch (cloud) {
    case 0:
      return 'sunny';
    case 1:
    case 5:
      return 'partly-cloudy';
    case 2:
      return 'mostly-cloudy';
    case 6:
      return 'foggy';
    default:
      return 'cloudy';
  }
}

function has(rate: number | null | undefined): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate);
}

function dayIcon(p: ParsedSymbol, rate: number | null | undefined, temp: number | null | undefined): DayIconKey {
  if (p.precip === 0) return cloudOnly(p.cloud);

  // 雷暴：不论降水类型，按降水率分级
  if (p.precip === 4) {
    if (!has(rate)) return 'stormy-rain-medium';
    if (rate < T.dryThunderBelow) return 'stormy-strong';
    if (rate < T.lightThunderBelow) return 'stormy-rain-light';
    if (rate >= T.heavyRainAtLeast) return 'stormy-rain-heavy';
    return 'stormy-rain-medium';
  }

  // 雨
  if (p.type === 0) {
    if (has(temp) && temp <= T.freezingAtOrBelow) return 'rainy-freezing';
    if (p.precip === 1) return has(rate) && rate < T.drizzleBelow ? 'rainy-drizzle' : 'rainy-light';
    if (p.precip === 2 && p.cloud <= 3) return 'rainy-shower-light';
    return has(rate) && rate >= T.heavyRainAtLeast ? 'rainy-heavy' : 'rainy-moderate';
  }

  // 雨夹雪
  if (p.type === 1) {
    if (p.precip === 1) return 'sleet-light';
    if (has(rate) && rate >= T.heavyRainAtLeast) return 'sleet-heavy';
    return SLEET_MODERATE_ICON_FIXED ? 'sleet-moderate' : 'sleet-light';
  }

  // 雪
  if (p.precip === 1) return 'snowy-light';
  if (p.precip === 2) return 'snowy-flurries';
  return has(rate) && rate >= T.heavySnowAtLeast ? 'snowy-heavy' : 'snowy-moderate';
}

/**
 * 返回图标 key。夜间：晴为 "night"，其他加 "night-" 前缀（如 "night-rainy-light"）。
 * 无法识别的代码返回 "cloudy"，调用方应记录日志。
 */
export function iconFor(input: IconInput): string {
  const parsed = parseSymbol(input.symbol);
  if (!parsed) return 'cloudy';
  const base = dayIcon(parsed, input.precipRate, input.temperature);
  if (!parsed.night) return base;
  return base === 'sunny' ? 'night' : `night-${base}`;
}

/**
 * 图标 key → 图片文件（相对 /img/weather/）。
 * 沿用旧站规则：只有晴、少云、半多云有专门的夜间图片，其他夜间图标复用白天图片。
 */
export function iconImage(key: string): string {
  if (key === 'night') return 'night.png';
  if (key === 'night-partly-cloudy' || key === 'night-mostly-cloudy') return 'night-partly-cloudy.png';
  const day = key.startsWith('night-') ? key.slice('night-'.length) : key;
  return `${day}.png`;
}

/**
 * 图标 key → 动画背景类型。移植自旧站 backend/model/weather_visual.go 的 WeatherVisualBackground。
 */
export function backgroundFor(key: string): string {
  const night = key === 'night' || key.startsWith('night-');
  const day = key === 'night' ? 'sunny' : key.replace(/^night-/, '');

  const group = (() => {
    if (day === 'rainy-freezing') return 'rainy-freezing';
    if (day.startsWith('stormy')) return 'stormy';
    if (day.startsWith('rainy')) return 'rainy';
    if (day.startsWith('snowy') || day.startsWith('sleet')) return 'snowy';
    if (day === 'foggy') return 'foggy';
    if (day === 'cloudy') return 'cloudy';
    if (day === 'partly-cloudy' || day === 'mostly-cloudy') return night ? 'cloudy' : 'sunny';
    return 'sunny';
  })();

  if (!night) return group;
  if (group === 'sunny') return 'night';
  return `night-${group}`;
}
