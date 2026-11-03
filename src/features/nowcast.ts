import { NOWCAST } from '../config/features';
import { parseSymbol } from '../weather/icons';
import type { NowcastPoint } from '../weather/types';

/**
 * 降雨时间轴的结论（需求文档"降雨时间轴"）。
 *
 * 有雷达的地区给出精确到分钟的结论（"35 分钟后开始下雨，持续约 60 分钟"）；
 * 没有雷达的地区数据是由逐小时预报插值的，只给小时级的说法（"未来 1 小时内可能下雨"）。
 */

export type PrecipKind = 'rain' | 'sleet' | 'snow';
export type NowcastState = 'dry' | 'starting' | 'stopping' | 'continuing';

export interface NowcastBar {
  time: string;
  rate: number | null;
  /** 0 无，1 小，2 中，3 大 */
  intensity: 0 | 1 | 2 | 3;
}

export interface NowcastSummary {
  state: NowcastState;
  kind: PrecipKind;
  /** true = 有雷达，分钟数可信 */
  precise: boolean;
  /** starting：多少分钟后开始；stopping：多少分钟后停止 */
  minutes: number | null;
  /** starting 且有雷达时：这一阵持续多少分钟；超出 2 小时范围时为 null */
  durationMinutes: number | null;
  bars: NowcastBar[];
  /** en.json 中的文案 key，变量见 vars */
  messageKey: string;
  vars: Record<string, number>;
}

const SLOT_MS = 15 * 60_000;

/** 降雨时间轴可能出现的全部文案 key（浏览器重算时要用，见 client/lib/nowcast.ts） */
export const NOWCAST_MESSAGE_KEYS: readonly string[] = [
  'Nowcast_dry',
  ...(['rain', 'sleet', 'snow'] as const).flatMap((k) =>
    ['starting', 'startingFor', 'stopping', 'continuing', 'startingSoon', 'startingLater', 'stoppingSoon', 'stoppingLater'].map((st) => `Nowcast_${st}_${k}`),
  ),
];

function intensity(rate: number | null): NowcastBar['intensity'] {
  const r = rate ?? 0;
  if (r < NOWCAST.wetAtLeast) return 0;
  if (r < NOWCAST.moderateAtLeast) return 1;
  if (r < NOWCAST.heavyAtLeast) return 2;
  return 3;
}

function kindOf(symbol: string | null): PrecipKind {
  const p = parseSymbol(symbol);
  if (p?.type === 2) return 'snow';
  if (p?.type === 1) return 'sleet';
  return 'rain';
}

function roundMinutes(ms: number): number {
  const step = NOWCAST.roundMinutesTo;
  return Math.max(step, Math.round(ms / 60_000 / step) * step);
}

/**
 * @param points 逐 15 分钟降水（每个点是这 15 分钟的开始时间）
 * @param radar  该城市是否有雷达覆盖（src/config/radar.ts）
 * @param nowMs  当前时间
 * 返回 null 表示没有数据（例如晴天没有请求接口），此时页面不显示时间轴。
 */
export function summarizeNowcast(points: NowcastPoint[] | null | undefined, radar: boolean, nowMs: number): NowcastSummary | null {
  if (!points || points.length === 0) return null;
  // 去掉已经过去的格子（缓存最多 30 分钟，开头可能有已过去的点）
  const upcoming = points
    .map((p) => ({ p, t: Date.parse(p.time) }))
    .filter(({ t }) => Number.isFinite(t) && t + SLOT_MS > nowMs)
    .slice(0, 8);
  if (upcoming.length === 0) return null;

  const bars: NowcastBar[] = upcoming.map(({ p }) => ({ time: p.time, rate: p.precipRate, intensity: intensity(p.precipRate) }));
  const wet = bars.map((b) => b.intensity > 0);
  const firstWet = wet.indexOf(true);
  const base = { precise: radar, bars };

  if (firstWet === -1) {
    return { ...base, state: 'dry', kind: 'rain', minutes: null, durationMinutes: null, messageKey: 'Nowcast_dry', vars: {} };
  }

  const kind = kindOf(upcoming[firstWet]!.p.symbol);

  if (firstWet === 0) {
    const firstDry = wet.indexOf(false);
    if (firstDry === -1) {
      return { ...base, state: 'continuing', kind, minutes: null, durationMinutes: null, messageKey: `Nowcast_continuing_${kind}`, vars: {} };
    }
    const minutes = roundMinutes(upcoming[firstDry]!.t - nowMs);
    if (radar) {
      return { ...base, state: 'stopping', kind, minutes, durationMinutes: null, messageKey: `Nowcast_stopping_${kind}`, vars: { min: minutes } };
    }
    const soon = minutes <= 60;
    return {
      ...base,
      state: 'stopping',
      kind,
      minutes,
      durationMinutes: null,
      messageKey: `Nowcast_${soon ? 'stoppingSoon' : 'stoppingLater'}_${kind}`,
      vars: {},
    };
  }

  const minutes = roundMinutes(upcoming[firstWet]!.t - nowMs);
  if (radar) {
    const dryAfter = wet.indexOf(false, firstWet);
    const durationMinutes = dryAfter === -1 ? null : roundMinutes(upcoming[dryAfter]!.t - upcoming[firstWet]!.t);
    return {
      ...base,
      state: 'starting',
      kind,
      minutes,
      durationMinutes,
      messageKey: durationMinutes === null ? `Nowcast_starting_${kind}` : `Nowcast_startingFor_${kind}`,
      vars: durationMinutes === null ? { min: minutes } : { min: minutes, dur: durationMinutes },
    };
  }
  const soon = minutes <= 60;
  return {
    ...base,
    state: 'starting',
    kind,
    minutes,
    durationMinutes: null,
    messageKey: `Nowcast_${soon ? 'startingSoon' : 'startingLater'}_${kind}`,
    vars: {},
  };
}
