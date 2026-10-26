import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import type { Channel } from '../config/channels';
import { intlLocale, textDirection, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { citiesPath, cityPath } from '../routing/urls';
import { iconImage } from '../weather/icons';
import type { WeatherLocation } from '../weather/types';
import { G } from './glyphs';
import { discPosition, type Sky } from './sky';
import { CSS } from './styles';

export const DASH = '—';

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

/** 风速：数据是 m/s，默认显示 km/h，华氏度用户显示 mph */
export function Speed(props: { ms: number | null | undefined }) {
  if (props.ms === null || props.ms === undefined) return <span>{DASH}</span>;
  return (
    <bdi dir="ltr">
      <span data-ms={String(props.ms)}>{Math.round(props.ms * 3.6)}</span> <span data-speed-unit>km/h</span>
    </bdi>
  );
}

/** 降水量：mm；华氏度用户显示英寸 */
export function Precip(props: { mm: number | null | undefined }) {
  if (props.mm === null || props.mm === undefined) return <span>{DASH}</span>;
  return (
    <bdi dir="ltr">
      <span data-mm={String(props.mm)}>{props.mm.toFixed(1)}</span> <span data-mm-unit>mm</span>
    </bdi>
  );
}

export function Icon(props: { icon: string; size?: number; cls?: string; eager?: boolean; alt?: string }) {
  return (
    <img
      class={props.cls}
      src={`/img/weather/${iconImage(props.icon)}`}
      alt={props.alt ?? ''}
      width={props.size ?? 32}
      height={props.size ?? 32}
      loading={props.eager ? 'eager' : 'lazy'}
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

/** 天空图层：太阳或月亮、星星、云、雨、雪、闪电、雾（见 sky.ts） */
export function SkyLayers(props: { sky: Sky }) {
  const { sky } = props;
  const pos = discPosition(sky.arc);
  const night = sky.phase === 'night';
  const w = sky.weather;
  return (
    <div class="sky" aria-hidden="true" style={`--sx:${pos.x}%;--sy:${pos.y}%`}>
      {night && (w === 'clear' || w === 'cloudy') ? <div class="stars" /> : null}
      {night && w === 'clear' ? <div class="stars s2" /> : null}
      {sky.showDisc ? <div class={night ? 'moon' : 'sun'} /> : null}
      {w !== 'fog' ? <div class="clouds" /> : null}
      {w !== 'fog' ? <div class="clouds c2" /> : null}
      {w === 'rain' || w === 'storm' ? <div class="rain2" /> : null}
      {w === 'rain' || w === 'storm' ? <div class="rain" /> : null}
      {w === 'storm' ? <div class="flash" /> : null}
      {w === 'snow' ? <div class="snow2" /> : null}
      {w === 'snow' ? <div class="snow" /> : null}
      {w === 'fog' ? <div class="fog" /> : null}
      {w === 'fog' ? <div class="fog2" /> : null}
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
      <button class="btn" dir="ltr" type="button" data-units-toggle aria-label={t(lang, 'SwitchUnits')}>
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
      <button class="btn" dir="ltr" type="button" data-units-toggle aria-label={t(props.lang, 'SwitchUnits')}>
        °C
      </button>
    </header>
  );
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
  ];
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = t(lang, k);
  for (const icon of ['sunny', 'night', 'partly-cloudy', 'mostly-cloudy', 'cloudy', 'foggy', 'rainy-drizzle', 'rainy-light', 'rainy-shower-light', 'rainy-moderate', 'rainy-heavy', 'rainy-freezing', 'stormy-strong', 'stormy-rain-light', 'stormy-rain-medium', 'stormy-rain-heavy', 'sleet-light', 'sleet-moderate', 'sleet-heavy', 'snowy-light', 'snowy-flurries', 'snowy-moderate', 'snowy-heavy']) {
    out[`Cond_${icon}`] = t(lang, `Cond_${icon}`);
  }
  return out;
}

/** 没有城市数据的页面（我的城市、错误页）用的天空 */
const DEFAULT_SKY: Sky = { phase: 'night', weather: 'cloudy', someClouds: false, arc: 0.5, showDisc: false, className: 'sky-night wx-cloudy' };

const THEME: Record<string, string> = { day: '#2f6fd6', dawn: '#3e4c8c', golden: '#3c6cc4', dusk: '#1c295c', night: '#060d26' };

export function Layout(props: {
  lang: Lang;
  title: string;
  sky?: Sky;
  devNote?: string;
  pageData: Record<string, unknown>;
  preloadIcon?: string;
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
        {props.preloadIcon ? <link rel="preload" as="image" href={`/img/weather/${iconImage(props.preloadIcon)}`} /> : null}
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
