import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import type { Channel } from '../config/channels';
import { intlLocale, textDirection, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { citiesPath, cityPath } from '../routing/urls';
import { iconImage, iconSrcset } from '../weather/icons';
import { EARLY_TIME_SCRIPT, EARLY_UNITS_SCRIPT } from '../config/units';
import type { WeatherLocation } from '../weather/types';
import { G } from './glyphs';
import { discPosition, skyVars, type Sky } from './sky';
import { CSS } from './styles';

/** 缺数据时显示的符号（Darren 2026-10-28：统一用 "--"，不用 0，0 是真实读数） */
export const DASH = '--';

export const round = (n: number | null | undefined): string => (n === null || n === undefined ? DASH : String(Math.round(n)));

/**
 * 温度。服务器按摄氏度输出，并把原始值放在 data-c 里；
 * 浏览器发现用户使用华氏度时就地换算（页面被所有访客共用，单位不能写死在 HTML 里）。
 */
export function Temp(props: { c: number | null | undefined; deg?: boolean }) {
  if (props.c === null || props.c === undefined) return <span>{DASH}</span>;
  // bdi：阿拉伯语、希伯来语页面里保持"29°"的顺序，不被排成"°29"
  return (
    <bdi dir="ltr">
      <span data-c={String(props.c)}>{Math.round(props.c)}</span>
      {props.deg === false ? '' : '°'}
    </bdi>
  );
}

/** 风速：数据是 m/s，默认显示 km/h；浏览器按用户设置换成 m/s 或 mph */
export function Speed(props: { ms: number | null | undefined }) {
  if (props.ms === null || props.ms === undefined) return <span>{DASH}</span>;
  return (
    <bdi dir="ltr">
      <span data-ms={String(props.ms)}>{Math.round(props.ms * 3.6)}</span> <span data-speed-unit>km/h</span>
    </bdi>
  );
}

/** 距离（能见度）：数据是米，默认显示公里；°F 用户显示英里 */
export function Distance(props: { m: number | null | undefined }) {
  if (props.m === null || props.m === undefined) return <span>{DASH}</span>;
  const km = props.m / 1000;
  return (
    <bdi dir="ltr">
      <span data-m={String(props.m)}>{km < 10 ? Math.round(km * 10) / 10 : Math.round(km)}</span> <small data-dist-unit>km</small>
    </bdi>
  );
}

/** 降水量：mm；°F 用户显示英寸 */
export function Precip(props: { mm: number | null | undefined }) {
  if (props.mm === null || props.mm === undefined) return <span>{DASH}</span>;
  return (
    <bdi dir="ltr">
      <span data-mm={String(props.mm)}>{props.mm.toFixed(1)}</span> <span data-mm-unit>mm</span>
    </bdi>
  );
}

export function Icon(props: { icon: string; size?: number; cls?: string; eager?: boolean; alt?: string }) {
  // 占位：没有数据时画一个同样大小的空图标位，布局不变
  if (!props.icon) {
    const s = props.size ?? 32;
    return <span class={`ico-ph${props.cls ? ` ${props.cls}` : ''}`} style={`width:${s}px;height:${s}px`} aria-hidden="true" />;
  }
  return (
    <img
      class={props.cls}
      src={`/img/weather/${iconImage(props.icon)}`}
      srcset={iconSrcset(props.icon)}
      sizes={`${props.size ?? 32}px`}
      alt={props.alt ?? ''}
      width={props.size ?? 32}
      height={props.size ?? 32}
      // 图标只有三十来张、反复使用，不做懒加载：首屏的明天/逐小时图标懒加载会晚一拍才出现
      loading="eager"
      fetchpriority={props.eager ? 'high' : undefined}
      decoding="async"
      data-icon={props.icon}
    />
  );
}

/**
 * 广告位占位。固定高度，避免广告加载前后页面跳动（需求文档"广告"）。
 * 广告代码由 Darren 接入（AnyMind → AdSense → Taboola）；预览环境显示虚线框，方便确认位置。
 */
export function AdSlot(props: { slot: string; height?: number; lang: Lang; preview?: boolean }) {
  const h = props.height ?? 280;
  return (
    <div
      class={`ad${props.preview === false ? '' : ' preview'}`}
      data-slot={props.slot}
      data-label={t(props.lang, 'Advertisement')}
      style={`min-height:${h}px`}
    />
  );
}

/** 简单的确定性随机数：同一个种子每次得到同一串数字（页面被缓存，粒子位置必须稳定） */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const f = (n: number, d = 2) => n.toFixed(d);

/** 雨滴：每一滴是一个独立元素，只用 transform 移动（显卡合成，不重绘，不抖） */
function Rain(props: { seed: string; intensity: number; fine?: boolean }) {
  const r = rng(`rain|${props.seed}`);
  const level = Math.max(1, props.intensity);
  const count = props.fine ? 44 : [0, 36, 60, 90][level]!;
  const speed = props.fine ? 1.6 : [0, 1.15, 0.85, 0.62][level]!;
  const drops = Array.from({ length: count }, () => {
    const t = speed * (0.8 + r() * 0.45);
    return {
      x: r() * 112 - 2,
      t,
      d: -r() * t,
      l: props.fine ? 5 + r() * 5 : 10 + level * 4 + r() * 10,
      o: props.fine ? 0.18 + r() * 0.18 : 0.22 + level * 0.06 + r() * 0.22,
    };
  });
  return (
    <div class="rain">
      {drops.map((d) => (
        <i style={`--x:${f(d.x, 1)}%;--t:${f(d.t)}s;--d:${f(d.d)}s;--l:${f(d.l, 0)}px;--o:${f(d.o)}`} />
      ))}
    </div>
  );
}

/** 雪花：外层负责下落，内层负责左右飘 */
function Snow(props: { seed: string; intensity: number }) {
  const r = rng(`snow|${props.seed}`);
  const level = Math.max(1, props.intensity);
  const count = [0, 30, 48, 72][level]!;
  const flakes = Array.from({ length: count }, () => {
    const t = 9 + r() * 9 - level;
    return { x: r() * 100, t, d: -r() * t, s: 2 + r() * 3.5, o: 0.55 + r() * 0.45, w: 2.6 + r() * 2.4 };
  });
  return (
    <div class="snow">
      {flakes.map((k) => (
        <i style={`--x:${f(k.x, 1)}%;--t:${f(k.t)}s;--d:${f(k.d)}s;--o:${f(k.o)}`}>
          <b style={`--s:${f(k.s, 1)}px;--w:${f(k.w)}s`} />
        </i>
      ))}
    </div>
  );
}

/** 星星：随机分布在上半屏，约三分之一会缓慢闪烁 */
function Stars(props: { seed: string }) {
  const r = rng(`stars|${props.seed}`);
  const stars = Array.from({ length: 64 }, () => ({ x: r() * 100, y: r() * 58, s: 1 + r() * 1.4, o: 0.35 + r() * 0.6, tw: r() < 0.33, d: -r() * 6 }));
  return (
    <div class="stars">
      {stars.map((s) => (
        <i
          class={s.tw ? 'tw' : undefined}
          style={`--x:${f(s.x, 1)}%;--y:${f(s.y, 1)}%;--s:${f(s.s, 1)}px;--o:${f(s.o)};--d:${f(s.d)}s`}
        />
      ))}
    </div>
  );
}

/** 沙尘：细小的颗粒顺着风向横穿屏幕 */
function Dust(props: { seed: string; level: number; wind: number }) {
  const r = rng(`dust|${props.seed}`);
  const count = props.level === 2 ? 90 : 55;
  const base = [13, 10, 7, 5][props.wind]!;
  const grains = Array.from({ length: count }, () => {
    const t = base * (0.7 + r() * 0.7);
    return { y: r() * 100, t, d: -r() * t, s: 1 + r() * 1.8, o: 0.25 + r() * 0.45 };
  });
  return (
    <div class="dust">
      {grains.map((g) => (
        <i style={`--y:${f(g.y, 1)}%;--t:${f(g.t)}s;--d:${f(g.d)}s;--s:${f(g.s, 1)}px;--o:${f(g.o)}`} />
      ))}
    </div>
  );
}

/** 风的线条：大风且没有雨雪沙尘时，几条很淡的细线快速掠过 */
function Gusts(props: { seed: string; wind: number }) {
  const r = rng(`gust|${props.seed}`);
  const count = props.wind >= 3 ? 16 : 10;
  const lines = Array.from({ length: count }, () => {
    const t = 1.4 + r() * 1.6 - props.wind * 0.2;
    return { y: 6 + r() * 62, t, d: -r() * 6, w: 50 + r() * 110, o: 0.18 + r() * 0.2 };
  });
  return (
    <div class="gusts">
      {lines.map((l) => (
        <i style={`--y:${f(l.y, 1)}%;--t:${f(l.t)}s;--d:${f(l.d)}s;--w:${f(l.w, 0)}px;--o:${f(l.o)}`} />
      ))}
    </div>
  );
}

/** 天空图层：渐变底色、太阳或月光、星星、云、雨、雪、沙尘、风、闪电、雾（见 sky.ts） */
export function SkyLayers(props: { sky: Sky }) {
  const { sky } = props;
  const pos = discPosition(sky.arc);
  const night = sky.phase === 'night';
  const w = sky.weather;
  const wet = w === 'rain' || w === 'storm';
  return (
    <div class="sky" aria-hidden="true" style={`--sx:${pos.x}%;--sy:${pos.y}%;${skyVars(sky)}`}>
      {night && w === 'clear' ? <Stars seed={sky.seed} /> : null}
      {sky.showDisc ? <div class={night ? 'moon' : 'sun'} /> : null}
      {w !== 'fog' && w !== 'dust' ? <div class="clouds" /> : null}
      {w !== 'fog' && w !== 'dust' ? <div class="clouds c2" /> : null}
      {w === 'dust' ? <div class="haze" /> : null}
      {w === 'dust' ? <Dust seed={sky.seed} level={sky.dust} wind={sky.wind} /> : null}
      {sky.wind >= 2 && (w === 'clear' || w === 'cloudy') ? <Gusts seed={sky.seed} wind={sky.wind} /> : null}
      {(wet && sky.intensity > 0) || sky.sleet ? <Rain seed={sky.seed} intensity={sky.sleet ? Math.max(1, sky.intensity - 1) : sky.intensity} fine={sky.fine} /> : null}
      {w === 'storm' ? <div class="flash" /> : null}
      {w === 'snow' ? <Snow seed={sky.seed} intensity={sky.sleet ? 1 : sky.intensity} /> : null}
      {w === 'fog' ? <div class="fog" /> : null}
      {w === 'fog' ? <div class="fog f2" /> : null}
    </div>
  );
}

/** 卡片标题：小图标 + 标题，右侧可选"查看更多" */
export function Sec(props: { icon: Child; title: string; more?: string; tag?: 'h2' | 'h3' }) {
  const inner = (
    <>
      {props.icon}
      <span>{props.title}</span>
      {props.more ? (
        <span class="go">
          {props.more}
          {G.chevron('flip')}
        </span>
      ) : null}
    </>
  );
  return props.tag === 'h3' ? <h3 class="sec">{inner}</h3> : <h2 class="sec">{inner}</h2>;
}

/** 城市主页顶部：城市名、单位切换、收藏、城市列表 */
export function TopBar(props: { location: WeatherLocation; channel: Channel; lang: Lang }) {
  const { location: loc, lang } = props;
  return (
    <header class="top">
      <div class="place">
        <h1>
          {G.pin()}
          <span>{loc.name}</span>
        </h1>
        <div class="region">{[loc.adminArea, loc.country].filter((x) => x && x !== loc.name).join(', ')}</div>
      </div>
      <button class="btn" dir="ltr" type="button" data-units-toggle aria-label={t(lang, 'UnitsTitle')}>
        °C
      </button>
      <button class="btn" type="button" data-save aria-pressed="false" aria-label={t(lang, 'AddToMyCities')}>
        {G.star()}
      </button>
      <a class="btn" data-nav href={citiesPath(props.channel, lang)} aria-label={t(lang, 'MyCitiesTitle')}>
        {G.list()}
      </a>
    </header>
  );
}

/** 子页顶部：返回城市主页 + 页面标题 */
export function SubBar(props: { location: WeatherLocation; channel: Channel; lang: Lang; title: string }) {
  return (
    <header class="top">
      <div class="place">
        <a class="back" data-nav href={cityPath(props.channel, props.lang, props.location.id)}>
          {G.back()}
          <span>{props.location.name}</span>
        </a>
        <h1>
          <span>{props.title}</span>
        </h1>
      </div>
      <button class="btn" dir="ltr" type="button" data-units-toggle aria-label={t(props.lang, 'UnitsTitle')}>
        °C
      </button>
    </header>
  );
}

/** 放在首屏区块之后：华氏度用户在首次绘制前就看到 °F（见 src/config/units.ts） */
export function EarlyUnits() {
  return <script>{raw(EARLY_UNITS_SCRIPT)}</script>;
}

/** 放在逐小时区块之后：先藏起已经过去的小时（见 src/config/units.ts） */
export function EarlyTime() {
  return <script>{raw(EARLY_TIME_SCRIPT)}</script>;
}

export function Footer(props: { lang: Lang; providerName: string }) {
  const legal = props.lang === 'ar' ? '/ar' : '/en';
  const { lang } = props;
  return (
    <footer>
      <nav>
        <a href={`${legal}/contact-us.html`}>{t(lang, 'ContactUs')}</a>
        <a href={`${legal}/privacy-policy.html`}>{t(lang, 'PrivacyPolicy')}</a>
        <a href={`${legal}/term-of-use.html`}>{t(lang, 'TermsOfUse')}</a>
      </nav>
      {/* Foreca 条款要求显示数据来源；拿到官方 logo 后替换为图片（需求文档"条款与署名"） */}
      <div>{t(lang, 'DataSource', { source: props.providerName === 'mock' ? 'Foreca (mock)' : 'Foreca' })}</div>
      <div>© {new Date().getFullYear()} Its Fun Magazine</div>
    </footer>
  );
}

/** 交给浏览器脚本的数据（文案、城市、时区）。转义 < 防止脚本注入。 */
export function PageData(props: { data: Record<string, unknown> }) {
  const json = JSON.stringify(props.data).replace(/</g, '\\u003c');
  return <script type="application/json" id="page-data">{raw(json)}</script>;
}

/** 浏览器脚本需要的文案 */
export function clientStrings(lang: Lang): Record<string, string> {
  const keys = [
    'NowLabel',
    'UpdatedJustNow',
    'UpdatedMinutesAgo',
    'UpdatedHoursAgo',
    'OfflineNotice',
    'StorageUnavailable',
    'AddToMyCities',
    'AddedToMyCities',
    'RemoveFromMyCities',
    'Searching',
    'SearchFailed',
    'NoMatchingCities',
    'NoCitiesSavedYet',
    'SearchToDiscoverCities',
    'LoadingSavedCities',
    'RemoveCityAria',
    'CurrentLocation',
    'GuessRight',
    'GuessWrong',
    'GuessPercentRight',
    'ForecastFeedbackThanks',
    'UnitsTitle',
    'TemperatureLabel',
    'WindSpeedLabel',
  ];
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = t(lang, k);
  for (const icon of ['sunny', 'night', 'partly-cloudy', 'mostly-cloudy', 'cloudy', 'foggy', 'rainy-drizzle', 'rainy-light', 'rainy-shower-light', 'rainy-moderate', 'rainy-heavy', 'rainy-freezing', 'stormy-strong', 'stormy-rain-light', 'stormy-rain-medium', 'stormy-rain-heavy', 'sleet-light', 'sleet-moderate', 'sleet-heavy', 'snowy-light', 'snowy-flurries', 'snowy-moderate', 'snowy-heavy']) {
    out[`Cond_${icon}`] = t(lang, `Cond_${icon}`);
  }
  return out;
}

/** 没有城市数据的页面（我的城市、错误页）用的天空 */
const DEFAULT_SKY: Sky = { phase: 'night', weather: 'cloudy', someClouds: false, arc: 0.5, showDisc: false, intensity: 0, sleet: false, fine: false, wind: 0, windSign: -1, dust: 0, seed: 'default', className: 'sky-night wx-cloudy' };

const THEME: Record<string, string> = { day: '#2f6fd6', dawn: '#3e4c8c', golden: '#3c6cc4', dusk: '#1c295c', night: '#060d26' };

export function Layout(props: {
  lang: Lang;
  title: string;
  sky?: Sky;
  devNote?: string;
  pageData: Record<string, unknown>;
  /** 首屏大图标（LCP），和页面上 Icon 的 icon、size 一致，才能命中预加载 */
  preloadIcon?: { icon: string; size: number };
  children?: Child;
}) {
  const { lang } = props;
  const sky = props.sky ?? DEFAULT_SKY;
  const theme = sky.weather === 'clear' ? THEME[sky.phase] : sky.phase === 'night' ? '#0b111f' : '#4a5670';
  return (
    <html lang={intlLocale(lang)} dir={textDirection(lang)}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content={theme} />
        <title>{props.title}</title>
        {props.preloadIcon ? (
          <link
            rel="preload"
            as="image"
            href={`/img/weather/${iconImage(props.preloadIcon.icon)}`}
            imagesrcset={iconSrcset(props.preloadIcon.icon)}
            imagesizes={`${props.preloadIcon.size}px`}
            fetchpriority="high"
          />
        ) : null}
        <style>{raw(CSS)}</style>
      </head>
      <body class={sky.className}>
        <SkyLayers sky={sky} />
        {props.devNote ? <div class="dev">{props.devNote}</div> : null}
        <div class="wrap">{props.children}</div>
        <PageData data={{ lang, intl: intlLocale(lang), ...props.pageData, strings: clientStrings(lang) }} />
        <script src="/static/app.js" defer></script>
      </body>
    </html>
  );
}
