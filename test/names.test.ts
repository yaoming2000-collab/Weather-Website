import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/cache/store';
import { MockProvider } from '../src/weather/mock';
import { WeatherService } from '../src/weather/service';
import { buildQuery, geonameIdOf, parseResults, type PlaceNamesSource, type WikiPlace } from '../src/weather/wikidata';
import { MOCK_LOCATIONS } from '../src/weather/mock';
import { isoOfCountry } from '../src/geo/countries';

const NOW = Date.UTC(2026, 9, 28, 3, 0);
const LONDON = MOCK_LOCATIONS.find((l) => l.id === '102643743')!;
const MOSCOW = MOCK_LOCATIONS.find((l) => l.id === '100524901')!;

function stubNames(table: Record<string, WikiPlace>, opts: { fail?: boolean } = {}) {
  const calls: string[][] = [];
  const src: PlaceNamesSource = {
    async lookup(ids) {
      calls.push(ids);
      if (opts.fail) throw new Error('down');
      return new Map(ids.filter((id) => table[id]).map((id) => [id, table[id]!]));
    },
  };
  return { src, calls };
}

describe('Wikidata names', () => {
  it('maps Foreca ids to GeoNames ids', () => {
    expect(geonameIdOf('102643743')).toBe('2643743');
    expect(geonameIdOf('abc')).toBeNull();
    expect(geonameIdOf('123')).toBeNull();
    expect(buildQuery(['2643743'])).toContain('VALUES ?gn { "2643743" }');
  });

  it('picks the entry with the most sitelinks when one GeoNames id has several', () => {
    const b = (item: string, links: number, lang: string, label: string) => ({
      gn: { value: '1816670' }, item: { value: item }, links: { value: String(links) }, lang: { value: lang }, label: { value: label }, iso: { value: 'CN' },
    });
    const r = parseResults([b('Q-shuntian', 20, 'ja', '順天府'), b('Q956', 305, 'ja', '北京市'), b('Q956', 305, 'vi', 'Bắc Kinh')]);
    expect(r.get('1816670')).toEqual({ labels: { ja: '北京市', vi: 'Bắc Kinh' }, iso: 'CN' });
  });

  it('does not guess the country when Wikidata lists more than one', () => {
    const b = (iso: string) => ({ gn: { value: '1' }, item: { value: 'Q1' }, links: { value: '5' }, lang: { value: 'ja' }, label: { value: 'X' }, iso: { value: iso } });
    expect(parseResults([b('AA'), b('BB')]).get('1')?.iso).toBeNull();
  });
});

describe('localized city names', () => {
  const make = (names?: PlaceNamesSource) =>
    new WeatherService(new MockProvider(() => NOW), new MemoryStore(() => NOW), () => NOW, () => undefined, 0, undefined, names);

  it('uses Wikidata for Japanese, translates the country, drops the English region, and caches', async () => {
    const { src, calls } = stubNames({ '102643743': { labels: { ja: 'ロンドン' }, iso: 'GB' } });
    const svc = make(src);
    const [ja] = await svc.localize([LONDON], 'ja');
    expect(ja).toMatchObject({ name: 'ロンドン', adminArea: null, country: 'イギリス' });
    await svc.localize([LONDON], 'ja');
    expect(calls).toHaveLength(1);
  });

  it('takes the country from Foreca, so Hong Kong stays Hong Kong, and keeps the region for search', async () => {
    const hk = { ...LONDON, id: '101819729', name: 'Hong Kong', adminArea: 'Central and Western', country: 'Hong Kong' };
    const svc = make(stubNames({ '101819729': { labels: { ja: '香港' }, iso: 'CN' } }).src);
    expect((await svc.localize([hk], 'ja'))[0]).toMatchObject({ name: '香港', country: '香港', adminArea: null });
    expect((await svc.localize([hk], 'ja', { keepAdmin: true }))[0]).toMatchObject({ adminArea: 'Central and Western' });
  });

  it('asks Wikidata once when the same new city is opened twice at the same time', async () => {
    const { src, calls } = stubNames({ '102643743': { labels: { ja: 'ロンドン' }, iso: 'GB' } });
    const svc = make(src);
    await Promise.all([svc.localize([LONDON], 'ja'), svc.localize([LONDON], 'ja')]);
    expect(calls).toHaveLength(1);
  });

  it('reports when names were not ready in time', async () => {
    const slow: PlaceNamesSource = { lookup: () => new Promise((r) => setTimeout(() => r(new Map()), 200)) };
    const r = await make(slow).localizeWithin([LONDON], 'ja', 20);
    expect(r).toEqual({ locs: [LONDON], complete: false });
  });

  it('keeps English when Wikidata has no name or is down', async () => {
    const none = make(stubNames({}).src);
    expect((await none.localize([MOSCOW], 'el'))[0]).toEqual(MOSCOW);
    const down = stubNames({}, { fail: true });
    const svc = make(down.src);
    expect((await svc.localize([MOSCOW], 'uk'))[0]).toEqual(MOSCOW);
    await svc.localize([MOSCOW], 'uk');
    expect(down.calls).toHaveLength(1);
  });

  it('asks Foreca for the languages it supports (bp → pt) and leaves English alone', async () => {
    const asked: string[] = [];
    const provider = new MockProvider(() => NOW);
    provider.locationById = async (id: string, lang?: string) => {
      asked.push(`${id}|${lang}`);
      return { ...LONDON, name: lang === 'zh' ? '伦敦' : 'Londres', country: lang === 'zh' ? '英国' : 'Reino Unido' };
    };
    const svc = new WeatherService(provider, new MemoryStore(() => NOW), () => NOW, () => undefined, 0);
    expect((await svc.localize([LONDON], 'zh'))[0]).toMatchObject({ name: '伦敦', country: '英国' });
    expect((await svc.localize([LONDON], 'bp'))[0]).toMatchObject({ name: 'Londres' });
    expect((await svc.localize([LONDON], 'en'))[0]).toEqual(LONDON);
    await svc.localize([LONDON], 'zh');
    expect(asked).toEqual(['102643743|zh', '102643743|pt']);
  });
});

describe('country names from Foreca', () => {
  it.each([
    ['United Kingdom', 'GB'], ['United States', 'US'], ['Vietnam', 'VN'], ['Viet Nam', 'VN'], ['Saudi Arabia', 'SA'], ['Turkey', 'TR'],
    ['Türkiye', 'TR'], ['Russia', 'RU'], ['Russian Federation', 'RU'], ['South Korea', 'KR'], ['Korea, Republic of', 'KR'], ['Hong Kong', 'HK'],
    ['Taiwan', 'TW'], ['China', 'CN'], ['Japan', 'JP'], ['Indonesia', 'ID'], ['Belarus', 'BY'], ['Argentina', 'AR'], ['Mexico', 'MX'],
    ['Czech Republic', 'CZ'], ['Czechia', 'CZ'], ['Iran', 'IR'], ['Myanmar', 'MM'], ['Côte d’Ivoire', 'CI'], ['Bosnia and Herzegovina', 'BA'], ['Saint Kitts and Nevis', 'KN'], ['Trinidad and Tobago', 'TT'],
  ])('%s → %s', (name, iso) => {
    expect(isoOfCountry(name)).toBe(iso);
  });
});
