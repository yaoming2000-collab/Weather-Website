import { SKY } from '../config/features';
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
export type SkyWeather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'dust';

export interface Sky {
  phase: SkyPhase;
  weather: SkyWeather;
  /** 少云：晴天背景上加几朵云 */
  someClouds: boolean;
  /** 太阳（白天）或月亮（夜晚）在弧线上的位置，0 = 升起，1 = 落下 */
  arc: number;
  /** 是否显示太阳/月亮的圆盘 */
  showDisc: boolean;
  /** 降水强度：0 无，1 小，2 中，3 大（雷暴按 3） */
  intensity: 0 | 1 | 2 | 3;
  /** 雨夹雪 */
  sleet: boolean;
  /** 毛毛雨：雨滴更细、更短、更慢 */
  fine: boolean;
  /** 风：0 平静，1 有风，2 大风，3 狂风 */
  wind: 0 | 1 | 2 | 3;
  /** 风把雨、雪、沙尘往哪边吹：1 向右，-1 向左（按真实风向的东西分量） */
  windSign: 1 | -1;
  /** 沙尘：0 无，1 有，2 严重 */
  dust: 0 | 1 | 2;
  /** 粒子位置的随机种子（同一城市同一小时相同，页面缓存时保持一致） */
  seed: string;
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
  /** 风速、阵风（m/s）和风向（度，风从哪里来） */
  wind?: { speed: number | null; gust: number | null; dir: number | null };
  /** 现在的空气质量（PM10、PM2.5 分指数），用来判断沙尘 */
  air?: { pm10: number | null; pm25: number | null } | null;
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

  const sw = skyWeather(input.icon);
  const dust = dustLevel(input.icon, input.air);
  const weather: SkyWeather = dust ? 'dust' : sw.weather;
  const someClouds = dust ? false : sw.someClouds;
  const wind = windLevel(input.wind?.speed ?? null, input.wind?.gust ?? null);
  const intensity = precipIntensity(input.icon);
  // 阴天（cloudy）看不到太阳；大部分多云（mostly-cloudy）白天还能透出一点太阳的光
  const base = input.icon.replace(/^night-/, '');
  const showDisc = weather === 'clear' || (base === 'mostly-cloudy' && phase !== 'night') || (weather === 'dust' && phase !== 'night');
  const tone = weather === 'clear' ? phase : phase === 'night' ? 'night' : phase === 'day' ? 'day' : 'twilight';
  return {
    phase,
    weather,
    someClouds,
    arc,
    showDisc,
    intensity,
    sleet: isSleet(input.icon),
    fine: base === 'rainy-drizzle',
    wind,
    windSign: windSign(input.wind?.dir ?? null),
    dust,
    seed: `${input.timezone}|${p.hour}|${input.icon}`,
    className: `sky-${tone} wx-${weather}${someClouds ? ' wx-some' : ''}${dust === 2 ? ' wx-dust2' : ''}`,
  };
}

/** 按图标判断雨雪大小，决定雨滴、雪花的数量和速度 */
export function precipIntensity(icon: string): 0 | 1 | 2 | 3 {
  const key = icon.replace(/^night-/, '');
  // 干雷：有雷没雨，只闪光不下雨
  if (key === 'stormy-strong') return 0;
  if (key === 'stormy-rain-light') return 1;
  if (key === 'stormy-rain-medium') return 2;
  if (key.endsWith('-heavy')) return 3;
  if (key.endsWith('-moderate') || key === 'rainy-freezing') return 2;
  if (/^(rainy|snowy|sleet)/.test(key)) return 1;
  return 0;
}

/** 沙尘等级：只在没有雨雪雾时判断（下雨时空气里的沙尘会被冲掉，显示雨更准确） */
export function dustLevel(icon: string, air: { pm10: number | null; pm25: number | null } | null | undefined): 0 | 1 | 2 {
  if (!air || air.pm10 === null) return 0;
  const w = skyWeather(icon).weather;
  if (w !== 'clear' && w !== 'cloudy') return 0;
  if (air.pm10 < SKY.dustAtLeast || (air.pm25 !== null && air.pm25 > air.pm10)) return 0;
  return air.pm10 >= SKY.heavyDustAtLeast ? 2 : 1;
}

export function windLevel(speed: number | null, gust: number | null): 0 | 1 | 2 | 3 {
  const v = Math.max(speed ?? 0, (gust ?? 0) * 0.7);
  if (v >= SKY.galeAtLeast) return 3;
  if (v >= SKY.windyAtLeast) return 2;
  if (v >= SKY.breezyAtLeast) return 1;
  return 0;
}

/** 风向是"风从哪里来"：西风（270°）把东西吹向右边（东），东风吹向左边；南北风默认向左 */
export function windSign(dir: number | null): 1 | -1 {
  if (dir === null) return -1;
  const eastward = -Math.sin((dir * Math.PI) / 180);
  return eastward > 0.25 ? 1 : -1;
}

/** 天空层的 CSS 变量：云飘的速度、雨的倾斜、雪和沙尘的横向漂移，都随风变化 */
export function skyVars(sky: Sky): string {
  const angle = [12, 18, 26, 34][sky.wind]!;
  const dx = Math.tan((angle * Math.PI) / 180) * 132 * sky.windSign;
  const snowDx = [0, 14, 32, 56][sky.wind]! * sky.windSign;
  const drift = [120, 75, 42, 26][sky.wind]!;
  return `--rot:${-sky.windSign * angle}deg;--dx:${dx.toFixed(1)}vh;--sdx:${snowDx}vh;--drift:${drift}s;--ws:${sky.windSign}`;
}

/** 沙尘时首页大图标和天气描述改为沙尘（Foreca 代码里没有沙尘，否则会显示"晴"） */
export function displayIcon(icon: string, sky: Sky): string {
  if (!sky.dust) return icon;
  return sky.dust === 2 ? 'sandy' : 'dusty';
}

/** 雨夹雪：同时显示雨滴和雪花 */
export function isSleet(icon: string): boolean {
  return icon.replace(/^night-/, '').startsWith('sleet');
}

/** 太阳/月亮在视口里的位置（百分比），弧线：两端低、中间高 */
export function discPosition(arc: number): { x: number; y: number } {
  // 升起和落下时在温度数字两侧的空白处，中午到屏幕顶部中间（城市名和按钮之间）
  const x = 8 + arc * 84;
  const y = 46 - Math.sin(arc * Math.PI) * 43;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

export const SKY_REFRESH_MS = 5 * MIN;
