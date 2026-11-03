import { test } from '@playwright/test';
import { CITY, city, expect, head } from './helpers';

/** 子页（docs/TESTING.md TC-SUB） */
const SUBS = ['hourly', '15day', 'air', 'tomorrow', 'day-after', 'week', 'climate', 'life/running', 'life/laundry', 'life/carwash', 'life/clothing', 'life/sunscreen'];

test.describe('子页', () => {
  test('TC-SUB-01 12 个子页都能打开，左上角有返回城市主页的链接', async ({ page }) => {
    for (const sub of SUBS) {
      const res = await page.goto(city(CITY.london, 'en', sub));
      expect(res?.status(), sub).toBe(200);
      const back = page.locator('header a.back').first();
      await expect(back, sub).toHaveAttribute('href', new RegExp(`/w/${CITY.london}(\\?|$)`));
    }
  });

  test('TC-SUB-02 从子页返回城市主页', async ({ page }) => {
    await page.goto(city(CITY.london, 'en', 'hourly'));
    await page.locator('header a.back').first().click();
    await expect(page).toHaveURL(new RegExp(`/w/${CITY.london}(\\?|$)`));
  });

  test('TC-SUB-03 不存在的城市显示 404 页，有回首页的链接', async ({ page }) => {
    const r = await head(page, city('999999999'));
    // 测真实站点时 Foreca 对不存在的 ID 可能报临时错误（已知问题，显示"天气暂时不可用"）
    expect([404, 503]).toContain(r.status);
    await page.goto(city('999999999'));
    await expect(page.locator('a.btn').last()).toBeVisible();
  });
});
