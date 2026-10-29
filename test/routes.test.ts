import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { pageCacheKey } from '../src/routing/urls';
import { MemoryStore } from '../src/cache/store';
import { MemoryFeatureStore } from '../src/features/store';
import { MockProvider } from '../src/weather/mock';
import { ProviderError, type WeatherProvider } from '../src/weather/provider';
import { WeatherService } from '../src/weather/service';
import { MockHistory, type PastWeatherSource } from '../src/weather/history';
import { MemoryHistoryQueue } from '../src/weather/historyQueue';

const NOW = Date.UTC(2026, 9, 22, 3, 0);

function app(provider: WeatherProvider = new MockProvider(() => NOW), history: PastWeatherSource | null = new MockHistory()) {
  return createApp({
    weather: () => new WeatherService(provider, new MemoryStore(() => NOW), () => NOW, () => undefined, undefined, undefined, undefined, history ?? undefined),
    features: () => new MemoryFeatureStore(),
  });
}

function req(path: string, init: { headers?: Record<string, string>; cf?: Record<string, unknown> } = {}) {
  const r = new Request(`https://weather.itsfunmag.com${path}`, { headers: init.headers });
  if (init.cf) Object.defineProperty(r, 'cf', { value: init.cf });
  return r;
}

describe('home and redirects', () => {
  it('sends visitors to the nearest city using Cloudflare location', async () => {
    const res = await app().request(req('/', { cf: { latitude: '41.01', longitude: '28.95' } }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/wmi/en/w/100745044');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('picks the language from Accept-Language and keeps the channel', async () => {
    const res = await app().request(
      req('/wxiaomi/', { headers: { 'Accept-Language': 'tr-TR,tr;q=0.9' }, cf: { latitude: '41.01', longitude: '28.95' } }),
    );
    expect(res.headers.get('Location')).toBe('/wxiaomi/tr/w/100745044');
  });

  it('keeps session, uid and locale and maps pt-BR to bp', async () => {
    const res = await app().request(req('/mi?locale=pt-BR&session=abc&uid=42&foo=bar', { cf: { latitude: '51.5', longitude: '-0.12' } }));
    const location = new URL(res.headers.get('Location')!, 'https://x');
    expect(location.pathname).toBe('/mi/bp/w/102643743');
    expect(location.searchParams.get('session')).toBe('abc');
    expect(location.searchParams.get('uid')).toBe('42');
    expect(location.searchParams.get('locale')).toBe('pt-BR');
    expect(location.searchParams.has('foo')).toBe(false);
  });

  it('honours old links that carry city coordinates', async () => {
    const res = await app().request(req('/?city=Shanghai&lat=31.23&lon=121.47&country_code=CN'));
    expect(res.headers.get('Location')).toBe('/wmi/en/w/101796236');
  });

  it('redirects the old city page with channel prefix', async () => {
    const res = await app().request(req('/wme/city/london-gb-51.507--0.128?city=London&lat=51.507&lon=-0.128&lang=ar'));
    expect(res.headers.get('Location')).toBe('/wme/ar/w/102643743');
  });

  it('falls back to a default city when the visitor location is unknown', async () => {
    const res = await app().request(req('/'));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/wmi/en/w/102643743');
  });

  it('without coordinates, uses the capital of the visitor country, then the browser language', async () => {
    // 只知道国家：俄罗斯 → 莫斯科；只有浏览器语言 vi-VN → 河内；只有 "ru" → 莫斯科
    expect((await app().request(req('/', { cf: { country: 'RU' } }))).headers.get('Location')).toBe('/wmi/en/w/100524901');
    expect((await app().request(req('/', { headers: { 'Accept-Language': 'vi-VN,vi;q=0.9' } }))).headers.get('Location')).toBe('/wmi/vi/w/101581130');
    expect((await app().request(req('/', { headers: { 'Accept-Language': 'ru' } }))).headers.get('Location')).toBe('/wmi/ru/w/100524901');
    // 未知国家代码、英文无地区：伦敦
    expect((await app().request(req('/', { cf: { country: 'T1' }, headers: { 'Accept-Language': 'en' } }))).headers.get('Location')).toBe('/wmi/en/w/102643743');
  });

  it('redirects the old cities page', async () => {
    const res = await app().request(req('/wsearch-mi/cities?locale=es-MX'));
    expect(res.headers.get('Location')).toBe('/wsearch-mi/lm/cities?locale=es-MX');
  });

  it('redirects geo links from our own products', async () => {
    const res = await app().request(req('/wmi/vi/w/geo/21.02,105.84'));
    expect(res.headers.get('Location')).toBe('/wmi/vi/w/101581130');
  });

  it('returns 404 for unknown channels and retired pages', async () => {
    for (const path of ['/foo', '/foo/en/w/1', '/wmi/xx/w/102643743', '/weather-preview', '/v1/weather', '/v1/news/list']) {
      const res = await app().request(req(path));
      expect(res.status, path).toBe(404);
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    }
  });
});

describe('city page', () => {
  it('renders the city with the time zone for the browser to use', async () => {
    const res = await app().request(req('/wmi/en/w/104686017'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex"/>');
    expect(html).toMatch(/<h1 class="city-name">.*?<span>Cheney<\/span><\/h1>/s);
    expect(html).toContain('"tz":"America/Chicago"');
    // 15 天预报：城市当地日期从 10 月 21 日开始（UTC 03:00 时美国中部还是 21 日）
    expect(html).toContain('data-date="2026-10-21"');
    expect(html).toMatch(/data-weekday="2026-10-21">Wed</);
    // 温度带原始摄氏度，供浏览器换算华氏度
    expect(html).toMatch(/data-c="-?\d+(\.\d+)?"/);
    // 三个广告位占位
    for (const slot of ['home_1', 'home_2', 'home_3']) expect(html).toContain(`data-slot="${slot}"`);
    expect(html).toMatch(/<script src="\/static\/app.js" defer/);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('X-Page-TTL')).toBe('300');
  });

  it('fills in the visitor channel in every link (one cached page serves all channels)', async () => {
    for (const ch of ['mi', 'wme', 'wsearch-mi']) {
      const html = await (await app().request(req(`/${ch}/en/w/102643743`))).text();
      expect(html, ch).not.toContain('__ch__');
      expect(html, ch).toContain(`href="/${ch}/en/w/102643743/hourly"`);
      expect(html, ch).toContain(`"channel":"${ch}"`);
    }
    expect(pageCacheKey(new URL('https://w.example/mi/en/w/1/hourly?session=x'))).toBe('https://w.example/_/en/w/1/hourly');
  });

  it('shows a dash instead of 0 when a value is missing', async () => {
    const html = await (await app().request(req('/wmi/en/w/100108410'))).text();
    expect(html).toMatch(/Visibility<\/span><\/h3><div class="big"><span>--<\/span>/);
  });

  it('uses the old site translations', async () => {
    const zh = await (await app().request(req('/wmi/zh/w/101796236'))).text();
    expect(zh).toContain('逐小时预报');
    expect(zh).toContain('lang="zh-Hans"');
    const tr = await (await app().request(req('/wmi/tr/w/100745044'))).text();
    expect(tr).toContain('lang="tr"');
  });

  it('renders the hourly, 15-day and air quality subpages', async () => {
    for (const [sub, text] of [['hourly', 'Next 24 hours'], ['15day', '15-Day Forecast'], ['air', 'Pollutants']] as const) {
      const res = await app().request(req(`/wmi/en/w/102643743/${sub}`));
      expect(res.status, sub).toBe(200);
      const html = await res.text();
      expect(html, sub).toContain(text);
      expect(html, sub).toContain('href="/wmi/en/w/102643743"');
    }
    expect((await app().request(req('/wmi/en/w/102643743/nope'))).status).toBe(404);
  });

  it('renders the saved cities page shell', async () => {
    const res = await app().request(req('/wxiaomi/vi/cities'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-saved-list');
    expect(html).toContain('"channel":"wxiaomi"');
  });

  it('sends old Hebrew links to the English page', async () => {
    for (const [from, to] of [
      ['/wmi/he/w/102643743?session=1', '/wmi/en/w/102643743?session=1'],
      ['/mi/iw/w/102643743/hourly', '/mi/en/w/102643743/hourly'],
      ['/wme/he/cities', '/wme/en/cities'],
      ['/wmi/he', '/wmi/'],
      ['/wmi/he/?x=1', '/wmi/?x=1'],
    ] as const) {
      const res = await app().request(req(from));
      expect(res.status, from).toBe(301);
      expect(res.headers.get('Location'), from).toBe(to);
    }
    const home = await app().request(req('/', { headers: { 'Accept-Language': 'he-IL,he;q=0.9' } }));
    expect(home.headers.get('Location')).toMatch(/^\/wmi\/en\/w\//);
  });

  it('shows the city name in the page language, but keeps English names for the ranking', async () => {
    const names = { lookup: async (ids: string[]) => new Map(ids.filter((i) => i === '102643743').map((i) => [i, { labels: { ja: 'ロンドン' }, iso: 'GB' }])) };
    const features = new MemoryFeatureStore();
    const a = createApp({
      weather: () => new WeatherService(new MockProvider(() => NOW), new MemoryStore(() => NOW), () => NOW, () => undefined, 0, undefined, names, new MockHistory()),
      features: () => features,
    });
    const html = await (await a.request(req('/wmi/ja/w/102643743'))).text();
    expect(html).toContain('<span>ロンドン</span>');
    expect(html).toContain('イギリス');
    const ranking = await features.ranking(NOW);
    expect([...ranking.warmest, ...ranking.coldest].map((r) => r.name)).toEqual(['London']);
    const page = await (await a.request(req('/wmi/ja/ranking'))).text();
    expect(page).toContain('ロンドン');
  });

  it('sets right-to-left for Arabic', async () => {
    const html = await (await app().request(req('/wmi/ar/w/100108410'))).text();
    expect(html).toContain('dir="rtl"');
  });

  it('returns 404 for an unknown city and 503 when the provider is down', async () => {
    expect((await app().request(req('/wmi/en/w/999999'))).status).toBe(404);

    const down: WeatherProvider = new Proxy(new MockProvider(() => NOW), {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? () => Promise.reject(new ProviderError('down', 503)) : v;
      },
    });
    const res = await app(down).request(req('/wmi/en/w/102643743'));
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('api', () => {
  it('limits how often one visitor can search', async () => {
    let n = 0;
    const env = { SEARCH_LIMITER: { limit: async () => ({ success: ++n <= 2 }) } };
    const a = app();
    const ask = () => a.request(req('/api/search?q=london&lang=en', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }), {}, env);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
  });

  it('searches cities', async () => {
    const res = await app().request(req('/api/search?q=ist&lang=tr'));
    const body = (await res.json()) as { items: Array<{ id: string; name: string }> };
    expect(body.items[0]).toMatchObject({ id: '100745044', name: 'Istanbul' });
    const short = (await (await app().request(req('/api/search?q=i'))).json()) as { items: unknown[] };
    expect(short.items).toEqual([]);
  });

  it('finds the nearest city for migrating old saved cities', async () => {
    const res = await app().request(req('/api/near?lat=55.75&lon=37.61'));
    expect(await res.json()).toMatchObject({ id: '100524901', name: 'Moscow' });
    expect((await app().request(req('/api/near?lat=999&lon=0'))).status).toBe(400);
  });

  it('returns saved city cards and skips unknown ids', async () => {
    const res = await app().request(req('/api/cities?ids=102643743,999999,101581130'));
    const body = (await res.json()) as { items: Array<{ id: string; temperature: number | null }> };
    expect(body.items.map((i) => i.id)).toEqual(['102643743', '101581130']);
    expect(typeof body.items[0]!.temperature).toBe('number');
  });

  it('returns the current weather as JSON for the browser refresh', async () => {
    const res = await app().request(req('/api/w/102643743/now'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; fetchedAt: number; current: { icon: string } };
    expect(body.id).toBe('102643743');
    expect(body.fetchedAt).toBe(NOW);
    expect(typeof body.current.icon).toBe('string');
  });
});

describe('guess and ranking api', () => {
  const post = (path: string, body: unknown) =>
    new Request(`https://weather.itsfunmag.com${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

  it('counts guesses for the city date and returns totals', async () => {
    const a = app();
    // Cheney 在 UTC 03:00 时当地还是 10 月 21 日
    let res = await a.request(post('/api/w/104686017/guess', { date: '2026-10-21', choice: 'warmer' }));
    expect(res.status).toBe(200);
    await a.request(post('/api/w/104686017/guess', { date: '2026-10-21', choice: 'colder' }));
    res = await a.request(req('/api/w/104686017/guess?date=2026-10-21'));
    expect(await res.json()).toEqual({ date: '2026-10-21', counts: { colder: 1, same: 0, warmer: 1 }, total: 2 });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    // 页面缓存跨过午夜时，前一天的日期也接受
    expect((await a.request(post('/api/w/104686017/guess', { date: '2026-10-20', choice: 'same' }))).status).toBe(200);
  });

  it('rejects bad choices, dates outside today and unknown cities', async () => {
    const a = app();
    expect((await a.request(post('/api/w/104686017/guess', { date: '2026-10-21', choice: 'hotter' }))).status).toBe(400);
    expect((await a.request(post('/api/w/104686017/guess', { date: '2026-10-25', choice: 'same' }))).status).toBe(400);
    expect((await a.request(post('/api/w/104686017/guess', { choice: 'same' }))).status).toBe(400);
    expect((await a.request(post('/api/w/999999/guess', { date: '2026-10-21', choice: 'same' }))).status).toBe(404);
    expect((await a.request(req('/api/w/104686017/guess?date=bad'))).status).toBe(400);
  });

  it('ranks cities that visitors have opened, without extra weather calls', async () => {
    const a = app();
    expect(await (await a.request(req('/api/ranking'))).json()).toMatchObject({ warmest: [], coldest: [] });
    for (const id of ['102643743', '100524901', '101581130']) await a.request(req(`/wmi/en/w/${id}`));
    const body = (await (await a.request(req('/api/ranking'))).json()) as {
      warmest: Array<{ cityId: string; deltaMax: number }>;
      coldest: Array<{ cityId: string; deltaMax: number }>;
    };
    const ids = [...body.warmest, ...body.coldest].map((r) => r.cityId).sort();
    expect(ids).toEqual(['100524901', '101581130', '102643743']);
    for (const r of body.warmest) expect(r.deltaMax).toBeGreaterThan(0);
  });
});

describe('step 3 pages', () => {
  it('renders tomorrow, the day after, the week, the climate page and all life pages', async () => {
    const a = app();
    const pages: Array<[string, string[]]> = [
      ['tomorrow', ['day_1', 'day_2']],
      ['day-after', ['day_1', 'day_2']],
      ['week', ['week_1', 'week_2']],
      ['climate', ['climate_1', 'climate_2']],
      ['life/running', ['life_1', 'life_2']],
      ['life/laundry', ['life_1']],
      ['life/carwash', ['life_1']],
      ['life/clothing', ['life_1']],
      ['life/sunscreen', ['life_1']],
    ];
    for (const [sub, slots] of pages) {
      const res = await a.request(req(`/wmi/en/w/102643743/${sub}`));
      expect(res.status, sub).toBe(200);
      const html = await res.text();
      for (const slot of slots) expect(html, `${sub} ${slot}`).toContain(`data-slot="${slot}"`);
      expect(html, sub).toContain('href="/wmi/en/w/102643743"');
    }
    expect((await a.request(req('/wmi/en/w/102643743/life/swimming'))).status).toBe(404);
  });

  it('links the home page to the new pages', async () => {
    const html = await (await app().request(req('/wmi/en/w/102643743'))).text();
    for (const sub of ['tomorrow', 'day-after', 'week', 'climate', 'life/running', 'life/sunscreen']) {
      expect(html, sub).toContain(`href="/wmi/en/w/102643743/${sub}"`);
    }
    expect(html).toContain('data-vote="102643743"');
  });

  it('puts the guess and its answer on the climate page', async () => {
    const html = await (await app().request(req('/wmi/en/w/104686017/climate'))).text();
    expect(html).toMatch(/data-guess="[^"]*" data-city="104686017" data-date="2026-10-21" data-answer="(colder|same|warmer)"/);
    for (const c of ['colder', 'same', 'warmer']) expect(html).toContain(`data-choice="${c}"`);
    expect(html).toContain('href="/wmi/en/ranking"');
  });

  it('says so when there is no data for the same day last year', async () => {
    // 没有配置 OpenWeather（没有密钥）：长期没有，不算"缺数据"，页面照常缓存 5 分钟
    const a = app(new MockProvider(() => NOW), null);
    const homeRes = await a.request(req('/wmi/en/w/102643743'));
    expect(homeRes.headers.get('X-Page-TTL')).toBe('300');
    const home = await homeRes.text();
    // 标签位置保留，显示"--"，不让首屏高度变化
    expect(home).toContain('style="--lv:var(--faint)"');
    expect(home).not.toContain('data-guess-tag="');
    const res = await a.request(req('/wmi/en/w/102643743/climate'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('class="lead"');
  });

  it('does not give the answer away on the home page before the visitor guesses', async () => {
    const home = await (await app().request(req('/wmi/en/w/102643743'))).text();
    const at = home.indexOf('data-guess-tag="');
    expect(at).toBeGreaterThan(0);
    const tag = home.slice(at, home.indexOf('</a>', at));
    // 结果只在 <template> 里，看得见的文字是"猜一猜"
    const visible = tag.replace(/<template>[\s\S]*?<\/template>/, '');
    // 看得见的部分没有温差数字，也没有结果文案
    expect(visible).not.toContain('data-dca');
    expect(visible).toContain('Warmer or colder than last year? Guess');
    expect(tag).toContain('<template>');
  });

  it('caches a page for only a minute when data was missing for a temporary reason', async () => {
    const flaky: WeatherProvider = new Proxy(new MockProvider(() => NOW), {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (prop === 'airQuality') return () => Promise.reject(new ProviderError('rate limited', 429));
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const res = await app(flaky).request(req('/wmi/en/w/102643743'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Page-TTL')).toBe('60');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0');
  });

  it('keeps every section in place with "--" when optional data is missing', async () => {
    const flaky: WeatherProvider = new Proxy(new MockProvider(() => NOW), {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (['hourly', 'daily', 'airQuality', 'climateDay', 'climateMonthly', 'nowcast'].includes(prop as string))
          return () => Promise.reject(new ProviderError('down', 503));
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const a = app(flaky);
    const home = await (await a.request(req('/wmi/en/w/102643743'))).text();
    expect(home).toContain('data-nowcast="unavailable"');
    expect(home).toContain('style="--lv:var(--faint)"');
    expect(home.match(/class="hour" /g)?.length).toBeGreaterThanOrEqual(24);
    expect(home.match(/class="day" /g)?.length).toBe(7);
    for (const k of ['running', 'laundry', 'carwash', 'clothing', 'sunscreen']) expect(home).toContain(`/life/${k}"`);
    expect(home).not.toMatch(/>0%</);

    const tomorrow = await (await a.request(req('/wmi/en/w/102643743/tomorrow'))).text();
    expect(tomorrow).toContain('class="hero day-hero"');
    expect(tomorrow).not.toContain('>Now<');

    const climate = await (await a.request(req('/wmi/en/w/102643743/climate'))).text();
    expect(climate).toContain('Please try again in a few minutes');
    // 过去 7 天只用历史数据，今年的预报缺了也照常显示
    expect(climate).toContain('class="series"');
    expect(climate).toContain('data-slot="climate_1"');

    const life = await (await a.request(req('/wmi/en/w/102643743/life/running'))).text();
    expect(life).toContain('class="tl-bars"');
    expect(life).not.toContain('class="good"');
  });

  it('does not claim "no rain" when rain is likely but the 15-minute data is not available', async () => {
    const base = new MockProvider(() => NOW);
    const noNowcast: WeatherProvider = new Proxy(base, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (prop === 'nowcast') return () => Promise.reject(new ProviderError('not in plan', 403));
        if (prop === 'hourly')
          return async (id: string, hours: number) => (await base.hourly(id, hours)).map((h) => ({ ...h, precipProb: 90 }));
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const home = await (await app(noNowcast).request(req('/wmi/en/w/102643743'))).text();
    expect(home).toContain('data-nowcast="unavailable"');
    expect(home.match(/class="hour" /g)?.length).toBeGreaterThanOrEqual(24);
    expect(home).not.toContain('class="ico-ph');
  });

  it('error pages offer a retry and keep channel, language and session', async () => {
    const down: WeatherProvider = new Proxy(new MockProvider(() => NOW), {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? () => Promise.reject(new ProviderError('down', 503)) : v;
      },
    });
    const html = await (await app(down).request(req('/wxiaomi/de/w/102643743?session=abc&foo=1'))).text();
    expect(html).toContain('data-retry');
    expect(html).toContain('href="/wxiaomi/?session=abc&amp;lang=de"');
    // 路径里的语言优先于 locale 提示
    const withLocale = await (await app(down).request(req('/wmi/de/w/102643743?locale=fr-FR'))).text();
    expect(withLocale).toContain('href="/wmi/?lang=de"');
    const notFound = await (await app().request(req('/wme/fr/w/999999'))).text();
    expect(notFound).not.toContain('data-retry');
    expect(notFound).toContain('href="/wme/?lang=fr"');
  });

  it('renders the ranking page with cities visitors opened', async () => {
    const a = app();
    for (const id of ['102643743', '100524901', '101581130', '100108410']) await a.request(req(`/wmi/en/w/${id}`));
    const res = await a.request(req('/wxiaomi/tr/ranking'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="rank"');
    expect(html).toContain('href="/wxiaomi/tr/w/');
    expect((await a.request(req('/foo/en/ranking'))).status).toBe(404);
  });
});

describe('page cache', () => {
  /** 简单的内存版 Cache API（只按网址存取） */
  function fakeCache() {
    const m = new Map<string, Response>();
    return {
      async match(r: Request) {
        const hit = m.get(r.url);
        return hit ? hit.clone() : undefined;
      },
      async put(r: Request, res: Response) {
        m.set(r.url, new Response(await res.arrayBuffer(), res));
      },
      async delete(r: Request) {
        return m.delete(r.url);
      },
      m,
    };
  }

  it('re-renders a stale page only once, and shares one cached page across channels', async () => {
    const cache = fakeCache();
    const g = globalThis as { caches?: unknown };
    const before = g.caches;
    g.caches = { default: cache };
    const pending: Promise<unknown>[] = [];
    try {
      let renders = 0;
      const service = new WeatherService(new MockProvider(() => NOW), new MemoryStore(() => NOW), () => NOW, () => undefined, undefined, undefined, undefined, new MockHistory());
      const original = service.cityBundle.bind(service);
      service.cityBundle = (id: string) => (renders++, original(id));
      const a = createApp({ weather: () => service, features: () => new MemoryFeatureStore() });
      const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} };
      const get = (path: string) => a.fetch(req(path), {}, ctx as unknown as ExecutionContext);

      const first = await get('/wmi/en/w/102643743');
      expect(first.headers.get('X-Page-Cache')).toBe('MISS');
      await Promise.all(pending.splice(0));
      const other = await get('/mi/en/w/102643743');
      expect(other.headers.get('X-Page-Cache')).toBe('HIT');
      expect(await other.text()).toContain('href="/mi/en/w/102643743/hourly"');
      expect(renders).toBe(1);

      // 把缓存里的页面改成很久以前生成的，再同时来 5 个请求：都拿到旧页面，后台只重做一次
      const [k, v] = [...cache.m.entries()].find(([url]) => url.includes('/_/en/w/102643743'))!;
      const old = new Response(await v.clone().text(), v);
      old.headers.set('X-Rendered-At', String(Date.now() - 3600_000));
      cache.m.set(k, old);
      const res = await Promise.all([1, 2, 3, 4, 5].map(() => get('/wme/en/w/102643743')));
      expect(res.every((r) => r.headers.get('X-Page-Cache') === 'STALE')).toBe(true);
      await Promise.all(pending.splice(0));
      expect(renders).toBe(2);
    } finally {
      g.caches = before;
    }
  });

  it('does not serve pages cached by a previous deployment', async () => {
    const g = globalThis as { caches?: unknown };
    const before = g.caches;
    g.caches = { default: fakeCache() };
    try {
      const a = app();
      const ctx = { waitUntil: async (p: Promise<unknown>) => p, passThroughOnException() {} } as unknown as ExecutionContext;
      const get = async (version: string) => {
        const pending: Promise<unknown>[] = [];
        const r = await a.fetch(req('/wmi/en/w/102643743'), { CF_VERSION_METADATA: { id: version } }, { ...ctx, waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext);
        await Promise.all(pending);
        return r.headers.get('X-Page-Cache');
      };
      expect(await get('v1')).toBe('MISS');
      expect(await get('v1')).toBe('HIT');
      expect(await get('v2')).toBe('MISS');
    } finally {
      g.caches = before;
    }
  });
});


describe('settings and chosen language', () => {
  it('renders the settings page with every language and the unit switches', async () => {
    const res = await app().request(req('/wmi/zh/settings'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.match(/data-lang-choice="/g)?.length).toBe(28);
    expect(html).toMatch(/data-lang-choice="zh"[^>]*aria-current="true"/);
    expect(html).toContain('data-units-group="temp"');
    expect(html).toContain('data-units-group="wind"');
    expect((await app().request(req('/foo/zh/settings'))).status).toBe(404);
  });

  it('uses the chosen language when coming from outside, over the lock-screen locale', async () => {
    const a = app();
    const home = await a.request(req('/wmi/?locale=en-US', { headers: { Cookie: 'wlang=de' }, cf: { latitude: '51.5', longitude: '-0.12' } }));
    expect(home.headers.get('Location')).toMatch(/^\/wmi\/de\/w\//);
    const direct = await a.request(req('/wmi/en/w/102643743?session=s', { headers: { Cookie: 'x=1; wlang=de' } }));
    expect(direct.status).toBe(302);
    expect(direct.headers.get('Location')).toBe('/wmi/de/w/102643743?session=s');
    // 站内点进来（同站 Referer）不换语言；设置页不换
    const inside = await a.request(req('/wmi/en/w/102643743', { headers: { Cookie: 'wlang=de', Referer: 'https://weather.itsfunmag.com/wmi/de/w/1' } }));
    expect(inside.status).toBe(200);
    expect((await a.request(req('/wmi/en/settings', { headers: { Cookie: 'wlang=de' } }))).status).toBe(200);
    // 没选过语言：照旧
    expect((await a.request(req('/wmi/en/w/102643743'))).status).toBe(200);
  });
});

describe('remembered city and current location (Darren 2026-10-29)', () => {
  const istanbul = { latitude: '41.01', longitude: '28.95' };

  it('opens the city the visitor looked at last', async () => {
    const res = await app().request(req('/wmi/?session=s1', { headers: { Cookie: 'wlang=zh; wcity=101796236' }, cf: istanbul }));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/wmi/zh/w/101796236?session=s1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('coordinates in the link still win (lock screen)', async () => {
    const res = await app().request(req('/?lat=51.5&lon=-0.12', { headers: { Cookie: 'wcity=101796236' }, cf: istanbul }));
    expect(res.headers.get('Location')).toBe('/wmi/en/w/102643743');
  });

  it('"Current Location" ignores the remembered city', async () => {
    const res = await app().request(req('/wmi/?lang=en&here=1', { headers: { Cookie: 'wcity=101796236' }, cf: istanbul }));
    expect(res.headers.get('Location')).toBe('/wmi/en/w/100745044');
  });

  it('falls back to location when the remembered city is unknown or malformed', async () => {
    for (const cookie of ['wcity=999999999', 'wcity=../x']) {
      const res = await app().request(req('/wmi/', { headers: { Cookie: cookie }, cf: istanbul }));
      expect(res.headers.get('Location')).toBe('/wmi/en/w/100745044');
    }
  });

  it('My Cities has a Current Location row and a back link the browser points at the previous city', async () => {
    const html = await (await app().request(req('/wmi/zh/cities'))).text();
    expect(html).toContain('href="/wmi/?lang=zh&amp;here=1"');
    expect(html).toContain('data-cities-back');
  });
});

describe('last year being prepared', () => {
  it('shows a "being prepared" note, no question, and only caches briefly', async () => {
    const slow: PastWeatherSource = { name: 'owm', slow: true, days: () => Promise.reject(new Error('pages must not call this')) };
    const queue = new MemoryHistoryQueue();
    const a = createApp({
      weather: () => new WeatherService(new MockProvider(() => NOW), new MemoryStore(() => NOW), () => NOW, () => undefined, 0, undefined, undefined, slow, undefined, queue),
      features: () => new MemoryFeatureStore(),
    });
    const res = await a.request(req('/wmi/zh/w/102643743/climate'));
    const html = await res.text();
    expect(html).toContain('正在准备这座城市去年的天气数据');
    expect(html).toContain('data-no-question');
    // 过去 7 天的图也说明在准备，不只是 "--"
    expect(html).toContain('class="ph-note"');
    expect(html).not.toContain('data-guess=');
    expect(res.headers.get('X-Page-TTL')).not.toBe(null);
    expect(Number(res.headers.get('X-Page-TTL'))).toBeLessThanOrEqual(60);
    expect(queue.jobs.size).toBeGreaterThanOrEqual(2);
    const home = await (await a.request(req('/wmi/zh/w/102643743'))).text();
    expect(home).toContain('data-no-question');
  });
});

describe('no spoilers for today or later questions (Darren 2026-10-29)', () => {
  it('the climate page compares the past 7 days only and shows them before guessing', async () => {
    const html = await (await app().request(req('/wmi/en/w/102643743/climate'))).text();
    expect(html).toContain('Past 7 days vs. last year');
    expect(html).not.toContain('data-spoil');
    expect(html).not.toContain('spoiler-pending');
    // 图上的日期都在今天（10-22）之前，最后一天是昨天
    const labels = [...html.matchAll(/fill="rgba\(255,255,255,.65\)">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toHaveLength(7);
    expect(labels.at(-1)).toBe('10/21');
    expect(html).toContain('data-streak-pre');
  });

  it('tomorrow and the day after no longer show last year’s temperature', async () => {
    for (const sub of ['tomorrow', 'day-after']) {
      const html = await (await app().request(req(`/wmi/en/w/102643743/${sub}`))).text();
      expect(html).not.toContain('Same day last year');
      expect(html).toContain('/wmi/en/w/102643743/climate');
    }
  });

  it('the ranking is about yesterday', async () => {
    const html = await (await app().request(req('/wmi/en/ranking'))).text();
    expect(html).toContain('Yesterday');
  });
});

describe('ranking records only the real yesterday', () => {
  it('skips a series that had to move back a day', async () => {
    const { anomalyRecord } = await import('../src/features');
    const loc = { id: '1', name: 'X', adminArea: null, country: 'GB', timezone: 'Europe/London', lat: 0, lon: 0 };
    const bundle = { location: loc, today: '2026-10-22' } as unknown as Parameters<typeof anomalyRecord>[0];
    const point = (date: string) => ({ date, maxTemp: 12, lastMaxTemp: 9, delta: 3, level: 'warmer' as const });
    expect(anomalyRecord(bundle, [point('2026-10-21')], NOW)?.date).toBe('2026-10-21');
    expect(anomalyRecord(bundle, [point('2026-10-20')], NOW)).toBeNull();
  });
});

describe('home tag without a question yet', () => {
  it('invites people to remember last year, and can scroll inside the pill', async () => {
    const html = await (await app(new MockProvider(() => NOW), null).request(req('/wmi/en/w/102643743'))).text();
    expect(html).toContain('Remember the weather on this day last year?');
    expect(html).toContain('data-marquee');
    expect(html).not.toContain('Today vs. last year –');
  });
});
