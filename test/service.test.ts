import { describe, expect, it } from 'vitest';
import { MemoryStore, TieredStore } from '../src/cache/store';
import { DATA_TTL, FAILURE_TTL, MAX_STALE_SECONDS, OPTIONAL_DATA_BUDGET_MS } from '../src/config/thresholds';
import { MockProvider } from '../src/weather/mock';
import { ProviderError } from '../src/weather/provider';
import { fromCurrentHour, searchLongEnough, shouldFetchNowcast, WeatherService } from '../src/weather/service';
import { MockHistory, type PastWeatherSource } from '../src/weather/history';
import { HISTORY_MAX_ATTEMPTS, KvHistoryQueue, MemoryHistoryQueue } from '../src/weather/historyQueue';
import type { CacheStore } from '../src/cache/store';

function setup(startMs = Date.UTC(2026, 9, 22, 3, 0)) {
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
  // 去年同一天的数据（OpenWeather）：统计调用次数，可模拟故障
  const mockHistory = new MockHistory();
  const history: PastWeatherSource = {
    name: 'owm',
    days: (lat, lon, start) => {
      calls.history = (calls.history ?? 0) + 1;
      const b = broken.get('history');
      if (b) return Promise.reject(new ProviderError('broken', b));
      return mockHistory.days(lat, lon, start);
    },
  };
  // stagger：本"机房"过期后再等多久才刷新（0 = 一过期就刷新）
  const make = (st: CacheStore, stagger = 0) => new WeatherService(counted, st, clock, () => undefined, stagger, undefined, undefined, history);
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

  it('asks for last year using the city date, in cached 10-day blocks', async () => {
    // 03:00 UTC 时美国中部还是 21 日
    const { service, calls, advance } = setup(Date.UTC(2026, 9, 22, 3, 0));
    const bundle = await service.cityBundle('104686017');
    expect(bundle.today).toBe('2026-10-21');
    expect(bundle.lastYear?.data['2026-10-21']?.date).toBe('2025-10-21');
    expect(Object.keys(bundle.lastYear!.data)).toHaveLength(15);
    // 15 天跨 2–3 个 10 天块
    const first = calls.history!;
    expect(first).toBeGreaterThanOrEqual(2);
    expect(first).toBeLessThanOrEqual(3);
    // 过去的数据不会变：一天后再打开，最多多取一块
    advance(86400);
    await service.cityBundle('104686017');
    expect(calls.history! - first).toBeLessThanOrEqual(1);
    // 有一块临时取不到：记为缺数据（页面只缓存 1 分钟）
    // Foreca 的往年平均不再请求
    expect(calls.climateDay ?? 0).toBe(0);
    expect(calls.climateMonthly ?? 0).toBe(0);
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
    breakMethod('history', 403);
    breakMethod('airQuality', 503);
    const bundle = await service.cityBundle('102643743');
    expect(bundle.lastYear).toBeNull();
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
  function world() {
    const w = setup(Date.UTC(2026, 9, 22, 3, 0));
    const kv = new MemoryStore(w.clock);
    const dc = (stagger: number) => w.make(new TieredStore(new MemoryStore(w.clock), kv, w.clock), stagger);
    return { ...w, dc, kv };
  }

  it('uses the copy another data center just fetched instead of calling Foreca again', async () => {
    const { dc, calls, advance } = world();
    const a = dc(0);
    const b = dc(0);
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

  it('staggers refreshes so only the first data center calls Foreca', async () => {
    const { dc, calls, advance } = world();
    const early = dc(0);
    const late = dc(0.9);
    await early.current('102643743');
    await late.current('102643743');
    expect(calls.current).toBe(1);
    // 刚过期：排后面的机房继续用手上的数据，不请求
    advance(DATA_TTL.current + 1);
    await late.current('102643743');
    expect(calls.current).toBe(1);
    // 排前面的机房去取
    await early.current('102643743');
    expect(calls.current).toBe(2);
    // 轮到排后面的机房时，KV 里已经是新的，直接用
    advance(5 * 60);
    const r = await late.current('102643743');
    expect(calls.current).toBe(2);
    expect(r.fetchedAt).toBeGreaterThan(Date.UTC(2026, 9, 22, 3, 0));
  });

  it('a data center on its own refreshes once, a little after expiry', async () => {
    const { dc, calls, advance } = world();
    const only = dc(0.5);
    await only.current('102643743');
    advance(DATA_TTL.current + 60);
    await only.current('102643743');
    expect(calls.current).toBe(1);
    advance(120);
    await only.current('102643743');
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

  it('copies entries written by the old version (no freshUntil) into the local layer', async () => {
    const { dc, kv, clock } = world();
    const a = dc(0);
    await kv.put('v1:mock:loc:102643743', { value: { id: '102643743', name: 'London', adminArea: null, country: null, timezone: 'Europe/London', lat: 0, lon: 0 }, fetchedAt: clock() }, 3600);
    await a.location('102643743');
    await kv.put('v1:mock:loc:102643743', { value: { id: 'changed', name: 'X', adminArea: null, country: null, timezone: 'UTC', lat: 0, lon: 0 }, fetchedAt: clock() }, 3600);
    // 第二次读本机房（已补上 freshUntil），不再读 KV
    expect((await a.location('102643743')).name).toBe('London');
  });
});

describe('no repeated calls around midnight', () => {
  it('fetches the 15-day forecast about once as local midnight passes', async () => {
    // 伦敦 23:52（UTC+1）开始，每 10 秒一次，持续 15 分钟
    const { service, calls, advance } = setup(Date.UTC(2026, 9, 22, 22, 52));
    for (let i = 0; i < 90; i++) {
      await service.daily('102643743', 'Europe/London');
      advance(10);
    }
    expect(calls.daily).toBeLessThanOrEqual(2);
  });
});

describe('failures', () => {
  it('keeps serving old data when Foreca rejects the key (401/403)', async () => {
    const { service, advance, fail } = setup();
    const first = await service.current('102643743');
    advance(DATA_TTL.current + 60);
    fail(401);
    expect((await service.current('102643743')).fetchedAt).toBe(first.fetchedAt);
    expect((await service.current('102643743')).fetchedAt).toBe(first.fetchedAt);
  });

  it('retries a new city soon after a temporary failure', async () => {
    const { service, calls, advance, fail } = setup();
    fail(503);
    await expect(service.current('102643743')).rejects.toBeInstanceOf(ProviderError);
    fail(false);
    advance(FAILURE_TTL.transientNoData + 1);
    await service.current('102643743');
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
    const svc = new WeatherService(provider, new MemoryStore(), () => Date.UTC(2026, 9, 22, 3, 0), () => undefined, 0, {
      record: (kind, city, ok) => seen.push(`${kind}|${city}|${ok}`),
    });
    await svc.current('102643743');
    await svc.current('102643743');
    await expect(svc.location('999999')).rejects.toBeInstanceOf(ProviderError);
    await svc.cached('v1:ranking', 60, async () => 1);
    expect(seen).toEqual(['cur|102643743|true', 'loc|999999|false']);
  });
});


describe('search by county or district name', () => {
  function svc(areas: Array<{ label: string; lat: number; lon: number }>, fail = false) {
    let asked = 0;
    const areaSearch = {
      searchAreas: async () => {
        asked++;
        if (fail) throw new Error('wikidata down');
        return areas;
      },
    };
    const service = new WeatherService(new MockProvider(), new MemoryStore(), () => Date.UTC(2026, 9, 22, 3), () => undefined, 0, undefined, undefined, undefined, areaSearch);
    return { service, asked: () => asked };
  }

  it('finds the nearby city when Foreca has no match', async () => {
    const { service } = svc([{ label: 'Camden', lat: 51.54, lon: -0.14 }]);
    const hits = await service.search('Camden', 'en');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.name).toBe('London');
    expect(hits[0]!.area).toBe('Camden');
  });

  it('drops places too far from the area', async () => {
    const { service } = svc([{ label: 'Middle of the Atlantic', lat: 40, lon: -40 }]);
    expect(await service.search('Atlantic', 'en')).toEqual([]);
  });

  it('does not ask Wikidata when Foreca finds the city, and survives Wikidata errors', async () => {
    const ok = svc([]);
    expect((await ok.service.search('London', 'en')).length).toBeGreaterThan(0);
    expect(ok.asked()).toBe(0);
    const broken = svc([], true);
    expect(await broken.service.search('Nowhere', 'en')).toEqual([]);
  });
});

describe('last year blocks that fail', () => {
  it('marks the page as missing data when one block fails for a temporary reason', async () => {
    let n = 0;
    const history = {
      name: 'owm',
      days: async (lat: number, lon: number, start: string) => {
        if (n++ === 0) throw new ProviderError('busy', 503);
        return new MockHistory().days(lat, lon, start);
      },
    };
    const service = new WeatherService(new MockProvider(() => Date.UTC(2026, 9, 22, 3)), new MemoryStore(() => Date.UTC(2026, 9, 22, 3)), () => Date.UTC(2026, 9, 22, 3), () => undefined, 0, undefined, undefined, history);
    const bundle = await service.cityBundle('102643743');
    expect(bundle.missing).toContain('lastYear');
    expect(Object.keys(bundle.lastYear!.data).length).toBeGreaterThan(0);
  });
});

describe('last year via the prefetch queue (OpenWeather is too slow for pages)', () => {
  const NOW = Date.UTC(2026, 9, 22, 3);
  const setup = (fail?: (start: string) => ProviderError | null) => {
    const calls: string[] = [];
    const history: PastWeatherSource = {
      name: 'owm',
      slow: true,
      days: async (lat, lon, start) => {
        calls.push(start);
        const e = fail?.(start);
        if (e) throw e;
        return new MockHistory().days(lat, lon, start);
      },
    };
    const queue = new MemoryHistoryQueue();
    const store = new MemoryStore(() => NOW);
    const make = () => new WeatherService(new MockProvider(() => NOW), store, () => NOW, () => undefined, 0, undefined, undefined, history, undefined, queue);
    return { calls, queue, make };
  };

  it('pages only read the cache, queue what is missing and say it is being prepared', async () => {
    const { calls, queue, make } = setup();
    const svc = make();
    const bundle = await svc.cityBundle('102643743');
    expect(calls).toEqual([]);
    expect(bundle.missing).toContain('lastYearPending');
    expect(bundle.missing).not.toContain('lastYear');
    expect(bundle.lastYear?.data).toEqual({});
    expect(queue.jobs.size).toBeGreaterThanOrEqual(2);
    const jobs = [...queue.jobs.values()];
    expect(jobs.every((j) => j.cityId === '102643743' && j.attempts === 0)).toBe(true);
    // 同一实例再打开不会重复写队列
    const adds = queue.adds;
    await svc.cityBundle('102643743');
    expect(queue.adds).toBe(adds);
  });

  it('the scheduled job fetches the queued blocks, then pages have the data', async () => {
    const { calls, queue, make } = setup();
    await make().cityBundle('102643743');
    const queued = queue.jobs.size;
    const r = await make().drainHistoryQueue();
    expect(r).toEqual({ fetched: queued, dropped: 0, retried: 0, left: 0 });
    expect(calls.length).toBe(queued);
    expect(queue.jobs.size).toBe(0);
    const bundle = await make().cityBundle('102643743');
    expect(bundle.missing).not.toContain('lastYearPending');
    expect(Object.keys(bundle.lastYear!.data)).toHaveLength(15);
    expect(calls.length).toBe(queued);
  });

  it('drops blocks the source does not have; pages then show no question instead of waiting', async () => {
    const { queue, make } = setup(() => new ProviderError('bad request', 404));
    await make().cityBundle('102643743');
    const r = await make().drainHistoryQueue();
    expect(r.dropped).toBeGreaterThanOrEqual(2);
    expect(queue.jobs.size).toBe(0);
    const bundle = await make().cityBundle('102643743');
    expect(bundle.missing).not.toContain('lastYearPending');
    expect(bundle.missing).not.toContain('lastYear');
    expect(bundle.lastYear).toBeNull();
  });

  it('retries temporary failures a few times, then gives up', async () => {
    const { queue, make } = setup(() => new ProviderError('busy', 503));
    await make().cityBundle('102643743');
    const queued = queue.jobs.size;
    const first = await make().drainHistoryQueue();
    expect(first.retried).toBe(queued);
    expect([...queue.jobs.values()].every((j) => j.attempts === 1)).toBe(true);
    for (let i = 1; i < HISTORY_MAX_ATTEMPTS; i++) await make().drainHistoryQueue();
    expect(queue.jobs.size).toBe(0);
    // 放弃后页面不再把它放回队列，也不说"正在准备"：今天不出题
    const adds = queue.adds;
    const bundle = await make().cityBundle('102643743');
    expect(queue.adds).toBe(adds);
    expect(queue.jobs.size).toBe(0);
    expect(bundle.missing).not.toContain('lastYearPending');
    expect(bundle.lastYear).toBeNull();
  });

  it('stops the run on a key or quota problem and keeps the jobs; pages stop queuing on 401/403', async () => {
    for (const status of [401, 429]) {
      const { calls, queue, make } = setup(() => new ProviderError('nope', status));
      await make().cityBundle('102643743');
      const queued = queue.jobs.size;
      const r = await make().drainHistoryQueue({ concurrency: 1 });
      expect(r.stopped).toBe(status);
      expect(calls).toHaveLength(1);
      expect(queue.jobs.size).toBe(queued);
      expect([...queue.jobs.values()].every((j) => j.attempts === 0)).toBe(true);
    }
  });

  it('takes fresh jobs before ones that keep failing', async () => {
    const q = new MemoryHistoryQueue();
    await q.add({ cityId: 'a', lat: 0, lon: 0, start: '2025-10-20' });
    await q.add({ cityId: 'b', lat: 0, lon: 0, start: '2025-10-20' });
    await q.retry((await q.take(1))[0]!);
    expect((await q.take(2)).map((j) => j.cityId)).toEqual(['b', 'a']);
  });

  it('says "being prepared" only for the days whose block is queued', async () => {
    const { make } = setup();
    const svc = make();
    const ly = await svc.lastYear({ id: '102643743', name: 'London', adminArea: null, country: 'GB', timezone: 'Europe/London', lat: 51.5, lon: -0.12 }, ['2026-10-22', '2026-10-23']);
    expect(ly.pending).toBe(true);
    expect(ly.pendingDates).toEqual(['2026-10-22', '2026-10-23']);
  });

  it('stops starting new requests after the deadline', async () => {
    const { calls, queue, make } = setup();
    await make().cityBundle('102643743');
    const r = await make().drainHistoryQueue({ stopAt: Date.now() - 1 });
    expect(r.left).toBe(queue.jobs.size);
    expect(calls).toEqual([]);
  });

  it('without a queue, pages fetch directly as before', async () => {
    const calls: string[] = [];
    const history: PastWeatherSource = { name: 'owm', slow: true, days: async (lat, lon, start) => (calls.push(start), new MockHistory().days(lat, lon, start)) };
    const svc = new WeatherService(new MockProvider(() => NOW), new MemoryStore(() => NOW), () => NOW, () => undefined, 0, undefined, undefined, history);
    const bundle = await svc.cityBundle('102643743');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(bundle.lastYear!.data)).toHaveLength(15);
  });
});

describe('KV history queue', () => {
  function fakeKv() {
    const map = new Map<string, { value: string; metadata: unknown }>();
    const kv = {
      map,
      get: async (k: string) => map.get(k)?.value ?? null,
      put: async (k: string, value: string, o?: { metadata?: unknown }) => void map.set(k, { value, metadata: o?.metadata }),
      delete: async (k: string) => void map.delete(k),
      list: async ({ prefix }: { prefix: string }) => ({
        keys: [...map.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, v]) => ({ name, metadata: v.metadata })),
      }),
    };
    return kv;
  }

  it('adds once, keeps attempts in metadata, gives up after the limit', async () => {
    const kv = fakeKv();
    const q = new KvHistoryQueue(kv as unknown as KVNamespace);
    const job = { cityId: '102643743', lat: 51.5, lon: -0.12, start: '2025-10-20' };
    await q.add(job);
    let [taken] = await q.take(10);
    expect(taken).toEqual({ ...job, attempts: 0 });
    await q.retry(taken!);
    await q.add(job); // 已在队列：不清零
    [taken] = await q.take(10);
    expect(taken!.attempts).toBe(1);
    for (let i = 1; i < HISTORY_MAX_ATTEMPTS; i++) {
      [taken] = await q.take(10);
      await q.retry(taken!);
    }
    expect(await q.take(10)).toEqual([]);
    await q.add(job);
    await q.done((await q.take(10))[0]!);
    expect(kv.map.size).toBe(0);
  });

  it('ignores malformed entries', async () => {
    const kv = fakeKv();
    kv.map.set('q:ly:x:2025-10-20', { value: '1', metadata: { cityId: 'x' } });
    expect(await new KvHistoryQueue(kv as unknown as KVNamespace).take(10)).toEqual([]);
  });
});
