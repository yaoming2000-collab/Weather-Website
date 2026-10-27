import { describe, expect, it } from 'vitest';
import { MemoryStore, TieredStore } from '../src/cache/store';
import { DATA_TTL, FAILURE_TTL, MAX_STALE_SECONDS, OPTIONAL_DATA_BUDGET_MS } from '../src/config/thresholds';
import { MockProvider } from '../src/weather/mock';
import { ProviderError } from '../src/weather/provider';
import { fromCurrentHour, searchLongEnough, shouldFetchNowcast, WeatherService } from '../src/weather/service';
import type { CacheStore } from '../src/cache/store';

function setup(startMs = Date.UTC(2026, 9, 22, 3, 0), opts: { random?: () => number } = {}) {
  let now = startMs;
  const clock = () => now;
  const provider = new MockProvider(clock);
  const calls: Record<string, number> = {};
  let failing: false | number = false;
  /** 某些方法一直失败（status），例如城市没有往年数据 */
  const broken = new Map<string, number>();
  let delayMs = 0;
  // 统计每个方法被调用的次数，并可模拟供应商故障
  const counted = new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
        if (failing) return Promise.reject(new ProviderError('down', failing));
        const b = broken.get(String(prop));
        if (b) return Promise.reject(new ProviderError('broken', b));
        const run = () => (value as (...a: unknown[]) => unknown).apply(target, args);
        return delayMs ? new Promise((r) => setTimeout(r, delayMs)).then(run) : run();
      };
    },
  });
  const store = new MemoryStore(clock);
  // 默认不提前刷新（random = 1），需要时由测试指定
  const make = (st: CacheStore) => new WeatherService(counted, st, clock, () => undefined, opts.random ?? (() => 1));
  const service = make(store);
  return {
    service,
    make,
    clock,
    calls,
    advance: (seconds: number) => (now += seconds * 1000),
    fail: (v: boolean | number) => (failing = v === true ? 503 : v),
    breakMethod: (name: string, status: number) => broken.set(name, status),
    slow: (ms: number) => (delayMs = ms),
  };
}

describe('WeatherService caching', () => {
  it('serves from cache until the TTL expires, then refetches', async () => {
    const { service, calls, advance } = setup();
    await service.current('102643743');
    await service.current('102643743');
    expect(calls.current).toBe(1);

    advance(DATA_TTL.current - 1);
    await service.current('102643743');
    expect(calls.current).toBe(1);

    advance(2);
    const fresh = await service.current('102643743');
    expect(calls.current).toBe(2);
    expect(fresh.fetchedAt).toBeGreaterThan(0);
  });

  it('merges concurrent requests for the same city into one provider call', async () => {
    const { service, calls } = setup();
    await Promise.all([service.hourly('102643743'), service.hourly('102643743'), service.hourly('102643743')]);
    expect(calls.hourly).toBe(1);
  });

  it('keeps one cache entry per city, regardless of language or unit', async () => {
    const { service, calls } = setup();
    await service.daily('100745044', 'Europe/Istanbul');
    await service.daily('100745044', 'Europe/Istanbul');
    await service.daily('102643743', 'Europe/London');
    expect(calls.daily).toBe(2);
  });

  it('falls back to stale data when the provider fails, within the allowed window', async () => {
    const { service, advance, fail } = setup();
    const first = await service.current('102643743');
    advance(DATA_TTL.current + 60);
    fail(true);
    const stale = await service.current('102643743');
    expect(stale.fetchedAt).toBe(first.fetchedAt);

    advance(MAX_STALE_SECONDS + 60);
    await expect(service.current('102643743')).rejects.toBeInstanceOf(ProviderError);
  });

  it('remembers a city that does not exist instead of asking again', async () => {
    const { service, calls, advance } = setup();
    await expect(service.location('999999')).rejects.toMatchObject({ status: 404 });
    await expect(service.location('999999')).rejects.toMatchObject({ status: 404 });
    expect(calls.locationById).toBe(1);
    advance(FAILURE_TTL.notFound + 1);
    await expect(service.location('999999')).rejects.toMatchObject({ status: 404 });
    expect(calls.locationById).toBe(2);
  });

  it('waits a little after a temporary failure before asking again', async () => {
    const { service, calls, advance, fail } = setup();
    fail(429);
    await expect(service.current('102643743')).rejects.toBeInstanceOf(ProviderError);
    await expect(service.current('102643743')).rejects.toBeInstanceOf(ProviderError);
    expect(calls.current).toBe(1);
    fail(false);
    advance(FAILURE_TTL.transient + 1);
    await service.current('102643743');
    expect(calls.current).toBe(2);
  });

  it('expires the 15-day forecast at local midnight', async () => {
    // 伦敦 2026-10-22 22:30（UTC+1），离午夜 1.5 小时，比 3 小时的有效期早
    const { service, calls, advance } = setup(Date.UTC(2026, 9, 22, 21, 30));
    await service.daily('102643743', 'Europe/London');
    advance(80 * 60);
    await service.daily('102643743', 'Europe/London');
    expect(calls.daily).toBe(1);
    advance(12 * 60);
    await service.daily('102643743', 'Europe/London');
    expect(calls.daily).toBe(2);
  });

  it('rounds visitor coordinates so nearby visitors share one lookup', async () => {
    const { service, calls } = setup();
    const a = await service.nearestLocation(41.0138, 28.9497);
    const b = await service.nearestLocation(41.0141, 28.9502);
    expect(a.id).toBe('100745044');
    expect(b.id).toBe(a.id);
    expect(calls.nearestLocation).toBe(1);
  });

  it('asks for climate data using the city date, not the server date', async () => {
    // 03:00 UTC 时美国中部还是 21 日
    const { service } = setup(Date.UTC(2026, 9, 22, 3, 0));
    const bundle = await service.cityBundle('104686017');
    expect(bundle.today).toBe('2026-10-21');
    expect(bundle.climate?.data.monthDay).toBe('10-21');
    expect(bundle.climateMonthly?.data).toHaveLength(12);
  });

  it('starts lists at the current hour and keeps enough hours for tomorrow', async () => {
    const start = Date.UTC(2026, 9, 22, 3, 40);
    const { service } = setup(start);
    const bundle = await service.cityBundle('102643743');
    expect(bundle.current.data.temperature).not.toBeNull();
    expect(Date.parse(bundle.hourly!.data[0]!.time)).toBeLessThanOrEqual(start);
    expect(Date.parse(bundle.hourly!.data[0]!.time) + 3600_000).toBeGreaterThan(start);
    expect(bundle.hourly!.data.length).toBeGreaterThanOrEqual(48 + 20);
    expect(bundle.daily?.data).toHaveLength(15);
    expect(bundle.missing).toEqual([]);
  });

  it('does not count data a city never has as missing, but does count temporary failures', async () => {
    const { service, breakMethod } = setup();
    breakMethod('climateDay', 404);
    breakMethod('climateMonthly', 403);
    breakMethod('airQuality', 503);
    const bundle = await service.cityBundle('102643743');
    expect(bundle.climate).toBeNull();
    expect(bundle.climateMonthly).toBeNull();
    expect(bundle.air).toBeNull();
    expect(bundle.missing).toEqual(['air']);
  });

  it('does not wait for slow optional data', async () => {
    const { service, slow } = setup();
    await service.location('102643743');
    await service.current('102643743');
    slow(OPTIONAL_DATA_BUDGET_MS + 500);
    const t0 = Date.now();
    const bundle = await service.cityBundle('102643743');
    expect(Date.now() - t0).toBeLessThan(OPTIONAL_DATA_BUDGET_MS + 400);
    expect(bundle.hourly).toBeNull();
    expect(bundle.missing).toContain('hourly');
  }, 10_000);
});

describe('two data centers sharing KV', () => {
  function world(opts: { random?: () => number } = {}) {
    const w = setup(Date.UTC(2026, 9, 22, 3, 0), opts);
    const kv = new MemoryStore(w.clock);
    const a = w.make(new TieredStore(new MemoryStore(w.clock), kv, w.clock));
    const b = w.make(new TieredStore(new MemoryStore(w.clock), kv, w.clock));
    return { ...w, a, b, kv };
  }

  it('uses the copy another data center just fetched instead of calling Foreca again', async () => {
    const { a, b, calls, advance } = world();
    await a.current('102643743');
    advance(60);
    await b.current('102643743');
    expect(calls.current).toBe(1);
    // A 的数据过期后重新取；B 的本机房副本随后过期，应该读 KV 里 A 刚取的，不再请求
    advance(DATA_TTL.current - 60 + 1);
    await a.current('102643743');
    expect(calls.current).toBe(2);
    advance(90);
    await b.current('102643743');
    expect(calls.current).toBe(2);
  });

  it('keeps a copy in the local layer only for as long as it is fresh', async () => {
    const w = setup();
    const local = new MemoryStore(w.clock);
    const kv = new MemoryStore(w.clock);
    const tiered = new TieredStore(local, kv, w.clock);
    const now = w.clock();
    await kv.put('k', { value: 1, fetchedAt: now - 10_000, freshUntil: now + 30_000 }, 3600);
    await tiered.get('k');
    expect(await local.get('k')).not.toBeNull();
    w.advance(31);
    expect(await local.get('k')).toBeNull();
    expect(await tiered.get('k')).not.toBeNull();
  });

  it('refreshes early, and checks KV first so two data centers do not both call', async () => {
    const { a, b, calls, advance } = world({ random: () => 0 });
    await a.current('102643743');
    await b.current('102643743');
    // 进入提前刷新窗口：A 去刷新；B 随后也"中签"，但先看 KV，发现 A 已经取过
    advance(DATA_TTL.current - 120);
    await a.current('102643743');
    expect(calls.current).toBe(2);
    await b.current('102643743');
    expect(calls.current).toBe(2);
  });
});

describe('search', () => {
  it('shares one cache entry between languages Foreca handles the same way', async () => {
    const { service, calls } = setup();
    await service.search('London', 'ja');
    await service.search('london ', 'en');
    await service.search('London', 'vi');
    expect(calls.searchLocations).toBe(1);
  });

  it('needs 3 letters, or 2 Chinese/Japanese/Korean characters', () => {
    expect(searchLongEnough('lo')).toBe(false);
    expect(searchLongEnough('lon')).toBe(true);
    expect(searchLongEnough('北京')).toBe(true);
    expect(searchLongEnough('서울')).toBe(true);
    expect(searchLongEnough('北')).toBe(false);
  });
});

describe('fromCurrentHour', () => {
  it('drops past hours', () => {
    const list = ['2026-10-22T10:00+00:00', '2026-10-22T11:00+00:00', '2026-10-22T12:00+00:00'].map((time) => ({ time }));
    expect(fromCurrentHour(list, Date.UTC(2026, 9, 22, 11, 30)).map((x) => x.time)).toEqual(['2026-10-22T11:00+00:00', '2026-10-22T12:00+00:00']);
    expect(fromCurrentHour(list, Date.UTC(2026, 9, 22, 14))).toEqual([]);
  });
});

describe('nowcast trigger', () => {
  const base = {
    time: '', symbol: 'd000', icon: 'sunny', temperature: 20, feelsLike: 20, humidity: 50, dewPoint: 10, windSpeed: 1,
    windGust: 2, windDir: 0, precipProb: 0, precipRate: 0, cloudiness: 0, thunderProb: 0, uvIndex: 1, pressure: 1013, visibility: 10000,
  };
  const hour = (precipProb: number) => ({
    time: '', symbol: 'd000', icon: 'sunny', temperature: 20, feelsLike: 20, precipProb, precipAccum: 0, windSpeed: 1, windDir: 0, humidity: 50, uvIndex: 1,
  });

  it('skips the call on dry days', () => {
    expect(shouldFetchNowcast(base, [hour(5), hour(10), hour(29)])).toBe(false);
  });
  it('calls when it is raining now or likely within 3 hours', () => {
    expect(shouldFetchNowcast({ ...base, precipRate: 0.4 }, [])).toBe(true);
    expect(shouldFetchNowcast(base, [hour(5), hour(10), hour(30)])).toBe(true);
    expect(shouldFetchNowcast(base, [hour(5), hour(10), hour(10), hour(90)])).toBe(false);
  });
});

describe('usage recording', () => {
  it('records each real provider call with its kind and city, but not cache hits', async () => {
    const seen: string[] = [];
    const provider = new MockProvider(() => Date.UTC(2026, 9, 22, 3, 0));
    const svc = new WeatherService(provider, new MemoryStore(), () => Date.UTC(2026, 9, 22, 3, 0), () => undefined, () => 1, {
      record: (kind, city, ok) => seen.push(`${kind}|${city}|${ok}`),
    });
    await svc.current('102643743');
    await svc.current('102643743');
    await expect(svc.location('999999')).rejects.toBeInstanceOf(ProviderError);
    expect(seen).toEqual(['cur|102643743|true', 'loc|999999|false']);
  });
});

