import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../src/i18n/languages';
import { messages, missingKeys, t } from '../src/i18n/t';
import { ICON_KEYS } from '../src/weather/icons';
import { LIFE } from '../src/config/features';
import { guessButtonKey, wordingKey, type ClimateLevel, type ClimateTone, type GuessChoice } from '../src/features/climate';
import { LIFE_INDEX_KEYS } from '../src/features/life';

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

  it('has English text for every key the step-3 features can produce', () => {
    const keys: string[] = [];
    const levels: ClimateLevel[] = ['much-warmer', 'warmer', 'normal', 'cooler', 'much-cooler'];
    const tones: ClimateTone[] = ['hot', 'mild', 'cold'];
    const choices: GuessChoice[] = ['colder', 'same', 'warmer'];
    for (const l of levels) for (const tn of tones) keys.push(`ClimateLabel_${wordingKey(l, tn)}`, `ClimateVerdict_${wordingKey(l, tn)}`);
    for (const ch of choices) for (const tn of tones) keys.push(`GuessButton_${guessButtonKey(ch, tn)}`);
    for (const kind of ['rain', 'sleet', 'snow']) {
      for (const st of ['starting', 'startingFor', 'stopping', 'continuing', 'startingSoon', 'startingLater', 'stoppingSoon', 'stoppingLater']) {
        keys.push(`Nowcast_${st}_${kind}`);
      }
    }
    for (const k of LIFE_INDEX_KEYS) keys.push(`LifeTitle_${k}`);
    for (const k of ['running', 'laundry', 'carwash', 'sunscreen']) for (const r of ['good', 'fair', 'poor']) keys.push(`Life_${k}_${r}`);
    for (const { band } of LIFE.clothing) keys.push(`Life_clothing_${band}`, `ClothingTip_${band}`);
    for (const key of keys) expect(t('en', key), key).not.toBe(key);
  });
});

