import { Hono, type Context } from 'hono';
import { normalizeChannel, DEFAULT_CHANNEL, type Channel } from './config/channels';
import { PAGE_STALE_WHILE_REVALIDATE, PAGE_TTL, PARTIAL_PAGE_TTL } from './config/thresholds';
import type { Env } from './env';
import { fallbackCoords, parseCoords, parseLatLonPair, visitorCoords, type Coords } from './geo/visitor';
import { isLang, resolveLanguage, type Lang } from './i18n/languages';
import { HomePage, type PageProps } from './pages/home';
import { AirPage, CitiesPage, DailyPage, HourlyPage, MessagePage } from './pages/subpages';
import { ClimatePage, RankingPage } from './pages/climate';
import { DayPage, WeekPage } from './pages/day';
import { LifePage } from './pages/life';
import { isLifeIndexKey, type LifeIndexKey } from './features/life';
import { citiesPath, cityPath, pageCacheKey, withNavParams } from './routing/urls';
import { RANKING } from './config/features';
import { GUESS_CHOICES, type GuessChoice } from './features/climate';
import { anomalyRecord, cityFeatures } from './features';
import { createFeatureStore, totalVotes, type FeatureStore, type GuessCounts, type Ranking } from './features/store';
import { localDate } from './time/cityTime';
import { createWeatherService } from './weather';
import { isNotFound, type WeatherService } from './weather/service';

type AppEnv = { Bindings: Env; Variables: { weather: WeatherService; features: FeatureStore } };
type C = Context<AppEnv>;

const LOCATION_ID = /^[0-9A-Za-z_-]{1,32}$/;
/** 浏览器端缓存时长（秒）；CDN 端由 PAGE_TTL 控制 */
const BROWSER_MAX_AGE = 60;

/** 城市子页 */
const SUBPAGES = {
  hourly: HourlyPage,
  '15day': DailyPage,
  air: AirPage,
  tomorrow: (p: PageProps) => DayPage({ ...p, offset: 1 }),
  'day-after': (p: PageProps) => DayPage({ ...p, offset: 2 }),
  week: WeekPage,
  climate: ClimatePage,
} as const;
type SubPage = keyof typeof SUBPAGES | `life/${LifeIndexKey}`;

export function createApp(
  options: { weather?: (env: Env) => WeatherService; features?: (env: Env) => FeatureStore } = {},
) {
  const app = new Hono<AppEnv>();
  const makeWeather = options.weather ?? createWeatherService;
  const makeFeatures = options.features ?? ((env: Env) => createFeatureStore(env.DB));
  let sharedFeatures: FeatureStore | undefined;
  // 同一个 Worker 实例共用一个数据模块，这样同一城市的并发请求只会向供应商请求一次
  let shared: WeatherService | undefined;

  // 所有响应都不让搜索引擎收录（需求文档"架构与缓存"）
  app.use('*', async (c, next) => {
    shared ??= makeWeather(c.env ?? {});
    c.set('weather', shared);
    sharedFeatures ??= makeFeatures(c.env ?? {});
    c.set('features', sharedFeatures);
    await next();
    c.res.headers.set('X-Robots-Tag', 'noindex');
  });

  // ---------- 接口（给浏览器脚本用） ----------

  /** 前端补刷新：只返回当前天气 */
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

  /** 城市搜索 */
  app.get('/api/search', async (c) => {
    const q = c.req.query('q') ?? '';
    const lang = isLang(c.req.query('lang')) ? (c.req.query('lang') as Lang) : 'en';
    try {
      const items = await c.var.weather.search(q, lang);
      c.header('Cache-Control', 'public, max-age=3600');
      return c.json({ items: items.map((l) => ({ id: l.id, name: l.name, admin: l.adminArea, country: l.country })) });
    } catch {
      return c.json({ error: 'unavailable' }, 503);
    }
  });

  /** 按坐标找最近的城市（迁移旧版"我的城市"时用） */
  app.get('/api/near', async (c) => {
    const coords = parseCoords(c.req.query('lat'), c.req.query('lon'));
    if (!coords) return c.json({ error: 'bad coordinates' }, 400);
    try {
      const l = await c.var.weather.nearestLocation(coords.lat, coords.lon);
      c.header('Cache-Control', 'public, max-age=86400');
      return c.json({ id: l.id, name: l.name, admin: l.adminArea, country: l.country });
    } catch {
      return c.json({ error: 'unavailable' }, 503);
    }
  });

  /** "我的城市"卡片，最多 10 个 */
  app.get('/api/cities', async (c) => {
    const ids = (c.req.query('ids') ?? '').split(',').map((s) => s.trim()).filter((s) => LOCATION_ID.test(s));
    const cards = await c.var.weather.cityCards(ids);
    c.header('Cache-Control', `public, max-age=${BROWSER_MAX_AGE}`);
    return c.json({ items: cards });
  });

  /**
   * 猜一猜（需求文档"今天比往年热还是冷"）。
   * GET 读取当天计数（已经猜过的用户再次进入时用）；POST 投一票并返回最新计数。
   * 每个浏览器每个城市每天只投一次，由浏览器 localStorage 控制。
   * 正确答案在页面里，"X% 的人猜对了"由浏览器用计数算出。
   */
  app.get('/api/w/:id/guess', async (c) => {
    const checked = await checkGuessTarget(c, c.req.query('date'));
    if (checked instanceof Response) return checked;
    const counts = await c.var.features.guessCounts(checked.id, checked.date);
    c.header('Cache-Control', 'no-store');
    return c.json(guessBody(checked.date, counts));
  });

  app.post('/api/w/:id/guess', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { date?: unknown; choice?: unknown } | null;
    const choice = body?.choice;
    if (typeof choice !== 'string' || !(GUESS_CHOICES as readonly string[]).includes(choice)) {
      return c.json({ error: 'bad choice' }, 400);
    }
    const checked = await checkGuessTarget(c, typeof body?.date === 'string' ? body.date : undefined);
    if (checked instanceof Response) return checked;
    const counts = await c.var.features.addGuess(checked.id, checked.date, choice as GuessChoice);
    c.header('Cache-Control', 'no-store');
    return c.json(guessBody(checked.date, counts));
  });

  /** 今天全球最反常的城市（只用已访问城市的数据，每小时更新） */
  app.get('/api/ranking', async (c) => {
    const ranking = await loadRanking(c);
    c.header('Cache-Control', 'public, max-age=600');
    return c.json(ranking);
  });

  // ---------- 页面 ----------

  app.get('/:channel/:lang/w/geo/:latlon', async (c) => {
    const target = parseTarget(c);
    if (!target) return c.notFound();
    const coords = parseLatLonPair(c.req.param('latlon'));
    if (!coords) return c.notFound();
    return redirectToNearest(c, target.channel, target.lang, coords);
  });

  app.get('/:channel/:lang/w/:id', (c) => cityPage(c));
  app.get('/:channel/:lang/w/:id/:sub', (c) => {
    const sub = c.req.param('sub');
    return sub in SUBPAGES ? cityPage(c, sub as SubPage) : c.notFound();
  });
  app.get('/:channel/:lang/w/:id/life/:key', (c) => {
    const key = c.req.param('key');
    return isLifeIndexKey(key) ? cityPage(c, `life/${key}`) : c.notFound();
  });

  /** 今天全球最反常的城市 */
  app.get('/:channel/:lang/ranking', async (c) => {
    const target = parseTarget(c);
    if (!target) return c.notFound();
    const ranking = await loadRanking(c);
    const html = await (<RankingPage ranking={ranking} channel={target.channel} lang={target.lang} providerName={c.var.weather.providerName} />).toString();
    c.header('Cache-Control', `public, max-age=${BROWSER_MAX_AGE}`);
    return c.html(`<!doctype html>${html}`);
  });

  app.get('/:channel/:lang/cities', async (c) => {
    const target = parseTarget(c);
    if (!target) return c.notFound();
    const html = await (<CitiesPage channel={target.channel} lang={target.lang} providerName={c.var.weather.providerName} />).toString();
    c.header('Cache-Control', 'public, max-age=300');
    return c.html(`<!doctype html>${html}`);
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

  app.notFound((c) => message(c, 404, 'NotFoundTitle', 'NotFoundText'));

  app.onError((err, c) => {
    console.error('[app] unhandled error', err);
    return message(c, 500, 'ErrorTitle', 'ErrorText');
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

async function message(c: C, status: 404 | 500 | 503, titleKey: string, textKey: string) {
  const lang = isLang(c.req.param('lang')) ? (c.req.param('lang') as Lang) : langOf(c);
  const html = await (<MessagePage lang={lang} titleKey={titleKey} textKey={textKey} />).toString();
  return new Response(`<!doctype html>${html}`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
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
    return message(c, 503, 'UnavailableTitle', 'UnavailableText');
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

/** 城市页面：先查页面缓存；过期但仍在宽限期内时先返回旧页面、后台重新生成 */
async function cityPage(c: C, sub?: SubPage) {
  const target = parseTarget(c);
  const id = c.req.param('id') ?? '';
  if (!target || !LOCATION_ID.test(id)) return c.notFound();

  const url = new URL(c.req.url);
  const key = new Request(pageCacheKey(url));
  const cache = defaultCache();
  const render = () => renderCity(c, target.channel, target.lang, id, sub);

  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const age = Date.now() - Number(hit.headers.get('X-Rendered-At') ?? 0);
      const ttl = Number(hit.headers.get('X-Page-TTL') ?? PAGE_TTL);
      if (age > ttl * 1000) {
        waitUntil(c, render().then((r) => (r.status === 200 ? store(cache, key, r) : undefined)));
      }
      const res = new Response(hit.body, hit);
      res.headers.set('Cache-Control', `public, max-age=${BROWSER_MAX_AGE}`);
      res.headers.set('X-Page-Cache', age > ttl * 1000 ? 'STALE' : 'HIT');
      return res;
    }
  }

  const res = await render();
  if (cache && res.status === 200) waitUntil(c, store(cache, key, res.clone()));
  res.headers.set('X-Page-Cache', 'MISS');
  return res;
}

async function store(cache: Cache, key: Request, res: Response) {
  const copy = new Response(res.body, res);
  const ttl = Number(res.headers.get('X-Page-TTL') ?? PAGE_TTL);
  copy.headers.set('Cache-Control', `public, max-age=${ttl + PAGE_STALE_WHILE_REVALIDATE}`);
  await cache.put(key, copy);
}

async function renderCity(c: C, channel: Channel, lang: Lang, id: string, sub?: SubPage): Promise<Response> {
  try {
    const bundle = await c.var.weather.cityBundle(id);
    const now = c.var.weather.nowMs();
    const features = cityFeatures(bundle, now);
    // 排行榜：顺便记录这个城市今天的偏差（不额外调用天气接口）
    const record = anomalyRecord(bundle, features.comparison, now);
    if (record) waitUntil(c, c.var.features.recordAnomaly(record).catch((e) => console.warn('[ranking] record failed', e)));
    const props: PageProps = { bundle, features, channel, lang, providerName: c.var.weather.providerName, nowMs: now };
    let html: string;
    if (sub?.startsWith('life/')) {
      html = await (<LifePage {...props} indexKey={sub.slice(5) as LifeIndexKey} />).toString();
    } else {
      const Page = sub ? SUBPAGES[sub as keyof typeof SUBPAGES] : HomePage;
      html = await (<Page {...props} />).toString();
    }
    // 有非关键数据没取到（例如 Foreca 限流）时，页面只缓存 1 分钟，尽快补全；否则缺的部分会挂 5 分钟
    const partial = !bundle.hourly || !bundle.daily || !bundle.air || !bundle.climate || !bundle.climateMonthly;
    return new Response(`<!doctype html>${html}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${partial ? 0 : BROWSER_MAX_AGE}`,
        'X-Page-TTL': String(partial ? PARTIAL_PAGE_TTL : PAGE_TTL),
        'X-Rendered-At': String(Date.now()),
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    if (isNotFound(err)) return message(c, 404, 'CityNotFoundTitle', 'CityNotFoundText');
    console.error('[city] render failed', err);
    return message(c, 503, 'UnavailableTitle', 'UnavailableText');
  }
}

// ---------- 第 3 步接口的辅助函数 ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 校验猜一猜的城市和日期。日期必须是城市当地的今天或昨天
 * （页面缓存 5 分钟，跨过午夜时页面上还是昨天的日期），防止写入任意日期。
 */
async function checkGuessTarget(c: C, date: string | undefined): Promise<{ id: string; date: string } | Response> {
  const id = c.req.param('id') ?? '';
  if (!LOCATION_ID.test(id) || !date || !DATE.test(date)) return c.json({ error: 'bad request' }, 400);
  try {
    const loc = await c.var.weather.location(id);
    const now = c.var.weather.nowMs();
    const allowed = [localDate(now, loc.timezone), localDate(now - 86400_000, loc.timezone)];
    if (!allowed.includes(date)) return c.json({ error: 'bad date' }, 400);
    return { id, date };
  } catch (err) {
    return c.json({ error: isNotFound(err) ? 'not found' : 'unavailable' }, isNotFound(err) ? 404 : 503);
  }
}

function guessBody(date: string, counts: GuessCounts) {
  return { date, counts, total: totalVotes(counts) };
}

async function loadRanking(c: C): Promise<Ranking> {
  const features = c.var.features;
  const now = c.var.weather.nowMs();
  // 没有数据库时（预览、测试）不缓存，否则同一实例里刚记录的城市要等一小时才出现
  if (!features.persistent) return features.ranking(now);
  const res = await c.var.weather.cached('v1:ranking', RANKING.cacheSeconds, () => features.ranking(now));
  return res.data;
}
