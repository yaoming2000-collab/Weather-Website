import { ProviderError } from './provider';

/**
 * 过去某天的实际天气（"和去年同一天比"用，Darren 2026-10-28）。
 * 数据来自 OpenWeather One Call API 4.0 的逐日时间线（单独订阅，按次计费，每天前 1,000 次免费）：
 *   GET https://api.openweathermap.org/data/4.0/onecall/timeline/1day?lat&lon&units=metric&start=<Unix 秒>&appid=
 * 2026-10-28 实测：
 * - start 只能是 Unix 时间戳；一次返回 10 天，从 start 所在的 UTC 日期开始
 * - 每条的 dt 是 UTC 0 点，dt 的 UTC 日期就是城市当地的日期（和 3.0 day_summary 按当地时区取的结果完全一致）
 * - 偶尔相邻两天数据完全相同（莫斯科 2025-10-28/29），把后一天当作没有数据
 */
export interface PastDay {
  /** 城市当地日期 YYYY-MM-DD */
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  /** 我们的图标 key（见 src/weather/icons.ts）；没有时为空字符串 */
  icon: string;
  /** 这一天是否下了雨或雪（雷雨、毛毛雨、雨、雪、雨夹雪） */
  wet: boolean | null;
}

export interface PastWeatherSource {
  readonly name: string;
  /** 从 startDate（YYYY-MM-DD）开始的若干天（OpenWeather 一次 10 天） */
  days(lat: number, lon: number, startDate: string): Promise<PastDay[]>;
}

/** 一次请求返回的天数；缓存按这么多天一块 */
export const HISTORY_BLOCK_DAYS = 10;

const API = 'https://api.openweathermap.org/data/4.0/onecall/timeline/1day';

interface RawDay {
  dt?: number;
  temp?: { max?: number; min?: number };
  weather?: Array<{ id?: number }>;
}

export class OpenWeatherHistory implements PastWeatherSource {
  readonly name = 'owm';
  constructor(
    private readonly key: string,
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  async days(lat: number, lon: number, startDate: string): Promise<PastDay[]> {
    // 取那天 UTC 中午：返回的第一条就是这一天
    const start = Math.floor(Date.parse(`${startDate}T12:00:00Z`) / 1000);
    const url = `${API}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&units=metric&start=${start}&appid=${encodeURIComponent(this.key)}`;
    let res: Response;
    try {
      res = await this.fetcher(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
      throw new ProviderError(`OpenWeather request failed (${(err as Error).message})`);
    }
    // 400：参数不对（我们这边的问题），重试也没用，按"没有这份数据"处理（记 1 天），免得反复请求
    if (!res.ok) throw new ProviderError(`OpenWeather responded ${res.status}`, res.status === 400 ? 404 : res.status);
    let body: { data?: RawDay[] };
    try {
      body = (await res.json()) as { data?: RawDay[] };
    } catch {
      throw new ProviderError('OpenWeather returned invalid JSON', res.status);
    }
    const days = cleanDays((body.data ?? []).map(mapDay).filter((d): d is PastDay => d !== null));
    // 回复不完整（缺天、日期对不上）时不要缓存（否则这几天会显示 "--" 一年多），当作临时故障
    if (days.length < HISTORY_BLOCK_DAYS || days[0]!.date !== startDate) {
      throw new ProviderError(`OpenWeather returned ${days.length} days from ${days[0]?.date ?? '-'} (wanted ${HISTORY_BLOCK_DAYS} from ${startDate})`, 502);
    }
    return days.slice(0, HISTORY_BLOCK_DAYS);
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function mapDay(raw: RawDay): PastDay | null {
  if (typeof raw.dt !== 'number') return null;
  const id = num(raw.weather?.[0]?.id);
  return {
    date: new Date(raw.dt * 1000).toISOString().slice(0, 10),
    maxTemp: num(raw.temp?.max),
    minTemp: num(raw.temp?.min),
    icon: id === null ? '' : iconOfWeatherId(id),
    wet: id === null ? null : id < 700,
  };
}

/** 相邻两天温度和天气完全相同：数据源重复了，后一天当作没有数据 */
export function cleanDays(days: PastDay[]): PastDay[] {
  return days.map((d, i) => {
    const prev = days[i - 1];
    if (prev && d.maxTemp !== null && d.maxTemp === prev.maxTemp && d.minTemp === prev.minTemp && d.icon === prev.icon) {
      return { date: d.date, maxTemp: null, minTemp: null, icon: '', wet: null };
    }
    return d;
  });
}

/** OpenWeather 天气代码 → 我们的白天图标（https://openweathermap.org/weather-conditions） */
export function iconOfWeatherId(id: number): string {
  if (id >= 200 && id < 300) {
    if ([200, 210, 230].includes(id)) return 'stormy-rain-light';
    if ([201, 211, 231].includes(id)) return 'stormy-rain-medium';
    return 'stormy-rain-heavy';
  }
  if (id >= 300 && id < 400) return [300, 301, 310].includes(id) ? 'rainy-drizzle' : 'rainy-drizzle-heavy';
  if (id >= 500 && id < 600) {
    if (id === 500) return 'rainy-light';
    if (id === 501) return 'rainy-moderate';
    if (id === 511) return 'rainy-freezing';
    if (id === 520 || id === 521) return 'rainy-shower-light';
    return 'rainy-heavy';
  }
  if (id >= 600 && id < 700) {
    if (id === 600) return 'snowy-light';
    if (id === 601 || id === 621) return 'snowy-moderate';
    if (id === 602 || id === 622) return 'snowy-heavy';
    if (id === 620) return 'snowy-flurries';
    return 'sleet-light';
  }
  if (id === 731 || id === 761) return 'dusty';
  if (id === 751) return 'sandy';
  if (id === 762) return 'volcanic-ash';
  if (id === 771) return 'squalls';
  if (id === 781) return 'tornado';
  if (id >= 700 && id < 800) return 'foggy';
  if (id === 800) return 'sunny';
  if (id === 801 || id === 802) return 'partly-cloudy';
  if (id === 803) return 'mostly-cloudy';
  return 'cloudy';
}

/**
 * 模拟数据：按城市坐标和日期生成稳定的数（本地开发、测试用，不调用 OpenWeather）。
 * 和 MockProvider 的今年预报大致在同一温度范围，所以"热、差不多、冷"三种结果都会出现。
 */
export class MockHistory implements PastWeatherSource {
  readonly name = 'mockly';
  calls = 0;
  async days(lat: number, lon: number, startDate: string): Promise<PastDay[]> {
    this.calls++;
    const startMs = Date.parse(`${startDate}T00:00:00Z`);
    return Array.from({ length: HISTORY_BLOCK_DAYS }, (_, i) => {
      const date = new Date(startMs + i * 86400_000).toISOString().slice(0, 10);
      const r = hash(`${lat.toFixed(2)}|${lon.toFixed(2)}|${date}`);
      // 和 MockProvider 的 baseTemp 同一个公式，再加 ±5° 的随机
      const monthIndex = Number(date.slice(5, 7)) - 1;
      const seasonal = -Math.cos(((monthIndex - 6.5) / 12) * 2 * Math.PI);
      const base = 28 - Math.abs(lat) * 0.45 + seasonal * (lat < 0 ? -1 : 1) * (4 + Math.abs(lat) * 0.18);
      const max = Math.round((base + 5 + (r - 0.5) * 10) * 10) / 10;
      const wet = r > 0.62;
      return { date, maxTemp: max, minTemp: Math.round((max - 10 + r * 2) * 10) / 10, icon: wet ? 'rainy-light' : r > 0.35 ? 'partly-cloudy' : 'sunny', wet };
    });
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** 今年某天对应的"去年同一天"；今年 2 月 29 日对去年 2 月 28 日 */
export function lastYearDate(date: string): string {
  const y = Number(date.slice(0, 4)) - 1;
  const md = date.slice(5);
  if (md === '02-29') return `${y}-02-28`;
  return `${y}-${md}`;
}

/** 日期所在的 10 天块的第一天（块按 1970-01-01 起每 10 天对齐，全球一致，缓存可共用） */
export function historyBlockStart(date: string): string {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400_000);
  const start = day - (((day % HISTORY_BLOCK_DAYS) + HISTORY_BLOCK_DAYS) % HISTORY_BLOCK_DAYS);
  return new Date(start * 86400_000).toISOString().slice(0, 10);
}

/** 不是 Error 时也能取到状态码 */
export function historyStatus(err: unknown): number | null {
  return err instanceof ProviderError ? (err.status ?? null) : null;
}
