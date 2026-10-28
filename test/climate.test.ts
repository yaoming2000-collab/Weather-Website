import { describe, expect, it } from 'vitest';
import { answerOf, climateLabel, climateLevel, climateSeries, climateTone, compareToday, rainComparison, wordingKey } from '../src/features/climate';
import { withFrozenComparison } from '../src/features';
import { cleanDays, historyBlockStart, iconOfWeatherId, lastYearDate, type PastDay } from '../src/weather/history';
import type { DailyPoint } from '../src/weather/types';

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

function past(date: string, maxTemp: number | null, wet = false): PastDay {
  return { date, maxTemp, minTemp: maxTemp === null ? null : maxTemp - 6, icon: wet ? 'rainy-light' : 'sunny', wet };
}

function dates(start: string, n: number): string[] {
  const t = Date.parse(`${start}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(t + i * 86400_000).toISOString().slice(0, 10));
}

describe('levels and wording', () => {
  it('grades the difference from last year (°C)', () => {
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

  it('picks words by how warm it was last year', () => {
    expect(climateTone(22)).toBe('hot');
    expect(climateTone(21.9)).toBe('mild');
    expect(climateTone(12)).toBe('cold');
    // 热的地方偏暖说"更热"，冷的地方偏暖说"更暖和"
    expect(wordingKey('warmer', 'hot')).toBe('warmer_hot');
    expect(wordingKey('much-cooler', 'cold')).toBe('cooler_cold');
    expect(wordingKey('normal', 'hot')).toBe('normal');
  });
});

describe('today vs the same day last year', () => {
  it('compares the forecast high with last year\'s actual high', () => {
    const c = compareToday(day('2026-10-22', 24.4), past('2025-10-22', 19))!;
    expect(c.deltaMax).toBe(5.4);
    expect(c.level).toBe('warmer');
    expect(c.answer).toBe('warmer');
    expect(c.lastMaxTemp).toBe(19);
    expect(c.lastIcon).toBe('sunny');
    expect(c.tone).toBe('mild');
    expect(c.wording).toBe('warmer_mild');
  });

  it('returns nothing when either side is missing', () => {
    expect(compareToday(day('2026-10-22', null), past('2025-10-22', 19))).toBeNull();
    expect(compareToday(day('2026-10-22', 20), past('2025-10-22', null))).toBeNull();
    expect(compareToday(day('2026-10-22', 20), undefined)).toBeNull();
  });
});

describe('15-day comparison', () => {
  it('pairs each day with the same day last year', () => {
    const ds = dates('2026-10-22', 3);
    const ly: Record<string, PastDay> = { [ds[0]!]: past('2025-10-22', 20), [ds[2]!]: past('2025-10-24', 10) };
    const s = climateSeries(ds.map((d) => day(d, 18)), ly);
    expect(s.map((p) => p.delta)).toEqual([-2, null, 8]);
    expect(s.map((p) => p.level)).toEqual(['cooler', null, 'much-warmer']);
  });
});

describe('rain comparison', () => {
  it('counts rainy days last year against rainy days in the forecast', () => {
    const ds = dates('2026-10-22', 10);
    const ly = Object.fromEntries(ds.map((d, i) => [d, past(d, 20, i < 4)]));
    const r = rainComparison(
      ds.map((d, i) => day(d, 20, { precipProb: i < 2 ? 80 : 10 })),
      ly,
    )!;
    expect(r).toEqual({ days: 10, lastYearRainyDays: 4, forecastRainyDays: 2 });
  });

  it('gives up when most days have no data', () => {
    const ds = dates('2026-10-22', 10);
    const ly = { [ds[0]!]: past(ds[0]!, 20, true) };
    expect(rainComparison(ds.map((d) => day(d, 20)), ly)).toBeNull();
  });
});

describe('home label and frozen answer', () => {
  it('labels only when there is a comparison', () => {
    expect(climateLabel(null)).toBeNull();
    const c = compareToday(day('2026-10-22', 20), past('2025-10-22', 20))!;
    expect(climateLabel(c)).toEqual({ mode: 'temperature', comparison: c });
  });

  it('uses the answer fixed earlier in the day, also for today on the chart', () => {
    const ds = dates('2026-10-22', 2);
    const ly = Object.fromEntries(ds.map((d) => [d, past(d, 15)]));
    const now = compareToday(day(ds[0]!, 16), ly[ds[0]!])!;
    const morning = compareToday(day(ds[0]!, 19), ly[ds[0]!])!;
    const f = withFrozenComparison(
      { comparison: now, label: climateLabel(now), series: climateSeries(ds.map((d) => day(d, 16)), ly), rain: null, nowcast: null, life: [], days: [] },
      morning,
    );
    expect(f.comparison!.answer).toBe('warmer');
    expect(f.label!.comparison.deltaMax).toBe(4);
    expect(f.series[0]!.delta).toBe(4);
    expect(f.series[1]!.delta).toBe(1);
  });
});

describe('last year data from OpenWeather', () => {
  it('uses Feb 28 last year for Feb 29', () => {
    expect(lastYearDate('2028-02-29')).toBe('2027-02-28');
    expect(lastYearDate('2026-10-28')).toBe('2025-10-28');
  });

  it('aligns 10-day blocks the same way everywhere', () => {
    const a = historyBlockStart('2025-10-28');
    const t = (Date.parse('2025-10-28') - Date.parse(a)) / 86400_000;
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(10);
    const plus = (n: number) => new Date(Date.parse(a) + n * 86400_000).toISOString().slice(0, 10);
    expect(historyBlockStart(plus(9))).toBe(a);
    expect(historyBlockStart(plus(10))).toBe(plus(10));
  });

  it('drops a day that repeats the previous one exactly', () => {
    const days = cleanDays([past('2025-10-27', 9.2), { ...past('2025-10-28', 8.13), icon: 'rainy-light' }, { ...past('2025-10-29', 8.13), icon: 'rainy-light' }]);
    expect(days[1]!.maxTemp).toBe(8.13);
    expect(days[2]!.maxTemp).toBeNull();
    expect(days[2]!.icon).toBe('');
  });

  it('maps weather codes to our icons', () => {
    expect(iconOfWeatherId(800)).toBe('sunny');
    expect(iconOfWeatherId(803)).toBe('mostly-cloudy');
    expect(iconOfWeatherId(500)).toBe('rainy-light');
    expect(iconOfWeatherId(211)).toBe('stormy-rain-medium');
    expect(iconOfWeatherId(601)).toBe('snowy-moderate');
    expect(iconOfWeatherId(741)).toBe('foggy');
  });
});
