import { test } from '@playwright/test';
import { addDays, CITY, city, expect, localDate, pageData } from './helpers';

/** 往年对比页（docs/TESTING.md TC-CLIMATE）：图和降雨只比过去 7 天，不泄漏以后的题 */
test.describe('往年对比', () => {
  test('TC-CLIMATE-01 过去 7 天的图：7 个日期，最后一天是昨天（或前天），没有今天和以后', async ({ page }) => {
    await page.goto(city(CITY.london, 'en', 'climate'));
    const chart = page.locator('svg.series');
    test.skip((await chart.count()) === 0, '这个城市的过去 7 天数据还没准备好');
    const { tz } = await pageData(page);
    const today = localDate(tz!);
    // 横轴日期（M/D）：图里最后 7 个文字标签
    const labels = (await chart.locator('text').evaluateAll((els) => els.map((e) => e.textContent ?? ''))).filter((x) => /^\d{1,2}\/\d{1,2}$/.test(x));
    expect(labels).toHaveLength(7);
    const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
    expect([md(addDays(today, -1)), md(addDays(today, -2))]).toContain(labels.at(-1));
    expect(labels).not.toContain(md(today));
    expect(labels).not.toContain(md(addDays(today, 1)));
  });

  test('TC-CLIMATE-02 降雨对比：今年和去年同期各几天下雨，有一句说明', async ({ page }) => {
    await page.goto(city(CITY.london, 'en', 'climate'));
    const card = page.locator('.cmp-bars').locator('..');
    await expect(card).toContainText('Last year');
    await expect(card).toContainText('This year');
    await expect(card.locator('.note')).not.toBeEmpty();
  });

  test('TC-CLIMATE-03 图例：今年最高、去年最高、和去年差不多（±2°）', async ({ page }) => {
    await page.goto(city(CITY.london, 'en', 'climate'));
    const body = await page.locator('body').innerText();
    expect(body).toContain("This year's high");
    expect(body).toContain("Last year's high");
    expect(body).toContain('±2°');
  });
});
