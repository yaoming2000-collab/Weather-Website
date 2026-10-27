import { CacheApiStore, KvStore, MemoryStore, TieredStore, type CacheStore } from '../cache/store';
import type { Env } from '../env';
import { D1Usage } from '../features/usage';
import { ForecaProvider } from './foreca/client';
import { MockProvider } from './mock';
import type { WeatherProvider } from './provider';
import { WeatherService } from './service';

/** 同一个 Worker 实例内复用的内存缓存（没有 KV 和 Cache API 时使用，例如测试） */
const memory = new MemoryStore();

export function createProvider(env: Env): WeatherProvider {
  if ((env.WEATHER_PROVIDER ?? 'foreca').toLowerCase() === 'mock') return new MockProvider();
  return new ForecaProvider(env.FORECA_TOKEN ?? '');
}

export function createStore(env: Env): CacheStore {
  const cacheApi = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default;
  const local = cacheApi ? new CacheApiStore(cacheApi) : null;
  const shared = env.WEATHER_KV ? new KvStore(env.WEATHER_KV) : null;
  if (local && shared) return new TieredStore(local, shared);
  return local ?? shared ?? memory;
}

export function createWeatherService(env: Env): WeatherService {
  // 调用统计写在 D1（线上）；没有数据库的测试环境不统计
  const usage = env.DB ? new D1Usage(env.DB) : undefined;
  return new WeatherService(createProvider(env), createStore(env), undefined, undefined, undefined, usage);
}
