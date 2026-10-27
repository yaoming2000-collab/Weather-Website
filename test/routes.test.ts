import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/cache/store';
import { MockProvider } from '../src/weather/mock';
import { ProviderError, type WeatherProvider } from '../src/weather/provider';
import { WeatherService } from '../src/weather/service';

const NOW = Date.UTC(2026, 9, 22, 3, 0);

function app(provider: WeatherProvider = new MockProvider(() => NOW)) {
  return createApp({ weather: () => new WeatherService(provider, new MemoryStore(() => NOW), () => NOW, () => undefined) });
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
    expect(html).toContain('Cheney');
    expect(html).toContain('data-tz="America/Chicago"');
    // 15 天预报：城市当地日期从 10 月 21 日开始（UTC 03:00 时美国中部还是 21 日）
    expect(html).toContain('data-date="2026-10-21"');
    expect(html).toMatch(/<span class="wd">Wed<\/span>/);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('shows a dash instead of 0 when a value is missing', async () => {
    const html = await (await app().request(req('/wmi/en/w/100108410'))).text();
    expect(html).toContain('Visibility<b>— km</b>');
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
  it('returns the current weather as JSON for the browser refresh', async () => {
    const res = await app().request(req('/api/w/102643743/now'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; fetchedAt: number; current: { icon: string } };
    expect(body.id).toBe('102643743');
    expect(body.fetchedAt).toBe(NOW);
    expect(typeof body.current.icon).toBe('string');
  });
});
