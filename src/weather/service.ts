import { DATA_TTL, MAX_STALE_SECONDS } from '../config/thresholds';
import { hasRadar } from '../config/radar';
import type { CacheEntry, CacheStore } from '../cache/store';
import { localDate, monthDayOf } from '../time/cityTime';
import { ProviderError, type WeatherProvider } from './provider';
import type {
  AirQualityPoint,
  ClimateDay,
  ClimateMonth,
  CurrentWeather,
  DailyPoint,
  Fetched,
  HourlyPoint,
  NowcastPoint,
  WeatherLocation,
} from './types';

/**
 * 天气数据模块：页面拿数据的唯一入口。
 * 负责：按城市缓存（与语言、单位无关）、合并并发请求、供应商出错时用旧数据兜底。
 */
export class WeatherService {
  /** 同一个 Worker 实例里正在进行的请求，避免同一城市同时请求多次 */
  private readonly inflight = new Map<string, Promise<CacheEntry<unknown>>>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly store: CacheStore,
    private readonly now: () => number = () => Date.now(),
    private readonly log: (msg: string) => void = (msg) => console.warn(msg),
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  private key(kind: string, ...parts: string[]): string {
    return ['v1', this.provider.name, kind, ...parts].join(':');
  }

  /**
   * 取缓存；过期就向供应商获取。获取失败时，如果旧数据还在可用期内就用旧数据。
   */
  async cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<Fetched<T>> {
    const existing = await this.store.get<T>(key);
    const now = this.now();
    if (existing && now - existing.fetchedAt < ttlSeconds * 1000) {
      return { data: existing.value, fetchedAt: existing.fetchedAt };
    }

    let pending = this.inflight.get(key) as Promise<CacheEntry<T>> | undefined;
    if (!pending) {
      pending = (async () => {
        const value = await fetcher();
        const entry: CacheEntry<T> = { value, fetchedAt: this.now() };
        await this.store.put(key, entry, ttlSeconds + MAX_STALE_SECONDS);
        return entry;
      })();
      this.inflight.set(key, pending as Promise<CacheEntry<unknown>>);
      pending.finally(() => this.inflight.delete(key)).catch(() => undefined);
    }

    try {
      const entry = await pending;
      return { data: entry.value, fetchedAt: entry.fetchedAt };
    } catch (err) {
      if (existing && now - existing.fetchedAt < (ttlSeconds + MAX_STALE_SECONDS) * 1000) {
        this.log(`[weather] using stale data for ${key}: ${(err as Error).message}`);
        return { data: existing.value, fetchedAt: existing.fetchedAt };
      }
      throw err;
    }
  }

  async nearestLocation(lat: number, lon: number): Promise<WeatherLocation> {
    // 坐标保留两位小数（约 1 公里），附近的访客共用一条缓存
    const rLat = lat.toFixed(2);
    const rLon = lon.toFixed(2);
    const res = await this.cached(this.key('near', rLat, rLon), DATA_TTL.location, () =>
      this.provider.nearestLocation(Number(rLat), Number(rLon)),
    );
    return res.data;
  }

  async location(id: string): Promise<WeatherLocation> {
    return (await this.cached(this.key('loc', id), DATA_TTL.location, () => this.provider.locationById(id))).data;
  }

  /** 城市搜索。结果按"语言 + 关键字"缓存一天。 */
  async search(query: string, lang: string): Promise<WeatherLocation[]> {
    const q = query.trim().toLowerCase().slice(0, 60);
    if (q.length < 2) return [];
    const res = await this.cached(this.key('search', lang, q), SEARCH_TTL, () => this.provider.searchLocations(q, lang));
    return res.data.slice(0, 10);
  }

  /** "我的城市"列表的卡片：城市、当前天气、今日最高最低。单个城市失败时跳过。 */
  async cityCards(ids: string[]): Promise<CityCard[]> {
    const unique = [...new Set(ids)].slice(0, 10);
    const cards = await Promise.all(
      unique.map(async (id): Promise<CityCard | null> => {
        try {
          const [location, current, daily] = await Promise.all([this.location(id), this.current(id), this.daily(id).catch(() => null)]);
          const today = daily?.data.find((d) => d.date === localDate(this.now(), location.timezone)) ?? daily?.data[0];
          return {
            id,
            name: location.name,
            admin: location.adminArea,
            country: location.country,
            temperature: current.data.temperature,
            icon: current.data.icon,
            high: today?.maxTemp ?? null,
            low: today?.minTemp ?? null,
          };
        } catch (err) {
          this.log(`[weather] city card unavailable for ${id}: ${(err as Error).message}`);
          return null;
        }
      }),
    );
    return cards.filter((c): c is CityCard => c !== null);
  }

  current(id: string): Promise<Fetched<CurrentWeather>> {
    return this.cached(this.key('cur', id), DATA_TTL.current, () => this.provider.current(id));
  }

  hourly(id: string): Promise<Fetched<HourlyPoint[]>> {
    return this.cached(this.key('hr', id), DATA_TTL.hourly, () => this.provider.hourly(id, 24));
  }

  daily(id: string): Promise<Fetched<DailyPoint[]>> {
    return this.cached(this.key('day', id), DATA_TTL.daily, () => this.provider.daily(id, 15));
  }

  airQuality(id: string): Promise<Fetched<AirQualityPoint[]>> {
    return this.cached(this.key('aq', id), DATA_TTL.airQuality, () => this.provider.airQuality(id, 24));
  }

  climateDay(id: string, monthDay: string): Promise<Fetched<ClimateDay>> {
    return this.cached(this.key('clid', id, monthDay), DATA_TTL.climateDaily, () =>
      this.provider.climateDay(id, monthDay),
    );
  }

  climateMonthly(id: string): Promise<Fetched<ClimateMonth[]>> {
    return this.cached(this.key('clim', id), DATA_TTL.climateMonthly, () => this.provider.climateMonthly(id));
  }

  nowcast(id: string, radar: boolean): Promise<Fetched<NowcastPoint[]>> {
    return this.cached(this.key('nc', id), radar ? DATA_TTL.nowcastRadar : DATA_TTL.nowcastModel, () =>
      this.provider.nowcast(id),
    );
  }

  /**
   * 城市主页需要的全部数据。任一非关键数据失败时该项为 null，页面照常显示其余部分。
   * 当前天气失败（且没有旧数据）时抛出错误。
   */
  async cityBundle(id: string): Promise<CityBundle> {
    const location = await this.location(id);
    const [current, hourly, daily, air] = await Promise.all([
      this.current(id),
      this.hourly(id).catch(this.soft('hourly', id)),
      this.daily(id).catch(this.soft('daily', id)),
      this.airQuality(id).catch(this.soft('air', id)),
    ]);

    const today = localDate(this.now(), location.timezone);
    const climate = await this.climateDay(id, monthDayOf(today)).catch(this.soft('climate', id));

    // 降雨时间轴：只在可能下雨时才请求（需求文档"降雨时间轴"）
    let nowcast: Fetched<NowcastPoint[]> | null = null;
    const radar = hasRadar(location.country);
    if (shouldFetchNowcast(current.data, hourly?.data ?? [])) {
      nowcast = await this.nowcast(id, radar).catch(this.soft('nowcast', id));
    }

    return { location, today, current, hourly, daily, air, climate, nowcast, radar };
  }

  private soft(what: string, id: string) {
    return (err: unknown): null => {
      this.log(`[weather] ${what} unavailable for ${id}: ${(err as Error).message}`);
      return null;
    };
  }
}

const SEARCH_TTL = 24 * 3600;

export interface CityCard {
  id: string;
  name: string;
  admin: string | null;
  country: string | null;
  temperature: number | null;
  icon: string;
  high: number | null;
  low: number | null;
}

export interface CityBundle {
  location: WeatherLocation;
  /** 城市当地今天的日期 */
  today: string;
  current: Fetched<CurrentWeather>;
  hourly: Fetched<HourlyPoint[]> | null;
  daily: Fetched<DailyPoint[]> | null;
  air: Fetched<AirQualityPoint[]> | null;
  climate: Fetched<ClimateDay> | null;
  nowcast: Fetched<NowcastPoint[]> | null;
  radar: boolean;
}

/** 当前有降水，或未来 3 小时任一小时降水概率 ≥ 30% 时，才请求逐 15 分钟降水。 */
export function shouldFetchNowcast(current: CurrentWeather, hourly: HourlyPoint[]): boolean {
  if ((current.precipRate ?? 0) > 0) return true;
  return hourly.slice(0, 3).some((h) => (h.precipProb ?? 0) >= 30);
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ProviderError && err.status === 404;
}
