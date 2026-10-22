import { describe, expect, it } from 'vitest';
import { LANGUAGES, parseLanguage, resolveLanguage, textDirection } from '../src/i18n/languages';

describe('languages', () => {
  it('has the 27 languages of the old site', () => {
    expect(LANGUAGES).toHaveLength(27);
    const codes = LANGUAGES.map((l) => l.code).sort();
    expect(codes).toEqual(
      ['ar', 'bp', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'id', 'it', 'ja', 'ko', 'lm', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh'].sort(),
    );
  });

  it.each([
    ['pt-BR', 'bp'],
    ['pt_br', 'bp'],
    ['pt-PT', 'pt'],
    ['pt', 'pt'],
    ['es', 'es'],
    ['es-ES', 'es'],
    ['es-MX', 'lm'],
    ['es-419', 'lm'],
    ['bp', 'bp'],
    ['lm', 'lm'],
    ['id', 'id'],
    ['in', 'id'],
    ['in-ID', 'id'],
    ['zh-CN', 'zh'],
    ['zh-Hant-TW', 'zh'],
    ['nb-NO', 'no'],
    ['iw', 'he'],
    ['ar-SA', 'ar'],
    ['en-US', 'en'],
    ['tr', 'tr'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseLanguage(input)).toBe(expected);
  });

  it('returns null for unsupported languages', () => {
    expect(parseLanguage('xx')).toBeNull();
    expect(parseLanguage('')).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
  });

  it('uses locale, then lang, then Accept-Language, then English (old site order)', () => {
    expect(resolveLanguage({ locale: 'ar-SA', lang: 'tr', acceptLanguage: 'de' })).toBe('ar');
    expect(resolveLanguage({ locale: 'xx', lang: 'tr', acceptLanguage: 'de' })).toBe('tr');
    expect(resolveLanguage({ acceptLanguage: 'xx-YY, vi;q=0.8, en;q=0.5' })).toBe('vi');
    expect(resolveLanguage({})).toBe('en');
  });

  it('marks Arabic and Hebrew as right-to-left', () => {
    expect(textDirection('ar')).toBe('rtl');
    expect(textDirection('he')).toBe('rtl');
    expect(textDirection('en')).toBe('ltr');
  });
});
