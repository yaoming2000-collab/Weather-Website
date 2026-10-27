import { Hono, type Context } from 'hono';
import { normalizeChannel, DEFAULT_CHANNEL, type Channel } from './config/channels';
import { PAGE_STALE_WHILE_REVALIDATE, PAGE_TTL } from './config/thresholds';
import type { Env } from './env';
import { fallbackCoords, parseCoords, parseLatLonPair, visitorCoords, type Coords } from './geo/visitor';
import { isLang, resolveLanguage, type Lang } from './i18n/languages';
import { CityPage, MessagePage } from './pages/cityPage';
import { citiesPath, cityPath, pageCacheKey, withNavParams } from './routing/urls';
import { createWeatherService } from './weather';
import { isNotFound, type WeatherService } from './weather/service';

type AppEnv = { Bindings: Env; Variables: { weather: WeatherService } };
type C = Context<AppEnv>;

const LOCATION_ID = /^[0-9A-Za-z_-]{1,32}$/;
/** 浏览器端缓存时长（秒）；CDN 端由 PAGE_TTL 控制 */
const BROWSER_MAX_AGE = 60;

export function createApp(options: { weather?: (env: Env) => WeatherService } = {}) {
  const app = new Hono<AppEnv>();
  const makeWeather = options.weather ?? createWeatherService;
  // 同一个 Worker 实例共用一个数据模块，这样同一城市的并发请求只会向供应商请求一次
  let shared: WeatherService | undefined;

  // 所有响应都不让搜索引擎收录（需求文档"架构与缓存"）
  app.use('*', async (c, next) => {
    shared ??= makeWeather(c.env ?? {});
    c.set('weather', shared);
    await next();
    c.res.headers.set('X-Robots-Tag', 'noindex');
  });

  // ---------- 接口 ----------

  /** 前端补刷新用：只返回当前天气 */
  app.get('/api/w/:id/now', async (c) => {
    const id = c.req.param('id');
    if (!LOCATION_ID.test(id)) return c.json({ error: 'bad id' }, 400);
    try {
      const current = await c.var.weather.current(id);
      c.header('Cache-Control', `public, max-age=${BROWSER_MAX_AGE}`);
      return c.json({ id, fetchedAt: current.fetchedAt, current: current.data });
    } catch (err) {
      return c.json({ error: isNotFound(err) ? 'not found' : 'unavailable' }, isNotFound(err) ? 404 : 503);
    }
  });

  // ---------- 新网址 ----------

  app.get('/:channel/:lang/w/geo/:latlon', async (c) => {
    const target = parseTarget(c);
    if (!target) return c.notFound();
    const coords = parseLatLonPair(c.req.param('latlon'));
    if (!coords) return c.notFound();
    return redirectToNearest(c, target.channel, target.lang, coords);
  });

  app.get('/:channel/:lang/w/:id', (c) => cityPage(c));

  app.get('/:channel/:lang/cities', (c) => {
    const target = parseTarget(c);
    if (!target) return c.notFound();
    return c.html(
      <MessagePage lang={target.lang} title="My cities" message="Saved cities will be rebuilt in step 2 of the redesign." />,
    );
  });

  // ---------- 旧网址兼容（需求文档"旧站兼容"） ----------

  // 旧城市页 /city/{cityID}?city=&lat=&lon=，以及带渠道前缀的 /{渠道}/city/{cityID}
  app.get('/city/:cityId', (c) => legacyHome(c, DEFAULT_CHANNEL));
  app.get('/:channel/city/:cityId', (c) => {
    const channel = normalizeChannel(c.req.param('channel'));
    return channel ? legacyHome(c, channel) : c.notFound();
  });

  // 旧"我的城市"页
  app.get('/cities', (c) => c.redirect(withNavParams(citiesPath(DEFAULT_CHANNEL, langOf(c)), query(c)), 302));
  app.get('/:channel/cities', (c) => {
    const channel = normalizeChannel(c.req.param('channel'));
    return channel ? c.redirect(withNavParams(citiesPath(channel, langOf(c)), query(c)), 302) : c.notFound();
  });

  // 首页：/ 和 /{渠道}/，可带旧参数 ?city=&lat=&lon=
  app.get('/', (c) => legacyHome(c, DEFAULT_CHANNEL));
  const channelHome = (c: C) => {
    const channel = normalizeChannel(c.req.param('channel'));
    return channel ? legacyHome(c, channel) : c.notFound();
  };
  app.get('/:channel', channelHome);
  app.get('/:channel/', channelHome);

  app.notFound((c) => {
    const lang = langOf(c);
    return c.html(<MessagePage lang={lang} title="Page not found" message="This page does not exist." />, 404);
  });

  app.onError((err, c) => {
    console.error('[app] unhandled error', err);
    return c.html(
      <MessagePage lang={langOf(c)} title="Something went wrong" message="Please try again in a moment." />,
      500,
    );
  });

  return app;
}

// ---------- 辅助函数 ----------

function query(c: C): URLSearchParams {
  return new URL(c.req.url).searchParams;
}

function langOf(c: C): Lang {
  const q = query(c);
  return resolveLanguage({ locale: q.get('locale'), lang: q.get('lang'), acceptLanguage: c.req.header('Accept-Language') });
}

function parseTarget(c: C): { channel: Channel; lang: Lang } | null {
  const channel = normalizeChannel(c.req.param('channel'));
  const lang = c.req.param('lang');
  if (!channel || !isLang(lang)) return null;
  return { channel, lang };
}

/** 首页和旧网址：决定城市坐标后跳转到新的城市网址 */
async function legacyHome(c: C, channel: Channel) {
  const q = query(c);
  // 旧链接直接指定了城市坐标
  const coords = parseCoords(q.get('lat'), q.get('lon')) ?? visitorCoords(c.req.raw) ?? fallbackCoords();
  return redirectToNearest(c, channel, langOf(c), coords);
}

async function redirectToNearest(c: C, channel: Channel, lang: Lang, coords: Coords) {
  try {
    const loc = await c.var.weather.nearestLocation(coords.lat, coords.lon);
    c.header('Cache-Control', 'no-store');
    return c.redirect(withNavParams(cityPath(channel, lang, loc.id), query(c)), 302);
  } catch (err) {
    console.error('[home] cannot resolve location', err);
    return c.html(
      <MessagePage lang={lang} title="Weather unavailable" message="We could not load the weather right now. Please try again shortly." />,
      503,
    );
  }
}

function waitUntil(c: C, promise: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // 测试环境没有 executionCtx
    void promise.catch(() => undefined);
  }
}

function defaultCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/** 城市主页：先查页面缓存；过期但仍在宽限期内时先返回旧页面、后台重新生成 */
async function cityPage(c: C) {
  const target = parseTarget(c);
  const id = c.req.param('id') ?? '';
  if (!target || !LOCATION_ID.test(id)) return c.notFound();

  const url = new URL(c.req.url);
  const key = new Request(pageCacheKey(url));
  const cache = defaultCache();

  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const age = Date.now() - Number(hit.headers.get('X-Rendered-At') ?? 0);
      if (age > PAGE_TTL * 1000) {
        waitUntil(
          c,
          renderCity(c, target.channel, target.lang, id).then((r) => (r.status === 200 ? store(cache, key, r) : undefined)),
        );
      }
      const res = new Response(hit.body, hit);
      res.headers.set('Cache-Control', `public, max-age=${BROWSER_MAX_AGE}`);
      res.headers.set('X-Page-Cache', age > PAGE_TTL * 1000 ? 'STALE' : 'HIT');
      return res;
    }
  }

  const res = await renderCity(c, target.channel, target.lang, id);
  if (cache && res.status === 200) waitUntil(c, store(cache, key, res.clone()));
  res.headers.set('X-Page-Cache', 'MISS');
  return res;
}

async function store(cache: Cache, key: Request, res: Response) {
  const copy = new Response(res.body, res);
  copy.headers.set('Cache-Control', `public, max-age=${PAGE_TTL + PAGE_STALE_WHILE_REVALIDATE}`);
  await cache.put(key, copy);
}

async function renderCity(c: C, channel: Channel, lang: Lang, id: string): Promise<Response> {
  try {
    const bundle = await c.var.weather.cityBundle(id);
    const html = await (
      <CityPage bundle={bundle} channel={channel} lang={lang} providerName={c.var.weather.providerName} />
    ).toString();
    return new Response(`<!doctype html>${html}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${BROWSER_MAX_AGE}`,
        'X-Rendered-At': String(Date.now()),
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    const notFound = isNotFound(err);
    if (!notFound) console.error('[city] render failed', err);
    const page = notFound ? (
      <MessagePage lang={lang} title="City not found" message="We could not find this city." />
    ) : (
      <MessagePage lang={lang} title="Weather unavailable" message="We could not load the weather right now. Please try again shortly." />
    );
    return new Response(`<!doctype html>${await page.toString()}`, {
      status: notFound ? 404 : 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
}
