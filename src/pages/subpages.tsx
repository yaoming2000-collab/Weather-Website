import type { Channel } from '../config/channels';
import { HOURS_SHOWN } from '../config/thresholds';
import { intlLocale, LANGUAGES, textDirection, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { hourLabel, weekdayLabel } from '../time/cityTime';
import { aqiLevel, aqiPercent, conditionKey, tempRange, uvLevelKey, windDirText } from '../weather/derive';
import { AdSlot, DASH, EarlyTime, Footer, Icon, Layout, Precip, Sec, SettingsLink, Speed, SubBar, Temp } from './components';
import { G } from './glyphs';
import { cityPageData, DayRow, devNote, pageSky, type PageProps } from './home';

const pct = (n: number | null | undefined) => (n === null || n === undefined ? DASH : `${Math.round(n)}%`);

/** 逐小时详情 /w/{id}/hourly */
export function HourlyPage(p: PageProps) {
  const { bundle, channel, lang } = p;
  const hours = bundle.hourly?.data ?? [];
  const title = t(lang, 'Next24Hours');
  const row = (h: (typeof hours)[number], i: number) => (
    <div class="row" data-time={h.time} data-now={i === 0 && Date.parse(h.time) <= p.nowMs ? '' : undefined}>
      <span>
        <bdi data-hour-label={hourLabel(h.time)}>{i === 0 && Date.parse(h.time) <= p.nowMs ? t(lang, 'NowLabel') : hourLabel(h.time)}</bdi>
      </span>
      <Icon icon={h.icon} size={32} />
      <div class="main">
        <div>{t(lang, conditionKey(h.icon))}</div>
        <div class="sub">
          {t(lang, 'ChanceOfPrecip')} {pct(h.precipProb)} · <Speed ms={h.windSpeed} /> {windDirText(h.windDir)}
        </div>
      </div>
      <span class="v">
        <Temp c={h.temperature} />
      </span>
    </div>
  );
  return (
    <Layout lang={lang} title={`${title} · ${bundle.location.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={cityPageData(p)}>
      <SubBar location={bundle.location} channel={channel} lang={lang} title={title} />
      <section class="card" data-now-label={t(lang, 'NowLabel')}>
        {hours.slice(0, 12).map(row)}
      </section>
      <EarlyTime />
      <AdSlot slot="sub_1" lang={lang} />
      <section class="card">{hours.slice(12, HOURS_SHOWN).map((h, i) => row(h, i + 12))}</section>
      <AdSlot slot="sub_2" lang={lang} />
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}

/** 15 天预报 /w/{id}/15day，每天可展开 */
export function DailyPage(p: PageProps) {
  const { bundle, channel, lang } = p;
  const days = bundle.daily?.data ?? [];
  const range = tempRange(days);
  const title = t(lang, 'DailyForecast15Title');
  const intl = intlLocale(lang);
  const dateFmt = new Intl.DateTimeFormat(intl, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const item = (d: (typeof days)[number]) => {
    const [y, m, dd] = d.date.split('-').map(Number);
    const uvKey = uvLevelKey(d.uvIndex);
    return (
      <details class="dd">
        <summary>
          <DayRow d={d} lang={lang} range={range} />
        </summary>
        <div class="more">
          <div>
            {weekdayLabel(d.date, intl, 'long')}, <bdi>{dateFmt.format(new Date(Date.UTC(y!, m! - 1, dd!, 12)))}</bdi>
          </div>
          <div>
            <b>{t(lang, conditionKey(d.icon))}</b>
          </div>
          <div>
            {t(lang, 'ChanceOfPrecip')} <b>{pct(d.precipProb)}</b>
          </div>
          <div>
            {t(lang, 'Precipitation')} <b><Precip mm={d.precipAccum} /></b>
          </div>
          <div>
            {t(lang, 'MaxWind')} <b><Speed ms={d.maxWindSpeed} /></b>
          </div>
          <div>
            {t(lang, 'WeatherUVIndex')} <b>{d.uvIndex === null ? DASH : Math.round(d.uvIndex)}</b> {uvKey ? t(lang, uvKey) : ''}
          </div>
          <div>
            {t(lang, 'WeatherSunrise')} <b><bdi>{d.sunrise?.slice(0, 5) ?? DASH}</bdi></b>
          </div>
          <div>
            {t(lang, 'WeatherSunset')} <b><bdi>{d.sunset?.slice(0, 5) ?? DASH}</bdi></b>
          </div>
        </div>
      </details>
    );
  };
  return (
    <Layout lang={lang} title={`${title} · ${bundle.location.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={cityPageData(p)}>
      <SubBar location={bundle.location} channel={channel} lang={lang} title={title} />
      <section class="card">{days.slice(0, 7).map(item)}</section>
      <AdSlot slot="sub_1" lang={lang} />
      <section class="card">{days.slice(7).map(item)}</section>
      <AdSlot slot="sub_2" lang={lang} />
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}

const POLLUTANTS: Array<{ key: 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co'; label: string }> = [
  { key: 'pm25', label: 'PM2.5' },
  { key: 'pm10', label: 'PM10' },
  { key: 'o3', label: 'O₃' },
  { key: 'no2', label: 'NO₂' },
  { key: 'so2', label: 'SO₂' },
  { key: 'co', label: 'CO' },
];

/** 空气质量详情 /w/{id}/air */
export function AirPage(p: PageProps) {
  const { bundle, channel, lang } = p;
  const points = (bundle.air?.data ?? []).slice(0, HOURS_SHOWN);
  const now = points[0] ?? null;
  const level = aqiLevel(now?.aqi ?? null);
  const max = Math.max(100, ...points.map((a) => a.aqi ?? 0));
  const title = t(lang, 'WeatherAirQuality');
  return (
    <Layout lang={lang} title={`${title} · ${bundle.location.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={cityPageData(p)}>
      <SubBar location={bundle.location} channel={channel} lang={lang} title={title} />
      <section class="card">
        <Sec icon={G.leaf()} title={t(lang, 'WeatherAirQuality')} />
        <div class="aq">
          <span class="v" style="font-size:56px">{now?.aqi ?? DASH}</span>
          <span class="l">
            <i class="dot" style={`background:${level?.color ?? '#cbd5e1'};margin-inline-end:6px;display:inline-block`} />
            {level ? t(lang, level.key) : t(lang, 'Unavailable')}
          </span>
        </div>
        <div class="meter">{now?.aqi !== null && now?.aqi !== undefined ? <b style={`inset-inline-start:${aqiPercent(now.aqi).toFixed(1)}%`} /> : null}</div>
        {now?.pollutant ? (
          <div class="sub" style="color:var(--mut);font-size:13px">
            {t(lang, 'MainPollutant')}: {now.pollutant.replace('Particulate matter <2.5um', 'PM2.5').replace('Particulate matter <10um', 'PM10')}
          </div>
        ) : null}
      </section>

      <section class="card">
        <Sec icon={G.clock()} title={t(lang, 'AirQualityNext24')} />
        <div class="aqbars">
          {points.map((a) => (
            <span
              data-time={a.time}
              title={`${hourLabel(a.time)} · ${a.aqi ?? DASH}`}
              style={`height:${(((a.aqi ?? 0) / max) * 100).toFixed(1)}%;background:${aqiLevel(a.aqi)?.color ?? 'rgba(255,255,255,.3)'}`}
            />
          ))}
        </div>
        <div class="axis">
          <bdi>{points[0] ? hourLabel(points[0].time) : ''}</bdi>
          <bdi>{points[12] ? hourLabel(points[12].time) : ''}</bdi>
          <bdi>{points.at(-1) ? hourLabel(points.at(-1)!.time) : ''}</bdi>
        </div>
      </section>

      <AdSlot slot="sub_1" lang={lang} />

      <section class="card">
        <Sec icon={G.leaf()} title={t(lang, 'Pollutants')} />
        <div class="pollutants">
          {POLLUTANTS.map((x) => (
            <div>
              <span style="color:var(--mut);font-size:12px">{x.label}</span>
              <b>{now?.[x.key] ?? DASH}</b>
            </div>
          ))}
        </div>
      </section>

      <AdSlot slot="sub_2" lang={lang} />
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}

/** 已保存城市 /{渠道}/{语言}/cities —— 列表和搜索由浏览器脚本完成 */
export function CitiesPage(props: { channel: Channel; lang: Lang; providerName: string }) {
  const { lang, channel } = props;
  return (
    <Layout lang={lang} title={t(lang, 'MyCitiesTitle')} devNote={devNote(props.providerName)} pageData={{ channel, page: 'cities' }}>
      <header class="top">
        <div class="place">
          {/* 返回进来之前的城市：首页会跳到上次看的城市；浏览器脚本再换成来源页和城市名（client/main.ts setupCitiesBack） */}
          <a class="back" data-nav data-cities-back href={`/${channel}/?lang=${lang}`}>
            {G.back()}
            <span>{t(lang, 'Back')}</span>
          </a>
          <h1>
            <span>{t(lang, 'MyCitiesTitle')}</span>
          </h1>
        </div>
        <SettingsLink channel={channel} lang={lang} />
      </header>
      <form class="search" role="search" data-search>
        <input type="search" name="q" autocomplete="off" placeholder={t(lang, 'SearchCityWorldwidePlaceholder')} aria-label={t(lang, 'SearchCityWorldwidePlaceholder')} />
      </form>
      <section class="card" data-search-results hidden></section>
      {/* 当前位置：按定位（IP）去，不用上次看的城市（Darren 2026-10-29） */}
      <section class="card here-card">
        <div class="city here">
          <a data-nav href={`/${channel}/?lang=${lang}&here=1`}>
            <span class="here-ico">{G.pin()}</span>
            <div class="n">
              <div>{t(lang, 'CurrentLocation')}</div>
            </div>
            {G.chevron()}
          </a>
        </div>
      </section>
      <section class="card" data-saved-list>
        <div class="empty">{t(lang, 'LoadingSavedCities')}</div>
      </section>
      <AdSlot slot="cities_1" lang={lang} />
      <Footer lang={lang} providerName={props.providerName} />
    </Layout>
  );
}

/**
 * 出错页（找不到、服务暂时不可用）。
 * homeHref 保留渠道、语言和 session 等参数；retry 时显示"重试"按钮，10 秒后自动重试一次（client/main.ts）。
 */
export function MessagePage(props: { lang: Lang; titleKey: string; textKey: string; homeHref: string; retry: boolean }) {
  const { lang } = props;
  return (
    <Layout lang={lang} title={t(lang, props.titleKey)} pageData={{ page: 'message' }}>
      <section class="msg">
        <h1>{t(lang, props.titleKey)}</h1>
        <p style="color:var(--mut)">{t(lang, props.textKey)}</p>
        <div class="msg-actions">
          {props.retry ? (
            <button type="button" class="btn" data-retry>
              {t(lang, 'Retry')}
            </button>
          ) : null}
          <a class={props.retry ? 'btn ghost' : 'btn'} href={props.homeHref}>
            {t(lang, 'BackToHome')}
          </a>
        </div>
      </section>
    </Layout>
  );
}

/**
 * 设置页 /{渠道}/{语言}/settings：语言、温度单位、风速单位。
 * - 语言：点哪个就跳到那个语言的设置页，并写入 Cookie（wlang），以后从锁屏或其他站外链接进来时优先用它（Darren 2026-10-28）
 * - 单位：存在浏览器里（和以前的单位面板同一份设置）
 * - 返回：回到进入设置前的页面（换了语言就回到那一页的新语言版本），由浏览器脚本处理；没有脚本时回渠道首页
 * 页面里不含个人信息，按语言缓存。
 */
export function SettingsPage(props: { channel: Channel; lang: Lang; providerName: string }) {
  const { lang, channel } = props;
  const seg = (name: string, options: Array<[string, string]>) => (
    <div class="seg" role="radiogroup" data-units-group={name}>
      {options.map(([value, label]) => (
        <button type="button" role="radio" aria-checked="false" data-unit={value} dir="ltr">
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <Layout lang={lang} title={t(lang, 'SettingsTitle')} devNote={devNote(props.providerName)} pageData={{ channel, page: 'settings' }}>
      <header class="top">
        <div class="place">
          <a class="back" data-nav data-settings-back href={`/${channel}/?lang=${lang}`}>
            {G.back()}
            <span>{t(lang, 'Back')}</span>
          </a>
          <h1>
            <span>{t(lang, 'SettingsTitle')}</span>
          </h1>
        </div>
      </header>

      <section class="card settings">
        <Sec icon={G.thermo()} title={t(lang, 'TemperatureLabel')} />
        {seg('temp', [
          ['c', '°C'],
          ['f', '°F'],
        ])}
        <Sec icon={G.wind()} title={t(lang, 'WindSpeedLabel')} />
        {seg('wind', [
          ['kmh', 'km/h'],
          ['ms', 'm/s'],
          ['mph', 'mph'],
        ])}
      </section>

      <section class="card settings">
        <Sec icon={G.list()} title={t(lang, 'LanguageLabel')} />
        <div class="langs">
          {LANGUAGES.map((l) => (
            <a
              class="lang-row"
              data-lang-choice={l.code}
              href={`/${channel}/${l.code}/settings`}
              lang={intlLocale(l.code)}
              dir={textDirection(l.code)}
              aria-current={l.code === lang ? 'true' : undefined}
            >
              <span>{l.name}</span>
              {l.code === lang ? <span class="tick">✓</span> : null}
            </a>
          ))}
        </div>
      </section>
      <Footer lang={lang} providerName={props.providerName} />
    </Layout>
  );
}
