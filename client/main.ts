/**
 * 浏览器端脚本（Vite 打包为 public/static/app.js）。
 * 页面主体由服务器生成并被 CDN 缓存；这里只处理因人而异、因时而异的部分。
 */
import { iconImage } from '../src/weather/icons';
import {
  addCity,
  LEGACY_COOKIE,
  LEGACY_STORAGE_KEY,
  mergeCities,
  MIGRATED_FLAG,
  parseLegacy,
  parseSaved,
  readCookie,
  removeCity,
  STORAGE_KEY,
  storage,
  type SavedCity,
} from './lib/saved';
import { entryKey, GUESS_KEY, isChoice, percentRight, readBook, VOTE_KEY, writeBook, type Choice, type Counts } from './lib/interact';
import { cityToday, minutesAgo, pastHourCount, REFRESH_AFTER_MS } from './lib/time';
import { drawCard, shareOrDownload } from './share';
import { defaultSystem, formatPrecip, formatSpeed, formatTemp, formatTempDelta, type UnitSystem } from './lib/units';

interface PageData {
  lang: string;
  intl: string;
  channel?: string;
  page?: string;
  tz?: string;
  city?: SavedCity;
  fetchedAt?: number;
  strings: Record<string, string>;
}

const data: PageData = (() => {
  try {
    return JSON.parse(document.getElementById('page-data')?.textContent ?? '{}');
  } catch {
    return { lang: 'en', intl: 'en', strings: {} };
  }
})();

const s = (key: string, vars?: Record<string, string | number>): string => {
  let v = data.strings?.[key] ?? key;
  if (vars) for (const [k, x] of Object.entries(vars)) v = v.split(`{${k}}`).join(String(x));
  return v;
};

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel)) as T[];

// ---------- 1. 站内链接带上 session / uid / locale ----------

const NAV = ['session', 'uid', 'locale'];
const here = new URLSearchParams(location.search);

function withNav(href: string): string {
  const url = new URL(href, location.origin);
  for (const k of NAV) {
    const v = here.get(k);
    if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.pathname + url.search + url.hash;
}

function syncNav(root: ParentNode = document) {
  for (const a of $$<HTMLAnchorElement>('a[data-nav]', root)) a.setAttribute('href', withNav(a.getAttribute('href') ?? '/'));
}

// ---------- 2. 单位 ----------

const UNITS_KEY = 'weather.units';

function currentSystem(): UnitSystem {
  const saved = storage.get(UNITS_KEY);
  if (saved === 'metric' || saved === 'imperial') return saved;
  return defaultSystem(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function applyUnits(system: UnitSystem, root: ParentNode = document) {
  for (const el of $$('[data-c]', root)) el.textContent = formatTemp(Number(el.dataset.c), system);
  for (const el of $$('[data-dc]', root)) el.textContent = formatTempDelta(Number(el.dataset.dc), system);
  for (const el of $$('[data-dca]', root)) el.textContent = formatTempDelta(Math.abs(Number(el.dataset.dca)), system).replace('+', '');
  for (const el of $$('[data-ms]', root)) {
    const f = formatSpeed(Number(el.dataset.ms), system);
    el.textContent = f.value;
    const unit = el.parentElement?.querySelector('[data-speed-unit]');
    if (unit) unit.textContent = f.unit;
  }
  for (const el of $$('[data-mm]', root)) {
    const f = formatPrecip(Number(el.dataset.mm), system);
    el.textContent = f.value;
    const unit = el.parentElement?.querySelector('[data-mm-unit]');
    if (unit) unit.textContent = f.unit;
  }
  for (const b of $$('[data-units-toggle]')) b.textContent = system === 'imperial' ? '°F' : '°C';
}

// ---------- 3. 现在、今天、更新时间 ----------

function applyTime() {
  const now = Date.now();
  if (data.tz) {
    const today = cityToday(now, data.tz);
    for (const el of $$('[data-date]')) {
      const date = el.dataset.date ?? '';
      el.toggleAttribute('data-today', date === today);
      // 跨过零点后，缓存页面里"昨天"那一行隐藏
      const row = el.closest('details') ?? el;
      (row as HTMLElement).hidden = date < today;
    }
  }

  // 逐小时：隐藏已经过去的小时，第一个未过去的小时标为"现在"
  for (const strip of [...$$('.hours'), ...($$('.row[data-time]').length ? [document.body] : [])]) {
    const list = strip === document.body ? $$('.row[data-time]') : $$('.hour:not(.sunev)', strip);
    if (!list.length) continue;
    const past = pastHourCount(list.map((el) => el.dataset.time ?? ''), now);
    list.forEach((el, i) => {
      el.hidden = i < past;
      el.toggleAttribute('data-now', i === past);
      const label = el.querySelector<HTMLElement>('[data-hour-label]');
      if (label) label.textContent = i === past ? s('NowLabel') : label.dataset.hourLabel ?? '';
    });
    // 日出日落：早于"现在"那一格的隐藏（它们的时间是当地时间，没有时差，按字符串比较）
    const first = list[past]?.dataset.time?.slice(0, 16);
    for (const ev of $$('.hour.sunev', strip)) ev.hidden = !!first && (ev.dataset.time ?? '') < first;
  }

  for (const el of $$('[data-fetched]')) {
    const mins = minutesAgo(Number(el.dataset.fetched), now);
    el.textContent = mins < 1 ? s('UpdatedJustNow') : s('UpdatedMinutesAgo', { n: mins });
  }
}

// ---------- 4. 当前天气补刷新 ----------

let refreshing = false;

async function refreshCurrent() {
  const city = data.city;
  const updated = document.querySelector<HTMLElement>('[data-fetched]');
  if (!city || !updated || refreshing) return;
  if (Date.now() - Number(updated.dataset.fetched) < REFRESH_AFTER_MS) return;
  refreshing = true;
  try {
    const res = await fetch(`/api/w/${encodeURIComponent(city.id)}/now`);
    if (!res.ok) return;
    const body = (await res.json()) as { fetchedAt: number; current: { temperature: number | null; icon: string } };
    const hero = document.querySelector('[data-current]');
    if (!hero || body.fetchedAt <= Number(updated.dataset.fetched)) return;
    const temp = hero.querySelector<HTMLElement>('[data-current-temp] [data-c]');
    if (temp && body.current.temperature !== null) temp.dataset.c = String(body.current.temperature);
    const img = hero.querySelector<HTMLImageElement>('img[data-icon]');
    if (img) {
      img.src = `/img/weather/${iconImage(body.current.icon)}`;
      img.dataset.icon = body.current.icon;
    }
    const cond = hero.querySelector('[data-current-cond]');
    if (cond) cond.textContent = s(`Cond_${body.current.icon === 'night' ? 'night' : body.current.icon.replace(/^night-/, '')}`);
    updated.dataset.fetched = String(body.fetchedAt);
    applyUnits(currentSystem(), hero);
    applyTime();
  } catch {
    // 网络失败时保留页面上的数据
  } finally {
    refreshing = false;
  }
}

// ---------- 5. 我的城市 ----------

function loadCities(): SavedCity[] {
  return parseSaved(storage.get(STORAGE_KEY));
}

function saveCities(list: SavedCity[]) {
  storage.set(STORAGE_KEY, JSON.stringify(list));
}

/** 把旧站保存的城市迁移过来（只做一次；旧数据不删除） */
async function migrateLegacy(): Promise<void> {
  if (storage.get(MIGRATED_FLAG)) return;
  const legacy = [...parseLegacy(storage.get(LEGACY_STORAGE_KEY)), ...parseLegacy(readCookie(document.cookie, LEGACY_COOKIE))];
  if (!legacy.length) {
    storage.set(MIGRATED_FLAG, '1');
    return;
  }
  const found = await Promise.all(
    legacy.map(async (c): Promise<SavedCity | null> => {
      try {
        const res = await fetch(`/api/near?lat=${c.lat}&lon=${c.lon}`);
        if (!res.ok) return null;
        const j = (await res.json()) as SavedCity;
        return { id: j.id, name: c.name || j.name, admin: j.admin, country: j.country };
      } catch {
        return null;
      }
    }),
  );
  const ok = found.filter((c): c is SavedCity => c !== null);
  // 全部成功才标记完成，失败的下次再试
  saveCities(mergeCities(loadCities(), ok));
  if (ok.length === legacy.length) storage.set(MIGRATED_FLAG, '1');
}

let renderSaveButton: () => void = () => undefined;

function setupSaveButton() {
  const btn = document.querySelector<HTMLButtonElement>('[data-save]');
  const city = data.city;
  if (!btn || !city) return;
  renderSaveButton = () => {
    const saved = loadCities().some((c) => c.id === city.id);
    btn.setAttribute('aria-pressed', String(saved));
    btn.setAttribute('aria-label', s(saved ? 'RemoveFromMyCities' : 'AddToMyCities'));
    btn.title = btn.getAttribute('aria-label') ?? '';
  };
  btn.addEventListener('click', () => {
    const list = loadCities();
    saveCities(list.some((c) => c.id === city.id) ? removeCity(list, city.id) : addCity(list, city));
    renderSaveButton();
  });
  renderSaveButton();
}

function cityHref(id: string): string {
  return withNav(`/${data.channel ?? 'wmi'}/${data.lang}/w/${encodeURIComponent(id)}`);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Card {
  id: string;
  name: string;
  admin: string | null;
  country: string | null;
  temperature?: number | null;
  icon?: string;
}

function cityRow(c: Card, onRemove?: () => void): HTMLElement {
  const row = el('div', { class: 'city' });
  const a = el('a', { href: cityHref(c.id) });
  if (c.icon) a.append(el('img', { src: `/img/weather/${iconImage(c.icon)}`, alt: '', width: '40', height: '40' }));
  const n = el('div', { class: 'n' });
  n.append(el('div', {}, c.name), el('div', { class: 'sub' }, [c.admin, c.country].filter(Boolean).join(', ')));
  a.append(n);
  if (c.temperature !== undefined && c.temperature !== null) {
    const v = el('span', { class: 'v' });
    v.append(el('span', { 'data-c': String(c.temperature) }), document.createTextNode('°'));
    a.append(v);
  }
  row.append(a);
  if (onRemove) {
    const b = el('button', { type: 'button', 'aria-label': s('RemoveCityAria', { city: c.name }) }, '×');
    b.addEventListener('click', onRemove);
    row.append(b);
  }
  return row;
}

async function renderSavedList() {
  const box = document.querySelector<HTMLElement>('[data-saved-list]');
  if (!box) return;
  const list = loadCities();
  if (!list.length) {
    box.replaceChildren(el('div', { class: 'empty' }, `${s('NoCitiesSavedYet')} · ${s('SearchToDiscoverCities')}`));
    return;
  }
  // 先用本地信息立即显示，再补上实时温度
  const draw = (cards: Card[]) => {
    box.replaceChildren(
      ...cards.map((c) =>
        cityRow(c, () => {
          saveCities(removeCity(loadCities(), c.id));
          void renderSavedList();
        }),
      ),
    );
    applyUnits(currentSystem(), box);
  };
  draw(list);
  try {
    const res = await fetch(`/api/cities?ids=${list.map((c) => encodeURIComponent(c.id)).join(',')}`);
    if (!res.ok) return;
    const { items } = (await res.json()) as { items: Card[] };
    draw(list.map((c) => ({ ...c, ...items.find((i) => i.id === c.id), name: c.name })));
  } catch {
    // 保持本地信息
  }
}

function setupSearch() {
  const form = document.querySelector<HTMLFormElement>('[data-search]');
  const box = document.querySelector<HTMLElement>('[data-search-results]');
  const input = form?.querySelector<HTMLInputElement>('input');
  if (!form || !box || !input) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      box.hidden = true;
      return;
    }
    const my = ++seq;
    box.hidden = false;
    box.replaceChildren(el('div', { class: 'empty' }, s('Searching')));
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(data.lang)}`);
      if (my !== seq) return;
      if (!res.ok) throw new Error(String(res.status));
      const { items } = (await res.json()) as { items: Card[] };
      box.replaceChildren(...(items.length ? items.map((c) => cityRow(c)) : [el('div', { class: 'empty' }, s('NoMatchingCities'))]));
    } catch {
      if (my === seq) box.replaceChildren(el('div', { class: 'empty' }, s('SearchFailed')));
    }
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    void run();
  });
}

// ---------- 6. 猜一猜（往年对比页） ----------

function readCounts(j: unknown): Counts | null {
  const c = (j as { counts?: Counts })?.counts;
  return c && typeof c.colder === 'number' ? c : null;
}

function setupGuess() {
  const box = document.querySelector<HTMLElement>('[data-guess]');
  const reveal = document.querySelector<HTMLElement>('[data-reveal]');
  if (!box || !reveal) return;
  const city = box.dataset.city ?? '';
  const date = box.dataset.date ?? '';
  const answer = box.dataset.answer as Choice;
  const minVotes = Number(box.dataset.minVotes ?? 20);
  const key = entryKey(city, date);
  const resultEl = reveal.querySelector<HTMLElement>('[data-guess-result]');
  const pctEl = reveal.querySelector<HTMLElement>('[data-guess-percent]');

  const showPercent = (counts: Counts | null) => {
    if (!pctEl || !counts) return;
    const p = percentRight(counts, answer, minVotes);
    pctEl.textContent = p === null ? '' : s('GuessPercentRight', { percent: p });
  };

  const open = (choice: Choice, animate: boolean) => {
    box.toggleAttribute('data-done', true);
    for (const b of $$<HTMLButtonElement>('[data-choice]', box)) b.setAttribute('aria-pressed', String(b.dataset.choice === choice));
    if (resultEl) resultEl.textContent = s(choice === answer ? 'GuessRight' : 'GuessWrong');
    reveal.classList.add('on');
    if (animate) reveal.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };

  const previous = readBook(storage.get(GUESS_KEY))[key]?.v;
  if (isChoice(previous)) {
    open(previous, false);
    fetch(`/api/w/${encodeURIComponent(city)}/guess?date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => showPercent(readCounts(j)))
      .catch(() => undefined);
    return;
  }

  for (const b of $$<HTMLButtonElement>('[data-choice]', box)) {
    b.addEventListener('click', async () => {
      const choice = b.dataset.choice;
      if (!isChoice(choice) || box.hasAttribute('data-done')) return;
      storage.set(GUESS_KEY, JSON.stringify(writeBook(readBook(storage.get(GUESS_KEY)), key, choice, Date.now())));
      open(choice, true);
      try {
        const res = await fetch(`/api/w/${encodeURIComponent(city)}/guess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, choice }),
        });
        showPercent(res.ok ? readCounts(await res.json()) : null);
      } catch {
        // 计数失败不影响揭晓
      }
    });
  }
}

// ---------- 7. 预报准吗（首页） ----------

function track(event: string, params: Record<string, string>) {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
  if (typeof w.gtag === 'function') w.gtag('event', event, params);
  else (w.dataLayer ??= []).push({ event, ...params });
}

function setupVote() {
  const box = document.querySelector<HTMLElement>('[data-vote]');
  if (!box || !data.tz) return;
  const city = box.dataset.vote ?? '';
  const key = entryKey(city, cityToday(Date.now(), data.tz));
  const done = (v: string) => {
    box.toggleAttribute('data-done', true);
    for (const b of $$<HTMLButtonElement>('[data-vote-value]', box)) {
      b.setAttribute('aria-pressed', String(b.dataset.voteValue === v));
      b.disabled = true;
    }
    const p = box.querySelector('p');
    if (p) p.textContent = s('ForecastFeedbackThanks');
  };
  const prev = readBook(storage.get(VOTE_KEY))[key]?.v;
  if (prev === 'up' || prev === 'down') return done(prev);
  for (const b of $$<HTMLButtonElement>('[data-vote-value]', box)) {
    b.addEventListener('click', () => {
      const v = b.dataset.voteValue ?? '';
      if (v !== 'up' && v !== 'down') return;
      storage.set(VOTE_KEY, JSON.stringify(writeBook(readBook(storage.get(VOTE_KEY)), key, v, Date.now())));
      // 需求文档：GA4 事件 forecast_feedback（参数：城市 ID、赞或踩）
      track('forecast_feedback', { city_id: city, value: v });
      done(v);
    });
  }
}

// ---------- 8. 分享卡片 ----------

function setupShare() {
  for (const b of $$<HTMLButtonElement>('[data-share]')) {
    b.addEventListener('click', async () => {
      const delta = Math.abs(Number(b.dataset.shareDelta ?? 0));
      const n = formatTempDelta(delta, currentSystem()).replace('+', '');
      const verdict = (b.dataset.shareTpl ?? '').split('{delta}').join(n);
      const [y, m, d] = (b.dataset.shareDate ?? '').split('-').map(Number) as [number, number, number];
      const dateLabel = new Intl.DateTimeFormat(data.intl, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
      b.disabled = true;
      try {
        const blob = await drawCard(
          { city: b.dataset.shareCity ?? '', verdict, color: b.dataset.shareColor ?? '#f97316', dateLabel, site: location.host },
          document.documentElement.dir === 'rtl',
        );
        if (blob) {
          const result = await shareOrDownload(blob, 'weather-vs-usual.png', `${b.dataset.shareCity}: ${verdict}`);
          if (result !== 'cancelled') track('climate_share', { city_id: data.city?.id ?? '', method: result });
        }
      } finally {
        b.disabled = false;
      }
    });
  }
}

// ---------- 启动 ----------

function init() {
  syncNav();
  applyUnits(currentSystem());
  applyTime();

  for (const b of $$('[data-units-toggle]')) {
    b.addEventListener('click', () => {
      const next: UnitSystem = currentSystem() === 'imperial' ? 'metric' : 'imperial';
      storage.set(UNITS_KEY, next);
      applyUnits(next);
    });
  }

  setupSaveButton();
  void migrateLegacy().then(() => {
    renderSaveButton();
    if (data.page === 'cities') void renderSavedList();
  });
  if (data.page === 'cities') {
    void renderSavedList();
    setupSearch();
  }

  setupGuess();
  setupVote();
  setupShare();

  void refreshCurrent();
  setInterval(applyTime, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyTime();
      void refreshCurrent();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
