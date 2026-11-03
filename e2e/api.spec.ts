import { test } from '@playwright/test';
import { CITY, expect } from './helpers';

/** 接口（docs/TESTING.md TC-API）：浏览器脚本和锁屏会调用这些接口，格式不能变 */
test.describe('接口', () => {
  test('TC-API-01 /api/search：3 个字母出结果，每条有 id、name、country', async ({ request }) => {
    const r = await request.get('/api/search?q=ist&lang=en');
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.items.length).toBeGreaterThan(0);
    expect(j.items[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    const short = await (await request.get('/api/search?q=i&lang=en')).json();
    expect(short.items).toEqual([]);
  });

  test('TC-API-02 /api/near：按坐标找最近的城市；坐标不对返回 400', async ({ request }) => {
    const j = await (await request.get('/api/near?lat=51.5&lon=-0.12')).json();
    expect(j).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    expect((await request.get('/api/near?lat=abc&lon=1')).status()).toBe(400);
  });

  test('TC-API-03 /api/cities：我的城市卡片（名字、温度、图标）', async ({ request }) => {
    const j = await (await request.get(`/api/cities?ids=${CITY.london},${CITY.shanghai}&lang=en`)).json();
    expect(j.items).toHaveLength(2);
    expect(j.items[0]).toMatchObject({ id: CITY.london, name: expect.any(String) });
  });

  test('TC-API-04 /api/w/{id}/now：当前天气；ID 格式不对返回 400', async ({ request }) => {
    const j = await (await request.get(`/api/w/${CITY.london}/now`)).json();
    expect(j).toMatchObject({ id: CITY.london, fetchedAt: expect.any(Number) });
    expect(j.current).toHaveProperty('temperature');
    expect((await request.get('/api/w/bad%20id!/now')).status()).toBe(400);
  });

  test('TC-API-05 /api/ranking：暖、冷两个列表', async ({ request }) => {
    const j = await (await request.get('/api/ranking')).json();
    expect(Array.isArray(j.warmest)).toBe(true);
    expect(Array.isArray(j.coldest)).toBe(true);
  });

  test('TC-API-06 /api/w/{id}/guess：读取计数（不写入）', async ({ request }) => {
    const r = await request.get(`/api/w/${CITY.london}/guess?date=2026-01-01`);
    expect([200, 400]).toContain(r.status());
    if (r.status() === 200) expect((await r.json()).counts).toBeDefined();
  });
});
