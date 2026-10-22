import type { Channel } from '../config/channels';
import { intlLocale, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { hourLabel, weekdayLabel } from '../time/cityTime';
import { aqiLevel, aqiPercent, conditionKey, tempRange, uvLevelKey, windDirText } from '../weather/derive';
import { backgroundFor } from '../weather/icons';
import { AdSlot, DASH, Footer, Icon, Layout, Precip, Speed, SubBar, Temp } from './components';
import { cityPageData, DayRow, devNote, type PageProps } from './home';

const pct = (n: number | null | undefined) => (n === null || n === undefined ? DASH : `${Math.round(n)}%`);

/** 逐小时详情 /w/{id}/hourly */
export function HourlyPage(p: PageProps) {
  const { bundle, channel, lang } = p;
  const hours = bundle.hourly?.data ?? [];
  const title = t(lang, 'Next24Hours');
  const row = (h: (typeof hours)[number], i: number) => (
    <div class="row" data-time={h.time}>
      <span>{i === 0 ? t(lang, 'NowLabel') : <bdi>{hourLabel(h.time)}</bdi>}</span>
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
    <Layout lang={lang} title={`${title} · ${bundle.location.name}`} bg={backgroundFor(bundle.current.data.icon)} devNote={devNote(p.providerName)} pageData={cityPageData(p)}>
      <SubBar location={bundle.location} channel={channel} lang={lang} title={title} />
      <section class="card">{hours.slice(0, 12).map(row)}</section>
      <AdSlot slot="sub_1" lang={lang} />
      <section class="card">{hours.slice(12).map((h, i) => row(h, i + 12))}</section>
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
    <Layout lang={lang} title={`${title} · ${bundle.location.name}`} bg={backgroundFor(bundle.current.data.icon)} devNote={devNote(p.providerName)} pageData={cityPageData(p)}>
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
  const points = bundle.air?.data ?? [];
  const now = points[0] ?? null;
  const level = aqiLevel(now?.aqi ?? null);
  const max = Math.max(100, ...points.map((a) => a.aqi ?? 0));
  const title = t(lang, 'WeatherAirQuality');
  return (
    <Layout lang={lang} title={`${title} · ${bundle.location.name}`} bg={backgroundFor(bundle.current.data.icon)} devNote={devNote(p.providerName)} pageData={cityPageData(p)}>
      <SubBar location={bundle.location} channel={channel} lang={lang} title={title} />
      <section class="card">
        <div style="display:flex;align-items:baseline;gap:12px">
          <span class="aqv" style="font-size:56px">{now?.aqi ?? DASH}</span>
          <span style={`color:${level?.color ?? 'inherit'};font-weight:600`}>{level ? t(lang, level.key) : t(lang, 'Unavailable')}</span>
        </div>
        <div class="meter">{now?.aqi !== null && now?.aqi !== undefined ? <b style={`inset-inline-start:${aqiPercent(now.aqi).toFixed(1)}%`} /> : null}</div>
        {now?.pollutant ? (
          <div class="sub" style="color:var(--mut);font-size:13px">
            {t(lang, 'MainPollutant')}: {now.pollutant.replace('Particulate matter <2.5um', 'PM2.5').replace('Particulate matter <10um', 'PM10')}
          </div>
        ) : null}
      </section>

      <section class="card">
        <h2>{t(lang, 'AirQualityNext24')}</h2>
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
        <h2>{t(lang, 'Pollutants')}</h2>
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
    <Layout lang={lang} title={t(lang, 'MyCitiesTitle')} bg="night-cloudy" devNote={devNote(props.providerName)} pageData={{ channel, page: 'cities' }}>
      <header class="top">
        <div class="place">
          <a class="back" data-nav href={`/${channel}/?lang=${lang}`}>
            {lang === 'ar' || lang === 'he' ? '→' : '←'} {t(lang, 'CurrentLocation')}
          </a>
          <h1>{t(lang, 'MyCitiesTitle')}</h1>
        </div>
      </header>
      <form class="search" role="search" data-search>
        <input type="search" name="q" autocomplete="off" placeholder={t(lang, 'SearchCityWorldwidePlaceholder')} aria-label={t(lang, 'SearchCityWorldwidePlaceholder')} />
      </form>
      <section class="card" data-search-results hidden></section>
      <section class="card" data-saved-list>
        <div class="empty">{t(lang, 'LoadingSavedCities')}</div>
      </section>
      <AdSlot slot="cities_1" lang={lang} />
      <Footer lang={lang} providerName={props.providerName} />
    </Layout>
  );
}

export function MessagePage(props: { lang: Lang; titleKey: string; textKey: string }) {
  const { lang } = props;
  return (
    <Layout lang={lang} title={t(lang, props.titleKey)} bg="night-cloudy" pageData={{}}>
      <section class="msg">
        <h1>{t(lang, props.titleKey)}</h1>
        <p style="color:var(--mut)">{t(lang, props.textKey)}</p>
        <a class="btn" href="/">
          {t(lang, 'BackToHome')}
        </a>
      </section>
    </Layout>
  );
}
