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
import { forecaLocationLang } from './langs';
import { FORECAST_PERIODS } from '../../config/thresholds';

const BASE_URL = 'https://weatherapi.foreca.net';


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
    private readonly retryDelayMs = 400,
  ) {
    if (!token) throw new ProviderError('FORECA_TOKEN is not set');
  }

  /**
   * 请求一次；只有页面离不开的数据（地点、实况）在遇到限流（429）或临时故障（502/503/504）时稍等再试一次。
   * 其他数据失败时页面照常显示、1 分钟后补，不重试，避免在已经限流时把请求量翻倍。
   * 每秒上限按套餐：Stratus 到 Altocumulus 10 次，Cirrus 50 次，Nimbus 500 次（business.foreca.com/weather-api/pricing，2026-10-27）；
   * 试用和 Freemium 另有每天 2,000 次的上限。失败的请求不计入用量。
   */
  private async get<T>(path: string, params: Record<string, string | number> = {}, retry = false): Promise<T> {
    try {
      return await this.getOnce<T>(path, params);
    } catch (err) {
      if (!retry || !(err instanceof ProviderError) || ![429, 502, 503, 504].includes(err.status ?? 0)) throw err;
      await new Promise((r) => setTimeout(r, this.retryDelayMs + Math.random() * this.retryDelayMs));
      return this.getOnce<T>(path, params);
    }
  }

  private async getOnce<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
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
    const raw = await this.get<RawLocation>(`/api/v1/location/${lon.toFixed(4)},${lat.toFixed(4)}`, { lang: 'en' }, true);
    return mapLocation(raw);
  }

  async locationById(id: string): Promise<WeatherLocation> {
    const raw = await this.get<RawLocation>(`/api/v1/location/${this.loc(id)}`, { lang: 'en' }, true);
    return mapLocation(raw);
  }

  async searchLocations(query: string, lang: string): Promise<WeatherLocation[]> {
    const q = query.trim();
    if (!q) return [];
    const raw = await this.get<RawLocationSearch>(`/api/v1/location/search/${encodeURIComponent(q)}`, {
      lang: forecaLocationLang(lang),
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
    return mapCurrent(await this.get<RawCurrent>(`/api/v1/current/${this.loc(id)}`, { lang: 'en' }, true));
  }

  async hourly(id: string, hours: number) {
    // dataset=full 才包含湿度、紫外线（2026-10-26 用真实接口核实：默认数据集没有 relHumidity、uvIndex）
    return mapHourly(
      await this.get<RawHourly>(`/api/v1/forecast/hourly/${this.loc(id)}`, { periods: hours, dataset: 'full', lang: 'en' }),
    );
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
    return mapNowcast(await this.get<RawNowcast>(`/api/v1/forecast/15minutely/${this.loc(id)}`, { periods: FORECAST_PERIODS.nowcast }));
  }
}
