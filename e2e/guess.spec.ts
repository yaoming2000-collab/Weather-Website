import { test, type Page } from '@playwright/test';
import { addDays, CITY, city, expect, localDate, mockOnly, pageData } from './helpers';

/**
 * 猜一猜（docs/TESTING.md TC-GUESS）：今天比去年同一天热还是冷。
 * 最重要的规则：猜之前任何看得到的地方都不能透露答案。
 */
const TEASER_EN = 'Remember this day last year? Guess';
const TEASER_ZH = '还记得去年今天的天气吗？猜一猜';

async function openClimate(page: Page, lang = 'en') {
  await page.goto(city(CITY.london, lang, 'climate'));
  const hasQuestion = (await page.locator('[data-guess]').count()) > 0;
  test.skip(!hasQuestion, '这个城市今天还没有题（去年数据在准备或没有）');
}

test.describe('猜一猜', () => {
  test('TC-GUESS-01 猜之前，首页标签只显示邀请文案，不显示结果', async ({ page }) => {
    await page.goto(city(CITY.london));
    await expect(page.locator('a.vs')).toHaveText(TEASER_EN);
    await page.goto(city(CITY.london, 'zh'));
    await expect(page.locator('a.vs')).toHaveText(TEASER_ZH);
  });

  test('TC-GUESS-02 猜之前，往年对比页看不到答案', async ({ page }) => {
    await openClimate(page);
    await expect(page.locator('[data-reveal]')).toBeHidden();
    await expect(page.locator('[data-guess] [data-choice]')).toHaveCount(3);
    // 可见文字里不能有结论（"Today is 3° warmer than this day last year"、"2° colder than last year"）
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\bToday is\b/i);
    expect(text).not.toMatch(/\d+°\s*(warmer|colder|hotter|cooler|milder)/i);
  });

  test('TC-GUESS-03 点一个答案：显示猜对/猜错、揭晓结果、去年今天的天气', async ({ page }) => {
    mockOnly(test.info());
    await openClimate(page);
    await page.locator('[data-choice]').first().click();
    await expect(page.locator('[data-reveal]')).toBeVisible();
    await expect(page.locator('[data-guess-result]')).not.toBeEmpty();
    await expect(page.locator('[data-choice][aria-pressed="true"]')).toHaveCount(1);
  });

  test('TC-GUESS-04 猜过后刷新：直接显示结果，不能再猜', async ({ page }) => {
    mockOnly(test.info());
    await openClimate(page);
    await page.locator('[data-choice]').nth(1).click();
    await page.reload();
    await expect(page.locator('[data-reveal]')).toBeVisible();
    await expect(page.locator('[data-guess][data-done]')).toHaveCount(1);
  });

  test('TC-GUESS-05 猜过后，首页标签换成结果', async ({ page }) => {
    mockOnly(test.info());
    await openClimate(page);
    await page.locator('[data-choice]').first().click();
    await page.goto(city(CITY.london));
    await expect(page.locator('a.vs')).not.toHaveText(TEASER_EN);
    await expect(page.locator('a.vs')).toContainText(/last year/i);
  });

  test('TC-GUESS-06 猜对后显示"已连续猜对 1 天"', async ({ page }) => {
    mockOnly(test.info());
    await openClimate(page);
    const answer = await page.locator('[data-guess]').getAttribute('data-answer');
    await page.locator(`[data-choice="${answer}"]`).click();
    await expect(page.locator('[data-streak]')).toBeVisible();
    await expect(page.locator('[data-streak]')).toContainText('1');
  });

  test('TC-GUESS-07 猜之前显示连续天数（昨天之前已连续猜对 3 天）', async ({ page }) => {
    await openClimate(page);
    const { tz, city: c } = await pageData(page);
    const yesterday = addDays(localDate(tz!), -1);
    await page.evaluate(([id, y]) => localStorage.setItem('weather.streak.v1', JSON.stringify({ [id!]: { cur: 3, best: 5, last: y } })), [c!.id, yesterday]);
    await page.reload();
    await expect(page.locator('[data-streak-pre]')).toBeVisible();
    await expect(page.locator('[data-streak-pre]')).toContainText('3');
  });

  test('TC-GUESS-08 明天、后天页没有猜一猜', async ({ page }) => {
    for (const sub of ['tomorrow', 'day-after']) {
      await page.goto(city(CITY.london, 'en', sub));
      await expect(page.locator('a.vs'), sub).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toContain(TEASER_EN);
    }
  });

  test('TC-GUESS-09 投票计数接口：读取和投票', async ({ page }) => {
    mockOnly(test.info());
    await openClimate(page);
    const date = await page.locator('[data-guess]').getAttribute('data-date');
    const before = await (await page.request.get(`/api/w/${CITY.london}/guess?date=${date}`)).json();
    expect(before.counts).toMatchObject({ colder: expect.any(Number), same: expect.any(Number), warmer: expect.any(Number) });
    const res = await page.request.post(`/api/w/${CITY.london}/guess`, { data: { date, choice: 'warmer' } });
    expect(res.ok()).toBe(true);
    const after = await res.json();
    expect(after.counts.warmer).toBe(before.counts.warmer + 1);
  });

  test('TC-GUESS-10 分享按钮在揭晓结果里', async ({ page }) => {
    mockOnly(test.info());
    await openClimate(page);
    await page.locator('[data-choice]').first().click();
    await expect(page.locator('[data-reveal] [data-share]')).toBeVisible();
  });
});
