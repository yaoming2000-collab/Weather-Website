import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../src/i18n/languages';
import { messages, missingKeys, t } from '../src/i18n/t';
import { ICON_KEYS } from '../src/weather/icons';

describe('translations', () => {
  it('loads a translation file for each of the 27 languages', () => {
    for (const { code } of LANGUAGES) {
      expect(Object.keys(messages(code)).length, code).toBeGreaterThan(100);
    }
  });

  it('reuses the old site translations', () => {
    expect(t('zh', 'TodayLabel')).toBe('今天');
    expect(t('ar', 'TodayLabel')).toBe('اليوم');
    expect(t('bp', 'TodayLabel')).not.toBe('Today');
  });

  it('falls back to English for strings not yet translated (filled in step 4)', () => {
    expect(t('tr', 'SeeAll15Days')).toBe('See 15 days');
    expect(missingKeys('en')).toEqual([]);
  });

  it('has an English weather description for every icon', () => {
    for (const key of ICON_KEYS) expect(t('en', `Cond_${key}`), key).not.toBe(`Cond_${key}`);
    expect(t('en', 'Cond_night')).toBe('Clear');
  });

  it('replaces variables', () => {
    expect(t('en', 'UpdatedMinutesAgo', { n: 7 })).toBe('Updated 7 min ago');
    expect(t('en', 'CityWeatherTitle', { city: 'Riyadh' })).toBe('Riyadh Weather');
  });
});
