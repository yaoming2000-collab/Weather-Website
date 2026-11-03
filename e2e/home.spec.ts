import { test } from '@playwright/test';
import { CITY, city, expect, mockOnly } from './helpers';

/** 城市首页（docs/TESTING.md TC-HOME） */
test.describe('城市首页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(city(CITY.london));
  });

  test('TC-HOME-01 显示城市名、当前温度、天气、最高最低温和更新时间', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('London');
    const hero = page.locator('[data-current]');
    await expect(hero).toBeVisible();
    await expect(hero.locator('[data-c]').first()).toHaveText(/^-?\d+$/);
    await expect(page.locator('[data-current-cond]')).not.toBeEmpty();
    await expect(page.locator('[data-fetched]')).toBeVisible();
  });

  test('TC-HOME-02 日期胶囊：明天、后天、7 天，点哪个进哪个并标为当前', async ({ page }) => {
    const pills = page.locator('[data-jump] a');
    await expect(pills).toHaveCount(3);
    await pills.first().click();
    await expect(page).toHaveURL(new RegExp(`/w/${CITY.london}/tomorrow`));
    await expect(page.locator('[data-jump] a[aria-current="page"]')).toBeVisible();
  });

  test('TC-HOME-03 逐小时预报至少 24 小时，可以横向滑动', async ({ page }) => {
    const hours = page.locator('.hours .hour');
    expect(await hours.count()).toBeGreaterThanOrEqual(24);
    const scrollable = await page.locator('.hours').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);
  });

  test('TC-HOME-04 "未来 2 小时"卡片一直显示，有一句结论', async ({ page }) => {
    const card = page.locator('[data-nowcast]');
    await expect(card).toBeVisible();
    await expect(card.locator('.nc-msg')).not.toBeEmpty();
  });

  test('TC-HOME-05 15 天和空气质量卡片能进入子页', async ({ page }) => {
    await page.locator(`a[href*="/w/${CITY.london}/15day"]`).first().click();
    await expect(page).toHaveURL(/\/15day/);
    await page.goBack();
    await page.locator(`a[href*="/w/${CITY.london}/air"]`).first().click();
    await expect(page).toHaveURL(/\/air/);
  });

  test('TC-HOME-06 生活指数 5 项都能进入详情', async ({ page }) => {
    for (const k of ['running', 'laundry', 'carwash', 'clothing', 'sunscreen']) {
      await expect(page.locator(`a[href*="/life/${k}"]`)).toHaveCount(1);
    }
    await page.locator('a[href*="/life/running"]').click();
    await expect(page).toHaveURL(/\/life\/running/);
  });

  test('TC-HOME-07 "预报准吗"：点了以后显示感谢，刷新后保持', async ({ page }) => {
    const box = page.locator('[data-vote]');
    await box.scrollIntoViewIfNeeded();
    await box.locator('[data-vote-value="up"]').click();
    await expect(box.locator('[data-vote-value="up"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(box.locator('[data-vote-value]').first()).toBeDisabled();
    await page.reload();
    await expect(page.locator('[data-vote] [data-vote-value="up"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('TC-HOME-08 收藏：点星标后加入"我的城市"，刷新后保持', async ({ page }) => {
    const star = page.locator('[data-save]');
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('[data-save]')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/wmi/en/cities');
    await expect(page.locator('[data-saved-list]')).toContainText('London');
  });

  test('TC-HOME-09 顶部：城市名 32px 一行，三个按钮在同一行，地区紧贴在城市名下面', async ({ page }) => {
    const name = page.locator('h1');
    expect(await name.evaluate((el) => getComputedStyle(el).fontSize)).toBe('32px');
    const nb = (await name.boundingBox())!;
    const buttons = page.locator('header a.btn, header button.btn');
    await expect(buttons).toHaveCount(3);
    for (const b of await buttons.all()) {
      const bb = (await b.boundingBox())!;
      const mid = bb.y + bb.height / 2;
      expect(mid).toBeGreaterThan(nb.y);
      expect(mid).toBeLessThan(nb.y + nb.height);
    }
    const region = (await page.locator('header .region').boundingBox())!;
    expect(region.y - (nb.y + nb.height)).toBeLessThan(8);
  });

  test('TC-HOME-10 广告位占位都在（home_1、home_2、home_3）', async ({ page }) => {
    for (const s of ['home_1', 'home_2', 'home_3']) await expect(page.locator(`[data-slot="${s}"]`)).toHaveCount(1);
  });
});

test('TC-HOME-11 模拟数据：每个模拟城市的首页都能打开', async ({ page }) => {
  mockOnly(test.info());
  for (const id of ['102643743', '104686017', '100745044', '100108410', '101581130', '101796236', '100524901']) {
    const res = await page.goto(city(id));
    expect(res?.status(), id).toBe(200);
  }
});
