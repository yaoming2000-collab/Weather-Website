import { describe, expect, it } from 'vitest';
import { MemoryStore, TieredStore } from '../src/cache/store';
import { DATA_TTL, MAX_STALE_SECONDS } from '../src/config/thresholds';
import { MockProvider } from '../src/weather/mock';
import { ProviderError } from '../src/weather/provider';
import { shouldFetchNowcast, WeatherService } from '../src/weather/service';

function setup(startMs = Date.UTC(2026, 9, 22, 3, 0)) {
  let now = startMs;
  const clock = () => now;
  const provider = new MockProvider(clock);
  const calls: Record<string, number> = {};
  let failing = false;
  // 统计每个方法被调用的次数，并可模拟供应商故障
  const counted = new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
        if (failing) return Promise.reject(new ProviderError('down', 503));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  const store = new MemoryStore(clock);
  const service = new WeatherService(counted, store, clock, () => undefined);
  return {
    service,
    calls,
    advance: (seconds: number) => (now += seconds * 1000),
    fail: (v: boolean) => (failing = v),
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
    await service.daily('100745044');
    await service.daily('100745044');
    await service.daily('102643743');
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
  });

  it('still renders the page when non-essential data fails', async () => {
    const { service } = setup();
    const bundle = await service.cityBundle('102643743');
    expect(bundle.current.data.temperature).not.toBeNull();
    expect(bundle.hourly?.data).toHaveLength(24);
    expect(bundle.daily?.data).toHaveLength(15);
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

describe('TieredStore', () => {
  it('backfills the faster layer from the shared layer', async () => {
    const l1 = new MemoryStore();
    const l2 = new MemoryStore();
    await l2.put('k', { value: 1, fetchedAt: 1 }, 600);
    const tiered = new TieredStore([l1, l2]);
    expect(await tiered.get('k')).toEqual({ value: 1, fetchedAt: 1 });
    expect(await l1.get('k')).toEqual({ value: 1, fetchedAt: 1 });
  });
});
