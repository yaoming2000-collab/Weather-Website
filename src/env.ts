/** Cloudflare Worker 的环境变量和绑定（见 wrangler.toml）。 */
export interface Env {
  /** "foreca" 或 "mock" */
  WEATHER_PROVIDER?: string;
  /** Foreca API 密钥（wrangler secret put FORECA_TOKEN） */
  FORECA_TOKEN?: string;
  /** 天气数据全局缓存 */
  WEATHER_KV?: KVNamespace;
  /** 猜一猜计数和排行榜（第 3 步）。没有绑定时退回内存存储 */
  DB?: D1Database;
  /** 城市搜索的频率限制（每个 IP 每分钟次数，见 wrangler.toml [[ratelimits]]）。没有绑定时不限制 */
  SEARCH_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** 静态文件 */
  ASSETS?: Fetcher;
}
