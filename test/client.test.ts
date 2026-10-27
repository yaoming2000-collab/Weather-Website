import { describe, expect, it } from 'vitest';
import { addCity, MAX_CITIES, mergeCities, parseLegacy, parseSaved, readCookie, removeCity } from '../client/lib/saved';
import { cityToday, minutesAgo, pastHourCount } from '../client/lib/time';
import { defaultSystem, formatPrecip, formatSpeed, formatTemp, formatTempDelta } from '../client/lib/units';

describe('units', () => {
  it('defaults to Fahrenheit for US visitors only', () => {
    expect(defaultSystem(['en-US', 'en'])).toBe('imperial');
    expect(defaultSystem(['en-GB'])).toBe('metric');
    expect(defaultSystem(['es-419', 'es'])).toBe('metric');
    expect(defaultSystem(['ar'])).toBe('metric');
  });

  it('converts temperature, deltas, wind and precipitation', () => {
    expect(formatTemp(20, 'imperial')).toBe('68');
    expect(formatTemp(-0.4, 'metric')).toBe('0');
    expect(formatTempDelta(6, 'imperial')).toBe('+11');
    expect(formatTempDelta(-3, 'metric')).toBe('-3');
    expect(formatSpeed(10, 'metric')).toEqual({ value: '36', unit: 'km/h' });
    expect(formatSpeed(10, 'imperial')).toEqual({ value: '22', unit: 'mph' });
    expect(formatPrecip(25.4, 'imperial')).toEqual({ value: '1.00', unit: 'in' });
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
