import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { backgroundFor, iconFor, iconImage } from '../src/weather/icons';

/** Foreca 文档列出的全部 31 个白天代码（夜间把 d 换成 n） */
const FORECA_CODES = [
  '000', '100', '200', '300', '400', '500', '600',
  '210', '310', '410', '220', '320', '420', '430', '240', '340', '440',
  '211', '311', '411', '221', '321', '421', '431',
  '212', '312', '412', '222', '322', '422', '432',
];

const IMG_DIR = fileURLToPath(new URL('../public/img/weather', import.meta.url));

describe('Foreca symbol → icon', () => {
  it('maps every documented code (day and night) to an existing image', () => {
    for (const code of FORECA_CODES) {
      for (const dn of ['d', 'n']) {
        for (const precipRate of [null, 0, 0.2, 2, 8]) {
          const key = iconFor({ symbol: `${dn}${code}`, precipRate, temperature: 10 });
          expect(existsSync(resolve(IMG_DIR, iconImage(key))), `${dn}${code} → ${key}`).toBe(true);
        }
      }
    }
  });

  it.each([
    ['d000', 'sunny'],
    ['n000', 'night'],
    ['d100', 'partly-cloudy'],
    ['d500', 'partly-cloudy'],
    ['n100', 'night-partly-cloudy'],
    ['d200', 'mostly-cloudy'],
    ['d300', 'cloudy'],
    ['d400', 'cloudy'],
    ['d600', 'foggy'],
    ['d210', 'rainy-light'],
    ['d410', 'rainy-light'],
    ['d220', 'rainy-shower-light'],
    ['d320', 'rainy-shower-light'],
    ['d420', 'rainy-moderate'],
    ['d430', 'rainy-moderate'],
    ['d240', 'stormy-rain-medium'],
    ['d211', 'sleet-light'],
    ['d421', 'sleet-moderate'], // sleet-moderate 已修好（去掉了误画的闪电）
    ['d212', 'snowy-light'],
    ['d222', 'snowy-flurries'],
    ['d432', 'snowy-moderate'],
    ['n430', 'night-rainy-moderate'],
  ])('%s → %s (no rate information)', (symbol, expected) => {
    expect(iconFor({ symbol, precipRate: null, temperature: 10 })).toBe(expected);
  });

  it('refines intensity with the precipitation rate', () => {
    expect(iconFor({ symbol: 'd210', precipRate: 0.1, temperature: 10 })).toBe('rainy-drizzle');
    expect(iconFor({ symbol: 'd430', precipRate: 5, temperature: 10 })).toBe('rainy-heavy');
    expect(iconFor({ symbol: 'd440', precipRate: 0.05, temperature: 20 })).toBe('stormy-strong');
    expect(iconFor({ symbol: 'd440', precipRate: 0.5, temperature: 20 })).toBe('stormy-rain-light');
    expect(iconFor({ symbol: 'd440', precipRate: 6, temperature: 20 })).toBe('stormy-rain-heavy');
    expect(iconFor({ symbol: 'd431', precipRate: 5, temperature: 1 })).toBe('sleet-heavy');
    expect(iconFor({ symbol: 'd432', precipRate: 3, temperature: -3 })).toBe('snowy-heavy');
  });

  it('shows freezing rain when it rains at or below 0°C', () => {
    expect(iconFor({ symbol: 'd410', precipRate: 1, temperature: -1 })).toBe('rainy-freezing');
    expect(iconFor({ symbol: 'n430', precipRate: 1, temperature: 0 })).toBe('night-rainy-freezing');
    // 雪不受影响
    expect(iconFor({ symbol: 'd412', precipRate: 1, temperature: -5 })).toBe('snowy-light');
  });

  it('falls back to cloudy for unknown codes', () => {
    expect(iconFor({ symbol: 'x999' })).toBe('cloudy');
    expect(iconFor({ symbol: null })).toBe('cloudy');
  });

  it('uses the night images only where the old site had them', () => {
    expect(iconImage('night')).toBe('night.png');
    expect(iconImage('night-partly-cloudy')).toBe('night-partly-cloudy.png');
    expect(iconImage('night-mostly-cloudy')).toBe('night-partly-cloudy.png');
    expect(iconImage('night-rainy-light')).toBe('rainy-light.png');
    expect(iconImage('cloudy')).toBe('cloudy.png');
  });

  it('groups icons into animated backgrounds like the old site', () => {
    expect(backgroundFor('sunny')).toBe('sunny');
    expect(backgroundFor('partly-cloudy')).toBe('sunny');
    expect(backgroundFor('night')).toBe('night');
    expect(backgroundFor('night-partly-cloudy')).toBe('night-cloudy');
    expect(backgroundFor('stormy-rain-heavy')).toBe('stormy');
    expect(backgroundFor('night-rainy-light')).toBe('night-rainy');
    expect(backgroundFor('sleet-light')).toBe('snowy');
    expect(backgroundFor('rainy-freezing')).toBe('rainy-freezing');
    expect(backgroundFor('foggy')).toBe('foggy');
  });
});
