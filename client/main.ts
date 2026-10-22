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
import { cityToday, minutesAgo, pastHourCount, REFRESH_AFTER_MS } from './lib/time';
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
  for (const list of [$$('.hours .hour'), $$('.row[data-time]')]) {
    if (!list.length) continue;
    const past = pastHourCount(list.map((el) => el.dataset.time ?? ''), now);
    list.forEach((el, i) => {
      el.hidden = i < past;
      el.toggleAttribute('data-now', i === past);
      const label = el.querySelector<HTMLElement>('[data-hour-label]');
      if (label) label.textContent = i === past ? s('NowLabel') : label.dataset.hourLabel ?? '';
    });
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
