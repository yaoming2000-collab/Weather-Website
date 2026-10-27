import { describe, expect, it } from 'vitest';
import { percentRight, readBook, writeBook } from '../client/lib/interact';
import { computeSky, discPosition } from '../src/pages/sky';

const at = (h: number, m = 0) => Date.UTC(2026, 9, 26, h, m); // 伦敦冬令时 = UTC
const base = { timezone: 'Europe/London', sunrise: '07:00:00', sunset: '17:00:00' };

describe('living sky', () => {
  it('follows the local time of day', () => {
    expect(computeSky({ ...base, icon: 'sunny', nowMs: at(7, 10) }).phase).toBe('dawn');
    expect(computeSky({ ...base, icon: 'sunny', nowMs: at(12) }).phase).toBe('day');
    expect(computeSky({ ...base, icon: 'sunny', nowMs: at(16, 20) }).phase).toBe('golden');
    expect(computeSky({ ...base, icon: 'sunny', nowMs: at(17, 20) }).phase).toBe('dusk');
    expect(computeSky({ ...base, icon: 'night', nowMs: at(22) }).phase).toBe('night');
  });

  it('trusts the night/day flag of the weather icon', () => {
    // 晚上 10 点却给了白天图标：不显示夜空，改为黄昏
    expect(computeSky({ ...base, icon: 'sunny', nowMs: at(22) }).phase).toBe('dusk');
  });

  it('maps the weather to the sky layers', () => {
    expect(computeSky({ ...base, icon: 'stormy-rain-heavy', nowMs: at(12) }).className).toBe('sky-day wx-storm');
    expect(computeSky({ ...base, icon: 'night-rainy-light', nowMs: at(22) }).className).toBe('sky-night wx-rain');
    expect(computeSky({ ...base, icon: 'partly-cloudy', nowMs: at(12) }).className).toBe('sky-day wx-clear wx-some');
    expect(computeSky({ ...base, icon: 'snowy-light', nowMs: at(16, 30) }).className).toBe('sky-twilight wx-snow');
  });

  it('puts the sun low on the left in the morning, high at noon, low on the right in the evening', () => {
    const morning = discPosition(computeSky({ ...base, icon: 'sunny', nowMs: at(8) }).arc);
    const noon = discPosition(computeSky({ ...base, icon: 'sunny', nowMs: at(12) }).arc);
    const evening = discPosition(computeSky({ ...base, icon: 'sunny', nowMs: at(16) }).arc);
    expect(morning.x).toBeLessThan(noon.x);
    expect(noon.x).toBeLessThan(evening.x);
    expect(noon.y).toBeLessThan(morning.y);
    expect(noon.y).toBeLessThan(evening.y);
  });

  it('uses 6:00 and 18:00 when there is no sunrise (polar night or day)', () => {
    expect(computeSky({ ...base, sunrise: null, sunset: null, icon: 'sunny', nowMs: at(12) }).phase).toBe('day');
  });
});

describe('guess and vote records', () => {
  it('computes the share of right guesses from 20 votes', () => {
    expect(percentRight({ colder: 2, same: 3, warmer: 10 }, 'warmer', 20)).toBeNull();
    expect(percentRight({ colder: 2, same: 3, warmer: 15 }, 'warmer', 20)).toBe(75);
  });

  it('keeps at most 60 records and survives broken storage', () => {
    let book = readBook('not json');
    for (let i = 0; i < 70; i++) book = writeBook(book, `c${i}|2026-10-26`, 'up', i);
    expect(Object.keys(book)).toHaveLength(60);
    expect(book['c0|2026-10-26']).toBeUndefined();
    expect(book['c69|2026-10-26']?.v).toBe('up');
  });
});

describe('sky particles', () => {
  it('scales rain and snow with the weather and keeps positions stable for cached pages', async () => {
    const { precipIntensity } = await import('../src/pages/sky');
    expect(precipIntensity('rainy-drizzle')).toBe(1);
    expect(precipIntensity('night-rainy-moderate')).toBe(2);
    expect(precipIntensity('stormy-rain-light')).toBe(3);
    expect(precipIntensity('snowy-heavy')).toBe(3);
    expect(precipIntensity('sunny')).toBe(0);

    const { SkyLayers } = await import('../src/pages/components');
    const sky = computeSky({ ...base, icon: 'rainy-moderate', nowMs: at(12) });
    const a = String(await SkyLayers({ sky }));
    const b = String(await SkyLayers({ sky }));
    expect(a).toBe(b);
    expect(a.match(/<i style="--x:/g)).toHaveLength(60);
    // 只用 transform 动画的粒子：内联样式里不能出现 background-position
    expect(a).not.toContain('background-position');
  });
});
