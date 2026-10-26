import { createApp } from './app';
import type { Env } from './env';
import { createFeatureStore } from './features/store';

/**
 * Cloudflare Worker 入口。
 * public/ 下存在的静态文件（图标、法律页面、ads.txt）由 Cloudflare 直接返回，不进入这里。
 */
const app = createApp();

export default {
  fetch: app.fetch,
  /** 定时任务（wrangler.toml 的 [triggers]）：每天清理过期的猜一猜计数和排行榜数据 */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(createFeatureStore(env.DB).cleanup(Date.now()));
  },
} satisfies ExportedHandler<Env>;
