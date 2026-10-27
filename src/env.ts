/** Cloudflare Worker 的环境变量和绑定（见 wrangler.toml）。 */
export interface Env {
  /** "foreca" 或 "mock" */
  WEATHER_PROVIDER?: string;
  /** Foreca API 密钥（wrangler secret put FORECA_TOKEN） */
  FORECA_TOKEN?: string;
  /** 天气数据全局缓存 */
  WEATHER_KV?: KVNamespace;
  /** 静态文件 */
  ASSETS?: Fetcher;
}
