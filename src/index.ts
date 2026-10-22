import { createApp } from './app';

/**
 * Cloudflare Worker 入口。
 * public/ 下存在的静态文件（图标、法律页面、ads.txt）由 Cloudflare 直接返回，不进入这里。
 */
const app = createApp();

export default app;
