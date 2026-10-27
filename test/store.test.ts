import { describe, expect, it } from 'vitest';
import { MemoryFeatureStore, percentCorrect, type AnomalyRecord } from '../src/features/store';

const NOW = Date.UTC(2026, 9, 22, 12, 0);
const H = 3600_000;

function rec(cityId: string, deltaMax: number, updatedAt = NOW, date = '2026-10-22'): AnomalyRecord {
  return { cityId, name: cityId, country: null, date, deltaMax, maxTemp: 20 + deltaMax, avgMaxTemp: 20, level: 'normal', updatedAt, validUntil: updatedAt + 12 * H };
}

describe('guess counter', () => {
  it('counts votes per city and date', async () => {
    const s = new MemoryFeatureStore();
    await s.addGuess('1', '2026-10-22', 'warmer');
    await s.addGuess('1', '2026-10-22', 'warmer');
    expect(await s.addGuess('1', '2026-10-22', 'same')).toEqual({ colder: 0, same: 1, warmer: 2 });
    expect(await s.guessCounts('1', '2026-10-21')).toEqual({ colder: 0, same: 0, warmer: 0 });
    expect(await s.guessCounts('2', '2026-10-22')).toEqual({ colder: 0, same: 0, warmer: 0 });
  });

  it('shows the share of right guesses only from 20 votes', () => {
    expect(percentCorrect({ colder: 5, same: 4, warmer: 10 }, 'warmer')).toBeNull();
    expect(percentCorrect({ colder: 5, same: 5, warmer: 10 }, 'warmer')).toBe(50);
    expect(percentCorrect({ colder: 0, same: 1, warmer: 24 }, 'warmer')).toBe(96);
  });

  it('keeps counts for 7 days', async () => {
    const s = new MemoryFeatureStore();
    await s.addGuess('1', '2026-10-14', 'warmer');
    await s.addGuess('1', '2026-10-15', 'warmer');
    await s.cleanup(NOW);
    expect((await s.guessCounts('1', '2026-10-14')).warmer).toBe(0);
    expect((await s.guessCounts('1', '2026-10-15')).warmer).toBe(1);
  });
});

describe('ranking', () => {
  it('drops a city once its local day is over', async () => {
    const s = new MemoryFeatureStore();
    await s.recordAnomaly({ ...rec('ended', 12), validUntil: NOW - 1 });
    await s.recordAnomaly(rec('today', 4));
    expect((await s.ranking(NOW)).warmest.map((r) => r.cityId)).toEqual(['today']);
  });

  it('splits warmest and coldest, top first, from the last 24 hours', async () => {
    const s = new MemoryFeatureStore();
    for (const r of [rec('a', 3), rec('b', 9), rec('c', -4), rec('d', -1), rec('e', 0), rec('old', 15, NOW - 25 * H)]) await s.recordAnomaly(r);
    const r = await s.ranking(NOW);
    expect(r.warmest.map((x) => x.cityId)).toEqual(['b', 'a']);
    expect(r.coldest.map((x) => x.cityId)).toEqual(['c', 'd']);
  });

  it('writes the same city at most once an hour, unless the date changed', async () => {
    const s = new MemoryFeatureStore();
    await s.recordAnomaly(rec('a', 3));
    await s.recordAnomaly(rec('a', 5, NOW + 10 * 60_000));
    expect((await s.ranking(NOW + H)).warmest[0]!.deltaMax).toBe(3);
    await s.recordAnomaly(rec('a', 6, NOW + 20 * 60_000, '2026-10-23'));
    expect((await s.ranking(NOW + H)).warmest[0]!.deltaMax).toBe(6);
    await s.recordAnomaly(rec('a', 7, NOW + 2 * H, '2026-10-23'));
    expect((await s.ranking(NOW + 2 * H)).warmest[0]!.deltaMax).toBe(7);
  });

  it('drops ranking rows after 2 days', async () => {
    const s = new MemoryFeatureStore();
    await s.recordAnomaly(rec('a', 3, NOW - 49 * H));
    await s.cleanup(NOW);
    expect((await s.ranking(NOW - 48 * H)).warmest).toEqual([]);
  });
});
