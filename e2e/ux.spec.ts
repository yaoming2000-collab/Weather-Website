import { test } from '@playwright/test';
import { CITY, city, expect, watchErrors } from './helpers';

/** 手机体验（docs/TESTING.md TC-UX） */
const PAGES = [city(CITY.london), city(CITY.london, 'en', 'climate'), city(CITY.london, 'en', 'hourly'), '/wmi/en/cities', '/wmi/en/settings', '/wmi/en/ranking'];

test.describe('手机体验', () => {
  test('TC-UX-01 页面不跳动（累计布局偏移 CLS < 0.02）', async ({ page }) => {
    for (const url of [city(CITY.london), city(CITY.london, 'en', 'climate')]) {
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(url);
      await page.waitForTimeout(2500);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, url).toBeLessThan(0.02);
    }
  });

  test('TC-UX-02 主要按钮点按区域至少 44px', async ({ page }) => {
    await page.goto(city(CITY.london));
    for (const b of await page.locator('header .btn').all()) {
      const bb = (await b.boundingBox())!;
      expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(44);
    }
    for (const b of await page.locator('[data-jump] a').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.goto('/wmi/en/settings');
    for (const b of await page.locator('[data-unit]').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.goto(city(CITY.london, 'en', 'climate'));
    for (const b of await page.locator('[data-choice]').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('TC-UX-03 主要页面没有脚本错误', async ({ page }) => {
    const errors = watchErrors(page);
    for (const url of PAGES) {
      await page.goto(url);
      await page.waitForTimeout(500);
    }
    expect(errors).toEqual([]);
  });

  test('TC-UX-04 出错页有"重试"或"回首页"按钮', async ({ page }) => {
    await page.goto(city('999999999'));
    await expect(page.locator('.msg a.btn, .msg button.btn').first()).toBeVisible();
  });

  test('TC-UX-05 断网时打开看过的城市，显示保存的副本', async ({ page, context }) => {
    await page.goto(city(CITY.london));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1')).toContainText('London');
    await context.setOffline(false);
  });

  test('TC-UX-06 页面上不出现 "undefined"、"NaN" 或没翻译的文案 key', async ({ page }) => {
    for (const url of PAGES) {
      await page.goto(url);
      const text = await page.locator('body').innerText();
      expect(text, url).not.toMatch(/\bundefined\b|\bNaN\b|\b(Climate|Guess|Nowcast|Streak|Life)[A-Z][A-Za-z_]+\b/);
    }
  });
});
