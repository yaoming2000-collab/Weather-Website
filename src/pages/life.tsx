import type { Child } from 'hono/jsx';
import { LIFE } from '../config/features';
import { bestHour, hourlyRatings, LIFE_INDEX_KEYS, type LifeIndex, type LifeIndexKey, type LifeInput, type LifeRating } from '../features/life';
import { intlLocale, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { cityPath } from '../routing/urls';
import { currentHourIndex, hourLabel, weekdayLabel } from '../time/cityTime';
import { aqiLevel, conditionKey } from '../weather/derive';
import { AdSlot, DASH, Footer, Icon, Layout, Precip, Sec, Speed, SubBar, Temp } from './components';
import { G } from './glyphs';
import { cityPageData, devNote, pageSky, type PageProps } from './home';
import { isPlaceholder } from './placeholders';

export const LIFE_GLYPH: Record<LifeIndexKey, () => Child> = {
  running: G.running,
  laundry: G.laundry,
  carwash: G.carwash,
  clothing: G.clothing,
  sunscreen: G.sunscreen,
};

const pct = (n: number | null | undefined) => (n === null || n === undefined ? DASH : `${Math.round(n)}%`);

function Fact(props: { label: string; children: Child }) {
  return (
    <div class="fact">
      <span>{props.label}</span>
      <b>{props.children}</b>
    </div>
  );
}

function Timeline(props: { items: Array<{ time: string; rating: LifeRating | null }>; lang: Lang }) {
  return (
    <div class="tl">
      <div class="tl-bars">
        {props.items.map((x) => (
          <span class={x.rating ?? 'none'} title={`${hourLabel(x.time)}`} />
        ))}
      </div>
      <div class="tl-axis">
        {props.items
          .filter((_, i) => i % 3 === 0)
          .map((x) => (
            <bdi>{hourLabel(x.time)}</bdi>
          ))}
      </div>
    </div>
  );
}

/** 单个生活指数 /w/{id}/life/{指数} */
export function LifePage(p: PageProps & { indexKey: LifeIndexKey }) {
  const { bundle, channel, lang, features } = p;
  const loc = bundle.location;
  const key = p.indexKey;
  const idx: LifeIndex | undefined = features.life.find((x) => x.key === key);
  const title = t(lang, `LifeTitle_${key}`);
  const c = bundle.current.data;
  const today = features.days[0];
  const input: LifeInput = { current: c, hourly: bundle.hourly?.data, daily: features.days, air: bundle.air?.data, nowMs: p.nowMs };
  const hourlyKey = key === 'running' || key === 'laundry' || key === 'sunscreen' ? key : null;
  const hours = bundle.hourly?.data ?? [];
  const hi = currentHourIndex(hours.map((h) => h.time), p.nowMs);
  // 逐小时预报没取到（占位数据）时时间条显示成灰色，不能用空值算出"适合"
  const noHourly = !hours[0] || isPlaceholder(hours[0]);
  const ratings: Array<{ time: string; rating: LifeRating | null }> = !hourlyKey
    ? []
    : noHourly
      ? (hi === -1 ? [] : hours.slice(hi, hi + 12)).map((h) => ({ time: h.time, rating: null }))
      : hourlyRatings(hourlyKey, input);
  const best = key === 'sunscreen' || noHourly ? null : bestHour(ratings as Array<{ time: string; rating: LifeRating }>);
  const next3 = hi === -1 ? [] : hours.slice(hi, hi + 3);
  const aq = bundle.air?.data[Math.max(0, currentHourIndex((bundle.air?.data ?? []).map((a) => a.time), p.nowMs))] ?? null;
  const aqL = aqiLevel(aq?.aqi ?? null);
  const maxProb = (xs: Array<number | null | undefined>) => {
    const n = xs.filter((v): v is number => typeof v === 'number');
    return n.length ? Math.max(...n) : null;
  };
  const intl = intlLocale(lang);

  let facts: Child = null;
  if (key === 'running') {
    facts = (
      <>
        <Fact label={t(lang, 'WeatherFeelsLike')}>
          <Temp c={c.feelsLike} />
        </Fact>
        <Fact label={t(lang, 'LifeRainNext3h')}>{pct(maxProb([c.precipProb, ...next3.map((h) => h.precipProb)]))}</Fact>
        <Fact label={t(lang, 'WeatherAirQuality')}>
          {aq?.aqi ?? DASH} {aqL ? t(lang, aqL.key) : ''}
        </Fact>
        <Fact label={t(lang, 'WeatherWind')}>
          <Speed ms={c.windSpeed} />
        </Fact>
        <Fact label={t(lang, 'WeatherHumidity')}>{pct(c.humidity)}</Fact>
      </>
    );
  } else if (key === 'laundry') {
    facts = (
      <>
        <Fact label={t(lang, 'ChanceOfPrecip')}>{pct(today?.precipProb)}</Fact>
        <Fact label={t(lang, 'WeatherHumidity')}>{pct(c.humidity)}</Fact>
        <Fact label={t(lang, 'WeatherWind')}>
          <Speed ms={c.windSpeed} />
        </Fact>
        <Fact label={t(lang, 'Temperature')}>
          <Temp c={c.temperature} />
        </Fact>
      </>
    );
  } else if (key === 'carwash') {
    facts = (
      <>
        {features.days.slice(0, 7).map((d, i) => (
          <div class={`fact day-fact${i < LIFE.carwash.days ? ' hot' : ''}`}>
            <span>
              <span data-weekday={d.date}>{weekdayLabel(d.date, intl)}</span>
            </span>
            <Icon icon={d.icon} size={26} alt={t(lang, conditionKey(d.icon))} />
            <b>
              {pct(d.precipProb)}
              {d.precipAccum ? (
                <small>
                  {' '}
                  <Precip mm={d.precipAccum} />
                </small>
              ) : null}
            </b>
          </div>
        ))}
      </>
    );
  } else if (key === 'clothing') {
    const feels = c.feelsLike ?? c.temperature;
    facts = (
      <>
        <Fact label={t(lang, 'WeatherFeelsLike')}>
          <Temp c={c.feelsLike} />
        </Fact>
        <Fact label={t(lang, 'LifeFeelsToday')}>
          <bdi>
            <Temp c={today?.minFeelsLike ?? today?.minTemp} /> – <Temp c={today?.maxFeelsLike ?? today?.maxTemp} />
          </bdi>
        </Fact>
        <Fact label={t(lang, 'WeatherWind')}>
          <Speed ms={c.windSpeed} />
        </Fact>
        <div class="bands">
          {LIFE.clothing.map((b) => (
            <span class={feels !== null && idx?.summaryKey === `Life_clothing_${b.band}` ? 'on' : ''}>{t(lang, `Life_clothing_${b.band}`)}</span>
          ))}
        </div>
      </>
    );
  } else {
    facts = (
      <>
        <Fact label={t(lang, 'LifeUvNow')}>{c.uvIndex === null ? DASH : Math.round(c.uvIndex)}</Fact>
        <Fact label={t(lang, 'LifeUvMaxToday')}>{today?.uvIndex === null || today?.uvIndex === undefined ? DASH : Math.round(today.uvIndex)}</Fact>
        {idx?.rating ? <p class="tip">{t(lang, `SunTip_${idx.rating}`)}</p> : null}
      </>
    );
  }

  return (
    <Layout lang={lang} title={`${title} · ${loc.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={{ ...cityPageData(p), page: 'life' }}>
      <SubBar location={loc} channel={channel} lang={lang} title={title} />

      <section class={`card life-hero ${idx?.rating ?? 'none'}`}>
        <span class="ico">{LIFE_GLYPH[key]()}</span>
        <div>
          <p class="verdict">
            {idx?.rating ? <i class={`dot ${idx.rating}`} /> : null}
            {idx?.summaryKey ? t(lang, idx.summaryKey) : DASH}
          </p>
          <p class="why">{idx?.reasonKey ? t(lang, idx.reasonKey, idx.vars) : t(lang, 'Unavailable')}</p>
        </div>
      </section>

      {hourlyKey ? (
        <section class="card">
          <Sec icon={G.clock()} title={t(lang, 'LifeNext12h')} />
          {key !== 'sunscreen' ? (
            <p class="lead">{noHourly ? DASH : best ? t(lang, 'LifeBestTime', { time: hourLabel(best) }) : t(lang, 'LifeNoGoodTime')}</p>
          ) : null}
          <Timeline items={ratings} lang={lang} />
          <div class="legend">
            <span>
              <i class="dot good" />
              {t(lang, `Life_${key}_good`)}
            </span>
            <span>
              <i class="dot fair" />
              {t(lang, `Life_${key}_fair`)}
            </span>
            <span>
              <i class="dot poor" />
              {t(lang, `Life_${key}_poor`)}
            </span>
          </div>
        </section>
      ) : null}

      <AdSlot slot="life_1" lang={lang} />

      <section class="card facts">
        <Sec icon={key === 'carwash' ? G.umbrella() : G.thermo()} title={t(lang, key === 'carwash' ? 'LifeRainWeek' : 'LifeWhy')} />
        {facts}
      </section>

      <section class="card">
        <Sec icon={G.sun()} title={t(lang, 'LifeMore')} />
        <div class="life">
          {LIFE_INDEX_KEYS.filter((k) => k !== key).map((k) => {
            const x = features.life.find((l) => l.key === k);
            return (
              <a data-nav href={cityPath(channel, lang, loc.id, `life/${k}`)}>
                <span class="ico">{LIFE_GLYPH[k]()}</span>
                <span class="n">
                  <b>{t(lang, `LifeTitle_${k}`)}</b>
                  <span>{x?.reasonKey ? t(lang, x.reasonKey, x.vars) : DASH}</span>
                </span>
                <span class="r">
                  {x?.rating ? <i class={`dot ${x.rating}`} /> : null}
                  {x?.summaryKey ? t(lang, x.summaryKey) : DASH}
                  {G.chevron('flip')}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <AdSlot slot="life_2" lang={lang} />
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}
