import { CacheApiStore, KvStore, MemoryStore, TieredStore, type CacheStore } from '../cache/store';
import type { Env } from '../env';
import { D1Usage } from '../features/usage';
import { ForecaProvider } from './foreca/client';
import { MockProvider } from './mock';
import type { WeatherProvider } from './provider';
import { WeatherService } from './service';
import { WikidataAreaSearch, WikidataNames } from './wikidata';
import { MockHistory, OpenWeatherHistory, type PastWeatherSource } from './history';
import { KvHistoryQueue } from './historyQueue';

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

/**
 * 去年同一天的实际天气：模拟数据模式用 MockHistory；否则配置了 OWM_KEY 才用 OpenWeather，
 * 没配置时页面上"和去年比"显示 "--"（不报错）。
 */
export function createHistory(env: Env): PastWeatherSource | undefined {
  if ((env.WEATHER_PROVIDER ?? 'foreca').toLowerCase() === 'mock') return new MockHistory();
  return env.OWM_KEY ? new OpenWeatherHistory(env.OWM_KEY) : undefined;
}

export function createWeatherService(env: Env, usage: D1Usage | undefined = env.DB ? new D1Usage(env.DB) : undefined): WeatherService {
  // 调用统计写在 D1（线上）；没有数据库的测试环境不统计
  // 去年数据的待取队列放在 KV：没有 KV 时（本地开发）页面直接请求，像以前一样
  const queue = env.WEATHER_KV ? new KvHistoryQueue(env.WEATHER_KV) : undefined;
  return new WeatherService(
    createProvider(env),
    createStore(env),
    undefined,
    undefined,
    undefined,
    usage,
    new WikidataNames(),
    createHistory(env),
    new WikidataAreaSearch(),
    queue,
  );
}
