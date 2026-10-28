import type { Child } from 'hono/jsx';
import type { Channel } from '../config/channels';
import { CLIMATE_LEVEL_COLORS, GUESS } from '../config/features';
import { guessButtonKey, type ClimateSeriesPoint, type GuessChoice } from '../features/climate';
import type { AnomalyRecord, Ranking } from '../features/store';
import { intlLocale, textDirection, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { cityPath, rankingPath } from '../routing/urls';
import { AdSlot, Footer, Layout, Sec, SubBar, Temp } from './components';
import { G } from './glyphs';
import { cityPageData, Delta, devNote, pageSky, rich, type PageProps } from './home';

const CHOICES: GuessChoice[] = ['colder', 'same', 'warmer'];

/** 温度计式图：灰色是往年同日的平均最低到最高，两个圆点是今天的预报最低、最高 */
function Thermometer(props: { lang: Lang; avgMin: number | null; avgMax: number; min: number | null; max: number; color: string }) {
  const vals = [props.avgMin, props.avgMax, props.min, props.max].filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...vals) - 2);
  const hi = Math.ceil(Math.max(...vals) + 2);
  const at = (v: number) => (((v - lo) / (hi - lo)) * 100).toFixed(1);
  return (
    <div class="thermo">
      <div class="track">
        {props.avgMin !== null ? (
          <span class="usual" style={`inset-inline-start:${at(props.avgMin)}%;width:${(Number(at(props.avgMax)) - Number(at(props.avgMin))).toFixed(1)}%`} />
        ) : null}
        {props.min !== null ? <b class="pt lo" style={`inset-inline-start:${at(props.min)}%`} /> : null}
        <b class="pt hi" style={`inset-inline-start:${at(props.max)}%;--lv:${props.color}`} />
      </div>
      <div class="marks">
        {props.min !== null ? (
          <span style={`inset-inline-start:${at(props.min)}%`}>
            <Temp c={props.min} />
          </span>
        ) : null}
        <span class="strong" style={`inset-inline-start:${at(props.max)}%`}>
          <Temp c={props.max} />
        </span>
      </div>
      <div class="legend">
        <span>
          <i class="sw usual" />
          {t(props.lang, 'ClimateUsualRange')}{' '}
          {props.avgMin !== null ? (
            <bdi>
              <Temp c={props.avgMin} /> – <Temp c={props.avgMax} />
            </bdi>
          ) : null}
        </span>
        <span>
          <i class="sw" style={`background:${props.color}`} />
          {t(props.lang, 'ClimateTodayHigh')}
        </span>
        <span>
          <i class="sw lo" />
          {t(props.lang, 'ClimateTodayLow')}
        </span>
      </div>
    </div>
  );
}

/** 未来 15 天：预报最高温折线；灰色带是"和往年差不多"的范围（往年平均最高 ±2°） */
function SeriesChart(props: { series: ClimateSeriesPoint[]; lang: Lang }) {
  const pts = props.series.filter((s) => s.maxTemp !== null && s.avgMaxTemp !== null);
  if (pts.length < 3) return null;
  const rtl = textDirection(props.lang) === 'rtl';
  const W = 340;
  const H = 150;
  const top = 18;
  const bottom = 124;
  const vals = pts.flatMap((s) => [s.maxTemp!, s.avgMaxTemp! - 2, s.avgMaxTemp! + 2]);
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const x = (i: number) => {
    const v = 14 + (i / (pts.length - 1)) * (W - 28);
    return rtl ? W - v : v;
  };
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const band =
    pts.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(s.avgMaxTemp! + 2).toFixed(1)}`).join(' ') +
    ' ' +
    pts
      .map((s, i) => [x(i), y(s.avgMaxTemp! - 2)] as const)
      .reverse()
      .map(([a, b]) => `L${a.toFixed(1)} ${b.toFixed(1)}`)
      .join(' ') +
    ' Z';
  const line = pts.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(s.maxTemp!).toFixed(1)}`).join(' ');
  const usual = pts.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(s.avgMaxTemp!).toFixed(1)}`).join(' ');
  const narrow = new Intl.DateTimeFormat(intlLocale(props.lang), { weekday: 'narrow', timeZone: 'UTC' });
  const wd = (date: string) => {
    const [yy, m, d] = date.split('-').map(Number) as [number, number, number];
    return narrow.format(new Date(Date.UTC(yy, m - 1, d, 12)));
  };
  const extremes = new Set<number>();
  let iMax = 0;
  let iMin = 0;
  pts.forEach((s, i) => {
    if (s.maxTemp! > pts[iMax]!.maxTemp!) iMax = i;
    if (s.maxTemp! < pts[iMin]!.maxTemp!) iMin = i;
  });
  extremes.add(0).add(iMax).add(iMin);
  return (
    <svg class="series" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(props.lang, 'ClimateChartTitle')}>
      <path d={band} fill="rgba(255,255,255,.16)" />
      <path d={usual} fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2" stroke-dasharray="3 3" />
      <path d={line} fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
      {pts.map((s, i) => (
        <circle
          cx={x(i).toFixed(1)}
          cy={y(s.maxTemp!).toFixed(1)}
          r={s.level && s.level !== 'normal' ? '4.2' : '3'}
          fill={s.level && s.level !== 'normal' ? CLIMATE_LEVEL_COLORS[s.level] : '#fff'}
          stroke="#fff"
          stroke-width={s.level && s.level !== 'normal' ? '1.5' : '0'}
        />
      ))}
      {[...extremes].map((i) => (
        <text x={x(i).toFixed(1)} y={(y(pts[i]!.maxTemp!) - 8).toFixed(1)} text-anchor="middle" font-size="10.5" font-weight="600" fill="#fff">
          <tspan data-c={String(pts[i]!.maxTemp)}>{Math.round(pts[i]!.maxTemp!)}</tspan>°
        </text>
      ))}
      {pts.map((s, i) => (
        <text x={x(i).toFixed(1)} y="144" text-anchor="middle" font-size="9.5" fill="rgba(255,255,255,.6)">
          {wd(s.date)}
        </text>
      ))}
    </svg>
  );
}

/** 今天和往年比 /w/{id}/climate（重点功能） */
export function ClimatePage(p: PageProps) {
  const { bundle, channel, lang, features } = p;
  const loc = bundle.location;
  const cmp = features.comparison;
  const title = t(lang, 'ClimateTitle');
  const color = cmp ? CLIMATE_LEVEL_COLORS[cmp.level] : '#fff';
  const rain = features.rain;
  const verdictTpl = cmp ? t(lang, `ClimateVerdict_${cmp.wording}`) : '';

  return (
    <Layout lang={lang} title={`${title} · ${loc.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={{ ...cityPageData(p), page: 'climate' }}>
      <SubBar location={loc} channel={channel} lang={lang} title={title} />

      {!cmp ? (
        <section class="card">
          <p class="lead">{t(lang, 'ClimateUnavailable')}</p>
        </section>
      ) : (
        <>
          <section
            class="card guess"
            data-guess
            data-city={loc.id}
            data-date={cmp.date}
            data-answer={cmp.answer}
            data-min-votes={String(GUESS.minVotesForPercent)}
          >
            <Sec icon={G.thermo()} title={t(lang, 'GuessTitle')} />
            <p class="q">{t(lang, 'GuessQuestion', { city: loc.name })}</p>
            <div class="choices">
              {CHOICES.map((c) => (
                <button type="button" data-choice={c} class={`ch ch-${c}`}>
                  {t(lang, `GuessButton_${guessButtonKey(c, cmp.tone)}`)}
                </button>
              ))}
            </div>
          </section>

          <section class="card reveal" data-reveal style={`--lv:${color}`}>
            <p class="res" data-guess-result />
            <p class="verdict">{rich(lang, `ClimateVerdict_${cmp.wording}`, { delta: <Delta c={cmp.deltaMax} /> })}</p>
            <p class="pc" data-guess-percent />
            <Thermometer lang={lang} avgMin={cmp.avgMinTemp} avgMax={cmp.avgMaxTemp} min={cmp.minTemp} max={cmp.maxTemp} color={color} />
            <div class="share-row">
              <button
                type="button"
                class="pill-btn"
                data-share
                data-share-city={loc.name}
                data-share-tpl={verdictTpl}
                data-share-delta={String(cmp.deltaMax)}
                data-share-color={color}
                data-share-date={cmp.date}
              >
                {G.share()}
                {t(lang, 'Share')}
              </button>
              <a class="pill-btn" data-nav href={rankingPath(channel, lang)}>
                {G.trophy()}
                {t(lang, 'RankingLink')}
              </a>
            </div>
          </section>
          <noscript>
            <style>{'[data-reveal]{display:block!important}.guess .choices{display:none}'}</style>
          </noscript>

          <AdSlot slot="climate_1" lang={lang} />

          {features.series.length >= 3 ? (
            <section class="card">
              <Sec icon={G.calendar()} title={t(lang, 'ClimateChartTitle')} />
              <SeriesChart series={features.series} lang={lang} />
              <div class="legend">
                <span>
                  <i class="sw line" />
                  {t(lang, 'ClimateForecastHigh')}
                </span>
                <span>
                  <i class="sw usual" />
                  {t(lang, 'ClimateNormalBand')}
                </span>
              </div>
            </section>
          ) : null}

          {rain ? (
            <section class="card">
              <Sec icon={G.umbrella()} title={t(lang, 'ClimateRainTitle')} />
              <div class="cmp-bars">
                <div>
                  <span>{t(lang, 'ClimateRainUsual')}</span>
                  <i style={`width:${((rain.usualRainyDays / rain.days) * 100).toFixed(1)}%`} class="usual" />
                  <b>{rain.usualRainyDays}</b>
                </div>
                <div>
                  <span>{t(lang, 'ClimateRainForecast')}</span>
                  <i style={`width:${((rain.forecastRainyDays / rain.days) * 100).toFixed(1)}%`} />
                  <b>{rain.forecastRainyDays}</b>
                </div>
              </div>
              <p class="note">{t(lang, 'ClimateRainCompare', { usual: rain.usualRainyDays, days: rain.days, forecast: rain.forecastRainyDays })}</p>
            </section>
          ) : null}

          <AdSlot slot="climate_2" lang={lang} />
        </>
      )}

      <p class="base-note">{t(lang, 'ClimateBaseline')}</p>
      <Footer lang={lang} providerName={p.providerName} />
    </Layout>
  );
}

// ---------------------------------------------------------------------------

function RankRows(props: { rows: AnomalyRecord[]; channel: Channel; lang: Lang; slotPrefix: string }) {
  const { rows, channel, lang } = props;
  const out: Child[] = [];
  rows.forEach((r, i) => {
    out.push(
      <a class="rank" data-nav href={cityPath(channel, lang, r.cityId, 'climate')}>
        <span class="no">{i + 1}</span>
        <span class="who">
          <b>{r.name}</b>
          <span>{r.country ?? ''}</span>
        </span>
        <span class="d" style={`--lv:${CLIMATE_LEVEL_COLORS[r.level]}`}>
          <bdi>
            <span data-dc={String(r.deltaMax)}>{r.deltaMax > 0 ? `+${Math.round(r.deltaMax)}` : Math.round(r.deltaMax)}</span>°
          </bdi>
        </span>
        <span class="hi">
          <Temp c={r.maxTemp} />
        </span>
      </a>,
    );
    if ((i + 1) % 5 === 0 && i + 1 < rows.length) out.push(<AdSlot slot={`${props.slotPrefix}_${(i + 1) / 5}`} lang={lang} />);
  });
  return <>{out}</>;
}

/** 今天全球最反常的城市 /{渠道}/{语言}/ranking */
export function RankingPage(props: { ranking: Ranking; channel: Channel; lang: Lang; providerName: string }) {
  const { ranking, channel, lang } = props;
  const title = t(lang, 'RankingTitle');
  const empty = ranking.warmest.length === 0 && ranking.coldest.length === 0;
  return (
    <Layout lang={lang} title={title} devNote={devNote(props.providerName)} pageData={{ channel, page: 'ranking' }}>
      <header class="top">
        <div class="place">
          <h1>
            {G.trophy()}
            <span>{title}</span>
          </h1>
          <div class="region wrap">{t(lang, 'RankingSubtitle')}</div>
        </div>
        <button class="btn" dir="ltr" type="button" data-units-toggle aria-label={t(lang, 'UnitsTitle')}>
          °C
        </button>
      </header>
      {empty ? (
        <section class="card">
          <p class="lead">{t(lang, 'RankingEmpty')}</p>
        </section>
      ) : (
        <>
          <section class="card">
            <Sec icon={G.sun()} title={t(lang, 'RankingWarmest')} />
            <RankRows rows={ranking.warmest} channel={channel} lang={lang} slotPrefix="ranking_w" />
          </section>
          <AdSlot slot="ranking_1" lang={lang} />
          <section class="card">
            <Sec icon={G.thermo()} title={t(lang, 'RankingColdest')} />
            <RankRows rows={ranking.coldest} channel={channel} lang={lang} slotPrefix="ranking_c" />
          </section>
        </>
      )}
      <p class="base-note">{t(lang, 'ClimateBaseline')}</p>
      <Footer lang={lang} providerName={props.providerName} />
    </Layout>
  );
}
