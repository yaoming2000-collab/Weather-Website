import { LIFE, NOWCAST } from '../config/features';
import { currentHourIndex } from '../time/cityTime';
import { parseSymbol } from '../weather/icons';
import type { AirQualityPoint, CurrentWeather, DailyPoint, HourlyPoint } from '../weather/types';

/**
 * 生活指数（需求文档"生活指数"）：自己计算，不依赖供应商。
 * 阈值在 src/config/features.ts 的 LIFE 里。
 *
 * 每个指数给出 rating（good 适合 / fair 一般 / poor 不适合）和一个理由。
 * 穿衣没有好坏之分，rating 为 null，给出体感温度档位 band。
 * 理由里不放温度、风速数字（避免单位换算问题），只放百分比和 AQI 这类无单位的数。
 */

export const LIFE_INDEX_KEYS = ['running', 'laundry', 'carwash', 'clothing', 'sunscreen'] as const;
export type LifeIndexKey = (typeof LIFE_INDEX_KEYS)[number];
export type LifeRating = 'good' | 'fair' | 'poor';

export interface LifeIndex {
  key: LifeIndexKey;
  rating: LifeRating | null;
  /** 结论文案 key，例如 Life_running_good、Life_clothing_cool */
  summaryKey: string;
  /** 理由文案 key，例如 LifeReason_rain */
  reasonKey: string;
  vars: Record<string, number>;
}

export interface LifeInput {
  current: CurrentWeather;
  hourly: HourlyPoint[] | null | undefined;
  daily: DailyPoint[] | null | undefined;
  air: AirQualityPoint[] | null | undefined;
  nowMs: number;
}

type Verdict = { rating: LifeRating; reasonKey: string; vars?: Record<string, number> };

function upcoming<T extends { time: string }>(list: T[] | null | undefined, nowMs: number, n: number): T[] {
  if (!list || list.length === 0) return [];
  const i = currentHourIndex(list.map((x) => x.time), nowMs);
  return i === -1 ? [] : list.slice(i, i + n);
}

function maxOf(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  return nums.length ? Math.max(...nums) : null;
}

const isThunder = (symbol: string | null) => parseSymbol(symbol)?.precip === 4;
const isWetNow = (c: CurrentWeather) => (c.precipRate ?? 0) >= NOWCAST.wetAtLeast;

function build(key: LifeIndexKey, v: Verdict): LifeIndex {
  return { key, rating: v.rating, summaryKey: `Life_${key}_${v.rating}`, reasonKey: v.reasonKey, vars: v.vars ?? {} };
}

export function runningIndex(input: LifeInput): LifeIndex {
  const T = LIFE.running;
  const { current } = input;
  const hours = upcoming(input.hourly, input.nowMs, T.hours);
  const prob = maxOf([current.precipProb, ...hours.map((h) => h.precipProb)]) ?? 0;
  const feels = current.feelsLike ?? current.temperature;
  const aqi = upcoming(input.air, input.nowMs, 1)[0]?.aqi ?? null;
  const wind = current.windSpeed ?? 0;
  const thunder = isThunder(current.symbol) || hours.some((h) => isThunder(h.symbol));

  const verdict = ((): Verdict => {
    if (thunder) return { rating: 'poor', reasonKey: 'LifeReason_thunder' };
    if (isWetNow(current) || prob >= T.poor.precipProbAtLeast) return { rating: 'poor', reasonKey: 'LifeReason_rain', vars: { prob } };
    if (aqi !== null && aqi > T.poor.aqiAbove) return { rating: 'poor', reasonKey: 'LifeReason_airPoor', vars: { aqi } };
    if (feels !== null && feels > T.poor.feelsAbove) return { rating: 'poor', reasonKey: 'LifeReason_tooHot' };
    if (feels !== null && feels < T.poor.feelsBelow) return { rating: 'poor', reasonKey: 'LifeReason_tooCold' };
    if (wind >= T.poor.windAtLeast) return { rating: 'poor', reasonKey: 'LifeReason_veryWindy' };

    if (prob >= T.fair.precipProbAtLeast) return { rating: 'fair', reasonKey: 'LifeReason_maybeRain', vars: { prob } };
    if (aqi !== null && aqi > T.fair.aqiAbove) return { rating: 'fair', reasonKey: 'LifeReason_airFair', vars: { aqi } };
    if (feels !== null && feels > T.fair.feelsAbove) return { rating: 'fair', reasonKey: 'LifeReason_hot' };
    if (feels !== null && feels < T.fair.feelsBelow) return { rating: 'fair', reasonKey: 'LifeReason_cold' };
    if ((current.humidity ?? 0) >= T.fair.humidityAtLeast && (current.temperature ?? 0) >= T.fair.humidTempAtLeast) {
      return { rating: 'fair', reasonKey: 'LifeReason_muggy' };
    }
    if (wind >= T.fair.windAtLeast) return { rating: 'fair', reasonKey: 'LifeReason_windy' };
    return { rating: 'good', reasonKey: 'LifeReason_runGood' };
  })();
  return build('running', verdict);
}

export function laundryIndex(input: LifeInput): LifeIndex {
  const T = LIFE.laundry;
  const { current } = input;
  const hours = upcoming(input.hourly, input.nowMs, T.hours);
  const today = input.daily?.[0];
  const prob = maxOf([current.precipProb, today?.precipProb, ...hours.map((h) => h.precipProb)]) ?? 0;
  const humidity = current.humidity ?? 0;

  const verdict = ((): Verdict => {
    if (isWetNow(current) || prob >= T.poor.precipProbAtLeast) return { rating: 'poor', reasonKey: 'LifeReason_rain', vars: { prob } };
    if (humidity >= T.poor.humidityAtLeast) return { rating: 'poor', reasonKey: 'LifeReason_veryHumid', vars: { humidity } };
    if (prob >= T.fair.precipProbAtLeast) return { rating: 'fair', reasonKey: 'LifeReason_maybeRain', vars: { prob } };
    if (humidity >= T.fair.humidityAtLeast) return { rating: 'fair', reasonKey: 'LifeReason_humid', vars: { humidity } };
    if ((current.temperature ?? 99) < T.fair.tempBelow) return { rating: 'fair', reasonKey: 'LifeReason_slowDrying' };
    if ((current.windSpeed ?? 0) >= T.breezyAtLeast) return { rating: 'good', reasonKey: 'LifeReason_dryBreezy' };
    return { rating: 'good', reasonKey: 'LifeReason_dry' };
  })();
  return build('laundry', verdict);
}

export function carwashIndex(input: LifeInput): LifeIndex | null {
  const T = LIFE.carwash;
  const days = (input.daily ?? []).slice(0, T.days);
  if (days.length === 0) return null;
  const prob = maxOf(days.map((d) => d.precipProb)) ?? 0;
  const accum = maxOf(days.map((d) => d.precipAccum)) ?? 0;
  const warmest = maxOf(days.map((d) => d.maxTemp));

  const verdict = ((): Verdict => {
    if (prob >= T.poor.precipProbAtLeast || accum >= T.poor.precipAccumAtLeast) {
      return { rating: 'poor', reasonKey: 'LifeReason_rainSoon', vars: { prob } };
    }
    if (prob >= T.fair.precipProbAtLeast) return { rating: 'fair', reasonKey: 'LifeReason_maybeRainSoon', vars: { prob } };
    if (warmest !== null && warmest <= T.fair.maxTempAtMost) return { rating: 'fair', reasonKey: 'LifeReason_freezing' };
    return { rating: 'good', reasonKey: 'LifeReason_drySoon' };
  })();
  return build('carwash', verdict);
}

export function clothingIndex(input: LifeInput): LifeIndex | null {
  const feels = input.current.feelsLike ?? input.current.temperature;
  if (feels === null) return null;
  const band = LIFE.clothing.find((b) => feels >= b.feelsAtLeast)!.band;
  return { key: 'clothing', rating: null, summaryKey: `Life_clothing_${band}`, reasonKey: `ClothingTip_${band}`, vars: {} };
}

export function sunscreenIndex(input: LifeInput): LifeIndex | null {
  const T = LIFE.sunscreen;
  const uv = maxOf([input.daily?.[0]?.uvIndex, input.current.uvIndex]);
  if (uv === null) return null;
  const rating: LifeRating = uv >= T.poorAtLeast ? 'poor' : uv >= T.fairAtLeast ? 'fair' : 'good';
  return build('sunscreen', { rating, reasonKey: 'LifeReason_uv', vars: { uv: Math.round(uv) } });
}

/** 首页"生活指数"一行：按固定顺序，数据不足的指数不显示 */
export function lifeIndices(input: LifeInput): LifeIndex[] {
  return [runningIndex(input), laundryIndex(input), carwashIndex(input), clothingIndex(input), sunscreenIndex(input)].filter(
    (x): x is LifeIndex => x !== null,
  );
}

export function isLifeIndexKey(s: string | undefined): s is LifeIndexKey {
  return (LIFE_INDEX_KEYS as readonly string[]).includes(s ?? '');
}

/**
 * 未来几个小时每小时的评级（生活指数详情页的时间条）：把每个小时当作"现在"重新计算。
 * 只支持跑步、晾衣、防晒；洗车和穿衣看的是整天，不按小时。
 */
export function hourlyRatings(key: 'running' | 'laundry' | 'sunscreen', input: LifeInput, hours = 12): Array<{ time: string; rating: LifeRating }> {
  const list = upcoming(input.hourly, input.nowMs, hours);
  const all = input.hourly ?? [];
  return list.map((h) => {
    const at = Date.parse(h.time);
    if (key === 'sunscreen') {
      const uv = h.uvIndex ?? 0;
      const rating: LifeRating = uv >= LIFE.sunscreen.poorAtLeast ? 'poor' : uv >= LIFE.sunscreen.fairAtLeast ? 'fair' : 'good';
      return { time: h.time, rating };
    }
    const current: CurrentWeather = {
      ...input.current,
      time: h.time,
      symbol: h.symbol,
      icon: h.icon,
      temperature: h.temperature,
      feelsLike: h.feelsLike,
      humidity: h.humidity ?? input.current.humidity,
      windSpeed: h.windSpeed,
      precipProb: h.precipProb,
      precipRate: h.precipAccum,
      uvIndex: h.uvIndex,
    };
    // 晾衣按小时看时不用整天的降水概率，否则一整天都会是同一个结论
    const at1 = { ...input, current, hourly: all, nowMs: at, daily: key === 'laundry' ? undefined : input.daily };
    return { time: h.time, rating: (key === 'running' ? runningIndex(at1) : laundryIndex(at1)).rating! };
  });
}

/** 最适合的时间：第一个"适合"的小时；没有就返回 null */
export function bestHour(ratings: Array<{ time: string; rating: LifeRating }>): string | null {
  return ratings.find((r) => r.rating === 'good')?.time ?? null;
}
