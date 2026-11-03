import { test } from '@playwright/test';
import { CITY, city, expect, head } from './helpers';

/** 其他（docs/TESTING.md TC-MISC） */
test.describe('其他', () => {
  test('TC-MISC-01 ads.txt、robots.txt 可以访问', async ({ request }) => {
    for (const p of ['/ads.txt', '/robots.txt']) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(200);
      expect((await r.text()).length, p).toBeGreaterThan(0);
    }
  });

  test('TC-MISC-02 法律页面（英文、阿拉伯文）可以访问', async ({ request }) => {
    for (const l of ['en', 'ar']) {
      for (const p of ['contact-us', 'privacy-policy', 'term-of-use']) {
        expect((await request.get(`/${l}/${p}.html`)).status(), `${l}/${p}`).toBe(200);
      }
    }
  });

  test('TC-MISC-03 城市页不让搜索引擎收录（X-Robots-Tag: noindex）', async ({ page }) => {
    const r = await head(page, city(CITY.london));
    expect(r.status).toBe(200);
    expect(r.headers['x-robots-tag']).toContain('noindex');
  });

  test('TC-MISC-04 各页面的广告位占位都在', async ({ page }) => {
    const slots: Array<[string, string[]]> = [
      [city(CITY.london, 'en', 'tomorrow'), ['day_1', 'day_2']],
      [city(CITY.london, 'en', 'week'), ['week_1', 'week_2']],
      [city(CITY.london, 'en', 'climate'), ['climate_1', 'climate_2']],
      [city(CITY.london, 'en', 'life/running'), ['life_1', 'life_2']],
      [city(CITY.london, 'en', 'hourly'), ['sub_1', 'sub_2']],
      ['/wmi/en/cities', ['cities_1']],
    ];
    for (const [url, names] of slots) {
      await page.goto(url);
      for (const s of names) await expect(page.locator(`[data-slot="${s}"]`), `${url} ${s}`).toHaveCount(1);
    }
  });
});
