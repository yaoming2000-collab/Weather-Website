import { describe, expect, it } from 'vitest';
import { carwashIndex, clothingIndex, laundryIndex, lifeIndices, runningIndex, sunscreenIndex, type LifeInput } from '../src/features/life';
import { summarizeNowcast } from '../src/features/nowcast';
import type { CurrentWeather, DailyPoint, HourlyPoint, NowcastPoint } from '../src/weather/types';

const NOW = Date.UTC(2026, 9, 22, 12, 0);

/** 从 NOW 开始每 15 分钟一个点（UTC 时间） */
function slots(rates: number[], symbol = 'd320', startOffsetMin = 0): NowcastPoint[] {
  return rates.map((r, i) => ({
    time: new Date(NOW + (startOffsetMin + i * 15) * 60_000).toISOString().replace(':00.000Z', '+00:00'),
    precipRate: r,
    precipProb: r > 0 ? 80 : 5,
    symbol: r > 0 ? symbol : 'd300',
  }));
}

describe('rain timeline', () => {
  it('returns nothing when the data was not requested (sunny city)', () => {
    expect(summarizeNowcast(null, true, NOW)).toBeNull();
    expect(summarizeNowcast([], true, NOW)).toBeNull();
  });

  it('says no rain for the next 2 hours when every slot is dry', () => {
    const s = summarizeNowcast(slots([0, 0, 0.05, 0, 0, 0, 0, 0]), true, NOW)!;
    expect(s.state).toBe('dry');
    expect(s.messageKey).toBe('Nowcast_dry');
    expect(s.bars).toHaveLength(8);
    expect(s.bars.every((b) => b.intensity === 0)).toBe(true);
  });

  it('gives minutes with radar: starts in 25 min, lasts 45 min', () => {
    const s = summarizeNowcast(slots([0, 0, 0.5, 2, 5, 0, 0, 0]), true, NOW + 5 * 60_000)!;
    expect(s.state).toBe('starting');
    expect(s.minutes).toBe(25);
    expect(s.durationMinutes).toBe(45);
    expect(s.messageKey).toBe('Nowcast_startingFor_rain');
    expect(s.vars).toEqual({ min: 25, dur: 45 });
    expect(s.bars.map((b) => b.intensity)).toEqual([0, 0, 1, 2, 3, 0, 0, 0]);
  });

  it('does not invent an end time when the rain lasts past the window', () => {
    const s = summarizeNowcast(slots([0, 0, 0, 0, 0, 0, 1, 1]), true, NOW)!;
    expect(s.messageKey).toBe('Nowcast_starting_rain');
    expect(s.vars).toEqual({ min: 90 });
  });

  it('only gives hour-level wording without radar', () => {
    const soon = summarizeNowcast(slots([0, 0, 1, 1, 1, 0, 0, 0]), false, NOW)!;
    expect(soon.messageKey).toBe('Nowcast_startingSoon_rain');
    expect(soon.vars).toEqual({});
    const later = summarizeNowcast(slots([0, 0, 0, 0, 0, 1, 1, 0]), false, NOW)!;
    expect(later.messageKey).toBe('Nowcast_startingLater_rain');
  });

  it('handles rain that is already falling', () => {
    expect(summarizeNowcast(slots([2, 2, 1, 0, 0, 0, 0, 0]), true, NOW)!).toMatchObject({
      state: 'stopping',
      minutes: 45,
      messageKey: 'Nowcast_stopping_rain',
    });
    expect(summarizeNowcast(slots([2, 2, 1, 0, 0, 0, 0, 0]), false, NOW)!.messageKey).toBe('Nowcast_stoppingSoon_rain');
    expect(summarizeNowcast(slots([1, 1, 1, 1, 1, 1, 1, 1]), true, NOW)!.messageKey).toBe('Nowcast_continuing_rain');
  });

  it('names snow and sleet', () => {
    expect(summarizeNowcast(slots([0, 1, 1, 0, 0, 0, 0, 0], 'n322'), true, NOW)!.kind).toBe('snow');
    expect(summarizeNowcast(slots([0, 1, 1, 0, 0, 0, 0, 0], 'd321'), false, NOW)!.messageKey).toBe('Nowcast_startingSoon_sleet');
  });

  it('skips slots that are already over (cached data)', () => {
    const s = summarizeNowcast(slots([3, 3, 0, 0, 0, 0, 0, 0], 'd320', -30), true, NOW)!;
    expect(s.state).toBe('dry');
    expect(s.bars).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------

function current(extra: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    time: '2026-10-22T12:00+00:00',
    symbol: 'd100',
    icon: 'partly-cloudy',
    temperature: 18,
    feelsLike: 18,
    humidity: 55,
    dewPoint: 9,
    windSpeed: 2,
    windGust: 4,
    windDir: 180,
    precipProb: 5,
    precipRate: 0,
    cloudiness: 20,
    thunderProb: 0,
    uvIndex: 3,
    pressure: 1015,
    visibility: 10000,
    ...extra,
  };
}

function hours(n: number, extra: (i: number) => Partial<HourlyPoint> = () => ({})): HourlyPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(NOW + i * 3600_000).toISOString().replace(':00.000Z', '+00:00'),
    symbol: 'd100',
    icon: 'partly-cloudy',
    temperature: 18,
    feelsLike: 18,
    precipProb: 5,
    precipAccum: 0,
    windSpeed: 2,
    windDir: 180,
    humidity: 55,
    uvIndex: 3,
    ...extra(i),
  }));
}

function days(probs: number[], extra: Partial<DailyPoint> = {}): DailyPoint[] {
  return probs.map((p, i) => ({
    date: `2026-10-${22 + i}`,
    symbol: 'd100',
    icon: 'partly-cloudy',
    maxTemp: 20,
    minTemp: 10,
    precipProb: p,
    precipAccum: 0,
    maxWindSpeed: 5,
    uvIndex: 4,
    sunrise: null,
    sunset: null,
    ...extra,
  }));
}

function input(over: Partial<LifeInput> = {}): LifeInput {
  return {
    current: current(),
    hourly: hours(24),
    daily: days([10, 10, 10]),
    air: [{ time: '2026-10-22T12:00+00:00', aqi: 30, pollutant: null, pm25: 10, pm10: 10, o3: 10, no2: 5, so2: 1, co: 1 }],
    nowMs: NOW,
    ...over,
  };
}

describe('life indices', () => {
  it('rates a mild dry day as good for running', () => {
    expect(runningIndex(input())).toMatchObject({ rating: 'good', summaryKey: 'Life_running_good', reasonKey: 'LifeReason_runGood' });
  });

  it('marks running poor for rain soon, thunder, bad air or extreme feels-like', () => {
    expect(runningIndex(input({ hourly: hours(24, (i) => (i === 2 ? { precipProb: 70 } : {})) }))).toMatchObject({
      rating: 'poor',
      reasonKey: 'LifeReason_rain',
      vars: { prob: 70 },
    });
    expect(runningIndex(input({ current: current({ symbol: 'd240' }) })).reasonKey).toBe('LifeReason_thunder');
    expect(runningIndex(input({ air: [{ ...input().air![0]!, aqi: 180 }] })).reasonKey).toBe('LifeReason_airPoor');
    expect(runningIndex(input({ current: current({ feelsLike: 35 }) })).reasonKey).toBe('LifeReason_tooHot');
    expect(runningIndex(input({ current: current({ feelsLike: -12 }) })).reasonKey).toBe('LifeReason_tooCold');
  });

  it('marks running fair for hot and humid weather', () => {
    expect(runningIndex(input({ current: current({ temperature: 26, feelsLike: 26, humidity: 90 }) }))).toMatchObject({
      rating: 'fair',
      reasonKey: 'LifeReason_muggy',
    });
  });

  it('only looks at the next 3 hours for running', () => {
    expect(runningIndex(input({ hourly: hours(24, (i) => (i === 5 ? { precipProb: 90 } : {})) })).rating).toBe('good');
  });

  it('rates laundry by rain chance, humidity and wind', () => {
    expect(laundryIndex(input({ current: current({ windSpeed: 4 }) })).reasonKey).toBe('LifeReason_dryBreezy');
    expect(laundryIndex(input()).reasonKey).toBe('LifeReason_dry');
    expect(laundryIndex(input({ daily: days([60]) })).rating).toBe('poor');
    expect(laundryIndex(input({ current: current({ humidity: 80 }) }))).toMatchObject({ rating: 'fair', vars: { humidity: 80 } });
    expect(laundryIndex(input({ current: current({ precipRate: 1 }) })).rating).toBe('poor');
  });

  it('rates car washing by the next 2 days', () => {
    expect(carwashIndex(input())!.rating).toBe('good');
    expect(carwashIndex(input({ daily: days([10, 70, 0]) }))!).toMatchObject({ rating: 'poor', vars: { prob: 70 } });
    expect(carwashIndex(input({ daily: days([10, 10, 90]) }))!.rating).toBe('good');
    expect(carwashIndex(input({ daily: days([10, 10], { maxTemp: -3 }) }))!.reasonKey).toBe('LifeReason_freezing');
    expect(carwashIndex(input({ daily: [] }))).toBeNull();
  });

  it('suggests clothes by feels-like temperature', () => {
    const band = (feelsLike: number) => clothingIndex(input({ current: current({ feelsLike }) }))!.summaryKey;
    expect(band(30)).toBe('Life_clothing_hot');
    expect(band(22)).toBe('Life_clothing_warm');
    expect(band(12)).toBe('Life_clothing_cool');
    expect(band(-20)).toBe('Life_clothing_freezing');
    expect(clothingIndex(input({ current: current({ feelsLike: null, temperature: null }) }))).toBeNull();
  });

  it('rates sun protection by the highest UV index today', () => {
    expect(sunscreenIndex(input({ daily: days([0], { uvIndex: 1 }), current: current({ uvIndex: 0 }) }))!.summaryKey).toBe('Life_sunscreen_good');
    expect(sunscreenIndex(input({ daily: days([0], { uvIndex: 7 }) }))).toMatchObject({ rating: 'poor', vars: { uv: 7 } });
  });

  it('lists the five indices in a fixed order', () => {
    expect(lifeIndices(input()).map((i) => i.key)).toEqual(['running', 'laundry', 'carwash', 'clothing', 'sunscreen']);
  });
});
