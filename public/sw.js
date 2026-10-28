/**
 * Service Worker：只为"没有网络 / 服务器出错"兜底，正常情况下行为和没有它一样。
 *
 * - 所有站内页面跳转：用导航预加载（navigation preload）的结果，没有就正常请求；
 *   Service Worker 启动和网络请求同时进行，不拖慢首屏，也不会重复请求。
 * - 城市页面（/{渠道}/{语言}/w/...）另外存一份副本（最多 12 个页面）；
 *   断网或服务器出错（5xx）时返回这个网址 12 小时内存的副本，页面上会显示"离线"提示或"N 小时前更新"。
 *   超过 12 小时的副本不用：预报早已过时，而且旧页面和新脚本可能对不上。
 * - 图标、脚本（/static/、/img/）：先走网络；断网时用存过的副本，保证离线副本能正常显示。
 *   图标只在第一次见到时存（不会每次浏览都写缓存）；脚本每次更新。
 * - 其他请求（接口、广告、统计）完全不经过这里。
 *
 * 紧急关闭：把 client/main.ts 里的 SERVICE_WORKER_ENABLED 改成 false 再部署
 * （已安装的会在用户下次打开页面时注销）。
 */
const PAGES = 'pages-v1';
const ASSETS = 'assets-v1';
const MAX_PAGES = 12;
const MAX_COPY_AGE_MS = 12 * 3600 * 1000;
const SAVED_AT = 'x-sw-saved-at';
const CITY_PAGE = /^\/[^/]+\/[a-z]{2}\/w\//;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      for (const key of await caches.keys()) if (key !== PAGES && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // 所有导航都要用预加载的结果；不接管的话浏览器会丢掉预加载再请求一次
    event.respondWith(CITY_PAGE.test(url.pathname) ? cityPage(event) : navigate(event));
  } else if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/img/')) {
    event.respondWith(asset(event, url.pathname.startsWith('/static/')));
  }
});

/** 存副本时去掉查询参数（session、uid 等因人而异，页面内容和它们无关；渠道和语言在路径里） */
const keyOf = (req) => {
  const u = new URL(req.url);
  return u.origin + u.pathname;
};

async function navigate(event) {
  return (await event.preloadResponse) || fetch(event.request);
}

async function cityPage(event) {
  const key = keyOf(event.request);
  try {
    const res = await navigate(event);
    if (res.ok) event.waitUntil(savePage(key, res.clone()));
    else if (res.status >= 500) {
      // 服务器出错时，有不太旧的副本就先显示副本（页面会标出"N 小时前更新"，并在后台继续尝试更新）
      const copy = await recentCopy(key);
      if (copy) return copy;
    }
    return res;
  } catch (err) {
    const copy = await recentCopy(key);
    if (copy) return copy;
    throw err;
  }
}

async function recentCopy(key) {
  const copy = await caches.match(key, { cacheName: PAGES });
  if (!copy) return null;
  const savedAt = Number(copy.headers.get(SAVED_AT));
  return Number.isFinite(savedAt) && Date.now() - savedAt < MAX_COPY_AGE_MS ? copy : null;
}

async function savePage(key, res) {
  try {
    const headers = new Headers(res.headers);
    headers.set(SAVED_AT, String(Date.now()));
    const body = await res.blob();
    const cache = await caches.open(PAGES);
    await cache.put(key, new Response(body, { status: res.status, statusText: res.statusText, headers }));
    const keys = await cache.keys();
    // 只留最近的 MAX_PAGES 个（put 会把条目移到最后，keys 按写入顺序排列）
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(old);
  } catch {
    // 存储满了等：不影响正常浏览
  }
}

async function asset(event, alwaysUpdate) {
  const req = event.request;
  const key = keyOf(req);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          const cache = await caches.open(ASSETS);
          if (alwaysUpdate || !(await cache.match(key))) await cache.put(key, copy);
        })().catch(() => undefined),
      );
    }
    return res;
  } catch (err) {
    const copy = await caches.match(key, { cacheName: ASSETS });
    if (copy) return copy;
    throw err;
  }
}
