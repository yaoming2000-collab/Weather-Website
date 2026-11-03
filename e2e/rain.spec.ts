import { test, type Page } from '@playwright/test';
import { city, expect, mockOnly } from './helpers';

/**
 * 降雨时间轴（docs/TESTING.md TC-RAIN）：分钟数按浏览器的当前时间计算，页面缓存多久都不过时。
 * 需要正在下雨或快下雨的城市：模拟数据里河内一直在下雨（src/weather/mock.ts RAIN_TEST_CITY），大约 1 小时后停。
 */
// 河内（101581130）在模拟数据里一直在下雨，先试它
const MOCK_CITIES = ['101581130', '102643743', '104686017', '101796236', '100524901', '100745044', '100108410'];

async function openRainyCity(page: Page): Promise<boolean> {
  for (const id of MOCK_CITIES) {
    await page.goto(city(id, 'en'));
    // 要有柱状图的：快下雨、正在下（不下雨时只有一行字）
    if ((await page.locator('[data-nc][data-nowcast="starting"], [data-nc][data-nowcast="stopping"], [data-nc][data-nowcast="continuing"]').count()) > 0) return true;
  }
  return false;
}

const minutes = async (page: Page) => {
  const t = await page.locator('[data-nowcast] .nc-msg').innerText();
  const m = t.match(/(\d+)\s*min/);
  return { text: t, min: m ? Number(m[1]) : null, state: await page.locator('[data-nowcast]').getAttribute('data-nowcast') };
};

test.describe('降雨时间轴', () => {
  test('TC-RAIN-01 时间往后走，分钟数跟着减少，过了开始时刻状态会变', async ({ page }) => {
    mockOnly(test.info());
    await page.clock.install({ time: Date.now() });
    test.skip(!(await openRainyCity(page)), '模拟数据今天没有下雨的城市');
    const a = await minutes(page);
    await page.clock.fastForward('15:00');
    const b = await minutes(page);
    expect(b.text).not.toBe(a.text);
    if (a.state === b.state && a.min !== null && b.min !== null) expect(b.min).toBeLessThan(a.min);
  });

  test('TC-RAIN-02 柱子最多 8 根，第一格标"现在"，卡片高度不变', async ({ page }) => {
    mockOnly(test.info());
    await page.clock.install({ time: Date.now() });
    test.skip(!(await openRainyCity(page)), '模拟数据今天没有下雨的城市');
    const card = page.locator('[data-nowcast]');
    const h1 = (await card.boundingBox())!.height;
    expect(await card.locator('.nc-bars span').count()).toBeLessThanOrEqual(8);
    await expect(card.locator('.nc-axis bdi').first()).toHaveText('Now');
    await page.clock.fastForward('20:00');
    const h2 = (await card.boundingBox())!.height;
    expect(Math.abs(h2 - h1)).toBeLessThan(2);
  });

  test('TC-RAIN-03 页面太旧、数据全部过去时显示"暂无数据"', async ({ page }) => {
    mockOnly(test.info());
    await page.clock.install({ time: Date.now() });
    test.skip(!(await openRainyCity(page)), '模拟数据今天没有下雨的城市');
    await page.clock.fastForward('03:30:00');
    await expect(page.locator('[data-nowcast]')).toHaveAttribute('data-nowcast', 'unavailable');
  });
});
