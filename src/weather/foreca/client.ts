import { ProviderError, type WeatherProvider } from '../provider';
import type { WeatherLocation } from '../types';
import {
  mapAirQuality,
  mapClimateDay,
  mapClimateMonthly,
  mapCurrent,
  mapDaily,
  mapHourly,
  mapLocation,
  mapNowcast,
} from './map';
import type {
  RawAirQuality,
  RawClimateDaily,
  RawClimateMonthly,
  RawCurrent,
  RawDaily,
  RawHourly,
  RawLocation,
  RawLocationSearch,
  RawNowcast,
} from './raw';

const BASE_URL = 'https://weatherapi.foreca.net';

/** Foreca 地点接口支持的城市名语言（其余语言的城市名由第 4 步的对照表提供）。 */
const LOCATION_LANGS = new Set(['de', 'en', 'es', 'fr', 'it', 'pl', 'ru', 'fi', 'sv', 'nl', 'ko', 'pt', 'th', 'tr', 'zh']);

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Foreca 天气接口客户端。
 * 所有请求都用英文、摄氏度、m/s，按地点本地时区返回时间；单位和语言在显示时处理，
 * 这样同一城市的数据只缓存一份。
 */
export class ForecaProvider implements WeatherProvider {
  readonly name = 'foreca';

  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 8000,
  ) {
    if (!token) throw new ProviderError('FORECA_TOKEN is not set');
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      throw new ProviderError(`Foreca request failed: ${path} (${(err as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new ProviderError(`Foreca responded ${res.status} for ${path}`, res.status);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new ProviderError(`Foreca returned invalid JSON for ${path}`, res.status);
    }
  }

  private loc(id: string): string {
    return encodeURIComponent(id);
  }

  async nearestLocation(lat: number, lon: number): Promise<WeatherLocation> {
    // Foreca 的坐标顺序是"经度,纬度"
    const raw = await this.get<RawLocation>(`/api/v1/location/${lon.toFixed(4)},${lat.toFixed(4)}`, { lang: 'en' });
    return mapLocation(raw);
  }

  async locationById(id: string): Promise<WeatherLocation> {
    const raw = await this.get<RawLocation>(`/api/v1/location/${this.loc(id)}`, { lang: 'en' });
    return mapLocation(raw);
  }

  async searchLocations(query: string, lang: string): Promise<WeatherLocation[]> {
    const q = query.trim();
    if (!q) return [];
    const raw = await this.get<RawLocationSearch>(`/api/v1/location/search/${encodeURIComponent(q)}`, {
      lang: LOCATION_LANGS.has(lang) ? lang : 'en',
    });
    return (raw.locations ?? []).flatMap((l) => {
      try {
        return [mapLocation(l)];
      } catch {
        return [];
      }
    });
  }

  async current(id: string) {
    return mapCurrent(await this.get<RawCurrent>(`/api/v1/current/${this.loc(id)}`, { lang: 'en' }));
  }

  async hourly(id: string, hours: number) {
    return mapHourly(await this.get<RawHourly>(`/api/v1/forecast/hourly/${this.loc(id)}`, { periods: hours, lang: 'en' }));
  }

  async daily(id: string, days: number) {
    // dataset=full 才包含日出日落、紫外线等字段
    return mapDaily(
      await this.get<RawDaily>(`/api/v1/forecast/daily/${this.loc(id)}`, { periods: days, dataset: 'full', lang: 'en' }),
    );
  }

  async airQuality(id: string, hours: number) {
    return mapAirQuality(
      await this.get<RawAirQuality>(`/api/v1/air-quality/forecast/hourly/${this.loc(id)}`, { periods: hours, lang: 'en' }),
    );
  }

  async climateDay(id: string, monthDay: string) {
    return mapClimateDay(
      await this.get<RawClimateDaily>(`/api/v1/climate/daily/${this.loc(id)}`, { monthday: monthDay }),
      monthDay,
    );
  }

  async climateMonthly(id: string) {
    return mapClimateMonthly(await this.get<RawClimateMonthly>(`/api/v1/climate/monthly/${this.loc(id)}`));
  }

  async nowcast(id: string) {
    return mapNowcast(await this.get<RawNowcast>(`/api/v1/forecast/15minutely/${this.loc(id)}`, { periods: 8 }));
  }
}
