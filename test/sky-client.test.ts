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
    expect(precipIntensity('stormy-rain-light')).toBe(1);
    expect(precipIntensity('stormy-rain-heavy')).toBe(3);
    // 干雷：只闪光，不下雨
    expect(precipIntensity('stormy-strong')).toBe(0);
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

describe('every weather state has a sky', () => {
  it('shows the right layers for tricky states', async () => {
    const { SkyLayers } = await import('../src/pages/components');
    const layers = async (icon: string, h = 12) => {
      const html = String(await SkyLayers({ sky: computeSky({ ...base, icon, nowMs: at(h) }) }));
      return ['stars', 'sun', 'moon', 'clouds', 'rain', 'snow', 'flash', 'fog'].filter((c) => html.includes(`class="${c}`));
    };
    expect(await layers('stormy-strong')).toEqual(['clouds', 'flash']); // 干雷不下雨
    expect(await layers('sleet-light')).toEqual(['clouds', 'rain', 'snow']); // 雨夹雪
    expect(await layers('cloudy')).toEqual(['clouds']); // 阴天看不到太阳
    expect(await layers('mostly-cloudy')).toEqual(['sun', 'clouds']);
    expect(await layers('night-cloudy', 22)).toEqual(['clouds']); // 阴天夜里没有星星
    expect(await layers('night', 22)).toEqual(['stars', 'moon', 'clouds']);
    expect(await layers('foggy')).toEqual(['fog']);
  });
});

describe('dust and wind', () => {
  it('shows dust from coarse particles when it is dry, and lets rain win', async () => {
    const { dustLevel, displayIcon } = await import('../src/pages/sky');
    expect(dustLevel('sunny', { pm10: 561, pm25: 98 })).toBe(2);
    expect(dustLevel('partly-cloudy', { pm10: 230, pm25: 80 })).toBe(1);
    expect(dustLevel('sunny', { pm10: 120, pm25: 40 })).toBe(0);
    // PM2.5 更高：是烟雾或污染，不是沙尘
    expect(dustLevel('sunny', { pm10: 260, pm25: 300 })).toBe(0);
    expect(dustLevel('rainy-light', { pm10: 561, pm25: 98 })).toBe(0);
    const sky = computeSky({ ...base, icon: 'sunny', nowMs: at(12), air: { pm10: 561, pm25: 98 } });
    expect(sky.className).toBe('sky-day wx-dust wx-dust2');
    expect(displayIcon('sunny', sky)).toBe('sandy');
  });

  it('turns wind into cloud speed, rain slant and direction', async () => {
    const { windLevel, windSign, skyVars } = await import('../src/pages/sky');
    expect(windLevel(3, 5)).toBe(0);
    expect(windLevel(7, null)).toBe(1);
    expect(windLevel(8, 17)).toBe(2); // 阵风 17 m/s × 0.7 ≈ 12
    expect(windLevel(20, 30)).toBe(3);
    expect(windSign(270)).toBe(1); // 西风：往右（东）吹
    expect(windSign(90)).toBe(-1); // 东风：往左吹
    expect(windSign(0)).toBe(-1); // 北风：默认向左
    const calm = skyVars(computeSky({ ...base, icon: 'rainy-light', nowMs: at(12), wind: { speed: 2, gust: 3, dir: 90 } }));
    const gale = skyVars(computeSky({ ...base, icon: 'rainy-light', nowMs: at(12), wind: { speed: 18, gust: 25, dir: 270 } }));
    expect(calm).toContain('--rot:12deg');
    expect(calm).toContain('--drift:120s');
    expect(gale).toContain('--rot:-34deg');
    expect(gale).toContain('--drift:26s');
  });
});
