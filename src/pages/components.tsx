import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import type { Channel } from '../config/channels';
import { intlLocale, textDirection, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { citiesPath, cityPath } from '../routing/urls';
import { iconImage } from '../weather/icons';
import type { WeatherLocation } from '../weather/types';
import { CSS } from './styles';

export const DASH = '—';

export const round = (n: number | null | undefined): string => (n === null || n === undefined ? DASH : String(Math.round(n)));

/**
 * 温度。服务器按摄氏度输出，并把原始值放在 data-c 里；
 * 浏览器发现用户使用华氏度时就地换算（页面被所有访客共用，单位不能写死在 HTML 里）。
 */
export function Temp(props: { c: number | null | undefined; deg?: boolean }) {
  if (props.c === null || props.c === undefined) return <span>{DASH}</span>;
  return (
    <span>
      <span data-c={String(props.c)}>{Math.round(props.c)}</span>
      {props.deg === false ? '' : '°'}
    </span>
  );
}

/** 风速：数据是 m/s，默认显示 km/h，华氏度用户显示 mph */
export function Speed(props: { ms: number | null | undefined }) {
  if (props.ms === null || props.ms === undefined) return <span>{DASH}</span>;
  return (
    <bdi>
      <span data-ms={String(props.ms)}>{Math.round(props.ms * 3.6)}</span> <span data-speed-unit>km/h</span>
    </bdi>
  );
}

/** 降水量：mm；华氏度用户显示英寸 */
export function Precip(props: { mm: number | null | undefined }) {
  if (props.mm === null || props.mm === undefined) return <span>{DASH}</span>;
  return (
    <bdi>
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
 * 第 5 步在这里接入 AnyMind → AdSense → Taboola 瀑布流；现在显示虚线框，方便确认位置。
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

/** 背景动画层 */
export function Sky(props: { bg: string }) {
  const b = props.bg;
  const fx: string[] = [];
  if (b.includes('rainy') || b.includes('stormy')) fx.push('fx-rain');
  if (b.includes('snowy')) fx.push('fx-snow');
  if (b === 'night' || b === 'night-cloudy') fx.push('fx-stars');
  if (b.includes('foggy')) fx.push('fx-fog');
  return (
    <div class="sky" aria-hidden="true">
      {fx.map((c) => (
        <div class={c} />
      ))}
    </div>
  );
}

const STAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </svg>
);
const LIST = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

/** 城市主页顶部：城市名、收藏、单位切换、城市列表 */
export function TopBar(props: { location: WeatherLocation; channel: Channel; lang: Lang }) {
  const { location: loc, lang } = props;
  return (
    <header class="top">
      <div class="place">
        <h1>{loc.name}</h1>
        <div class="region">{[loc.adminArea, loc.country].filter(Boolean).join(', ')}</div>
      </div>
      <button class="btn" type="button" data-units-toggle aria-label={t(lang, 'SwitchUnits')}>
        °C
      </button>
      <button class="btn" type="button" data-save aria-pressed="false" aria-label={t(lang, 'AddToMyCities')}>
        {STAR}
      </button>
      <a class="btn" data-nav href={citiesPath(props.channel, lang)} aria-label={t(lang, 'MyCitiesTitle')}>
        {LIST}
      </a>
    </header>
  );
}

/** 子页顶部：返回城市主页 */
export function SubBar(props: { location: WeatherLocation; channel: Channel; lang: Lang; title: string }) {
  const back = textDirection(props.lang) === 'rtl' ? '→' : '←';
  return (
    <header class="top">
      <div class="place">
        <a class="back" data-nav href={cityPath(props.channel, props.lang, props.location.id)}>
          {back} {props.location.name}
        </a>
        <h1>{props.title}</h1>
      </div>
      <button class="btn" type="button" data-units-toggle aria-label={t(props.lang, 'SwitchUnits')}>
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
  ];
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = t(lang, k);
  for (const icon of ['sunny', 'night', 'partly-cloudy', 'mostly-cloudy', 'cloudy', 'foggy', 'rainy-drizzle', 'rainy-light', 'rainy-shower-light', 'rainy-moderate', 'rainy-heavy', 'rainy-freezing', 'stormy-strong', 'stormy-rain-light', 'stormy-rain-medium', 'stormy-rain-heavy', 'sleet-light', 'sleet-moderate', 'sleet-heavy', 'snowy-light', 'snowy-flurries', 'snowy-moderate', 'snowy-heavy']) {
    out[`Cond_${icon}`] = t(lang, `Cond_${icon}`);
  }
  return out;
}

export function Layout(props: {
  lang: Lang;
  title: string;
  bg: string;
  devNote?: string;
  pageData: Record<string, unknown>;
  preloadIcon?: string;
  children?: Child;
}) {
  const { lang } = props;
  return (
    <html lang={intlLocale(lang)} dir={textDirection(lang)}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#1b2a4a" />
        <title>{props.title}</title>
        {props.preloadIcon ? <link rel="preload" as="image" href={`/img/weather/${iconImage(props.preloadIcon)}`} /> : null}
        <style>{raw(CSS)}</style>
      </head>
      <body class={`bg-${props.bg}`}>
        <Sky bg={props.bg} />
        {props.devNote ? <div class="dev">{props.devNote}</div> : null}
        <div class="wrap">{props.children}</div>
        <PageData data={{ lang, intl: intlLocale(lang), ...props.pageData, strings: clientStrings(lang) }} />
        <script src="/static/app.js" defer></script>
      </body>
    </html>
  );
}
