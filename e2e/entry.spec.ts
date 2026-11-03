import { test } from '@playwright/test';
import { CHANNELS, CITY, CITY_URL, expect, head } from './helpers';

/** 进入与跳转（docs/TESTING.md TC-ENTRY） */
test.describe('进入与跳转', () => {
  test('TC-ENTRY-01 首页按位置跳转到某个城市页，不让搜索引擎收录', async ({ page }) => {
    const r = await head(page, '/');
    expect(r.status).toBe(302);
    expect(new URL(r.location, 'http://x').pathname).toMatch(CITY_URL);
    expect(r.headers['cache-control'] ?? '').toContain('no-store');
  });

  test('TC-ENTRY-02 6 种渠道前缀都能进入，跳转后保留渠道', async ({ page }) => {
    for (const ch of CHANNELS) {
      const r = await head(page, `/${ch}/`);
      expect(r.status, ch).toBe(302);
      expect(new URL(r.location, 'http://x').pathname, ch).toMatch(new RegExp(`^/${ch}/[a-z]{2}/w/`));
    }
  });

  test('TC-ENTRY-03 不存在的渠道返回 404', async ({ page }) => {
    const r = await head(page, '/no-such-channel/');
    expect(r.status).toBe(404);
  });

  test('TC-ENTRY-04 记住上次看的城市：再打开首页直接去那个城市', async ({ page }) => {
    const r = await head(page, '/wmi/', { Cookie: `wcity=${CITY.london}` });
    expect(new URL(r.location, 'http://x').pathname).toBe(`/wmi/en/w/${CITY.london}`);
  });

  test('TC-ENTRY-05 链接带坐标（锁屏）时按坐标，优先于上次的城市', async ({ page }) => {
    const r = await head(page, '/?lat=31.23&lon=121.47', { Cookie: `wcity=${CITY.london}` });
    const path = new URL(r.location, 'http://x').pathname;
    expect(path).toMatch(CITY_URL);
    expect(path).not.toContain(CITY.london);
    await page.goto(path);
    await expect(page.locator('h1')).toContainText(/Shanghai/i);
  });

  test('TC-ENTRY-06 "当前位置"（?here=1）不用上次的城市', async ({ page }) => {
    const r = await head(page, '/wmi/?here=1', { Cookie: `wcity=${CITY.london}` });
    expect(new URL(r.location, 'http://x').pathname).toMatch(CITY_URL);
    expect(r.location).not.toContain('here=');
  });

  test('TC-ENTRY-07 旧网址兼容', async ({ page }) => {
    let r = await head(page, '/?city=Shanghai&lat=31.23&lon=121.47');
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wmi\/en\/w\//);
    r = await head(page, '/wme/city/london-gb-51.507--0.128?city=London&lat=51.507&lon=-0.128&lang=ar');
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wme\/ar\/w\//);
    r = await head(page, '/cities');
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wmi\/[a-z]{2}\/cities$/);
    r = await head(page, '/mi/cities');
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/mi\/[a-z]{2}\/cities$/);
    const legal = await page.request.get('/en/term-of-use.html');
    expect(legal.status()).toBe(200);
  });

  test('TC-ENTRY-08 跳转时保留统计参数 session、uid、locale，去掉其他参数', async ({ page }) => {
    const r = await head(page, '/mi?locale=pt-BR&session=abc&uid=42&foo=bar');
    const u = new URL(r.location, 'http://x');
    expect(u.pathname).toMatch(/^\/mi\/bp\/w\//);
    expect(u.searchParams.get('session')).toBe('abc');
    expect(u.searchParams.get('uid')).toBe('42');
    expect(u.searchParams.get('locale')).toBe('pt-BR');
    expect(u.searchParams.has('foo')).toBe(false);
  });

  test('TC-ENTRY-09 语言优先级：设置页选的 > 锁屏 locale > 浏览器语言', async ({ page }) => {
    let r = await head(page, '/wmi/', { 'Accept-Language': 'tr-TR,tr;q=0.9' });
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wmi\/tr\//);
    r = await head(page, '/wmi/?locale=de-DE', { 'Accept-Language': 'tr-TR,tr;q=0.9' });
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wmi\/de\//);
    r = await head(page, '/wmi/?locale=de-DE', { 'Accept-Language': 'tr-TR,tr;q=0.9', Cookie: 'wlang=zh' });
    expect(new URL(r.location, 'http://x').pathname).toMatch(/^\/wmi\/zh\//);
  });

  test('TC-ENTRY-10 从站外打开别的语言的城市页，按设置页选的语言跳转', async ({ page }) => {
    const r = await head(page, `/wmi/en/w/${CITY.london}`, { Cookie: 'wlang=zh' });
    expect(r.status).toBe(302);
    expect(new URL(r.location, 'http://x').pathname).toBe(`/wmi/zh/w/${CITY.london}`);
  });
});
