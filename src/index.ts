import { createApp } from './app';
import type { Env } from './env';
import { createFeatureStore } from './features/store';
import { D1Usage } from './features/usage';
import { createWeatherService } from './weather';

/**
 * Cloudflare Worker 入口。
 * public/ 下存在的静态文件（图标、法律页面、ads.txt）由 Cloudflare 直接返回，不进入这里。
 */
const app = createApp();

export default {
  fetch: app.fetch,
  /**
   * 定时任务（wrangler.toml 的 [triggers]）：
   * - 每 10 分钟：取回页面排队的去年数据（OpenWeather 太慢，页面不等它，见 src/weather/historyQueue.ts）
   * - 每天：清理过期的猜一猜计数、排行榜数据和调用统计
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === HISTORY_CRON) {
      // 直接等它做完（最长约 9.5 分钟，定时任务最多 15 分钟），不放进 waitUntil
      await prefetchLastYear(env);
      return;
    }
    if (event.cron !== CLEANUP_CRON) {
      console.error('[cron] unknown schedule (wrangler.toml 和 src/index.ts 要一致)', event.cron);
      return;
    }
    ctx.waitUntil(createFeatureStore(env.DB).cleanup(Date.now()));
    if (env.DB) ctx.waitUntil(D1Usage.cleanup(env.DB, Date.now()));
  },
} satisfies ExportedHandler<Env>;

/** 和 wrangler.toml [triggers] 里的写法一致（改一边要改另一边） */
const HISTORY_CRON = '*/10 * * * *';
const CLEANUP_CRON = '17 3 * * *';
/** 开始 8 分钟后不再开始新的请求（每个最多 90 秒），赶在下一次定时任务之前结束 */
const HISTORY_RUN_MS = 8 * 60_000;

async function prefetchLastYear(env: Env): Promise<void> {
  const usage = env.DB ? new D1Usage(env.DB) : undefined;
  const weather = createWeatherService(env, usage);
  try {
    const r = await weather.drainHistoryQueue({ stopAt: Date.now() + HISTORY_RUN_MS });
    if (r.fetched || r.dropped || r.retried || r.left) console.log('[history] prefetch', JSON.stringify(r));
  } catch (err) {
    console.error('[history] prefetch failed', err);
  } finally {
    // OpenWeather 的调用次数记进统计
    await usage?.flush().catch(() => undefined);
  }
}
