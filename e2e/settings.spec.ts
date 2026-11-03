import { test } from '@playwright/test';
import { CITY, city, expect, head } from './helpers';

/** 设置页（docs/TESTING.md TC-SET） */
test.describe('设置', () => {
  test('TC-SET-01 温度改成 °F：城市页的温度立即按华氏度显示，并记住', async ({ page }) => {
    await page.goto('/wmi/en/settings');
    await page.locator('[data-units-group="temp"] [data-unit="f"]').click();
    await expect(page.locator('[data-units-group="temp"] [data-unit="f"]')).toHaveAttribute('aria-checked', 'true');
    await page.goto(city(CITY.london));
    const el = page.locator('[data-current] [data-c]').first();
    const c = Number(await el.getAttribute('data-c'));
    await expect(el).toHaveText(String(Math.round((c * 9) / 5 + 32)));
  });

  test('TC-SET-02 风速改成 mph：城市页的风速单位跟着变', async ({ page }) => {
    await page.goto('/wmi/en/settings');
    await page.locator('[data-units-group="wind"] [data-unit="mph"]').click();
    await page.goto(city(CITY.london));
    const units = page.locator('[data-speed-unit]');
    test.skip((await units.count()) === 0, '页面上没有风速');
    await expect(units.first()).toHaveText('mph');
  });

  test('TC-SET-03 换语言：跳到新语言的设置页，以后打开首页也用这个语言', async ({ page }) => {
    await page.goto('/wmi/en/settings');
    await page.locator('[data-lang-choice="zh"]').click();
    await expect(page).toHaveURL(/\/wmi\/zh\/settings/);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'wlang')?.value).toBe('zh');
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const r = await head(page, '/wmi/', { Cookie: cookie });
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wmi\/zh\//);
  });

  test('TC-SET-04 设置页左上角返回：回到进来之前的页面', async ({ page }) => {
    await page.goto(city(CITY.london, 'en', 'hourly'));
    await page.locator('header a[href*="/settings"]').first().click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('[data-settings-back]')).toHaveAttribute('href', new RegExp(`/w/${CITY.london}/hourly`));
  });
});
