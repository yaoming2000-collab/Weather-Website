import { CLIMATE, CLIMATE_LEVEL_COLORS } from '../config/features';
import type { PastDay } from '../weather/history';
import type { DailyPoint } from '../weather/types';

/**
 * 今天比去年同一天热还是冷（2026-10-28 起；之前是和 1991–2020 年平均比）。
 *
 * 只做计算，不做显示：页面拿这里的结果，配合 i18n 文案 key 渲染。
 * 一律用摄氏度计算和分级；显示 °F 时偏差 × 1.8 再四舍五入（浏览器里换算，见 client/lib/units.ts）。
 * 比较的是"今天的预报最高温"和"去年同一天的实际最高温"（OpenWeather）。
 */

export type ClimateLevel = keyof typeof CLIMATE_LEVEL_COLORS;
/** 猜一猜的三个选项 */
export type GuessChoice = 'colder' | 'same' | 'warmer';
export const GUESS_CHOICES: readonly GuessChoice[] = ['colder', 'same', 'warmer'];
/** 按去年那天的气温选用词：hot 说"更热/更凉快"，cold 说"更暖和/更冷"，mild 说"更暖/更冷" */
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

export function climateTone(refMaxTemp: number): ClimateTone {
  if (refMaxTemp >= CLIMATE.hotClimateAtLeast) return 'hot';
  if (refMaxTemp <= CLIMATE.coldClimateAtMost) return 'cold';
  return 'mild';
}

/**
 * 文案 key 的后缀。例如 tone=hot、偏暖 → "warmer_hot"，对应 en.json 的
 * ClimateLabel_warmer_hot = "{delta}° hotter than last year"。差不多时为 "normal"。
 */
export function wordingKey(level: ClimateLevel, tone: ClimateTone): string {
  const answer = answerOf(level);
  if (answer === 'same') return 'normal';
  return `${answer === 'warmer' ? 'warmer' : 'cooler'}_${tone}`;
}

/** 猜一猜按钮的文案 key 后缀（按钮用词也随气温变化） */
export function guessButtonKey(choice: GuessChoice, tone: ClimateTone): string {
  if (choice === 'same') return 'same';
  return `${choice === 'warmer' ? 'warmer' : 'cooler'}_${tone}`;
}

export interface TodayComparison {
  date: string;
  maxTemp: number;
  minTemp: number | null;
  /** 去年同一天的实际最高、最低温 */
  lastMaxTemp: number;
  lastMinTemp: number | null;
  /** 去年同一天的天气图标 key（空字符串 = 不知道） */
  lastIcon: string;
  /** 今天预报最高温 − 去年同一天最高温（°C，一位小数） */
  deltaMax: number;
  deltaMin: number | null;
  level: ClimateLevel;
  tone: ClimateTone;
  answer: GuessChoice;
  /** 文案 key 后缀，见 wordingKey */
  wording: string;
}

export function compareToday(day: DailyPoint | undefined, past: PastDay | null | undefined): TodayComparison | null {
  if (!day || day.maxTemp === null || !past || past.maxTemp === null) return null;
  const deltaMax = round1(day.maxTemp - past.maxTemp);
  const deltaMin = day.minTemp !== null && past.minTemp !== null ? round1(day.minTemp - past.minTemp) : null;
  const level = climateLevel(deltaMax);
  const tone = climateTone(past.maxTemp);
  return {
    date: day.date,
    maxTemp: day.maxTemp,
    minTemp: day.minTemp,
    lastMaxTemp: past.maxTemp,
    lastMinTemp: past.minTemp,
    lastIcon: past.icon,
    deltaMax,
    deltaMin,
    level,
    tone,
    answer: answerOf(level),
    wording: wordingKey(level, tone),
  };
}

// ---------------------------------------------------------------------------
// 过去 7 天：今年实际 vs 去年同期（2026-10-29 起，只用过去的日子，不泄漏以后的题）
// ---------------------------------------------------------------------------

export interface ClimateSeriesPoint {
  date: string;
  /** 今年这天的实际最高温 */
  maxTemp: number | null;
  /** 去年同一天的实际最高温 */
  lastMaxTemp: number | null;
  /** 今年 − 去年；任一值缺失时为 null */
  delta: number | null;
  /** 偏差超过 ±2° 的日子标颜色；其余为 normal */
  level: ClimateLevel | null;
}

/**
 * 最近 days 天（到昨天为止；昨天还没有今年的数据时往前挪一天）。
 * thisYear：今年的实际天气，键是日期；lastYear：去年同一天，键是今年的日期。
 */
export function pastSeries(
  today: string,
  thisYear: Record<string, PastDay> | null | undefined,
  lastYear: Record<string, PastDay> | null | undefined,
  days: number,
): ClimateSeriesPoint[] {
  const yesterday = shiftDate(today, -1);
  const end = thisYear?.[yesterday] || !thisYear?.[shiftDate(today, -2)] ? yesterday : shiftDate(today, -2);
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(end, i - days + 1);
    const maxTemp = thisYear?.[date]?.maxTemp ?? null;
    const lastMaxTemp = lastYear?.[date]?.maxTemp ?? null;
    const delta = maxTemp !== null && lastMaxTemp !== null ? round1(maxTemp - lastMaxTemp) : null;
    return { date, maxTemp, lastMaxTemp, delta, level: delta === null ? null : climateLevel(delta) };
  });
}

function shiftDate(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 降水对比：同样这几天，今年和去年各有几天下雨（雪）
// ---------------------------------------------------------------------------

export interface RainComparison {
  /** 统计的天数（两边都有数据的天数，通常 7） */
  days: number;
  lastYearRainyDays: number;
  thisYearRainyDays: number;
}

export function rainComparison(
  dates: string[],
  thisYear: Record<string, PastDay> | null | undefined,
  lastYear: Record<string, PastDay> | null | undefined,
): RainComparison | null {
  if (!thisYear || !lastYear) return null;
  const both = dates.filter((d) => thisYear[d]?.wet != null && lastYear[d]?.wet != null);
  // 一半以上的天数缺数据时不比
  if (both.length === 0 || both.length < dates.length / 2) return null;
  return {
    days: both.length,
    lastYearRainyDays: both.filter((d) => lastYear[d]!.wet).length,
    thisYearRainyDays: both.filter((d) => thisYear[d]!.wet).length,
  };
}

// ---------------------------------------------------------------------------
// 首页标签
// ---------------------------------------------------------------------------

export type ClimateLabel = { mode: 'temperature'; comparison: TodayComparison };

/** 首页顶部的"和去年比"标签（没猜之前页面上只显示"猜一猜"，见 home.tsx ClimateTag） */
export function climateLabel(comparison: TodayComparison | null): ClimateLabel | null {
  return comparison ? { mode: 'temperature', comparison } : null;
}
