import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { D1FeatureStore, type AnomalyRecord } from '../src/features/store';
import { D1Usage } from '../src/features/usage';

/**
 * 用 wrangler 自带的本地 D1（真实 SQLite）跑一遍 SQL，确认建表语句和查询在 D1 上能用。
 */
const NOW = Date.UTC(2026, 9, 22, 12, 0);
const H = 3600_000;

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let db: D1Database;

beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  db = proxy.env.DB;
  for (const file of ['0001_features.sql', '0002_anomaly_valid_until.sql', '0003_usage.sql']) {
    const sql = readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const stmt of sql.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

function rec(cityId: string, deltaMax: number, updatedAt = NOW, date = '2026-10-22'): AnomalyRecord {
  return { cityId, name: `City ${cityId}`, country: 'X', date, deltaMax, maxTemp: 20 + deltaMax, avgMaxTemp: 20, level: 'warmer', updatedAt, validUntil: updatedAt + 12 * H };
}

describe('D1 storage', () => {
  it('adds votes atomically, including concurrent ones', async () => {
    const store = new D1FeatureStore(db);
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.addGuess('100', '2026-10-22', i % 5 === 0 ? 'colder' : 'warmer')));
    expect(await store.addGuess('100', '2026-10-22', 'same')).toEqual({ colder: 5, same: 1, warmer: 20 });
    expect(await store.guessCounts('100', '2026-10-22')).toEqual({ colder: 5, same: 1, warmer: 20 });
    expect(await store.guessCounts('100', '2026-10-21')).toEqual({ colder: 0, same: 0, warmer: 0 });
  });

  it('records anomalies at most once an hour per city and ranks them', async () => {
    const store = new D1FeatureStore(db);
    await store.recordAnomaly(rec('a', 4));
    await store.recordAnomaly(rec('b', -7));
    await store.recordAnomaly(rec('c', 1.5));
    await store.recordAnomaly(rec('old', 12, NOW - 50 * H));
    // 另一个 Worker 实例 10 分钟后写同一城市：被 SQL 条件挡住
    await new D1FeatureStore(db).recordAnomaly(rec('a', 9, NOW + 10 * 60_000));
    const r = await store.ranking(NOW + 10 * 60_000);
    expect(r.warmest.map((x) => [x.cityId, x.deltaMax])).toEqual([['a', 4], ['c', 1.5]]);
    expect(r.coldest.map((x) => x.cityId)).toEqual(['b']);
    expect(r.warmest[0]).toMatchObject({ name: 'City a', country: 'X', level: 'warmer' });

    // 一小时后可以更新
    await new D1FeatureStore(db).recordAnomaly(rec('a', 9, NOW + 2 * H));
    expect((await store.ranking(NOW + 2 * H)).warmest[0]).toMatchObject({ cityId: 'a', deltaMax: 9 });
  });

  it('cleans up old rows', async () => {
    const store = new D1FeatureStore(db);
    await store.addGuess('200', '2026-10-01', 'warmer');
    await store.cleanup(NOW);
    expect((await store.guessCounts('200', '2026-10-01')).warmer).toBe(0);
    expect((await store.guessCounts('100', '2026-10-22')).warmer).toBe(20);
    const left = await db.prepare('SELECT city_id FROM anomalies ORDER BY city_id').all<{ city_id: string }>();
    expect(left.results.map((r) => r.city_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('Foreca usage statistics', () => {
  it('adds up calls per day and kind, and counts distinct cities', async () => {
    let now = NOW;
    const u = new D1Usage(db, () => now);
    for (let i = 0; i < 3; i++) u.record('cur', '102643743', true);
    u.record('cur', '100524901', true);
    u.record('aq', '102643743', true);
    u.record('clid', '102643743', false);
    u.record('search', null, true);
    expect(u.due()).toBe(false);
    now += 31_000;
    expect(u.due()).toBe(true);
    await u.flush();
    u.record('cur', '102643743', true);
    await u.flush();
    const rows = await db.prepare('SELECT kind, ok, calls FROM usage_daily WHERE date = ?1 ORDER BY kind, ok').bind('2026-10-22').all();
    expect(rows.results).toEqual([
      { kind: 'aq', ok: 1, calls: 1 },
      { kind: 'clid', ok: 0, calls: 1 },
      { kind: 'cur', ok: 1, calls: 5 },
      { kind: 'search', ok: 1, calls: 1 },
    ]);
    const cities = await db.prepare('SELECT COUNT(*) AS n FROM usage_cities WHERE date = ?1').bind('2026-10-22').first<{ n: number }>();
    expect(cities?.n).toBe(2);
  });
});
