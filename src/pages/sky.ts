import { localParts } from '../time/cityTime';

/**
 * 页面背景："此刻这座城市的天空"。
 *
 * 由两件事决定：
 *   1. 天色（phase）：按城市当地时间和当天的日出日落算出黎明、白天、傍晚金光、黄昏、夜晚；
 *   2. 天气（weather）：晴、多云、雨、雷暴、雪、雾。
 * 太阳和月亮的位置也按真实时间放在一条弧线上：早上在左边低处，中午在高处，傍晚在右边低处。
 * 页面缓存 5 分钟，所以位置最多差 5 分钟，看不出来。
 */

export type SkyPhase = 'dawn' | 'day' | 'golden' | 'dusk' | 'night';
export type SkyWeather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

export interface Sky {
  phase: SkyPhase;
  weather: SkyWeather;
  /** 少云：晴天背景上加几朵云 */
  someClouds: boolean;
  /** 太阳（白天）或月亮（夜晚）在弧线上的位置，0 = 升起，1 = 落下 */
  arc: number;
  /** 是否显示太阳/月亮的圆盘 */
  showDisc: boolean;
  /** body 上的 class */
  className: string;
}

const MIN = 60_000;

function minutesOf(hhmm: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function skyWeather(icon: string): { weather: SkyWeather; someClouds: boolean } {
  const key = icon === 'night' ? 'sunny' : icon.replace(/^night-/, '');
  if (key.startsWith('stormy')) return { weather: 'storm', someClouds: false };
  if (key.startsWith('rainy')) return { weather: 'rain', someClouds: false };
  if (key.startsWith('snowy') || key.startsWith('sleet')) return { weather: 'snow', someClouds: false };
  if (key === 'foggy') return { weather: 'fog', someClouds: false };
  if (key === 'cloudy' || key === 'mostly-cloudy') return { weather: 'cloudy', someClouds: false };
  return { weather: 'clear', someClouds: key === 'partly-cloudy' };
}

/**
 * @param sunrise、sunset 城市当地 "HH:MM:SS"；极昼极夜时为 null，按 6:00 / 18:00 处理
 */
export function computeSky(input: {
  icon: string;
  nowMs: number;
  timezone: string;
  sunrise: string | null | undefined;
  sunset: string | null | undefined;
}): Sky {
  const p = localParts(input.nowMs, input.timezone);
  const now = p.hour * 60 + p.minute;
  const rise = minutesOf(input.sunrise) ?? 6 * 60;
  const set = minutesOf(input.sunset) ?? 18 * 60;

  let phase: SkyPhase;
  if (now < rise - 40 || now > set + 40) phase = 'night';
  else if (now < rise + 40) phase = 'dawn';
  else if (now < set - 70) phase = 'day';
  else if (now < set - 10) phase = 'golden';
  else phase = 'dusk';

  // 天气图标自带昼夜（Foreca 已分好），以它为准，避免"晴天夜间图标 + 白天背景"
  if (input.icon === 'night' || input.icon.startsWith('night-')) phase = phase === 'dusk' || phase === 'dawn' ? phase : 'night';
  else if (phase === 'night') phase = now < 12 * 60 ? 'dawn' : 'dusk';

  let arc: number;
  if (phase === 'night') {
    const nightLen = 24 * 60 - (set - rise);
    const since = now > set ? now - set : now + 24 * 60 - set;
    arc = Math.min(1, Math.max(0, since / nightLen));
  } else {
    arc = Math.min(1, Math.max(0, (now - rise) / Math.max(1, set - rise)));
  }

  const { weather, someClouds } = skyWeather(input.icon);
  const showDisc = weather === 'clear' || (weather === 'cloudy' && phase !== 'night');
  const tone = weather === 'clear' ? phase : phase === 'night' ? 'night' : phase === 'day' ? 'day' : 'twilight';
  return {
    phase,
    weather,
    someClouds,
    arc,
    showDisc,
    className: `sky-${tone} wx-${weather}${someClouds ? ' wx-some' : ''}`,
  };
}

/** 太阳/月亮在视口里的位置（百分比），弧线：两端低、中间高 */
export function discPosition(arc: number): { x: number; y: number } {
  // 升起和落下时在温度数字两侧的空白处，中午到屏幕顶部中间（城市名和按钮之间）
  const x = 8 + arc * 84;
  const y = 46 - Math.sin(arc * Math.PI) * 43;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

export const SKY_REFRESH_MS = 5 * MIN;
