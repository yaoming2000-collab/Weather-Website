import { describe, expect, it } from 'vitest';
import { answerOf, climateLabel, climateLevel, climateTone, compareToday, pastSeries, rainComparison, wordingKey } from '../src/features/climate';
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

describe('past 7 days: this year vs last year', () => {
  const thisYear = (ds: string[], t: (i: number) => number | null) => Object.fromEntries(ds.map((d, i) => [d, past(d, t(i))]));

  it('ends yesterday and pairs each day with the same day last year (never today or later)', () => {
    const ds = dates('2026-10-15', 7); // 10-15 … 10-21
    const now = thisYear(ds, () => 18);
    const ly: Record<string, PastDay> = { [ds[6]!]: past('2025-10-21', 20), [ds[0]!]: past('2025-10-15', 10) };
    const s = pastSeries('2026-10-22', now, ly, 7);
    expect(s.map((p) => p.date)).toEqual(ds);
    expect(s[0]!.delta).toBe(8);
    expect(s[6]!.delta).toBe(-2);
    expect(s[6]!.level).toBe('cooler');
    expect(s[3]!.delta).toBeNull();
  });

  it('moves back a day while yesterday is not in yet', () => {
    const ds = dates('2026-10-14', 7); // 到 10-20，10-21 还没有
    const s = pastSeries('2026-10-22', thisYear(ds, () => 18), {}, 7);
    expect(s.at(-1)!.date).toBe('2026-10-20');
    // 两天都没有（例如还在准备）：仍然按昨天排，显示 "--"
    expect(pastSeries('2026-10-22', {}, {}, 7).at(-1)!.date).toBe('2026-10-21');
  });
});

describe('rain comparison', () => {
  it('counts rainy days this year and last year over the same days', () => {
    const ds = dates('2026-10-15', 7);
    const now = Object.fromEntries(ds.map((d, i) => [d, past(d, 20, i < 2)]));
    const ly = Object.fromEntries(ds.map((d, i) => [d, past(d, 20, i < 4)]));
    expect(rainComparison(ds, now, ly)).toEqual({ days: 7, lastYearRainyDays: 4, thisYearRainyDays: 2 });
  });

  it('gives up when most days have no data', () => {
    const ds = dates('2026-10-15', 7);
    const ly = { [ds[0]!]: past(ds[0]!, 20, true) };
    expect(rainComparison(ds, ly, ly)).toBeNull();
    expect(rainComparison(ds, null, ly)).toBeNull();
  });
});

describe('home label and frozen answer', () => {
  it('labels only when there is a comparison', () => {
    expect(climateLabel(null)).toBeNull();
    const c = compareToday(day('2026-10-22', 20), past('2025-10-22', 20))!;
    expect(climateLabel(c)).toEqual({ mode: 'temperature', comparison: c });
  });

  it('uses the answer fixed earlier in the day', () => {
    const ly = past('2025-10-22', 15);
    const now = compareToday(day('2026-10-22', 16), ly)!;
    const morning = compareToday(day('2026-10-22', 19), ly)!;
    const f = withFrozenComparison({ comparison: now, label: climateLabel(now), series: [], rain: null, nowcast: null, life: [], days: [] }, morning);
    expect(f.comparison!.answer).toBe('warmer');
    expect(f.label!.comparison.deltaMax).toBe(4);
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

describe('OpenWeather replies', () => {
  const reply = (days: number, from = '2025-10-28', status = 200) => async () =>
    new Response(
      JSON.stringify({ data: Array.from({ length: days }, (_, i) => ({ dt: Date.parse(`${from}T00:00:00Z`) / 1000 + i * 86400, temp: { max: 10 + i, min: i }, weather: [{ id: 800 }] })) }),
      { status },
    );

  it('accepts a full 10-day block', async () => {
    const { OpenWeatherHistory } = await import('../src/weather/history');
    const days = await new OpenWeatherHistory('k', reply(10)).days(1, 2, '2025-10-28');
    expect(days).toHaveLength(10);
    expect(days[0]!.date).toBe('2025-10-28');
  });

  it('refuses to cache a short or shifted reply, and treats 400 as "not available"', async () => {
    const { OpenWeatherHistory } = await import('../src/weather/history');
    await expect(new OpenWeatherHistory('k', reply(3)).days(1, 2, '2025-10-28')).rejects.toMatchObject({ status: 502 });
    await expect(new OpenWeatherHistory('k', reply(10, '2025-10-27')).days(1, 2, '2025-10-28')).rejects.toMatchObject({ status: 502 });
    await expect(new OpenWeatherHistory('k', reply(0, '2025-10-28', 400)).days(1, 2, '2025-10-28')).rejects.toMatchObject({ status: 404 });
  });

  it('uses the answer fixed earlier when today cannot be computed now', () => {
    const c = compareToday(day('2026-10-22', 20), past('2025-10-22', 15))!;
    const f = withFrozenComparison({ comparison: null, label: null, series: [], rain: null, nowcast: null, life: [], days: [] }, c);
    expect(f.comparison).toBe(c);
    expect(f.label?.comparison).toBe(c);
  });
});
