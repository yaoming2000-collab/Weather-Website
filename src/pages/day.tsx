import { intlLocale, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { cityPath } from '../routing/urls';
import { weekdayLabel } from '../time/cityTime';
import { conditionKey, tempRange, uvLevelKey, windDirText } from '../weather/derive';
import type { DailyPoint } from '../weather/types';
import { AdSlot, DASH, EarlyUnits, Footer, Icon, Layout, Precip, Sec, Speed, SubBar, Temp } from './components';
import { G } from './glyphs';
import { placeholderDayHours } from './placeholders';
import { cityPageData, Compass, DayRow, devNote, HourlyStrip, Jump, pageSky, rich, type PageProps } from './home';

/** 日期："10月27日 星期二"之类，按语言格式化 */
export function longDate(date: string, lang: Lang): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? DASH : `${Math.round(n)}%`);

/** 月相名称和图标 */
function moonKey(deg: number): string {
  const p = ((deg % 360) + 360) % 360;
  if (p < 12 || p >= 348) return 'MoonNew';
  if (p < 78) return 'MoonWaxingCrescent';
  if (p < 102) return 'MoonFirstQuarter';
  if (p < 168) return 'MoonWaxingGibbous';
  if (p < 192) return 'MoonFull';
  if (p < 258) return 'MoonWaningGibbous';
  if (p < 282) return 'MoonLastQuarter';
  return 'MoonWaningCrescent';
}

function MoonIcon(props: { deg: number }) {
  // 亮面：外侧半圆 + 明暗交界线（椭圆弧）。上弦前后右边亮（北半球视角），下弦前后左边亮。
  const p = ((props.deg % 360) + 360) % 360;
  const lit = (1 - Math.cos((p * Math.PI) / 180)) / 2;
  const waxing = p < 180;
  const rx = (Math.abs(1 - 2 * lit) * 20).toFixed(1);
  const outerSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (lit < 0.5 ? 0 : 1) : lit < 0.5 ? 1 : 0;
  return (
    <svg viewBox="0 0 60 60" width="64" height="64" aria-hidden="true">
      <circle cx="30" cy="30" r="20" fill="rgba(255,255,255,.14)" />
      {lit > 0.02 ? <path d={`M30 10 A20 20 0 0 ${outerSweep} 30 50 A${rx} 20 0 0 ${termSweep} 30 10 Z`} fill="#f4f0dc" /> : null}
    </svg>
  );
}

/** 明天、后天的详情页 */
export function DayPage(p: PageProps & { offset: 1 | 2 }) {
  const { bundle, channel, lang, features } = p;
  const d = features.days[p.offset];
  const loc = bundle.location;
  const sub = p.offset === 1 ? 'tomorrow' : 'day-after';
  const title = p.offset === 1 ? t(lang, 'TomorrowLabel') : weekdayLabel(d?.date ?? bundle.today, intlLocale(lang), 'long');
  const realHours = (bundle.hourly?.data ?? []).filter((h) => d && h.time.startsWith(d.date));
  // 逐小时预报覆盖不到这一天时用占位小时，区块不消失
  const hours = realHours.length > 0 || !d ? realHours : placeholderDayHours(d.date, loc.timezone);
  const uvKey = d ? uvLevelKey(d.uvIndex) : null;

  return (
    <Layout lang={lang} title={`${title} · ${loc.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={{ ...cityPageData(p), page: 'day' }}>
      <SubBar location={loc} channel={channel} lang={lang} title={title} />
      <Jump p={p} active={sub} />
      {!d ? (
        <section class="card">
          <p>{t(lang, 'Unavailable')}</p>
        </section>
      ) : (
        <>
          <section class="hero day-hero">
            <p class="date" data-weekday-long={d.date}>
              {longDate(d.date, lang)}
            </p>
            <Icon icon={d.icon} size={96} cls="big-ico" eager alt="" />
            <p class="cond">{t(lang, conditionKey(d.icon))}</p>
            <p class="range">
              <Temp c={d.maxTemp} />
              <span class="sep">/</span>
              <Temp c={d.minTemp} />
            </p>
            {/* 明天、后天不显示去年那天的温度（那是以后的题的答案，Darren 2026-10-29），只引导去猜今天 */}
            <a class="vs" data-nav href={cityPath(channel, lang, loc.id, 'climate')} style="--lv:var(--faint)">
              <i />
              <span>{t(lang, 'ClimateTeaser')}</span>
              {G.chevron('flip')}
            </a>
          </section>
          <EarlyUnits />

          {hours.length > 0 ? (
            <section class="card">
              <Sec icon={G.clock()} title={t(lang, 'HourlyForecastTitle')} />
              <HourlyStrip hours={hours} days={features.days} lang={lang} nowMs={p.nowMs} />
            </section>
          ) : null}

          <AdSlot slot="day_1" lang={lang} />

          <div class="grid">
            <div class="tile">
              <Sec tag="h3" icon={G.umbrella()} title={t(lang, 'ChanceOfPrecip')} />
              <div class="big">{pct(d.precipProb)}</div>
              <div class="note">
                {t(lang, 'Precipitation')} <b><Precip mm={d.precipAccum} /></b>
                {d.snowAccum ? (
                  <span>
                    {', '}
                    {t(lang, 'Snowfall')} <b><Precip mm={d.snowAccum} /></b>
                  </span>
                ) : null}
              </div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.thermo()} title={t(lang, 'WeatherFeelsLike')} />
              <div class="big">
                <Temp c={d.maxFeelsLike} />
              </div>
              <div class="note">
                {t(lang, 'LowShort')} <Temp c={d.minFeelsLike} />
              </div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.wind()} title={t(lang, 'WeatherWind')} />
              <div class="viz">
                <Compass deg={d.windDir ?? null} />
              </div>
              <div class="note">
                <b>
                  <Speed ms={d.maxWindSpeed} />
                </b>{' '}
                {windDirText(d.windDir ?? null)}
                {d.maxWindGust ? (
                  <span>
                    {', '}
                    {t(lang, 'WindGustPrefix')} <Speed ms={d.maxWindGust} />
                  </span>
                ) : null}
              </div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.drop()} title={t(lang, 'WeatherHumidity')} />
              <div class="big">
                {d.maxHumidity === null || d.maxHumidity === undefined ? DASH : Math.round(d.maxHumidity)}
                <small>%</small>
              </div>
              <div class="note">
                {t(lang, 'LowShort')} {pct(d.minHumidity)}
              </div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.sun()} title={t(lang, 'WeatherUVIndex')} />
              <div class="big">{d.uvIndex === null ? DASH : Math.round(d.uvIndex)}</div>
              <div class="meter uvm">{d.uvIndex !== null ? <b style={`inset-inline-start:${Math.min(100, (d.uvIndex / 11) * 100).toFixed(1)}%`} /> : null}</div>
              <div class="note">{uvKey ? t(lang, uvKey) : ''}</div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.sunrise()} title={t(lang, 'Daylight')} />
              <div class="big">
                <bdi>{d.sunrise?.slice(0, 5) ?? DASH}</bdi>
              </div>
              <div class="note">
                {t(lang, 'WeatherSunset')} <bdi>{d.sunset?.slice(0, 5) ?? DASH}</bdi>
                {d.sunHours !== null && d.sunHours !== undefined ? (
                  <span>
                    <br />
                    {t(lang, 'SunHours', { n: Math.round(d.sunHours * 10) / 10 })}
                  </span>
                ) : null}
              </div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.rainfall()} title={t(lang, 'CloudCover')} />
              <div class="big">
                {d.cloudiness === null || d.cloudiness === undefined ? DASH : Math.round(d.cloudiness)}
                <small>%</small>
              </div>
              <div class="note">{t(lang, conditionKey(d.icon))}</div>
            </div>
            <div class="tile">
              <Sec tag="h3" icon={G.eye()} title={t(lang, 'MoonPhase')} />
              {d.moonPhase !== null && d.moonPhase !== undefined ? (
                <>
                  <div class="viz">
                    <MoonIcon deg={d.moonPhase} />
                  </div>
                  <div class="note">
                    <b>{t(lang, moonKey(d.moonPhase))}</b>
                    <br />
                    {d.moonrise ? (
                      <span>
                        ↑ <bdi>{d.moonrise.slice(0, 5)}</bdi>{' '}
                      </span>
                    ) : null}
                    {d.moonset ? (
                      <span>
                        ↓ <bdi>{d.moonset.slice(0, 5)}</bdi>
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div class="big">{DASH}</div>
              )}
            </div>
          </div>

          <AdSlot slot="day_2" lang={lang} />
        </>
      )}
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}

/** 7 天总览 /w/{id}/week */
export function WeekPage(p: PageProps) {
  const { bundle, channel, lang, features } = p;
  const loc = bundle.location;
  const week = features.days.slice(0, 7);
  const title = t(lang, 'WeekTitle');
  const withMax = week.filter((d) => d.maxTemp !== null);
  const withMin = week.filter((d) => d.minTemp !== null);
  const warmest = withMax.reduce<DailyPoint | null>((a, d) => (!a || d.maxTemp! > a.maxTemp! ? d : a), null);
  const coldest = withMin.reduce<DailyPoint | null>((a, d) => (!a || d.minTemp! < a.minTemp! ? d : a), null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgHi = avg(withMax.map((d) => d.maxTemp!));
  const avgLo = avg(withMin.map((d) => d.minTemp!));
  // 一天的降水概率都没有时显示 --，不显示 0 天
  const rainy = week.some((d) => d.precipProb !== null) ? week.filter((d) => (d.precipProb ?? 0) >= 50).length : DASH;
  const total = week.reduce((a, d) => a + (d.precipAccum ?? 0), 0);
  const range = tempRange(week);
  const subFor = (i: number) => (i === 0 ? '' : i === 1 ? 'tomorrow' : i === 2 ? 'day-after' : null);
  const intl = intlLocale(lang);
  const short = new Intl.DateTimeFormat(intl, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dateOf = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return short.format(new Date(Date.UTC(y, m - 1, d, 12)));
  };

  return (
    <Layout lang={lang} title={`${title} · ${loc.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={{ ...cityPageData(p), page: 'week' }}>
      <SubBar location={loc} channel={channel} lang={lang} title={title} />
      <Jump p={p} active="week" />

      <section class="hero week-hero">
        <p class="range big">
          <Temp c={warmest?.maxTemp} />
          <span class="sep">/</span>
          <Temp c={coldest?.minTemp} />
        </p>
        <p class="hl-line">
          {t(lang, 'WeekAverage')} <b><Temp c={avgHi} /></b> / <b><Temp c={avgLo} /></b>
        </p>
        <p class="feels">
          {t(lang, 'WeekRainyDays', { n: rainy })}
          {total > 0 ? (
            <span>
              {', '}
              {t(lang, 'WeekTotalPrecip')} <Precip mm={Math.round(total * 10) / 10} />
            </span>
          ) : null}
        </p>
      </section>
      <EarlyUnits />

      <div class="grid">
        {[
          [warmest, 'WeekWarmest', warmest?.maxTemp],
          [coldest, 'WeekColdest', coldest?.minTemp],
        ].map(([d, key, temp]) => {
          const day = d as DailyPoint | null;
          return (
            <div class="tile short">
              <Sec tag="h3" icon={key === 'WeekWarmest' ? G.sun() : G.thermo()} title={t(lang, key as string)} />
              <div class="big">
                <Temp c={temp as number | null | undefined} />
              </div>
              <div class="note">
                {day ? (
                  <span>
                    <span data-weekday={day.date}>{weekdayLabel(day.date, intl, 'long')}</span>, {t(lang, conditionKey(day.icon))}
                  </span>
                ) : (
                  DASH
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AdSlot slot="week_1" lang={lang} />

      <section class="card">
        <Sec icon={G.calendar()} title={t(lang, 'DayByDay')} />
        {week.map((d, i) => {
          const sub = subFor(i);
          const body = (
            <>
              <DayRow d={d} lang={lang} range={range} />
              <div class="wk-facts">
                <span>
                  <bdi>{dateOf(d.date)}</bdi>
                </span>
                <span>
                  {G.umbrella()} {pct(d.precipProb)}
                </span>
                {d.precipAccum ? (
                  <span>
                    <Precip mm={d.precipAccum} />
                  </span>
                ) : null}
                <span>
                  {G.wind()} <Speed ms={d.maxWindSpeed} />
                </span>
                {d.maxHumidity !== null && d.maxHumidity !== undefined ? (
                  <span>
                    {G.drop()} {pct(d.maxHumidity)}
                  </span>
                ) : null}
              </div>
            </>
          );
          return sub !== null ? (
            <a class="wk" data-nav href={cityPath(channel, lang, loc.id, sub || undefined)}>
              {body}
            </a>
          ) : (
            <div class="wk">{body}</div>
          );
        })}
      </section>

      <a class="card more-link" data-nav href={cityPath(channel, lang, loc.id, '15day')}>
        <Sec icon={G.calendar()} title={t(lang, 'DailyForecast15Title')} more={t(lang, 'SeeAll15Days')} />
      </a>

      <AdSlot slot="week_2" lang={lang} />
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}
