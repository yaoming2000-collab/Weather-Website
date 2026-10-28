import {
  DATA_TTL,
  REFRESH_STAGGER,
  FAILURE_TTL,
  FORECAST_PERIODS,
  MAX_STALE_SECONDS,
  OPTIONAL_DATA_BUDGET_MS,
} from '../config/thresholds';
import { hasRadar } from '../config/radar';
import type { CacheEntry, CacheStore } from '../cache/store';
import { currentHourIndex, localDate, monthDayOf, nextLocalMidnight } from '../time/cityTime';
import { forecaLocationLang } from './foreca/langs';
import { intlLocale, isLang } from '../i18n/languages';
import { WIKIDATA_LANGS, type AreaSearchSource, type PlaceNamesSource, type WikiPlace } from './wikidata';
import { isoOfCountry } from '../geo/countries';
import { normalizeSearch, searchLongEnough } from './search';
import { historyBlockStart, lastYearDate, type PastDay, type PastWeatherSource } from './history';

export { normalizeSearch, searchLongEnough };
import { ProviderError, type WeatherProvider } from './provider';
import type {
  AirQualityPoint,
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
  /** 攒够了该写入存储了吗 */
  due?(): boolean;
  flush?(): Promise<void>;
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
    /** 本机房在"错开窗口"里的位置（0–1）。默认按机房代码算（setColo），拿到之前随机 */
    private stagger: number = Math.random(),
    private readonly usage?: UsageRecorder,
    private readonly placeNames?: PlaceNamesSource,
    /** 去年同一天的实际天气（OpenWeather）；没有配置时页面上"和去年比"显示 "--" */
    private readonly history?: PastWeatherSource,
    /** Foreca 搜不到时按名字找县、区（Wikidata） */
    private readonly areaSearch?: AreaSearchSource,
  ) {}

  /** Wikidata 出错后暂停查询到这个时刻（同一实例内），期间城市名用英文 */
  private namesPausedUntil = 0;
  /** 正在向 Wikidata 查询的城市（同一实例内），同时打开同一个新城市时只查一次 */
  private readonly namesInflight = new Map<string, Promise<WikiPlace | undefined>>();

  /**
   * 告诉数据模块自己在哪个 Cloudflare 机房（request.cf.colo，如 "HKG"）。
   * 同一机房固定一个错开位置，不同机房分散开，见 cached() 里的说明。
   */
  setColo(colo: string | undefined): void {
    if (!colo || this.colo === colo) return;
    this.colo = colo;
    let h = 2166136261;
    for (const ch of colo) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    this.stagger = (h >>> 0) / 2 ** 32;
  }

  private colo: string | undefined;

  /** 调用统计攒够了时返回写入任务（由 app 在请求结束后放进 waitUntil），否则返回 null */
  usageFlush(): Promise<void> | null {
    return this.usage?.due?.() && this.usage.flush ? this.usage.flush() : null;
  }

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
   * - 错开刷新：所有机房从 KV 拿到的是同一份数据，会在同一时刻过期。过期后每个机房再等一个固定的、
   *   按机房代码错开的时间（最多有效期的 1/4、不超过 5 分钟）才去 Foreca 取；等待期间照常用手上的数据，
   *   而且每次都会先读 KV（本机房副本已过期），排在前面的机房一旦取到新数据，后面的机房直接用。
   *   这样同一城市在多个机房有访客时，大多只请求一次；只有一个机房的城市不会多请求。
   * - 获取失败时：旧数据还在可用期内就用旧数据（城市不存在除外）；同时记下失败，一段时间内不再重复请求。
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

    if (existing) {
      const fresh = this.freshUntilOf(existing, ttlSeconds);
      if (now < fresh) {
        // 旧版本写入的数据没有 freshUntil，补上后存进本机房，免得每次都去读 KV
        if (existing.freshUntil === undefined) {
          await this.store.put(key, { ...existing, freshUntil: fresh }, 0, { localOnly: true }).catch(() => undefined);
        }
        return ok(existing);
      }
      if (now < fresh + this.staggerMs(fresh - existing.fetchedAt)) return ok(existing);
    }

    const failed = await this.store.get<FailureMark>(`${key}:fail`);
    if (failed && now < (failed.freshUntil ?? 0)) {
      if (usable(existing) && failed.value.status !== 404) return ok(existing);
      throw new ProviderError(`recently failed: ${key}`, failed.value.status ?? undefined);
    }

    try {
      return ok(await this.refresh(key, ttlSeconds, fetcher, options.freshUntil));
    } catch (err) {
      await this.rememberFailure(key, err, usable(existing));
      if (usable(existing) && statusOf(err) !== 404) {
        this.log(`[weather] using stale data for ${key}: ${(err as Error).message}`);
        return ok(existing);
      }
      throw err;
    }
  }

  private freshUntilOf(e: CacheEntry<unknown>, ttlSeconds: number): number {
    return e.freshUntil ?? e.fetchedAt + ttlSeconds * 1000;
  }

  /** 本机房过期后再等多久才刷新（毫秒）。lifetimeMs：这份数据的新鲜期长度 */
  private staggerMs(lifetimeMs: number): number {
    const windowMs = Math.min(Math.max(0, lifetimeMs) * REFRESH_STAGGER.share, REFRESH_STAGGER.maxSeconds * 1000);
    return windowMs * this.stagger;
  }

  private refresh<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, freshFn?: (fetchedAt: number) => number): Promise<CacheEntry<T>> {
    let pending = this.inflight.get(key) as Promise<CacheEntry<T>> | undefined;
    if (!pending) {
      // 只统计向天气供应商的请求（键以 v1:<供应商>: 开头），排行榜等数据库查询不算
      const [, prov, kind, cityId] = key.split(':');
      // 去年数据来自 OpenWeather（键以 v1:owm: 开头），也记下来，方便核对 OpenWeather 的用量
      const track = (prov === this.provider.name || prov === this.history?.name) && kind ? (prov === this.provider.name ? kind : `${prov}-${kind}`) : null;
      pending = (async () => {
        let value: T;
        try {
          value = await fetcher();
        } catch (err) {
          if (track) this.usage?.record(track, cityId ?? null, false);
          throw err;
        }
        if (track) this.usage?.record(track, cityId ?? null, true);
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

  /**
   * 记下失败，一段时间内不再问：
   * - 404（城市不存在、这个城市没有这类数据）：1 天，写到全球；
   * - 401/403（密钥或套餐问题）：15 分钟，只记本机房，期间照常用旧数据；
   * - 其他（限流、超时、临时故障）：有旧数据可用时 2 分钟，没有时只等 20 秒（新城市不至于长时间打不开）。
   */
  private async rememberFailure(key: string, err: unknown, hasFallback: boolean): Promise<void> {
    const status = statusOf(err);
    const seconds =
      status === 404
        ? FAILURE_TTL.notFound
        : status === 401 || status === 403
          ? FAILURE_TTL.forbidden
          : hasFallback
            ? FAILURE_TTL.transient
            : FAILURE_TTL.transientNoData;
    const now = this.now();
    const mark: CacheEntry<FailureMark> = { value: { status }, fetchedAt: now, freshUntil: now + seconds * 1000 };
    await this.store.put(`${key}:fail`, mark, seconds, { localOnly: status !== 404 }).catch(() => undefined);
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
   * 城市名本地化（第 4 步）。英文直接返回；
   * Foreca 支持的 15 种语言（含 bp → pt、lm → es）向 Foreca 要该语言的城市、行政区、国家名，缓存 30 天；
   * 其余 9 种语言从 Wikidata 批量查城市名，国家名用 Intl.DisplayNames 翻译，缓存 90 天，不显示行政区（Wikidata 没有对应的本地化行政区名）。
   * 查不到或出错时保留英文。
   */
  async localize(locs: WeatherLocation[], lang: string, opts: { keepAdmin?: boolean } = {}): Promise<WeatherLocation[]> {
    if (lang === 'en' || locs.length === 0) return locs;
    const fl = forecaLocationLang(lang);
    if (fl !== 'en') {
      return Promise.all(
        locs.map((l) =>
          this.cached(this.key('loc', l.id, fl), DATA_TTL.location, () => this.provider.locationById(l.id, fl))
            .then((r) => ({ ...l, name: r.data.name, adminArea: r.data.adminArea, country: r.data.country }))
            .catch(() => l),
        ),
      );
    }
    const prefs = WIKIDATA_LANGS[lang];
    if (!prefs || !this.placeNames) return locs;
    const places = await this.wikiPlaces(locs.map((l) => l.id));
    const intl = isLang(lang) ? intlLocale(lang) : lang;
    return locs.map((l) => {
      const p = places.get(l.id);
      const name = p && prefs.map((x) => p.labels[x]).find(Boolean);
      if (!p || !name) return l;
      // 国家优先按 Foreca 的英文国家名（和英文页面一致，例如香港显示"香港"而不是"中国"），其次用 Wikidata 的
      const iso = isoOfCountry(l.country) ?? p.iso;
      return {
        ...l,
        name,
        // 搜索结果保留英文的州/省，同名城市（例如很多个 Springfield）才分得清
        adminArea: opts.keepAdmin ? l.adminArea : null,
        country: (iso && regionName(iso, intl)) || l.country,
      };
    });
  }

  /**
   * 本地化，但最多等 budgetMs：第一次遇到的城市名可能要查 Foreca 或 Wikidata，页面不等太久，
   * 先用英文，查询交给 defer（waitUntil）继续完成并缓存，下一次就是本地化的名字。
   */
  async localizeWithin(
    locs: WeatherLocation[],
    lang: string,
    budgetMs: number,
    defer?: (p: Promise<unknown>) => void,
    opts: { keepAdmin?: boolean } = {},
  ): Promise<{ locs: WeatherLocation[]; complete: boolean }> {
    const p = this.localize(locs, lang, opts);
    defer?.(p.catch(() => undefined));
    try {
      return { locs: await withBudget(p, budgetMs), complete: true };
    } catch {
      // 没等到：先用英文，调用方据此把页面只缓存 1 分钟
      return { locs, complete: false };
    }
  }

  /** 只需要 Wikidata 的语言（搜索结果在 Foreca 支持的语言里已经是本地化的） */
  needsWikidataNames(lang: string): boolean {
    return !!WIKIDATA_LANGS[lang];
  }

  private async wikiPlaces(ids: string[]): Promise<Map<string, WikiPlace>> {
    const now = this.now();
    const out = new Map<string, WikiPlace>();
    const missing: string[] = [];
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        const e = await this.store.get<WikiPlace>(this.wikiKey(id));
        if (e) out.set(id, e.value);
        if (!e || now >= (e.freshUntil ?? 0)) missing.push(id);
      }),
    );
    if (missing.length === 0 || now < this.namesPausedUntil || !this.placeNames) return out;
    const toFetch = missing.filter((id) => !this.namesInflight.has(id));
    if (toFetch.length) {
      const batch = this.fetchPlaces(toFetch, now);
      for (const id of toFetch) {
        const one = batch.then((m) => m.get(id)).finally(() => this.namesInflight.delete(id));
        this.namesInflight.set(id, one);
      }
    }
    await Promise.all(
      missing.map(async (id) => {
        const v = await this.namesInflight.get(id)?.catch(() => undefined);
        if (v) out.set(id, v);
      }),
    );
    return out;
  }

  private async fetchPlaces(ids: string[], now: number): Promise<Map<string, WikiPlace>> {
    try {
      const found = await this.placeNames!.lookup(ids);
      const freshUntil = now + DATA_TTL.placeNames * 1000;
      const out = new Map<string, WikiPlace>();
      await Promise.all(
        ids.map((id) => {
          // 查不到的城市也记下来（空名字），免得每次都再查
          const value = found.get(id) ?? { labels: {}, iso: null };
          out.set(id, value);
          return this.store.put(this.wikiKey(id), { value, fetchedAt: now, freshUntil }, DATA_TTL.placeNames * 2).catch(() => undefined);
        }),
      );
      return out;
    } catch (err) {
      this.namesPausedUntil = now + FAILURE_TTL.transient * 1000;
      this.log(`[names] Wikidata unavailable: ${(err as Error).message}`);
      return new Map();
    }
  }

  private wikiKey(id: string): string {
    return ['v1', 'wikidata', 'names', id].join(':');
  }

  /**
   * 城市搜索。结果按"Foreca 实际使用的语言 + 关键字"缓存一天
   * （网站 27 种语言里有 12 种 Foreca 不支持、都按英文查，共用一份缓存）。
   */
  async search(query: string, lang: string): Promise<SearchHit[]> {
    const q = normalizeSearch(query);
    if (!searchLongEnough(q)) return [];
    const fl = forecaLocationLang(lang);
    const res = await this.cached(this.key('search', fl, q), SEARCH_TTL, () => this.provider.searchLocations(q, fl));
    if (res.data.length > 0 || !this.areaSearch) return res.data.slice(0, 10);
    // Foreca 只收城市、镇，不收县和区（如"惠东"）：按名字找行政区，再换成附近的 Foreca 城市（县城等）
    try {
      return await withBudget(this.areaFallback(q, lang), AREA_SEARCH_BUDGET_MS);
    } catch (err) {
      this.log(`[weather] area search failed for ${q}: ${(err as Error).message}`);
      return [];
    }
  }

  private async areaFallback(q: string, lang: string): Promise<SearchHit[]> {
    const source = this.areaSearch!;
    const res = await this.cached(['v1', 'wd', 'area', lang, q].join(':'), SEARCH_TTL, async () => {
      const areas = (await source.searchAreas(q, lang)).slice(0, 3);
      const out: SearchHit[] = [];
      for (const a of areas) {
        const loc = await this.nearestLocation(a.lat, a.lon).catch(() => null);
        if (!loc || distanceKm(a, loc) > AREA_MAX_DISTANCE_KM || out.some((o) => o.id === loc.id)) continue;
        out.push({ ...loc, area: a.label });
      }
      // 城市名换成页面语言（如 Pingshan → 平山）
      const named = await this.localize(out, lang, { keepAdmin: true });
      return named.map((l, i) => ({ ...l, area: out[i]!.area }));
    });
    return res.data;
  }

  /** "我的城市"列表的卡片：城市、当前天气、今日最高最低。单个城市失败时跳过。 */
  async cityCards(ids: string[], lang = 'en', defer?: (p: Promise<unknown>) => void): Promise<CityCard[]> {
    const unique = [...new Set(ids)].slice(0, 10);
    const cards = await Promise.all(
      unique.map(async (id): Promise<CityCard | null> => {
        try {
          const base = await this.location(id);
          const [named, current, daily] = await Promise.all([
            this.localizeWithin([base], lang, NAME_BUDGET_MS, defer),
            this.current(id),
            this.daily(id, base.timezone).catch(() => null),
          ]);
          const location = named.locs[0] ?? base;
          const today = daily?.data.find((d) => d.date === localDate(this.now(), base.timezone)) ?? daily?.data[0];
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

  /**
   * 去年同一天的实际天气，按今年的日期返回（今年 2 月 29 日对去年 2 月 28 日）。
   * 按 10 天一块向 OpenWeather 取（一次请求 10 天），每块永久缓存：同一城市大约每 10 天才新请求一次。
   * 某一块取不到时，那几天没有数据（页面显示 "--"），其余照常。
   */
  async lastYear(location: WeatherLocation, dates: string[]): Promise<Fetched<Record<string, PastDay>>> {
    const source = this.history;
    if (!source || dates.length === 0) return { data: {}, fetchedAt: this.now() };
    const wanted = dates.map((d) => ({ date: d, past: lastYearDate(d) }));
    const blocks = [...new Set(wanted.map((w) => historyBlockStart(w.past)))];
    const results = await Promise.allSettled(
      blocks.map((start) =>
        this.cached(['v1', source.name, 'ly', location.id, start].join(':'), DATA_TTL.lastYear, () =>
          source.days(location.lat, location.lon, start),
        ),
      ),
    );
    const byPast = new Map<string, PastDay>();
    let fetchedAt = this.now();
    let failure: unknown = null;
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        fetchedAt = Math.min(fetchedAt, r.value.fetchedAt);
        for (const d of r.value.data) byPast.set(d.date, d);
      } else failure = r.reason;
    });
    // 全部失败时报错（页面记为"缺数据"，只缓存 1 分钟）；部分失败时用拿到的
    if (byPast.size === 0 && failure) throw failure;
    const data: Record<string, PastDay> = {};
    for (const w of wanted) {
      const d = byPast.get(w.past);
      if (d) data[w.date] = d;
    }
    return { data, fetchedAt };
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
   * defer：请求的 waitUntil（超时没等到的请求在页面返回后继续完成）。
   * 当前天气失败（且没有旧数据）时抛出错误。
   * 列表数据都从"现在这一小时 / 今天"开始，页面不用再找当前位置。
   */
  async cityBundle(id: string, defer?: (p: Promise<unknown>) => void): Promise<CityBundle> {
    const location = await this.location(id);
    const now = this.now();
    const today = localDate(now, location.timezone);
    const missing: string[] = [];
    // 整页共用一个时限：前一轮用掉的时间，降雨时间轴那一轮就少等这么多（用真实时钟）；至少留 0.3 秒给缓存读取
    const deadline = Date.now() + OPTIONAL_DATA_BUDGET_MS;
    const opt = <T>(what: string, p: Promise<Fetched<T>>) => {
      // 超过时限页面就不等了；把请求交给 waitUntil，让它在页面返回后也能完成并写进缓存（否则会被取消，白白计费）
      defer?.(p.catch(() => undefined));
      return this.optional(what, id, withBudget(p, Math.max(300, deadline - Date.now())), missing);
    };

    // 去年同一天：今天起 15 天（和 15 天对比图一致）
    const window = Array.from({ length: FORECAST_PERIODS.daily }, (_, i) => addDays(today, i));
    const [current, hourly, daily, air, lastYear] = await Promise.all([
      this.current(id),
      opt('hourly', this.hourly(id)),
      opt('daily', this.daily(id, location.timezone)),
      opt('air', this.airQuality(id)),
      opt('lastYear', this.lastYear(location, window)),
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
      lastYear,
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
/** 按县、区名字找城市时最多等多久（毫秒），以及行政区中心到 Foreca 城市最远多少公里 */
const AREA_SEARCH_BUDGET_MS = 2500;
const AREA_MAX_DISTANCE_KM = 30;

/** 搜索结果；area 是用户搜的行政区名字（Foreca 里没有它，结果是附近的城市，页面显示"惠东县（平山）"） */
export type SearchHit = WeatherLocation & { area?: string };

/** 两点间的大圆距离（公里） */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** 城市名本地化最多等多久（毫秒） */
export const NAME_BUDGET_MS = 1500;

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
  /** 去年同一天的实际天气，键是今年的日期；没取到时为 null */
  lastYear: Fetched<Record<string, PastDay>> | null;
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

/** YYYY-MM-DD 加 n 天 */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
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

/** 超过时限就先放弃（请求本身由 defer 交给 waitUntil 继续，完成后照样写进缓存，下一次就有了） */
export function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError(`took longer than ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => timer !== undefined && clearTimeout(timer));
}

/** 国家或地区名（ISO 代码 → 指定语言），浏览器和 Workers 都自带 */
function regionName(iso: string, intl: string): string | null {
  try {
    // 香港、澳门的完整名称很长（"中華人民共和国香港特別行政区"），用简短的写法
    const style = iso === 'HK' || iso === 'MO' ? 'short' : 'long';
    const name = new Intl.DisplayNames([intl], { type: 'region', style }).of(iso);
    return name && name !== iso ? name : null;
  } catch {
    return null;
  }
}
