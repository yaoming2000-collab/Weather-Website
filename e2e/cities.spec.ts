import { test } from '@playwright/test';
import { CITY, city, CITY_URL, expect, REMOTE } from './helpers';

/** 我的城市（docs/TESTING.md TC-CITIES） */
test.describe('我的城市', () => {
  test('TC-CITIES-01 顶部有"当前位置"，点进去按定位跳到城市页', async ({ page }) => {
    await page.goto('/wmi/en/cities');
    const here = page.locator('a[href*="here=1"]');
    await expect(here).toContainText('Current location');
    await here.click();
    await expect(page).toHaveURL((u) => CITY_URL.test(u.pathname));
  });

  test('TC-CITIES-02 搜索：输入 3 个字母出结果，点结果进入城市', async ({ page }) => {
    await page.goto('/wmi/en/cities');
    const box = page.locator('[data-search-results]');
    await page.locator('[data-search] input').fill('is');
    await page.waitForTimeout(800);
    await expect(box).toBeHidden();
    await page.locator('[data-search] input').fill('ist');
    await expect(box).toContainText('Istanbul');
    await box.locator('a', { hasText: 'Istanbul' }).first().click();
    await expect(page).toHaveURL((u) => CITY_URL.test(u.pathname));
  });

  test('TC-CITIES-03 中文搜索 2 个字就能搜（真实数据）', async ({ page }) => {
    test.skip(!REMOTE, '模拟数据只有英文城市名，只在真实站点检查');
    await page.goto('/wmi/zh/cities');
    await page.locator('[data-search] input').fill('上海');
    await expect(page.locator('[data-search-results]')).toContainText('上海');
  });

  test('TC-CITIES-04 县、区名也能搜到（例如"惠东"，真实数据）', async ({ page }) => {
    test.skip(!REMOTE, '依赖 Wikidata 和 Foreca，只在真实站点检查');
    await page.goto('/wmi/zh/cities');
    await page.locator('[data-search] input').fill('惠东');
    await expect(page.locator('[data-search-results]')).toContainText('惠东', { timeout: 15_000 });
  });

  test('TC-CITIES-05 收藏的城市列在"我的城市"，可以删除', async ({ page }) => {
    for (const id of [CITY.london, CITY.shanghai]) {
      await page.goto(city(id));
      await page.locator('[data-save]').click();
    }
    await page.goto('/wmi/en/cities');
    const list = page.locator('[data-saved-list]');
    await expect(list).toContainText('London');
    await expect(list).toContainText('Shanghai');
    await list.locator('.city', { hasText: 'London' }).locator('button').click();
    await expect(list).not.toContainText('London');
    await expect(list).toContainText('Shanghai');
  });

  test('TC-CITIES-06 左上角返回：回到进来之前的城市页，显示城市名', async ({ page }) => {
    await page.goto(city(CITY.shanghai));
    await page.locator(`header a[href*="/cities"]`).click();
    await expect(page).toHaveURL(/\/cities/);
    const back = page.locator('[data-cities-back]');
    await expect(back).toContainText('Shanghai');
    await expect(back).toHaveAttribute('href', new RegExp(`/w/${CITY.shanghai}`));
  });
});
