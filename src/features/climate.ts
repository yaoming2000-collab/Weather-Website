import { CLIMATE, CLIMATE_LEVEL_COLORS } from '../config/features';
import { monthDayOf } from '../time/cityTime';
import type { ClimateDay, ClimateMonth, DailyPoint, WeatherLocation } from '../weather/types';

/**
 * 今天比往年热还是冷（需求文档"重点功能"）。
 *
 * 只做计算，不做显示：页面拿这里的结果，配合 i18n 文案 key 渲染。
 * 一律用摄氏度计算和分级；显示 °F 时偏差 × 1.8 再四舍五入（浏览器里换算，见 client/lib/units.ts）。
 * 气候接口只有平均值，所以结论只能说"比往年同期高/低多少度"，不能说"创纪录"之类。
 */

export type ClimateLevel = keyof typeof CLIMATE_LEVEL_COLORS;
/** 猜一猜的三个选项 */
export type GuessChoice = 'colder' | 'same' | 'warmer';
export const GUESS_CHOICES: readonly GuessChoice[] = ['colder', 'same', 'warmer'];
/** 按往年气候选用词：hot 城市说"更热/更凉快"，cold 城市说"更暖和/更冷"，mild 说"更暖/更冷" */
export type ClimateTone = 'hot' | 'mild' | 'cold';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function climateLevel(delta: number): ClimateLevel {
  const d = round1(delta);
  if (d >= CLIMATE.muchAtLeast) return 'much-warmer';
  if (d >= CLIMATE.notableAtLeast) return 'warmer';
  if (d <= -CLIMATE.muchAtLeast) return 'much-cooler';
  if (d <= -CLIMATE.notableAtLeast) return 'cooler';
  return 'normal';
}

export function levelColor(level: ClimateLevel): string {
  return CLIMATE_LEVEL_COLORS[level];
}

/** 等级对应的猜一猜正确答案 */
export function answerOf(level: ClimateLevel): GuessChoice {
  if (level === 'much-warmer' || level === 'warmer') return 'warmer';
  if (level === 'much-cooler' || level === 'cooler') return 'colder';
  return 'same';
}

export function climateTone(avgMaxTemp: number): ClimateTone {
  if (avgMaxTemp >= CLIMATE.hotClimateAtLeast) return 'hot';
  if (avgMaxTemp <= CLIMATE.coldClimateAtMost) return 'cold';
  return 'mild';
}

/**
 * 文案 key 的后缀。例如 tone=hot、偏暖 → "warmer_hot"，对应 en.json 的
 * ClimateLabel_warmer_hot = "{delta}° hotter than usual"。和往年差不多时为 "normal"。
 */
export function wordingKey(level: ClimateLevel, tone: ClimateTone): string {
  const answer = answerOf(level);
  if (answer === 'same') return 'normal';
  return `${answer === 'warmer' ? 'warmer' : 'cooler'}_${tone}`;
}

/** 猜一猜按钮的文案 key 后缀（按钮用词也随城市气候变化） */
export function guessButtonKey(choice: GuessChoice, tone: ClimateTone): string {
  if (choice === 'same') return 'same';
  return `${choice === 'warmer' ? 'warmer' : 'cooler'}_${tone}`;
}

export interface TodayComparison {
  date: string;
  maxTemp: number;
  minTemp: number | null;
  avgMaxTemp: number;
  avgMinTemp: number | null;
  /** 今天预报最高温 − 往年同日平均最高温（°C，一位小数） */
  deltaMax: number;
  /** 今天预报最低温 − 往年同日平均最低温，详情页用 */
  deltaMin: number | null;
  level: ClimateLevel;
  tone: ClimateTone;
  answer: GuessChoice;
  /** 文案 key 后缀，见 wordingKey */
  wording: string;
}

export function compareToday(day: DailyPoint | undefined, climate: ClimateDay | null | undefined): TodayComparison | null {
  if (!day || day.maxTemp === null || !climate || climate.avgMaxTemp === null) return null;
  const deltaMax = round1(day.maxTemp - climate.avgMaxTemp);
  const deltaMin =
    day.minTemp !== null && climate.avgMinTemp !== null ? round1(day.minTemp - climate.avgMinTemp) : null;
  const level = climateLevel(deltaMax);
  const tone = climateTone(climate.avgMaxTemp);
  return {
    date: day.date,
    maxTemp: day.maxTemp,
    minTemp: day.minTemp,
    avgMaxTemp: climate.avgMaxTemp,
    avgMinTemp: climate.avgMinTemp,
    deltaMax,
    deltaMin,
    level,
    tone,
    answer: answerOf(level),
    wording: wordingKey(level, tone),
  };
}

// ---------------------------------------------------------------------------
// 15 天对比：往年平均由每月平均插值得到（一次接口调用代替 15 次逐日调用）
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

/**
 * 某一天的往年平均最高、最低温：把每月平均值看作该月月中的值，相邻两个月之间线性插值（12 月和 1 月首尾相接）。
 */
export function interpolateClimate(
  months: ClimateMonth[],
  date: string,
): { avgMaxTemp: number | null; avgMinTemp: number | null } | null {
  const byMonth = new Map(months.map((m) => [m.month, m]));
  if (byMonth.size !== 12) return null;
  const { y, m, d } = parseDate(date);
  // pos：以"月中"为整数点的月份坐标，0 = 1 月中
  const pos = m - 1 + (d - 0.5) / daysInMonth(y, m) - 0.5;
  const lo = Math.floor(pos);
  const frac = pos - lo;
  const a = byMonth.get(((lo % 12) + 12) % 12 + 1)!;
  const b = byMonth.get((((lo + 1) % 12) + 12) % 12 + 1)!;
  const mix = (x: number | null, y2: number | null) => (x === null || y2 === null ? null : round1(x + (y2 - x) * frac));
  return { avgMaxTemp: mix(a.avgMaxTemp, b.avgMaxTemp), avgMinTemp: mix(a.avgMinTemp, b.avgMinTemp) };
}

export interface ClimateSeriesPoint {
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  avgMaxTemp: number | null;
  avgMinTemp: number | null;
  /** 最高温偏差；任一值缺失时为 null */
  delta: number | null;
  /** 偏差超过 ±2° 的日子标颜色；其余为 normal */
  level: ClimateLevel | null;
}

/**
 * 未来 15 天对比图的数据。
 * 插值曲线整体平移到"今天的往年同日平均"上，这样今天这个点和首页标签的数字一致，图上也不会出现跳变。
 */
export function climateSeries(
  daily: DailyPoint[],
  months: ClimateMonth[] | null | undefined,
  todayClimate: ClimateDay | null | undefined,
): ClimateSeriesPoint[] {
  const todayDate = daily[0]?.date;
  let offMax = 0;
  let offMin = 0;
  if (months && todayDate && todayClimate) {
    const base = interpolateClimate(months, todayDate);
    if (base?.avgMaxTemp != null && todayClimate.avgMaxTemp !== null) offMax = todayClimate.avgMaxTemp - base.avgMaxTemp;
    if (base?.avgMinTemp != null && todayClimate.avgMinTemp !== null) offMin = todayClimate.avgMinTemp - base.avgMinTemp;
  }

  return daily.map((day) => {
    let avgMaxTemp: number | null = null;
    let avgMinTemp: number | null = null;
    if (todayClimate && todayClimate.monthDay === monthDayOf(day.date)) {
      avgMaxTemp = todayClimate.avgMaxTemp;
      avgMinTemp = todayClimate.avgMinTemp;
    } else if (months) {
      const v = interpolateClimate(months, day.date);
      avgMaxTemp = v?.avgMaxTemp != null ? round1(v.avgMaxTemp + offMax) : null;
      avgMinTemp = v?.avgMinTemp != null ? round1(v.avgMinTemp + offMin) : null;
    }
    const delta = day.maxTemp !== null && avgMaxTemp !== null ? round1(day.maxTemp - avgMaxTemp) : null;
    return {
      date: day.date,
      maxTemp: day.maxTemp,
      minTemp: day.minTemp,
      avgMaxTemp,
      avgMinTemp,
      delta,
      level: delta === null ? null : climateLevel(delta),
    };
  });
}

// ---------------------------------------------------------------------------
// 降水对比
// ---------------------------------------------------------------------------

/** 本月往年平均下雨天数（四舍五入） */
export function monthRainDays(months: ClimateMonth[] | null | undefined, date: string): number | null {
  const m = parseDate(date).m;
  const v = months?.find((x) => x.month === m)?.rainDays;
  return v == null ? null : Math.round(v);
}

export interface RainComparison {
  /** 统计的天数（通常 15） */
  days: number;
  /** 往年同期这些天里平均约几天下雨：每天按"当月下雨天数 ÷ 当月天数"累加 */
  usualRainyDays: number;
  /** 预报中降水概率 ≥ 50% 的天数 */
  forecastRainyDays: number;
}

export function rainComparison(daily: DailyPoint[], months: ClimateMonth[] | null | undefined): RainComparison | null {
  if (!months || daily.length === 0) return null;
  let usual = 0;
  for (const day of daily) {
    const { y, m } = parseDate(day.date);
    const rd = months.find((x) => x.month === m)?.rainDays;
    if (rd == null) return null;
    usual += rd / daysInMonth(y, m);
  }
  const forecast = daily.filter((d) => (d.precipProb ?? 0) >= CLIMATE.rainyDayProbAtLeast).length;
  return { days: daily.length, usualRainyDays: Math.round(usual), forecastRainyDays: forecast };
}

// ---------------------------------------------------------------------------
// 首页标签
// ---------------------------------------------------------------------------

export type ClimateLabel =
  | { mode: 'temperature'; comparison: TodayComparison }
  | { mode: 'rain'; comparison: TodayComparison; rainDays: number };

/**
 * 首页顶部的往年对比标签。
 * 热带城市未来 7 天都"和往年差不多"时，改为突出降水（需求文档"文案规则"）。
 */
export function climateLabel(
  location: Pick<WeatherLocation, 'lat'>,
  comparison: TodayComparison | null,
  series: ClimateSeriesPoint[],
  months: ClimateMonth[] | null | undefined,
): ClimateLabel | null {
  if (!comparison) return null;
  const tropical = Math.abs(location.lat) <= CLIMATE.tropicsLatitude;
  if (tropical && comparison.level === 'normal') {
    const week = series.slice(0, CLIMATE.tropicalCheckDays);
    const calm =
      week.length === CLIMATE.tropicalCheckDays &&
      week.every((p) => p.delta !== null && Math.abs(p.delta) < CLIMATE.notableAtLeast);
    const rainDays = monthRainDays(months, comparison.date);
    if (calm && rainDays !== null && rainDays >= CLIMATE.tropicalMinRainDays) {
      return { mode: 'rain', comparison, rainDays };
    }
  }
  return { mode: 'temperature', comparison };
}
