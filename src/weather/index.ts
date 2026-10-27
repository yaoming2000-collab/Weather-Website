import { CacheApiStore, KvStore, MemoryStore, TieredStore, type CacheStore } from '../cache/store';
import type { Env } from '../env';
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
  const layers: CacheStore[] = [];
  const cacheApi = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default;
  if (cacheApi) layers.push(new CacheApiStore(cacheApi));
  if (env.WEATHER_KV) layers.push(new KvStore(env.WEATHER_KV));
  if (layers.length === 0) layers.push(memory);
  return layers.length === 1 ? layers[0]! : new TieredStore(layers);
}

export function createWeatherService(env: Env): WeatherService {
  return new WeatherService(createProvider(env), createStore(env));
}
