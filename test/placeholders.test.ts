import { describe, expect, it } from 'vitest';
import { isPlaceholder, padLife, placeholderDays, placeholderHours } from '../src/pages/placeholders';

describe('placeholders for missing data', () => {
  it('builds hours from the current hour in city time', () => {
    const hours = placeholderHours(Date.UTC(2026, 9, 28, 6, 40), 'Asia/Shanghai', 3);
    expect(hours.map((h) => h.time.slice(0, 16))).toEqual(['2026-10-28T14:00', '2026-10-28T15:00', '2026-10-28T16:00']);
    expect(hours.every(isPlaceholder)).toBe(true);
    expect(hours[0]!.temperature).toBeNull();
  });

  it('builds days across a month end', () => {
    expect(placeholderDays('2026-10-30', 3).map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('always lists the five daily activities, keeping real ones', () => {
    const life = padLife([{ key: 'laundry', rating: 'good', summaryKey: 'Life_laundry_good', reasonKey: 'r', vars: {} }]);
    expect(life.map((x) => x.key)).toEqual(['running', 'laundry', 'carwash', 'clothing', 'sunscreen']);
    expect(life[1]!.rating).toBe('good');
    expect(life[0]).toMatchObject({ rating: null, summaryKey: '' });
  });
});

describe('placeholder hours in odd time zones', () => {
  it('starts on the local hour in half-hour time zones', async () => {
    const { placeholderHours } = await import('../src/pages/placeholders');
    const hours = placeholderHours(Date.UTC(2026, 9, 28, 6, 40), 'Asia/Kolkata', 2);
    expect(hours.map((h) => h.time.slice(11, 16))).toEqual(['12:00', '13:00']);
  });

  it('covers a whole local day', async () => {
    const { placeholderDayHours } = await import('../src/pages/placeholders');
    const hours = placeholderDayHours('2026-10-30', 'America/New_York');
    expect(hours).toHaveLength(24);
    expect(hours[0]!.time.slice(0, 16)).toBe('2026-10-30T00:00');
  });
});
