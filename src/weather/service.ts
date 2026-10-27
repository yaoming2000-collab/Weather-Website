import {
  DATA_TTL,
  EARLY_REFRESH,
  FAILURE_TTL,
  FORECAST_PERIODS,
  MAX_STALE_SECONDS,
  OPTIONAL_DATA_BUDGET_MS,
} from '../config/thresholds';
import { hasRadar } from '../config/radar';
import type { CacheEntry, CacheStore } from '../cache/store';
import { currentHourIndex, localDate, monthDayOf, nextLocalMidnight } from '../time/cityTime';
import { forecaLocationLang } from './foreca/langs';
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

/** 每次真正调用供应商时记一笔（调用统计用） */
export interface UsageRecorder {
  record(kind: string, cityId: string | null, ok: boolean): void;
}

interface FailureMark {
  status: number | null;
}

/**
 * 天气数据模块：页面拿数据的唯一入口。
 * 负责：按城市缓存（与语言、单位无关）、合并并发请求、供应商出错时用旧数据兜底、记住取不到的数据。
 */
export class WeatherService {
  /** 同一个 Worker 实例里正在进行的请求，避免同一城市同时请求多次 */
  private readonly inflight = new Map<string, Promise<CacheEntry<unknown>>>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly store: CacheStore,
    private readonly now: () => number = () => Date.now(),
    private readonly log: (msg: string) => void = (msg) => console.warn(msg),
    private readonly random: () => number = Math.random,
    private readonly usage?: UsageRecorder,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /** 当前时间（测试中可替换），页面计算"现在"相关的内容时用它，和数据保持一致 */
  nowMs(): number {
    return this.now();
  }

  private key(kind: string, ...parts: string[]): string {
    return ['v1', this.provider.name, kind, ...parts].join(':');
  }

  /**
   * 取缓存；过期就向供应商获取。
   * - 快过期时按概率提前刷新（先看 KV 里有没有其他机房刚取的），把各机房的刷新时间错开；
   * - 获取失败时：旧数据还在可用期内就用旧数据；同时记下失败，一段时间内不再重复请求；
   * - freshUntil：数据自己的过期时刻（例如 15 天预报在当地午夜过期），和有效期取较早的。
   */
  async cached<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
    options: { freshUntil?: (fetchedAt: number) => number } = {},
  ): Promise<Fetched<T>> {
    const existing = await this.store.get<T>(key);
    const now = this.now();
    const ok = (e: CacheEntry<T>): Fetched<T> => ({ data: e.value, fetchedAt: e.fetchedAt });
    const usable = (e: CacheEntry<T> | null): e is CacheEntry<T> =>
      !!e && now < this.freshUntilOf(e, ttlSeconds) + MAX_STALE_SECONDS * 1000;

    if (existing && now < this.freshUntilOf(existing, ttlSeconds)) {
      if (!this.refreshEarly(now, this.freshUntilOf(existing, ttlSeconds), ttlSeconds)) return ok(existing);
      // 提前刷新：其他机房可能刚刷新过，先看 KV
      const shared = await this.store.getShared<T>(key);
      if (shared && shared.fetchedAt > existing.fetchedAt) {
        await this.store.put(key, shared, 0, { localOnly: true });
        return ok(shared);
      }
      try {
        return ok(await this.refresh(key, ttlSeconds, fetcher, options.freshUntil));
      } catch {
        return ok(existing);
      }
    }

    const failed = await this.store.get<FailureMark>(`${key}:fail`);
    if (failed && now < (failed.freshUntil ?? 0)) {
      if (usable(existing) && !isAbsent(failed.value.status)) return ok(existing);
      throw new ProviderError(`recently failed: ${key}`, failed.value.status ?? undefined);
    }

    try {
      return ok(await this.refresh(key, ttlSeconds, fetcher, options.freshUntil));
    } catch (err) {
      await this.rememberFailure(key, err);
      if (usable(existing) && !isAbsent(statusOf(err))) {
        this.log(`[weather] using stale data for ${key}: ${(err as Error).message}`);
        return ok(existing);
      }
      throw err;
    }
  }

  private freshUntilOf(e: CacheEntry<unknown>, ttlSeconds: number): number {
    return e.freshUntil ?? e.fetchedAt + ttlSeconds * 1000;
  }

  private refreshEarly(now: number, freshUntil: number, ttlSeconds: number): boolean {
    if (ttlSeconds < EARLY_REFRESH.minTtlSeconds) return false;
    const windowMs = Math.min(ttlSeconds * EARLY_REFRESH.share, EARLY_REFRESH.maxSeconds) * 1000;
    const start = freshUntil - windowMs;
    if (now < start) return false;
    const progress = Math.min(1, (now - start) / windowMs);
    const chance = EARLY_REFRESH.minChance + (EARLY_REFRESH.maxChance - EARLY_REFRESH.minChance) * progress;
    return this.random() < chance;
  }

  private refresh<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, freshFn?: (fetchedAt: number) => number): Promise<CacheEntry<T>> {
    let pending = this.inflight.get(key) as Promise<CacheEntry<T>> | undefined;
    if (!pending) {
      const [, , kind, cityId] = key.split(':');
      pending = (async () => {
        let value: T;
        try {
          value = await fetcher();
        } catch (err) {
          this.usage?.record(kind ?? 'other', cityId ?? null, false);
          throw err;
        }
        this.usage?.record(kind ?? 'other', cityId ?? null, true);
        const fetchedAt = this.now();
        const freshUntil = Math.min(fetchedAt + ttlSeconds * 1000, freshFn?.(fetchedAt) ?? Infinity);
        const entry: CacheEntry<T> = { value, fetchedAt, freshUntil };
        await this.store.put(key, entry, (freshUntil - fetchedAt) / 1000 + MAX_STALE_SECONDS);
        return entry;
      })();
      this.inflight.set(key, pending as Promise<CacheEntry<unknown>>);
      pending.finally(() => this.inflight.delete(key)).catch(() => undefined);
    }
    return pending;
  }

  private async rememberFailure(key: string, err: unknown): Promise<void> {
    const status = statusOf(err);
    const seconds =
      status === 404 ? FAILURE_TTL.notFound : status === 401 || status === 403 ? FAILURE_TTL.forbidden : FAILURE_TTL.transient;
    const now = this.now();
    const mark: CacheEntry<FailureMark> = { value: { status }, fetchedAt: now, freshUntil: now + seconds * 1000 };
    // 短暂故障只记本机房；"不存在"、"套餐不包含"写到全球，所有机房都不再问
    await this.store.put(`${key}:fail`, mark, seconds, { localOnly: !isAbsent(status) }).catch(() => undefined);
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

  /**
   * 城市搜索。结果按"Foreca 实际使用的语言 + 关键字"缓存一天
   * （网站 27 种语言里有 12 种 Foreca 不支持、都按英文查，共用一份缓存）。
   */
  async search(query: string, lang: string): Promise<WeatherLocation[]> {
    const q = normalizeSearch(query);
    if (!searchLongEnough(q)) return [];
    const fl = forecaLocationLang(lang);
    const res = await this.cached(this.key('search', fl, q), SEARCH_TTL, () => this.provider.searchLocations(q, fl));
    return res.data.slice(0, 10);
  }

  /** "我的城市"列表的卡片：城市、当前天气、今日最高最低。单个城市失败时跳过。 */
  async cityCards(ids: string[]): Promise<CityCard[]> {
    const unique = [...new Set(ids)].slice(0, 10);
    const cards = await Promise.all(
      unique.map(async (id): Promise<CityCard | null> => {
        try {
          const location = await this.location(id);
          const [current, daily] = await Promise.all([this.current(id), this.daily(id, location.timezone).catch(() => null)]);
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
    return this.cached(this.key('hr', id), DATA_TTL.hourly, () => this.provider.hourly(id, FORECAST_PERIODS.hourly));
  }

  /** timezone：城市时区，用来让 15 天预报在当地午夜过期 */
  daily(id: string, timezone: string): Promise<Fetched<DailyPoint[]>> {
    return this.cached(this.key('day', id), DATA_TTL.daily, () => this.provider.daily(id, FORECAST_PERIODS.daily), {
      freshUntil: (at) => nextLocalMidnight(at, timezone) + 60_000,
    });
  }

  airQuality(id: string): Promise<Fetched<AirQualityPoint[]>> {
    return this.cached(this.key('aq', id), DATA_TTL.airQuality, () => this.provider.airQuality(id, FORECAST_PERIODS.airQuality));
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
   * 城市主页需要的全部数据。
   * 地点几乎总在缓存里（保存 30 天），取到时区后，其余数据同时请求；降雨时间轴要看实况和逐小时，最后取。
   * 非必需数据最多等 OPTIONAL_DATA_BUDGET_MS，失败或超时时该项为 null，页面照常显示其余部分。
   * 当前天气失败（且没有旧数据）时抛出错误。
   * 列表数据都从"现在这一小时 / 今天"开始，页面不用再找当前位置。
   */
  async cityBundle(id: string): Promise<CityBundle> {
    const location = await this.location(id);
    const now = this.now();
    const today = localDate(now, location.timezone);
    const missing: string[] = [];
    // 整页共用一个时限：前一轮用掉的时间，降雨时间轴那一轮就少等这么多（用真实时钟）；至少留 0.3 秒给缓存读取
    const deadline = Date.now() + OPTIONAL_DATA_BUDGET_MS;
    const opt = <T>(what: string, p: Promise<Fetched<T>>) =>
      this.optional(what, id, withBudget(p, Math.max(300, deadline - Date.now())), missing);

    const [current, hourly, daily, air, climate, climateMonthly] = await Promise.all([
      this.current(id),
      opt('hourly', this.hourly(id)),
      opt('daily', this.daily(id, location.timezone)),
      opt('air', this.airQuality(id)),
      opt('climate', this.climateDay(id, monthDayOf(today))),
      opt('climateMonthly', this.climateMonthly(id)),
    ]);

    const hours = hourly ? { ...hourly, data: fromCurrentHour(hourly.data, now) } : null;

    // 降雨时间轴：只在可能下雨时才请求（需求文档"降雨时间轴"）
    let nowcast: Fetched<NowcastPoint[]> | null = null;
    const radar = hasRadar(location.country);
    if (shouldFetchNowcast(current.data, hours?.data ?? [])) {
      nowcast = await opt('nowcast', this.nowcast(id, radar));
    }

    return {
      location,
      today,
      current,
      hourly: hours,
      daily: daily ? { ...daily, data: daily.data.filter((d) => d.date >= today) } : null,
      air: air ? { ...air, data: fromCurrentHour(air.data, now) } : null,
      climate,
      climateMonthly,
      nowcast,
      radar,
      missing,
    };
  }

  /** 非必需数据：失败时返回 null。"不存在、套餐不包含"是长期的，不算缺；其他失败记到 missing，页面只短暂缓存。 */
  private async optional<T>(what: string, id: string, p: Promise<Fetched<T>>, missing: string[]): Promise<Fetched<T> | null> {
    try {
      return await p;
    } catch (err) {
      if (!isAbsent(statusOf(err))) {
        missing.push(what);
        this.log(`[weather] ${what} unavailable for ${id}: ${(err as Error).message}`);
      }
      return null;
    }
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
  climateMonthly: Fetched<ClimateMonth[]> | null;
  nowcast: Fetched<NowcastPoint[]> | null;
  radar: boolean;
  /** 这次没取到的非必需数据（限流、超时等临时原因）。不为空时页面只缓存 1 分钟。 */
  missing: string[];
}

/** 当前有降水，或未来 3 小时任一小时降水概率 ≥ 30% 时，才请求逐 15 分钟降水。hourly 要从当前小时开始。 */
export function shouldFetchNowcast(current: CurrentWeather, hourly: HourlyPoint[]): boolean {
  if ((current.precipRate ?? 0) > 0) return true;
  return hourly.slice(0, 3).some((h) => (h.precipProb ?? 0) >= 30);
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ProviderError && err.status === 404;
}

/** 列表里去掉已经过去的小时，从"现在这一小时"开始（全部过去时返回空） */
export function fromCurrentHour<T extends { time: string }>(list: T[], nowMs: number): T[] {
  const i = currentHourIndex(list.map((x) => x.time), nowMs);
  return i === -1 ? [] : list.slice(i);
}

function statusOf(err: unknown): number | null {
  return err instanceof ProviderError && err.status !== undefined ? err.status : null;
}

/** 长期取不到：不存在（404）或套餐不包含（401/403） */
function isAbsent(status: number | null): boolean {
  return status === 404 || status === 401 || status === 403;
}

/** 超过时限就先放弃（请求本身继续，完成后照样写进缓存，下一次就有了） */
function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError(`took longer than ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => timer !== undefined && clearTimeout(timer));
}

/** 搜索关键字：去掉首尾空格、转小写、最长 60 个字符 */
export function normalizeSearch(query: string): string {
  return query.trim().toLowerCase().slice(0, 60);
}

/** 至少 3 个字符；中日韩文字 2 个字即可（"北京"、"東京"、"서울"） */
export function searchLongEnough(q: string): boolean {
  const n = Array.from(q).length;
  if (n >= 3) return true;
  return n === 2 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(q);
}
