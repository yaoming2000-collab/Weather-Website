import type { Channel } from '../config/channels';
import { intlLocale, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { cityPath } from '../routing/urls';
import { hourLabel, weekdayLabel } from '../time/cityTime';
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
import { backgroundFor } from '../weather/icons';
import type { CityBundle } from '../weather/service';
import type { DailyPoint } from '../weather/types';
import { AdSlot, DASH, Footer, Icon, Layout, Speed, Temp, TopBar } from './components';

export interface PageProps {
  bundle: CityBundle;
  channel: Channel;
  lang: Lang;
  providerName: string;
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

/** 一天的温度条 */
export function DayRow(props: { d: DailyPoint; lang: Lang; range: { min: number; span: number } }) {
  const { d, lang, range } = props;
  const lo = d.minTemp ?? d.maxTemp ?? 0;
  const hi = d.maxTemp ?? d.minTemp ?? 0;
  const left = ((lo - range.min) / range.span) * 100;
  const width = Math.max(4, ((hi - lo) / range.span) * 100);
  return (
    <div class="day" data-date={d.date}>
      <span class="wd" data-weekday={d.date}>
        {weekdayLabel(d.date, intlLocale(lang))}
      </span>
      <Icon icon={d.icon} size={30} alt={t(lang, conditionKey(d.icon))} />
      <span class="p">{d.precipProb !== null && d.precipProb >= 30 ? `${Math.round(d.precipProb)}%` : ''}</span>
      <span class="lo">
        <Temp c={d.minTemp} />
      </span>
      <span class="bar">
        <i style={`inset-inline-start:${left.toFixed(1)}%;width:${width.toFixed(1)}%;background:${tempGradient(lo, hi)}`} />
      </span>
      <span class="hi">
        <Temp c={d.maxTemp} />
      </span>
    </div>
  );
}

function Compass(props: { deg: number | null }) {
  const rot = props.deg === null ? 0 : (props.deg + 180) % 360;
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" />
      <text x="32" y="12" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.7)">N</text>
      <text x="56" y="35" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.5)">E</text>
      <text x="32" y="59" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.5)">S</text>
      <text x="8" y="35" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.5)">W</text>
      {props.deg === null ? null : (
        <path d="M32 14 L37 34 L32 30 L27 34 Z" fill="#fff" transform={`rotate(${rot} 32 32)`} />
      )}
    </svg>
  );
}

function Gauge(props: { percent: number }) {
  // 半圆表盘，-120° 到 +120°
  const angle = -120 + (props.percent / 100) * 240;
  return (
    <svg viewBox="0 0 64 44" width="72" height="50" aria-hidden="true">
      <path d="M8 38 A26 26 0 1 1 56 38" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="5" stroke-linecap="round" />
      <line x1="32" y1="32" x2="32" y2="12" stroke="#fff" stroke-width="3" stroke-linecap="round" transform={`rotate(${angle.toFixed(1)} 32 32)`} />
    </svg>
  );
}

export function HomePage(p: PageProps) {
  const { bundle, channel, lang } = p;
  const { location: loc, current, hourly, daily, air } = bundle;
  const c = current.data;
  const today = daily?.data.find((d) => d.date === bundle.today) ?? daily?.data[0];
  const week = (daily?.data ?? []).slice(0, 7);
  const range = tempRange(week);
  const aq = air?.data[0] ?? null;
  const aqLevel = aqiLevel(aq?.aqi ?? null);
  const uvKey = uvLevelKey(c.uvIndex);
  const pKey = pressureKey(c.pressure);

  return (
    <Layout
      lang={lang}
      title={t(lang, 'CityWeatherTitle', { city: loc.name })}
      bg={backgroundFor(c.icon)}
      devNote={devNote(p.providerName)}
      pageData={cityPageData(p)}
      preloadIcon={c.icon}
    >
      <TopBar location={loc} channel={channel} lang={lang} />

      <section class="hero" data-current>
        <Icon icon={c.icon} size={112} cls="icon" eager alt="" />
        <div class="temp" data-current-temp>
          <Temp c={c.temperature} />
        </div>
        <div class="cond" data-current-cond>
          {t(lang, conditionKey(c.icon))}
        </div>
        <div class="hl">
          {t(lang, 'HighShort')}:<Temp c={today?.maxTemp} /> · {t(lang, 'LowShort')}:<Temp c={today?.minTemp} />
        </div>
        <div class="upd" data-fetched={String(current.fetchedAt)}>
          {t(lang, 'UpdatedJustNow')}
        </div>
      </section>

      <section class="card">
        <h2>
          {t(lang, 'HourlyForecastTitle')}
          <a data-nav href={cityPath(channel, lang, loc.id, 'hourly')}>
            {t(lang, 'SeeHourlyDetails')} ›
          </a>
        </h2>
        <div class="hours">
          {(hourly?.data ?? []).map((h, i) => (
            <div class="hour" data-time={h.time}>
              <div class="t" data-hour-label={hourLabel(h.time)}>
                {i === 0 ? t(lang, 'NowLabel') : hourLabel(h.time)}
              </div>
              <Icon icon={h.icon} size={34} alt={t(lang, conditionKey(h.icon))} />
              <div class="v">
                <Temp c={h.temperature} />
              </div>
              <div class="p">{h.precipProb !== null && h.precipProb >= 30 ? `${Math.round(h.precipProb)}%` : ''}</div>
            </div>
          ))}
        </div>
      </section>

      <AdSlot slot="home_1" height={100} lang={lang} />

      <section class="card">
        <h2>
          {t(lang, 'DailyForecastTitle')}
          <a data-nav href={cityPath(channel, lang, loc.id, '15day')}>
            {t(lang, 'SeeAll15Days')} ›
          </a>
        </h2>
        {week.map((d) => (
          <DayRow d={d} lang={lang} range={range} />
        ))}
      </section>

      <AdSlot slot="home_2" lang={lang} />

      <a class="card" data-nav href={cityPath(channel, lang, loc.id, 'air')}>
        <h2>
          {t(lang, 'WeatherAirQuality')}
          <span class="more">{t(lang, 'SeeDetails')} ›</span>
        </h2>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span class="aqv">{aq?.aqi ?? DASH}</span>
          <span>{aqLevel ? t(lang, aqLevel.key) : t(lang, 'Unavailable')}</span>
        </div>
        <div class="meter">{aq?.aqi !== null && aq?.aqi !== undefined ? <b style={`inset-inline-start:${aqiPercent(aq.aqi).toFixed(1)}%`} /> : null}</div>
      </a>

      <div class="grid">
        <div class="tile">
          <h3>{t(lang, 'WeatherFeelsLike')}</h3>
          <div class="big">
            <Temp c={c.feelsLike} />
          </div>
          <div class="note">{t(lang, feelsKey(c.temperature, c.feelsLike))}</div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'WeatherHumidity')}</h3>
          <div class="big">{c.humidity === null ? DASH : `${Math.round(c.humidity)}%`}</div>
          <div class="note">{t(lang, humidityKey(c.humidity))}</div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'WeatherWind')}</h3>
          <div style="display:flex;align-items:center;gap:10px">
            <Compass deg={c.windDir} />
            <div>
              <div style="font-size:18px;font-weight:600">
                <Speed ms={c.windSpeed} />
              </div>
              <div class="note">
                {windDirText(c.windDir)}
                {c.windGust !== null ? (
                  <span>
                    {' '}
                    · {t(lang, 'WindGustPrefix')} <Speed ms={c.windGust} />
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'WeatherPressure')}</h3>
          <Gauge percent={pressurePercent(c.pressure)} />
          <div style="font-size:18px;font-weight:600">
            <bdi>{c.pressure === null ? DASH : `${Math.round(c.pressure)} hPa`}</bdi>
          </div>
          <div class="note">{pKey ? t(lang, pKey) : ''}</div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'WeatherVisibility')}</h3>
          <div class="big">
            <bdi>{c.visibility === null ? DASH : `${Math.round(c.visibility / 1000)} km`}</bdi>
          </div>
          <div class="note">{t(lang, visibilityKey(c.visibility))}</div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'WeatherUVIndex')}</h3>
          <div class="big">{c.uvIndex === null ? DASH : Math.round(c.uvIndex)}</div>
          <div class="meter uvm">{c.uvIndex !== null ? <b style={`inset-inline-start:${Math.min(100, (c.uvIndex / 11) * 100).toFixed(1)}%`} /> : null}</div>
          <div class="note">{uvKey ? t(lang, uvKey) : ''}</div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'WeatherSunrise')}</h3>
          <div class="big">
            <bdi>{today?.sunrise?.slice(0, 5) ?? DASH}</bdi>
          </div>
          <div class="note">
            {t(lang, 'WeatherSunset')} <bdi>{today?.sunset?.slice(0, 5) ?? DASH}</bdi>
          </div>
        </div>
        <div class="tile">
          <h3>{t(lang, 'ChanceOfPrecip')}</h3>
          <div class="big">{today?.precipProb === null || today?.precipProb === undefined ? DASH : `${Math.round(today.precipProb)}%`}</div>
          <div class="note">{t(lang, 'TodayLabel')}</div>
        </div>
      </div>

      <AdSlot slot="home_3" lang={lang} />

      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}
