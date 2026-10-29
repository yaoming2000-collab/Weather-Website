import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import type { Channel } from '../config/channels';
import { CLIMATE_LEVEL_COLORS, GUESS } from '../config/features';
import { guessButtonKey, type ClimateSeriesPoint, type GuessChoice } from '../features/climate';
import type { AnomalyRecord, Ranking } from '../features/store';
import { intlLocale, textDirection, type Lang } from '../i18n/languages';
import { t } from '../i18n/t';
import { cityPath, rankingPath } from '../routing/urls';
import { conditionKey } from '../weather/derive';
import { AdSlot, DASH, Footer, Icon, Layout, Sec, SettingsLink, SubBar, Temp } from './components';
import { G } from './glyphs';
import { cityPageData, Delta, devNote, pageSky, rich, type PageProps } from './home';

const CHOICES: GuessChoice[] = ['colder', 'same', 'warmer'];

/** 温度计式图：灰色是去年同一天的最低到最高，两个圆点是今天的预报最低、最高 */
function Thermometer(props: { lang: Lang; lastMin: number | null; lastMax: number; min: number | null; max: number; color: string }) {
  const vals = [props.lastMin, props.lastMax, props.min, props.max].filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...vals) - 2);
  const hi = Math.ceil(Math.max(...vals) + 2);
  const at = (v: number) => (((v - lo) / (hi - lo)) * 100).toFixed(1);
  const lastLo = props.lastMin ?? props.lastMax;
  return (
    <div class="thermo">
      <div class="track">
        <span class="usual" style={`inset-inline-start:${at(lastLo)}%;width:${Math.max(1.5, Number(at(props.lastMax)) - Number(at(lastLo))).toFixed(1)}%`} />
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
          {t(props.lang, 'ClimateLastYearRange')}{' '}
          <bdi>
            {props.lastMin !== null ? (
              <>
                <Temp c={props.lastMin} /> –{' '}
              </>
            ) : null}
            <Temp c={props.lastMax} />
          </bdi>
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

/**
 * 过去 7 天：今年实际最高温（实线）和去年同一天的实际最高温（虚线），灰色带是"和去年差不多"的范围（去年 ±2°）。
 * 只有过去的日子（2026-10-29 起）：不含今天和以后，猜之前完整显示也不会透露答案。
 */
function SeriesChart(props: { series: ClimateSeriesPoint[]; lang: Lang; preparing?: boolean }) {
  const pts = props.series.filter((s) => s.maxTemp !== null && s.lastMaxTemp !== null);
  // 数据不够时占同样高度，显示 --
  // 数据正在准备（排队等定时任务）时说明一下，免得以为坏了
  if (pts.length < 3) return <div class="ph-chart">{props.preparing ? <span class="ph-note">{t(props.lang, 'ClimatePreparing')}</span> : DASH}</div>;
  const rtl = textDirection(props.lang) === 'rtl';
  const W = 340;
  const H = 150;
  const top = 18;
  const bottom = 124;
  const vals = pts.flatMap((s) => [s.maxTemp!, s.lastMaxTemp! - 2, s.lastMaxTemp! + 2]);
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const x = (i: number) => {
    const v = 20 + (i / (pts.length - 1)) * (W - 40);
    return rtl ? W - v : v;
  };
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const band =
    pts.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(s.lastMaxTemp! + 2).toFixed(1)}`).join(' ') +
    ' ' +
    pts
      .map((s, i) => [x(i), y(s.lastMaxTemp! - 2)] as const)
      .reverse()
      .map(([a, b]) => `L${a.toFixed(1)} ${b.toFixed(1)}`)
      .join(' ') +
    ' Z';
  const line = (pick: (s: ClimateSeriesPoint) => number) => pts.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(pick(s)).toFixed(1)}`).join(' ');
  const md = new Intl.DateTimeFormat(intlLocale(props.lang), { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const label = (date: string) => {
    const [yy, m, d] = date.split('-').map(Number) as [number, number, number];
    return md.format(new Date(Date.UTC(yy, m - 1, d, 12)));
  };
  return (
    <svg class="series" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(props.lang, 'ClimateChartTitle')}>
      <path d={band} fill="rgba(255,255,255,.16)" />
      <path d={line((s) => s.lastMaxTemp!)} fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-dasharray="3 3" />
      <path d={line((s) => s.maxTemp!)} fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
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
      {pts.map((s, i) => (
        <text x={x(i).toFixed(1)} y={(y(s.maxTemp!) - 8).toFixed(1)} text-anchor="middle" font-size="12" font-weight="600" fill="#fff">
          <tspan data-c={String(s.maxTemp)}>{Math.round(s.maxTemp!)}</tspan>°
        </text>
      ))}
      {pts.map((s, i) => (
        <text x={x(i).toFixed(1)} y="145" text-anchor="middle" font-size="12" fill="rgba(255,255,255,.65)">
          {label(s.date)}
        </text>
      ))}
    </svg>
  );
}

/**
 * 猜之前的"已连续猜对 N 天"，首次绘制前填上（规则同 client/lib/streak.ts currentStreak：最后记录是今天或昨天时还连着）。
 * 已经猜过今天的不显示（结果卡片里有）。
 */
function STREAK_PRE_SCRIPT(city: string, date: string): string {
  const c = JSON.stringify(city);
  const d = JSON.stringify(date);
  return `(function(){try{var e=document.currentScript.previousElementSibling;if(JSON.parse(localStorage.getItem('weather.guess.v2')||'{}')[${c}+'|'+${d}])return;
var b=JSON.parse(localStorage.getItem('weather.streak.v1')||'{}')[${c}];if(!b)return;var p=new Date(Date.parse(${d}+'T00:00:00Z')-864e5).toISOString().slice(0,10);
var n=(b.last===${d}||b.last===p)?b.cur:0;var t=n>0?e.getAttribute('data-tpl-now').split('{n}').join(n):b.best>0?e.getAttribute('data-tpl-best').split('{n}').join(b.best):'';
if(t){e.textContent=t;e.hidden=false}}catch(x){}})()`;
}

/** "去年今天：" 后面接天气；中日文全角冒号后不再加空格 */
function lastYearLead(lang: Lang): string {
  const lead = t(lang, 'ClimateLastYearToday');
  return /[：:]$/.test(lead) && /：$/.test(lead) ? lead : `${lead} `;
}

/** 今天和去年同一天比 /w/{id}/climate（重点功能） */
export function ClimatePage(p: PageProps) {
  const { bundle, channel, lang, features } = p;
  const loc = bundle.location;
  const cmp = features.comparison;
  const title = t(lang, 'ClimateTitle');
  const color = cmp ? CLIMATE_LEVEL_COLORS[cmp.level] : '#fff';
  const rain = features.rain;
  const verdictTpl = cmp ? t(lang, `ClimateVerdict_${cmp.wording}`) : '';
  // 去年数据或今年预报这次没取到（临时失败）→ 提示稍后再试；一直没有去年数据 → 说明
  const transient = bundle.missing.some((m) => m === 'lastYear' || m === 'daily');
  // 新城市的去年数据正在排队等定时任务取（10 分钟左右）：今天先不出题，连续猜对不算断
  const preparing = !transient && !!bundle.lastYear?.pendingDates?.includes(bundle.today);
  // 过去 7 天（今年或去年）有一块还在排队
  const pastPending = features.series.some((p) => bundle.pastWeek?.pendingDates?.includes(p.date) || bundle.lastYear?.pendingDates?.includes(p.date));

  return (
    <Layout lang={lang} title={`${title} · ${loc.name}`} sky={pageSky(p)} devNote={devNote(p.providerName)} pageData={{ ...cityPageData(p), page: 'climate' }}>
      <SubBar location={loc} channel={channel} lang={lang} title={title} />

      {!cmp ? (
        // 今天没出题（一直没有去年数据）：连续猜对天数不算断（client/main.ts markSkippedDay）；临时取不到时不算，等会儿还会出题
        <section class="card" {...(transient ? {} : { 'data-no-question': '', 'data-city': loc.id, 'data-date': bundle.today })}>
          <p class="lead">{t(lang, transient ? 'TryLater' : preparing ? 'ClimatePreparing' : 'ClimateUnavailable')}</p>
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
            {/* 猜之前的连续天数：首次绘制前由下面的脚本填上（不跳动），之后 client/main.ts showPreStreak 再算一次；没猜过的城市不显示 */}
            <p class="streak pre" data-streak-pre data-tpl-now={t(lang, 'StreakBeforeGuess')} data-tpl-best={t(lang, 'StreakRestart')} hidden />
            <script>{raw(STREAK_PRE_SCRIPT(loc.id, cmp.date))}</script>
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
            {/* 连续猜对天数（浏览器里算，见 client/lib/streak.ts） */}
            <p class="streak" data-streak hidden />
            <p class="pc" data-guess-percent />
            <p class="ly-day">
              {cmp.lastIcon ? <Icon icon={cmp.lastIcon} size={28} alt="" /> : null}
              <span>
                {lastYearLead(lang)}
                <b>{cmp.lastIcon ? t(lang, conditionKey(cmp.lastIcon)) : DASH}</b>
              </span>
            </p>
            <Thermometer lang={lang} lastMin={cmp.lastMinTemp} lastMax={cmp.lastMaxTemp} min={cmp.minTemp} max={cmp.maxTemp} color={color} />
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
        </>
      )}

      <AdSlot slot="climate_1" lang={lang} />

      <section class="card">
        <Sec icon={G.calendar()} title={t(lang, 'ClimateChartTitle')} />
        <SeriesChart series={features.series} lang={lang} preparing={pastPending} />
        <div class="legend">
          <span>
            <i class="sw line" />
            {t(lang, 'ClimateThisYearHigh')}
          </span>
          <span>
            <i class="sw dash" />
            {t(lang, 'ClimateLastYearHigh')}
          </span>
          <span>
            <i class="sw usual" />
            {t(lang, 'ClimateNormalBand')}
          </span>
        </div>
      </section>

      <section class="card">
        <Sec icon={G.umbrella()} title={t(lang, 'ClimateRainTitle')} />
        <div class="cmp-bars">
          <div>
            <span>{t(lang, 'ClimateRainLastYear')}</span>
            {rain ? <i style={`width:${((rain.lastYearRainyDays / rain.days) * 100).toFixed(1)}%`} class="usual" /> : <i class="usual ph" />}
            <b>{rain ? rain.lastYearRainyDays : DASH}</b>
          </div>
          <div>
            <span>{t(lang, 'ClimateRainThisYear')}</span>
            {rain ? <i style={`width:${((rain.thisYearRainyDays / rain.days) * 100).toFixed(1)}%`} /> : <i class="ph" />}
            <b>{rain ? rain.thisYearRainyDays : DASH}</b>
          </div>
        </div>
        <p class="note">{rain ? t(lang, 'ClimateRainPast', { days: rain.days, now: rain.thisYearRainyDays, last: rain.lastYearRainyDays }) : pastPending ? t(lang, 'ClimatePreparing') : DASH}</p>
      </section>

      <AdSlot slot="climate_2" lang={lang} />

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
        <SettingsLink channel={channel} lang={lang} />
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
