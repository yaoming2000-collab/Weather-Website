import { describe, expect, it } from 'vitest';
import { addCity, MAX_CITIES, mergeCities, parseLegacy, parseSaved, readCookie, removeCity } from '../client/lib/saved';
import { cityToday, minutesAgo, pastHourCount } from '../client/lib/time';
import { citiesBack, lastCityCookie, parseLastCity } from '../client/lib/lastCity';
import { defaultUnits, formatDistance, formatPrecip, formatSpeed, formatTemp, formatTempDelta, fromLegacy, parseUnits } from '../client/lib/units';

describe('units', () => {
  const C = { temp: 'c', wind: 'kmh' } as const;
  const F = { temp: 'f', wind: 'mph' } as const;

  it('picks temperature and wind units by region', () => {
    expect(defaultUnits(['en-US', 'en'])).toEqual({ temp: 'f', wind: 'mph' });
    expect(defaultUnits(['en-GB'])).toEqual({ temp: 'c', wind: 'mph' });
    expect(defaultUnits(['ru-RU'])).toEqual({ temp: 'c', wind: 'ms' });
    expect(defaultUnits(['nb-NO'])).toEqual({ temp: 'c', wind: 'ms' });
    expect(defaultUnits(['ja-JP'])).toEqual({ temp: 'c', wind: 'ms' });
    expect(defaultUnits(['es-419', 'es'])).toEqual({ temp: 'c', wind: 'kmh' });
    expect(defaultUnits(['de-DE'])).toEqual({ temp: 'c', wind: 'kmh' });
    // 没有地区时按语言
    expect(defaultUnits(['fi'])).toEqual({ temp: 'c', wind: 'ms' });
    expect(defaultUnits(['ar'])).toEqual({ temp: 'c', wind: 'kmh' });
  });

  it('keeps the old metric/imperial choice and reads saved settings safely', () => {
    expect(fromLegacy('imperial', { temp: 'c', wind: 'ms' })).toEqual({ temp: 'f', wind: 'mph' });
    expect(fromLegacy('metric', { temp: 'f', wind: 'mph' })).toEqual({ temp: 'c', wind: 'kmh' });
    expect(fromLegacy('metric', { temp: 'c', wind: 'ms' })).toEqual({ temp: 'c', wind: 'ms' });
    expect(fromLegacy(null, C)).toBeNull();
    expect(parseUnits('{"temp":"f","wind":"ms"}')).toEqual({ temp: 'f', wind: 'ms' });
    expect(parseUnits('{"temp":"k"}')).toBeNull();
    expect(parseUnits('oops')).toBeNull();
  });

  it('converts temperature, deltas, wind, precipitation and distance', () => {
    expect(formatTemp(20, F)).toBe('68');
    expect(formatTemp(-0.4, C)).toBe('0');
    expect(formatTempDelta(6, F)).toBe('+11');
    expect(formatTempDelta(-3, C)).toBe('-3');
    expect(formatSpeed(10, C)).toEqual({ value: '36', unit: 'km/h' });
    expect(formatSpeed(10, F)).toEqual({ value: '22', unit: 'mph' });
    expect(formatSpeed(10, { temp: 'c', wind: 'ms' })).toEqual({ value: '10', unit: 'm/s' });
    expect(formatPrecip(25.4, F)).toEqual({ value: '1.00', unit: 'in' });
    expect(formatDistance(16093, F)).toEqual({ value: '10', unit: 'mi' });
    expect(formatDistance(4000, F)).toEqual({ value: '2.5', unit: 'mi' });
    expect(formatDistance(24000, C)).toEqual({ value: '24', unit: 'km' });
    expect(formatDistance(800, C)).toEqual({ value: '0.8', unit: 'km' });
  });
});

describe('saved cities', () => {
  const london = { id: '102643743', name: 'London', admin: 'England', country: 'United Kingdom' };
  const hanoi = { id: '101581130', name: 'Hanoi', admin: null, country: 'Vietnam' };

  it('reads the old site format (lat/lon based) and drops bad entries', () => {
    const legacy = JSON.stringify([
      { id: 'london-gb-51.507--0.128', name: 'London', displayName: 'London, England, GB', countryCode: 'GB', lat: 51.507, lon: -0.128 },
      { name: 'Broken', lat: 'x', lon: 1 },
      { name: 'Out', lat: 120, lon: 0 },
    ]);
    expect(parseLegacy(legacy)).toEqual([{ name: 'London', lat: 51.507, lon: -0.128 }]);
    expect(parseLegacy('not json')).toEqual([]);
  });

  it('reads the old cookie', () => {
    const v = encodeURIComponent(JSON.stringify([{ name: 'A', lat: 1, lon: 2 }]));
    expect(readCookie(`foo=1; weather_saved_cities_v1=${v}; bar=2`, 'weather_saved_cities_v1')).toBe('[{"name":"A","lat":1,"lon":2}]');
    expect(readCookie('foo=1', 'weather_saved_cities_v1')).toBeNull();
  });

  it('adds to the top, removes, de-duplicates and caps at 10', () => {
    let list = addCity([], london);
    list = addCity(list, hanoi);
    expect(list.map((c) => c.id)).toEqual([hanoi.id, london.id]);
    expect(addCity(list, london).map((c) => c.id)).toEqual([london.id, hanoi.id]);
    expect(removeCity(list, hanoi.id)).toEqual([london]);
    const many = Array.from({ length: 15 }, (_, i) => ({ ...london, id: String(i) }));
    expect(mergeCities([], many)).toHaveLength(MAX_CITIES);
    expect(parseSaved(JSON.stringify([london, { bad: true }]))).toEqual([london]);
  });
});

describe('browser time', () => {
  it('uses the city date', () => {
    const t = Date.UTC(2026, 9, 22, 3, 0);
    expect(cityToday(t, 'America/Chicago')).toBe('2026-10-21');
    expect(cityToday(t, 'Asia/Shanghai')).toBe('2026-10-22');
  });

  it('hides hours that are already over when the page comes from cache', () => {
    const times = ['2026-10-22T10:00+08:00', '2026-10-22T11:00+08:00', '2026-10-22T12:00+08:00'];
    // 北京时间 11:20
    expect(pastHourCount(times, Date.UTC(2026, 9, 22, 3, 20))).toBe(1);
    expect(minutesAgo(Date.UTC(2026, 9, 22, 3, 0), Date.UTC(2026, 9, 22, 3, 7, 59))).toBe(7);
  });
});

describe('guess streak', () => {
  it('counts correct days in a row and breaks on a wrong answer', async () => {
    const { recordResult, currentStreak } = await import('../client/lib/streak');
    let s = recordResult(undefined, '2026-10-20', true);
    s = recordResult(s, '2026-10-21', true);
    s = recordResult(s, '2026-10-22', true);
    expect(s).toEqual({ cur: 3, best: 3, last: '2026-10-22' });
    // 同一天再记不变
    expect(recordResult(s, '2026-10-22', false)).toBe(s);
    s = recordResult(s, '2026-10-23', false);
    expect(s.cur).toBe(0);
    expect(s.best).toBe(3);
    s = recordResult(s, '2026-10-24', true);
    expect(currentStreak(s, '2026-10-24')).toBe(1);
  });

  it('breaks when a day is missed, but not when there was no question', async () => {
    const { recordResult, recordSkip, currentStreak } = await import('../client/lib/streak');
    let s = recordResult(recordResult(undefined, '2026-10-20', true), '2026-10-21', true);
    // 22 日没出题（去年数据缺失）
    s = recordSkip(s, '2026-10-22')!;
    s = recordResult(s, '2026-10-23', true);
    expect(s.cur).toBe(3);
    // 昨天之前就没再猜：今天看到的是 0
    expect(currentStreak(s, '2026-10-24')).toBe(3);
    expect(currentStreak(s, '2026-10-25')).toBe(0);
    // 隔了一天再猜对：重新从 1 开始，最长保留
    s = recordResult(s, '2026-10-25', true);
    expect(s).toEqual({ cur: 1, best: 3, last: '2026-10-25' });
  });

  it('ignores damaged storage', async () => {
    const { readStreaks } = await import('../client/lib/streak');
    expect(readStreaks('not json')).toEqual({});
    expect(readStreaks('{"1":{"cur":"x"}}')).toEqual({});
  });
});

describe('guess streak edge cases', () => {
  it('counts a real guess made after a "no question" mark on the same day', async () => {
    const { recordResult, recordSkip } = await import('../client/lib/streak');
    let s = recordResult(undefined, '2026-10-20', true);
    s = recordSkip(s, '2026-10-21')!;
    expect(s.skipped).toBe(true);
    s = recordResult(s, '2026-10-21', true);
    expect(s).toEqual({ cur: 2, best: 2, last: '2026-10-21' });
  });

  it('ignores a guess for a day before the last one (an old cached page)', async () => {
    const { recordResult } = await import('../client/lib/streak');
    const s = recordResult(recordResult(undefined, '2026-10-21', true), '2026-10-22', true);
    expect(recordResult(s, '2026-10-21', false)).toBe(s);
  });
});

describe('last city (My Cities back link)', () => {
  const last = { id: '101796236', name: '上海', path: '/wmi/zh/w/101796236' };
  const host = 'weather.itsfunmag.com';

  it('reads only well-formed entries', () => {
    expect(parseLastCity(JSON.stringify(last))).toEqual(last);
    expect(parseLastCity(JSON.stringify({ ...last, path: 'https://evil.example/' }))).toBeNull();
    expect(parseLastCity('{bad')).toBeNull();
    expect(parseLastCity(null)).toBeNull();
  });

  it('goes back to the city page the visitor came from, in the current language', () => {
    expect(citiesBack(`https://${host}/wmi/en/w/101796236/climate?session=1`, host, last, 'zh')).toEqual({ path: '/wmi/zh/w/101796236/climate', label: '上海' });
  });

  it('only names the city when the link really goes there (another tab may have changed the last city)', () => {
    expect(citiesBack(`https://${host}/wmi/en/w/102643743`, host, last, 'zh')).toEqual({ path: '/wmi/zh/w/102643743', label: null });
  });

  it('otherwise goes to the last city; nothing known keeps the server link', () => {
    expect(citiesBack(`https://${host}/wmi/zh/settings`, host, last, 'en')).toEqual({ path: '/wmi/en/w/101796236', label: '上海' });
    expect(citiesBack('https://other.example/wmi/en/w/1', host, null, 'en')).toEqual({ path: null, label: null });
    expect(citiesBack('', host, null, 'en')).toEqual({ path: null, label: null });
    expect(parseLastCity(JSON.stringify({ ...last, path: '/\\evil.com/zh/w/1' }))).toBeNull();
  });

  it('cookie lasts a year and is Secure on https', () => {
    expect(lastCityCookie('101796236', true)).toBe('wcity=101796236; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(lastCityCookie('101796236', false)).not.toContain('Secure');
  });
});
