import { test } from '@playwright/test';
import { CITY, city, expect, LANGS, watchErrors } from './helpers';

/** 多语言（docs/TESTING.md TC-I18N） */
test.describe('多语言', () => {
  test('TC-I18N-01 28 种语言的城市页都能打开，没有脚本错误，胶囊文案在 360px 宽不滚动', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    const overflow: string[] = [];
    for (const lang of LANGS) {
      const res = await page.goto(city(CITY.london, lang));
      expect(res?.status(), lang).toBe(200);
      await expect(page.locator('h1'), lang).toBeVisible();
      const running = await page.locator('a.vs [data-marquee].run').count();
      if (running) overflow.push(lang);
    }
    expect(errors).toEqual([]);
    expect(overflow, '这些语言的胶囊文案放不下').toEqual([]);
  });

  test('TC-I18N-02 阿拉伯语从右到左排版', async ({ page }) => {
    await page.goto(city(CITY.london, 'ar'));
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.goto(city(CITY.london, 'en'));
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('TC-I18N-03 页面语言和网址一致（中文页面是中文文案）', async ({ page }) => {
    await page.goto(city(CITY.london, 'zh'));
    await expect(page.locator('html')).toHaveAttribute('lang', /^zh/);
    await expect(page.locator('body')).toContainText('逐小时');
  });
});
