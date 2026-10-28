import type { Child } from 'hono/jsx';
import type { Channel } from '../config/channels';
import { CLIMATE_LEVEL_COLORS } from '../config/features';
import { HOURS_SHOWN, STALE_AFTER_MIN } from '../config/thresholds';
import type { CityFeatures } from '../features';
import type { LifeIndexKey } from '../features/life';
import { intlLocale, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { cityPath } from '../routing/urls';
import { currentHourIndex, hourLabel, weekdayLabel } from '../time/cityTime';
import {
  aqiLevel,
  aqiPercent,
  conditionKey,
  feelsKey,
  humidityKey,
  pressureKey,
  pressurePercent,
  tempGradient,
  tempRange,
  uvLevelKey,
  visibilityKey,
  windDirText,
} from '../weather/derive';
import type { CityBundle } from '../weather/service';
import type { DailyPoint, HourlyPoint } from '../weather/types';
import { AdSlot, DASH, Distance, EarlyTime, EarlyUnits, Footer, Icon, Layout, Precip, Sec, Speed, Temp, TopBar } from './components';
import { G } from './glyphs';
import { isPlaceholder } from './placeholders';
import { computeSky, displayIcon, type Sky } from './sky';

export interface PageProps {
  bundle: CityBundle;
  features: CityFeatures;
  channel: Channel;
  lang: Lang;
  providerName: string;
  /** 生成页面的时间（和天气数据用同一个时钟） */
  nowMs: number;
}

export function devNote(providerName: string): string | undefined {
  return providerName === 'mock' ? '开发预览 · 模拟数据（不是真实天气）· 虚线框为广告位' : undefined;
}

export function cityPageData(p: PageProps): Record<string, unknown> {
  const loc = p.bundle.location;
  return {
    channel: p.channel,
    tz: loc.timezone,
    city: { id: loc.id, name: loc.name, admin: loc.adminArea, country: loc.country },
    fetchedAt: p.bundle.current.fetchedAt,
  };
}

export function pageSky(p: PageProps): Sky {
  const today = p.bundle.daily?.data.find((d) => d.date === p.bundle.today);
  const c = p.bundle.current.data;
  const air = p.bundle.air?.data ?? [];
  const i = currentHourIndex(air.map((a) => a.time), p.nowMs);
  const aq = i === -1 ? null : air[i];
  return computeSky({
    icon: c.icon,
    nowMs: p.nowMs,
    timezone: p.bundle.location.timezone,
    sunrise: today?.sunrise,
    sunset: today?.sunset,
    wind: { speed: c.windSpeed, gust: c.windGust, dir: c.windDir },
    air: aq ? { pm10: aq.pm10, pm25: aq.pm25 } : null,
  });
}

/**
 * 带变量的文案，变量位置放入页面元素（例如需要浏览器换算单位的温差）。
 * 例："{delta}° warmer than usual" → [<span data-dc…>6</span>, "° warmer than usual"]
 */
export function rich(lang: Lang, key: string, parts: Record<string, Child>): Child[] {
  const out: Child[] = [];
  const re = /\{(\w+)\}/g;
  const text = t(lang, key);
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(text.slice(last, m.index));
    out.push(m[1]! in parts ? parts[m[1]!] : m[0]);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** 温差（绝对值），浏览器按用户单位换算 */
export function Delta(props: { c: number }) {
  return <span data-dca={String(props.c)}>{Math.abs(Math.round(props.c))}</span>;
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '' : `${Math.round(n)}%`);

/** 一天的温度条；today 时在条上标出现在的温度 */
export function DayRow(props: { d: DailyPoint; lang: Lang; range: { min: number; span: number }; nowTemp?: number | null }) {
  const { d, lang, range } = props;
  const known = d.minTemp !== null || d.maxTemp !== null;
  const lo = d.minTemp ?? d.maxTemp ?? 0;
  const hi = d.maxTemp ?? d.minTemp ?? 0;
  const left = ((lo - range.min) / range.span) * 100;
  const width = Math.max(4, ((hi - lo) / range.span) * 100);
  const now = props.nowTemp;
  const nowPos = now === null || now === undefined ? null : Math.min(100, Math.max(0, ((now - range.min) / range.span) * 100));
  return (
    <div class="day" data-date={d.date}>
      <span class="wd" data-weekday={d.date}>
        {weekdayLabel(d.date, intlLocale(lang))}
      </span>
      <span class="ic">
        <Icon icon={d.icon} size={30} alt={t(lang, conditionKey(d.icon))} />
        {d.precipProb !== null && d.precipProb >= 30 ? <small>{pct(d.precipProb)}</small> : null}
      </span>
      <span class="lo">
        <Temp c={d.minTemp} />
      </span>
      <span class="bar">
        {known ? <i style={`inset-inline-start:${left.toFixed(1)}%;width:${width.toFixed(1)}%;background:${tempGradient(lo, hi)}`} /> : null}
        {nowPos !== null ? <b data-now-dot style={`inset-inline-start:${nowPos.toFixed(1)}%`} /> : null}
      </span>
      <span class="hi">
        <Temp c={d.maxTemp} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

type HourItem = { kind: 'hour'; h: HourlyPoint } | { kind: 'sun'; time: string; rise: boolean };

/** 逐小时里插入日出、日落（按当地时间排序） */
function hourItems(hours: HourlyPoint[], days: DailyPoint[]): HourItem[] {
  const items: HourItem[] = hours.map((h) => ({ kind: 'hour', h }));
  if (hours.length < 2) return items;
  const first = hours[0]!.time.slice(0, 16);
  const last = hours[hours.length - 1]!.time.slice(0, 16);
  for (const d of days.slice(0, 2)) {
    for (const [hhmm, rise] of [
      [d.sunrise, true],
      [d.sunset, false],
    ] as const) {
      if (!hhmm) continue;
      const local = `${d.date}T${hhmm.slice(0, 5)}`;
      if (local <= first || local >= last) continue;
      const idx = items.findIndex((it) => it.kind === 'hour' && it.h.time.slice(0, 16) > local);
      if (idx > 0) items.splice(idx, 0, { kind: 'sun', time: local, rise });
    }
  }
  return items;
}

export function HourlyStrip(props: { hours: HourlyPoint[]; days: DailyPoint[]; lang: Lang; nowMs: number }) {
  const { lang } = props;
  // 第一格只有在已经开始（包含现在）时才叫"现在"；明天、后天页面的第一格是 00:00
  const isNow = (time: string, i: number) => i === 0 && Date.parse(time) <= props.nowMs;
  return (
    <div class="hours">
      {hourItems(props.hours, props.days).map((it, i) =>
        it.kind === 'hour' ? (
          <div class="hour" data-time={it.h.time}>
            <div class="t" data-hour-label={hourLabel(it.h.time)}>
              {isNow(it.h.time, i) ? t(lang, 'NowLabel') : hourLabel(it.h.time)}
            </div>
            <Icon icon={it.h.icon} size={34} alt={t(lang, conditionKey(it.h.icon))} />
            <div class="p">{it.h.precipProb !== null && it.h.precipProb >= 20 ? pct(it.h.precipProb) : ''}</div>
            <div class="v">
              <Temp c={it.h.temperature} />
            </div>
          </div>
        ) : (
          <div class="hour sunev" data-time={`${it.time}`}>
            <div class="t">
              <bdi>{it.time.slice(11, 16)}</bdi>
            </div>
            <span class="sunico">{it.rise ? G.sunrise() : G.sunset()}</span>
            <div class="p" />
            <div class="v">{t(lang, it.rise ? 'WeatherSunrise' : 'WeatherSunset')}</div>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * 降雨时间轴卡片：一直显示。
 * 没请求逐 15 分钟数据（逐小时预报显示未来 3 小时不太可能下雨）时显示"未来 2 小时无雨"；
 * 数据没取到时显示"暂时无法获取"。
 */
function Nowcast(props: { f: CityFeatures; lang: Lang; fallback: 'dry' | 'unavailable' }) {
  const n = props.f.nowcast;
  const { lang } = props;
  if (!n) {
    return (
      <section class="card" data-nowcast={props.fallback}>
        <Sec icon={G.umbrella()} title={t(lang, 'NowcastTitle')} />
        <div class="nc-msg">{t(lang, props.fallback === 'dry' ? 'Nowcast_dry' : 'Unavailable')}</div>
      </section>
    );
  }
  if (n.state === 'dry') {
    return (
      <section class="card" data-nowcast="dry">
        <Sec icon={G.umbrella()} title={t(lang, 'NowcastTitle')} />
        <div class="nc-msg">{t(lang, n.messageKey, n.vars)}</div>
      </section>
    );
  }
  const max = 3;
  return (
    <section class="card" data-nowcast={n.state}>
      <Sec icon={G.umbrella()} title={t(lang, 'NowcastTitle')} />
      <div class="nc-msg">{t(lang, n.messageKey, n.vars)}</div>
      <div class="nc-bars" role="img" aria-label={t(lang, n.messageKey, n.vars)}>
        {n.bars.map((b) => (
          <span data-i={String(b.intensity)} style={`height:${Math.max(4, (b.intensity / max) * 100)}%`} />
        ))}
      </div>
      <div class="nc-axis">
        {n.bars
          .filter((_, i) => i % 2 === 0)
          .map((b, i) => (
            <bdi>{i === 0 ? t(lang, 'NowLabel') : b.time.slice(11, 16)}</bdi>
          ))}
      </div>
      <div class="nc-note">{t(lang, n.precise ? 'NowcastRadarNote' : 'NowcastModelNote')}</div>
    </section>
  );
}

const LIFE_GLYPH: Record<LifeIndexKey, () => Child> = {
  running: G.running,
  laundry: G.laundry,
  carwash: G.carwash,
  clothing: G.clothing,
  sunscreen: G.sunscreen,
};

function LifeRow(props: { p: PageProps }) {
  const { p } = props;
  const { lang, channel } = p;
  const items = p.features.life;
  return (
    <section class="card">
      <Sec icon={G.sun()} title={t(lang, 'LifeTitle')} />
      <div class="life">
        {items.map((x) => (
          <a data-nav href={cityPath(channel, lang, p.bundle.location.id, `life/${x.key}`)}>
            <span class="ico">{LIFE_GLYPH[x.key]()}</span>
            <span class="n">
              <b>{t(lang, `LifeTitle_${x.key}`)}</b>
              <span>{x.reasonKey ? t(lang, x.reasonKey, x.vars) : DASH}</span>
            </span>
            <span class="r">
              {x.rating ? <i class={`dot ${x.rating}`} /> : null}
              {x.summaryKey ? t(lang, x.summaryKey) : DASH}
              {G.chevron('flip')}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

/** 顶部"比往年同期暖 6°"标签 */
export function ClimateTag(props: { p: PageProps }) {
  const { p } = props;
  const label = p.features.label;
  const href = cityPath(p.channel, p.lang, p.bundle.location.id, 'climate');
  // 没有往年数据时保留同样大小的标签（"今天 vs 往年 --"），点进去看原因
  if (!label) {
    return (
      <a class="vs" data-nav href={href} style="--lv:var(--faint)">
        <i />
        <span>
          {t(p.lang, 'ClimateTitle')} {DASH}
        </span>
        {G.chevron('flip')}
      </a>
    );
  }
  const c = label.comparison;
  const text =
    label.mode === 'rain'
      ? t(p.lang, 'ClimateLabel_rain', { n: label.rainDays })
      : rich(p.lang, `ClimateLabel_${c.wording}`, { delta: <Delta c={c.deltaMax} /> });
  return (
    <a class="vs" data-nav href={href} style={`--lv:${label.mode === 'rain' ? 'var(--rain)' : CLIMATE_LEVEL_COLORS[c.level]}`}>
      <i />
      <span>{text}</span>
      {G.chevron('flip')}
    </a>
  );
}

/** 今天、明天、后天、7 天的快捷入口；在子页里标出当前页 */
export function Jump(props: { p: PageProps; active?: 'tomorrow' | 'day-after' | 'week' }) {
  const { p, active } = props;
  const days = p.features.days;
  const id = p.bundle.location.id;
  const cur = (k: string) => (active === k ? { 'aria-current': 'page' } : {});
  const pill = (d: DailyPoint | undefined, sub: string, label: Child) =>
    d ? (
      <a data-nav href={cityPath(p.channel, p.lang, id, sub)} {...cur(sub)}>
        <span>{label}</span>
        <Icon icon={d.icon} size={24} alt={t(p.lang, conditionKey(d.icon))} />
        <span class="hl">
          <Temp c={d.maxTemp} />
          {' / '}
          <Temp c={d.minTemp} />
        </span>
      </a>
    ) : null;
  const after = days[2];
  return (
    <nav class="jump">
      {active ? pill(days[0], '', t(p.lang, 'TodayLabel')) : null}
      {pill(days[1], 'tomorrow', t(p.lang, 'TomorrowLabel'))}
      {pill(after, 'day-after', after ? <span data-weekday={after.date}>{weekdayLabel(after.date, intlLocale(p.lang), 'long')}</span> : '')}
      <a data-nav href={cityPath(p.channel, p.lang, id, 'week')} {...cur('week')}>
        <span>{t(p.lang, 'WeekOverview')}</span>
        {G.chevron()}
      </a>
    </nav>
  );
}

export function Compass(props: { deg: number | null }) {
  const rot = props.deg === null ? 0 : (props.deg + 180) % 360;
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
      {ticks.map((a) => (
        <line
          x1="50"
          y1="6"
          x2="50"
          y2={a % 90 === 0 ? '13' : '10'}
          stroke={a % 90 === 0 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)'}
          stroke-width={a % 90 === 0 ? '2' : '1.2'}
          transform={`rotate(${a} 50 50)`}
        />
      ))}
      <text x="50" y="27" text-anchor="middle" font-size="12" font-weight="650" fill="#fff">N</text>
      <text x="80" y="54.5" text-anchor="middle" font-size="11.5" fill="rgba(255,255,255,.7)">E</text>
      <text x="50" y="84" text-anchor="middle" font-size="11.5" fill="rgba(255,255,255,.7)">S</text>
      <text x="20" y="54.5" text-anchor="middle" font-size="11.5" fill="rgba(255,255,255,.7)">W</text>
      {props.deg === null ? null : (
        <g transform={`rotate(${rot} 50 50)`}>
          <path d="M50 16 L55 30 L50 27 L45 30 Z" fill="#fff" />
          <line x1="50" y1="28" x2="50" y2="84" stroke="#fff" stroke-width="2" stroke-linecap="round" />
          <circle cx="50" cy="84" r="3" fill="none" stroke="#fff" stroke-width="2" />
        </g>
      )}
    </svg>
  );
}

export function Gauge(props: { percent: number }) {
  const angle = -120 + (props.percent / 100) * 240;
  const ticks = Array.from({ length: 25 }, (_, i) => -120 + i * 10);
  return (
    <svg viewBox="0 0 100 74" width="104" height="77" aria-hidden="true">
      {ticks.map((a) => (
        <line x1="50" y1="8" x2="50" y2="16" stroke="rgba(255,255,255,.4)" stroke-width="1.6" stroke-linecap="round" transform={`rotate(${a} 50 50)`} />
      ))}
      <line x1="50" y1="6" x2="50" y2="19" stroke="#fff" stroke-width="3.5" stroke-linecap="round" transform={`rotate(${angle.toFixed(1)} 50 50)`} />
    </svg>
  );
}

/** 日出日落弧线，太阳按现在的时间放在线上 */
export function SunArc(props: { arc: number | null }) {
  const a = props.arc;
  const x = a === null ? null : 6 + a * 88;
  const y = a === null ? null : 50 - Math.sin(a * Math.PI) * 38;
  return (
    <svg class="sunarc" viewBox="0 0 100 56" aria-hidden="true">
      <path d="M6 50 Q50 -26 94 50" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.6" stroke-dasharray="2 3" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,.3)" stroke-width="1" />
      {x !== null && y !== null ? <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="4.5" fill="#ffd36b" stroke="#fff" stroke-width="1.5" /> : null}
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function HomePage(p: PageProps) {
  const { bundle, channel, lang, features } = p;
  const { location: loc, current, hourly, air } = bundle;
  const c = current.data;
  const days = features.days;
  const today = days[0];
  const week = days.slice(0, 7);
  const range = tempRange(week);
  const aq = air?.data[0] ?? null;
  const aqLevel = aqiLevel(aq?.aqi ?? null);
  const uvKey = uvLevelKey(c.uvIndex);
  const pKey = pressureKey(c.pressure);
  const sky = pageSky(p);
  // 没有日出日落时间时不画太阳（位置是估的）
  const daylight = sky.phase !== 'night' && today?.sunrise && today?.sunset ? sky.arc : null;
  const heroIcon = displayIcon(c.icon, sky);
  // 降雨时间轴没有内容时：没去请求（逐小时预报显示近 3 小时不太会下雨）→"未来 2 小时无雨"；
  // 请求失败、逐小时预报也没有、或取到的数据已全部过时 →"暂无数据"
  const nowcastFallback = bundle.nowcast === null && !bundle.missing.includes('nowcast') && !isPlaceholder(hourly?.data[0] ?? { icon: '' }) ? 'dry' : 'unavailable';
  // 数据的实际年龄（接口故障时用的是旧数据）；页面缓存期间由浏览器脚本继续更新这行字
  const updMins = Math.max(0, Math.floor((p.nowMs - current.fetchedAt) / 60_000));

  return (
    <Layout
      lang={lang}
      title={t(lang, 'CityWeatherTitle', { city: loc.name })}
      sky={sky}
      devNote={devNote(p.providerName)}
      pageData={{ ...cityPageData(p), page: 'home' }}
      preloadIcon={{ icon: heroIcon, size: 62 }}
    >
      <TopBar location={loc} channel={channel} lang={lang} />
      <Jump p={p} />

      <section class="hero" data-current data-live="hero">
        <div class="now">
          <span class="t" data-current-temp>
            {c.temperature === null ? DASH : <span data-c={String(c.temperature)}>{Math.round(c.temperature)}</span>}
          </span>
          <span class="deg">°</span>
          <Icon icon={heroIcon} size={62} eager alt="" />
        </div>
        <p class="cond" data-current-cond>
          {t(lang, conditionKey(heroIcon))}
        </p>
        <p class="hl-line">
          {/* 每组"标签 + 温度"单独隔离，从右往左的语言里标签和数字不会错位 */}
          <bdi>{t(lang, 'HighShort')} <b><Temp c={today?.maxTemp} /></b></bdi>
          {'  '}
          <bdi>{t(lang, 'LowShort')} <b><Temp c={today?.minTemp} /></b></bdi>
        </p>
        {/* 体感温度一直显示（和实际温度相同也显示），每个城市的首屏高度一致 */}
        <p class="feels">
          {t(lang, 'WeatherFeelsLike')} <Temp c={c.feelsLike} />
        </p>
        <ClimateTag p={p} />
        <p class={`upd${updMins > STALE_AFTER_MIN ? ' stale' : ''}`} data-fetched={String(current.fetchedAt)}>
          {updMins < 1 ? t(lang, 'UpdatedJustNow') : updMins < 60 ? t(lang, 'UpdatedMinutesAgo', { n: updMins }) : t(lang, 'UpdatedHoursAgo', { n: Math.floor(updMins / 60) })}
        </p>
      </section>
      <EarlyUnits />

      <div data-live="nowcast" style="display:contents">
        <Nowcast f={features} lang={lang} fallback={nowcastFallback} />
      </div>

      <a class="card" data-live="hourly" data-nav href={cityPath(channel, lang, loc.id, 'hourly')}>
        <Sec icon={G.clock()} title={t(lang, 'HourlyForecastTitle')} more={t(lang, 'SeeHourlyDetails')} />
        <HourlyStrip hours={(hourly?.data ?? []).slice(0, HOURS_SHOWN)} days={days} lang={lang} nowMs={p.nowMs} />
      </a>
      <EarlyTime />

      <AdSlot slot="home_1" height={100} lang={lang} />

      <a class="card" data-live="week" data-nav href={cityPath(channel, lang, loc.id, '15day')}>
        <Sec icon={G.calendar()} title={t(lang, 'DailyForecastTitle')} more={t(lang, 'SeeAll15Days')} />
        {week.map((d, i) => (
          <DayRow d={d} lang={lang} range={range} nowTemp={i === 0 ? c.temperature : undefined} />
        ))}
      </a>

      <LifeRow p={p} />

      <AdSlot slot="home_2" lang={lang} />

      <a class="card" data-live="aq" data-nav href={cityPath(channel, lang, loc.id, 'air')}>
        <Sec icon={G.leaf()} title={t(lang, 'WeatherAirQuality')} more={t(lang, 'SeeDetails')} />
        <div class="aq">
          <span class="v">{aq?.aqi ?? DASH}</span>
          <span class="l">{aqLevel ? t(lang, aqLevel.key) : t(lang, 'Unavailable')}</span>
        </div>
        <div class="meter">{aq?.aqi !== null && aq?.aqi !== undefined ? <b style={`inset-inline-start:${aqiPercent(aq.aqi).toFixed(1)}%`} /> : null}</div>
      </a>

      <div class="grid" data-live="tiles">
        <div class="tile">
          <Sec tag="h3" icon={G.thermo()} title={t(lang, 'WeatherFeelsLike')} />
          <div class="big">
            <Temp c={c.feelsLike} />
          </div>
          <div class="note">{t(lang, feelsKey(c.temperature, c.feelsLike))}</div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.drop()} title={t(lang, 'WeatherHumidity')} />
          <div class="big">
            {c.humidity === null ? DASH : Math.round(c.humidity)}
            <small>%</small>
          </div>
          <div class="note">{t(lang, humidityKey(c.humidity))}</div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.wind()} title={t(lang, 'WeatherWind')} />
          <div class="viz">
            <Compass deg={c.windDir} />
          </div>
          <div class="note">
            <b>
              <Speed ms={c.windSpeed} />
            </b>{' '}
            {windDirText(c.windDir)}
            {c.windGust !== null ? (
              <span>
                {', '}
                {t(lang, 'WindGustPrefix')} <Speed ms={c.windGust} />
              </span>
            ) : null}
          </div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.gauge()} title={t(lang, 'WeatherPressure')} />
          <div class="viz">
            <Gauge percent={pressurePercent(c.pressure)} />
          </div>
          <div class="note">
            <b>
              <bdi>{c.pressure === null ? DASH : `${Math.round(c.pressure)} hPa`}</bdi>
            </b>{' '}
            {pKey ? t(lang, pKey) : ''}
          </div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.sunrise()} title={t(lang, 'WeatherSunrise')} />
          <div class="big">
            <bdi>{today?.sunrise?.slice(0, 5) ?? DASH}</bdi>
          </div>
          <SunArc arc={daylight} />
          <div class="note">
            {t(lang, 'WeatherSunset')} <bdi>{today?.sunset?.slice(0, 5) ?? DASH}</bdi>
          </div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.sun()} title={t(lang, 'WeatherUVIndex')} />
          <div class="big">{c.uvIndex === null ? DASH : Math.round(c.uvIndex)}</div>
          <div class="meter uvm">{c.uvIndex !== null ? <b style={`inset-inline-start:${Math.min(100, (c.uvIndex / 11) * 100).toFixed(1)}%`} /> : null}</div>
          <div class="note">{uvKey ? t(lang, uvKey) : ''}</div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.rainfall()} title={t(lang, 'Precipitation')} />
          <div class="big">
            <Precip mm={today?.precipAccum} />
          </div>
          <div class="note">
            {today?.precipProb !== null && today?.precipProb !== undefined
              ? t(lang, 'PrecipTodayNote', { percent: Math.round(today.precipProb) })
              : t(lang, 'TodayLabel')}
          </div>
        </div>
        <div class="tile">
          <Sec tag="h3" icon={G.eye()} title={t(lang, 'WeatherVisibility')} />
          <div class="big">
            <Distance m={c.visibility} />
          </div>
          <div class="note">{t(lang, visibilityKey(c.visibility))}</div>
        </div>
      </div>

      <section class="card vote" data-vote={loc.id}>
        <p>{t(lang, 'ForecastFeedbackQuestion')}</p>
        <button type="button" data-vote-value="up" aria-pressed="false" aria-label={t(lang, 'ForecastAccurateYes')}>
          {G.thumbUp()}
        </button>
        <button type="button" data-vote-value="down" aria-pressed="false" aria-label={t(lang, 'ForecastAccurateNo')}>
          {G.thumbDown()}
        </button>
      </section>

      <AdSlot slot="home_3" lang={lang} />

      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}
