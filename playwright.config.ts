import { defineConfig } from '@playwright/test';

/**
 * 黑盒功能测试（docs/TESTING.md）。
 * - 默认：自动用模拟数据启动本地站点（wrangler dev --env preview --var WEATHER_PROVIDER:mock），不需要联网和密钥
 * - 设置 BASE_URL 时：直接测这个网址（测试站或正式站，真实数据）；只适用于模拟数据的用例会自动跳过
 */
const remote = process.env.BASE_URL;
const PORT = Number(process.env.E2E_PORT ?? 8788);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: remote ? 2 : 4,
  retries: remote ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: remote ?? `http://127.0.0.1:${PORT}`,
    // 手机尺寸：360 宽是最常见的安卓宽度
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: remote
    ? undefined
    : {
        // 每次用一个干净的本地存储（不沿用上次缓存的页面和数据）
        command: `node -e "require('fs').rmSync('.wrangler/e2e-state',{recursive:true,force:true})" && npx wrangler dev --env preview --var WEATHER_PROVIDER:mock --port ${PORT} --ip 127.0.0.1 --persist-to .wrangler/e2e-state`,
        url: `http://127.0.0.1:${PORT}/robots.txt`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { WRANGLER_SEND_METRICS: 'false' },
      },
});
