import type { Channel } from '../config/channels';
import { intlLocale, type Lang } from '../i18n/languages';
import { citiesPath } from '../routing/urls';
import { hourLabel, weekdayLabel } from '../time/cityTime';
import { iconImage } from '../weather/icons';
import type { CityBundle } from '../weather/service';
import { Layout } from './layout';

/**
 * 第 1 步骨架的城市页：只用来验证数据链路（路由 → 数据模块 → 缓存 → 页面）。
 * 正式界面、多语言文案、广告位在第 2–5 步完成。
 */

const dash = '—';
const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? dash : n.toFixed(digits));

function Icon(props: { icon: string; alt?: string }) {
  return <img src={`/img/weather/${iconImage(props.icon)}`} alt={props.alt ?? props.icon} loading="lazy" />;
}

export function CityPage(props: { bundle: CityBundle; channel: Channel; lang: Lang; providerName: string }) {
  const { bundle, channel, lang } = props;
  const { location, current, hourly, daily, air, climate, nowcast } = bundle;
  const c = current.data;
  const intl = intlLocale(lang);
  const today = daily?.data.find((d) => d.date === bundle.today) ?? daily?.data[0];

  // 往年对比（第 3 步会做成完整功能）
  const delta =
    today?.maxTemp !== null && today?.maxTemp !== undefined && climate?.data.avgMaxTemp !== null && climate?.data.avgMaxTemp !== undefined
      ? Math.round(today.maxTemp - climate.data.avgMaxTemp)
      : null;

  const devNote =
    props.providerName === 'mock'
      ? '开发预览 · 第 1 步骨架 · 模拟数据（不是真实天气）'
      : '开发预览 · 第 1 步骨架';

  return (
    <Layout lang={lang} title={`${location.name} Weather`} devNote={devNote}>
      <div data-tz={location.timezone}>
        <h1>{location.name}</h1>
        <div class="sub">
          {[location.adminArea, location.country].filter(Boolean).join(', ')} ·{' '}
          <a data-nav href={citiesPath(channel, lang)}>
            Change city
          </a>
        </div>

        <section class="card">
          <div class="hero">
            <Icon icon={c.icon} />
            <div>
              <div class="temp">{fmt(c.temperature)}°</div>
              <div class="sub">
                {c.icon} · H {fmt(today?.maxTemp)}° · L {fmt(today?.minTemp)}°
              </div>
            </div>
          </div>
          {delta !== null ? (
            <span class={`tag ${delta >= 2 ? 'warm' : delta <= -2 ? 'cool' : ''}`}>
              {delta > 0 ? `+${delta}` : delta}° vs 1991–2020 average
            </span>
          ) : null}
          <div class="sub" style="margin-top:8px">
            Updated <span data-fetched={String(current.fetchedAt)}>…</span>
          </div>
        </section>

        {nowcast ? (
          <section class="card">
            <h2>Next 2 hours {bundle.radar ? '(radar)' : '(model)'}</h2>
            <div class="bars">
              {nowcast.data.map((p) => (
                <span title={`${hourLabel(p.time)} ${fmt(p.precipRate, 1)} mm/h`} style={`height:${Math.min(100, (p.precipRate ?? 0) * 25)}%`} />
              ))}
            </div>
          </section>
        ) : null}

        <section class="card">
          <h2>Hourly</h2>
          <div class="h">
            {(hourly?.data ?? []).map((h) => (
              <div data-time={h.time}>
                <div class="mut">{hourLabel(h.time)}</div>
                <Icon icon={h.icon} />
                <div>{fmt(h.temperature)}°</div>
              </div>
            ))}
          </div>
        </section>

        <section class="card">
          <h2>15 days</h2>
          {(daily?.data ?? []).map((d) => (
            <div class="d" data-date={d.date}>
              <span class="wd">{weekdayLabel(d.date, intl)}</span>
              <Icon icon={d.icon} />
              <span class="mut">{d.precipProb !== null && d.precipProb >= 30 ? `${d.precipProb}%` : ''}</span>
              <span>
                {fmt(d.minTemp)}° / {fmt(d.maxTemp)}°
              </span>
            </div>
          ))}
        </section>

        <section class="card">
          <h2>Details</h2>
          <div class="grid">
            <div>
              Feels like<b>{fmt(c.feelsLike)}°</b>
            </div>
            <div>
              Humidity<b>{fmt(c.humidity)}%</b>
            </div>
            <div>
              Wind<b>{fmt(c.windSpeed !== null ? c.windSpeed * 3.6 : null)} km/h</b>
            </div>
            <div>
              Pressure<b>{fmt(c.pressure)} hPa</b>
            </div>
            <div>
              Visibility<b>{fmt(c.visibility !== null ? c.visibility / 1000 : null)} km</b>
            </div>
            <div>
              UV index<b>{fmt(c.uvIndex)}</b>
            </div>
            <div>
              Air quality<b>{fmt(air?.data[0]?.aqi)}</b>
            </div>
            <div>
              Sunrise / sunset<b>{today?.sunrise?.slice(0, 5) ?? dash} / {today?.sunset?.slice(0, 5) ?? dash}</b>
            </div>
          </div>
        </section>

        <footer>
          Weather data: Foreca{props.providerName === 'mock' ? ' (mock)' : ''} · Channel {channel} · {location.timezone}
        </footer>
      </div>
    </Layout>
  );
}

export function MessagePage(props: { lang: Lang; title: string; message: string }) {
  return (
    <Layout lang={props.lang} title={props.title}>
      <section class="card">
        <h1>{props.title}</h1>
        <p class="mut">{props.message}</p>
      </section>
    </Layout>
  );
}
