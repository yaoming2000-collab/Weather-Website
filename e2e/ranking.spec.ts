import { test } from '@playwright/test';
import { expect } from './helpers';

/** 排行榜（docs/TESTING.md TC-RANK）：昨天最反常的城市（今天的就是今天的答案，不能公开） */
test.describe('排行榜', () => {
  test('TC-RANK-01 标题是"昨天"', async ({ page }) => {
    await page.goto('/wmi/en/ranking');
    await expect(page.locator('h1')).toContainText('Yesterday');
    await page.goto('/wmi/zh/ranking');
    await expect(page.locator('h1')).toContainText('昨天');
  });

  test('TC-RANK-02 有数据时列出城市，没数据时显示提示', async ({ page }) => {
    await page.goto('/wmi/en/ranking');
    const rows = await page.locator('a.rank').count();
    if (rows === 0) await expect(page.locator('body')).toContainText('Not enough data yet');
    else expect(rows).toBeGreaterThan(0);
  });
});
