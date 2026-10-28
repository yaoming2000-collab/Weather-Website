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

  it('has every string translated in all 28 languages, with the same placeholders', () => {
    for (const l of LANGUAGES.map((x) => x.code)) {
      expect(missingKeys(l), l).toEqual([]);
      for (const [k, v] of Object.entries(messages('en'))) {
        const ph = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
        expect(ph(t(l, k)), `${l} ${k}`).toBe(ph(v));
      }
    }
    expect(t('tr', 'SeeAll15Days')).not.toBe('See 15 days');
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

