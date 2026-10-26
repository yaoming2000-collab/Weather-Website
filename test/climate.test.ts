import { describe, expect, it } from 'vitest';
import {
  answerOf,
  climateLabel,
  climateLevel,
  climateSeries,
  climateTone,
  compareToday,
  interpolateClimate,
  monthRainDays,
  rainComparison,
  wordingKey,
} from '../src/features/climate';
import type { ClimateDay, ClimateMonth, DailyPoint } from '../src/weather/types';

function day(date: string, maxTemp: number | null, extra: Partial<DailyPoint> = {}): DailyPoint {
  return {
    date,
    symbol: 'd000',
    icon: 'sunny',
    maxTemp,
    minTemp: maxTemp === null ? null : maxTemp - 8,
    precipProb: 0,
    precipAccum: 0,
    maxWindSpeed: 3,
    uvIndex: 3,
    sunrise: null,
    sunset: null,
    ...extra,
  };
}

/** 每月平均最高温 = 月份 × 2（1 月 2°，12 月 24°），每月下雨 15 天 */
const MONTHS: ClimateMonth[] = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  avgMaxTemp: (i + 1) * 2,
  avgMinTemp: (i + 1) * 2 - 8,
  precipSum: 60,
  rainDays: 15,
}));

function dates(start: string, n: number): string[] {
  const t = Date.parse(`${start}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(t + i * 86400_000).toISOString().slice(0, 10));
}

describe('levels and wording', () => {
  it('grades the difference from usual (°C)', () => {
    expect(climateLevel(6)).toBe('much-warmer');
    expect(climateLevel(5.9)).toBe('warmer');
    expect(climateLevel(2)).toBe('warmer');
    expect(climateLevel(1.9)).toBe('normal');
    expect(climateLevel(0)).toBe('normal');
    expect(climateLevel(-1.9)).toBe('normal');
    expect(climateLevel(-2)).toBe('cooler');
    expect(climateLevel(-6)).toBe('much-cooler');
    // 浮点误差不影响分级
    expect(climateLevel(1.9999999)).toBe('warmer');
  });

  it('maps levels to the guess answer', () => {
    expect(answerOf('much-warmer')).toBe('warmer');
    expect(answerOf('cooler')).toBe('colder');
    expect(answerOf('normal')).toBe('same');
  });

  it('picks words by the usual climate of the city', () => {
    expect(climateTone(22)).toBe('hot');
    expect(climateTone(21.9)).toBe('mild');
    expect(climateTone(12)).toBe('cold');
    // 热的地方偏暖说"更热"，冷的地方偏暖说"更暖和"
    expect(wordingKey('warmer', 'hot')).toBe('warmer_hot');
    expect(wordingKey('much-cooler', 'cold')).toBe('cooler_cold');
    expect(wordingKey('normal', 'hot')).toBe('normal');
  });
});

describe('today vs usual', () => {
  const climate: ClimateDay = { monthDay: '10-22', avgMaxTemp: 18.4, avgMinTemp: 9.1, avgTemp: 13 };

  it('compares the forecast high with the usual high for the date', () => {
    const c = compareToday(day('2026-10-22', 24.6, { minTemp: 10 }), climate)!;
    expect(c.deltaMax).toBe(6.2);
    expect(c.deltaMin).toBe(0.9);
    expect(c.level).toBe('much-warmer');
    expect(c.tone).toBe('mild');
    expect(c.answer).toBe('warmer');
    expect(c.wording).toBe('warmer_mild');
  });

  it('returns nothing when data is missing, so the page hides the label', () => {
    expect(compareToday(undefined, climate)).toBeNull();
    expect(compareToday(day('2026-10-22', null), climate)).toBeNull();
    expect(compareToday(day('2026-10-22', 20), null)).toBeNull();
    expect(compareToday(day('2026-10-22', 20), { ...climate, avgMaxTemp: null })).toBeNull();
  });
});

describe('15-day comparison', () => {
  it('uses the monthly value in the middle of the month and wraps December to January', () => {
    expect(interpolateClimate(MONTHS, '2026-01-16')!.avgMaxTemp).toBe(2);
    expect(interpolateClimate(MONTHS, '2026-06-15')!.avgMaxTemp).toBe(12);
    // 1 月 1 日在 12 月中（24°）和 1 月中（2°）之间
    const jan1 = interpolateClimate(MONTHS, '2026-01-01')!.avgMaxTemp!;
    expect(jan1).toBeGreaterThan(2);
    expect(jan1).toBeLessThan(24);
    expect(interpolateClimate(MONTHS.slice(1), '2026-01-01')).toBeNull();
  });

  it('anchors the curve on the exact usual value for today', () => {
    const ds = dates('2026-10-16', 3);
    const today: ClimateDay = { monthDay: '10-16', avgMaxTemp: 25, avgMinTemp: 15, avgTemp: 20 };
    const series = climateSeries(ds.map((d) => day(d, 25)), MONTHS, today);
    expect(series[0]!.avgMaxTemp).toBe(25);
    expect(series[0]!.delta).toBe(0);
    // 10 月中插值为 20°，今天实际 25° → 之后几天整体平移 +5°
    expect(series[1]!.avgMaxTemp).toBeCloseTo(20 + 5 + (2 / 31) * 1, 0);
    expect(series[1]!.level).toBe('normal');
  });

  it('still draws the curve without the daily climate value', () => {
    const series = climateSeries([day('2026-10-16', 30)], MONTHS, null);
    expect(series[0]!.avgMaxTemp).toBe(20);
    expect(series[0]!.level).toBe('much-warmer');
  });
});

describe('rain comparison', () => {
  it('scales monthly rainy days to the forecast period and counts forecast rainy days', () => {
    const ds = dates('2026-10-22', 15);
    const daily = ds.map((d, i) => day(d, 20, { precipProb: i < 4 ? 50 : 49 }));
    // 15 天全在 10 月（下旬到 11 月初）：10 月 10 天 × 15/31 + 11 月 5 天 × 15/30 ≈ 7.3
    expect(rainComparison(daily, MONTHS)).toEqual({ days: 15, usualRainyDays: 7, forecastRainyDays: 4 });
    expect(rainComparison(daily, null)).toBeNull();
    expect(monthRainDays(MONTHS, '2026-10-22')).toBe(15);
  });
});

describe('home label', () => {
  const ds = dates('2026-10-22', 7);
  const calmSeries = climateSeries(ds.map((d) => day(d, 20.5)), MONTHS, { monthDay: '10-22', avgMaxTemp: 20, avgMinTemp: 12, avgTemp: 16 });
  const normal = compareToday(day(ds[0]!, 20.5), { monthDay: '10-22', avgMaxTemp: 20, avgMinTemp: 12, avgTemp: 16 });

  it('switches tropical cities with a calm week to the rain message', () => {
    const label = climateLabel({ lat: 10.8 }, normal, calmSeries, MONTHS);
    expect(label).toMatchObject({ mode: 'rain', rainDays: 15 });
  });

  it('keeps the temperature label outside the tropics, in deserts, or when today is unusual', () => {
    expect(climateLabel({ lat: 40 }, normal, calmSeries, MONTHS)?.mode).toBe('temperature');
    const dry = MONTHS.map((m) => ({ ...m, rainDays: 1 }));
    expect(climateLabel({ lat: 10.8 }, normal, calmSeries, dry)?.mode).toBe('temperature');
    const hot = compareToday(day(ds[0]!, 25), { monthDay: '10-22', avgMaxTemp: 20, avgMinTemp: 12, avgTemp: 16 });
    expect(climateLabel({ lat: 10.8 }, hot, calmSeries, MONTHS)?.mode).toBe('temperature');
    expect(climateLabel({ lat: 10.8 }, null, calmSeries, MONTHS)).toBeNull();
  });
});
