/**
 * Service Worker：只为"没有网络"兜底，有网络时行为和没有它一样。
 *
 * - 城市页面（/{渠道}/{语言}/w/...）：先走网络；成功就存一份副本（最多 12 个页面）；
 *   网络失败或服务器出错（5xx）时返回这个网址上次存的副本，页面上会显示"离线"提示或"N 小时前更新"。
 * - 图标、脚本（/static/、/img/）：先走网络；失败时用存过的副本，保证离线副本能正常显示。
 * - 其他请求（接口、广告、统计）完全不经过这里。
 *
 * 用了导航预加载（navigation preload），Service Worker 启动的时间和网络请求同时进行，不拖慢首屏。
 *
 * 紧急关闭：把本文件换成只有 `self.addEventListener('install', () => self.skipWaiting());
 * self.addEventListener('activate', () => self.registration.unregister());` 的版本再部署。
 */
const PAGES = 'pages-v1';
const ASSETS = 'assets-v1';
const MAX_PAGES = 12;
const CITY_PAGE = /^\/[^/]+\/[a-z]{2}(?:-[a-z]{2})?\/w\//i;

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
  if (req.mode === 'navigate' && CITY_PAGE.test(url.pathname)) {
    event.respondWith(page(event));
  } else if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/img/')) {
    event.respondWith(asset(event));
  }
});

/** 存副本时去掉查询参数（session、uid 等因人而异，页面内容和它们无关） */
const keyOf = (req) => {
  const u = new URL(req.url);
  return u.origin + u.pathname;
};

async function page(event) {
  const req = event.request;
  try {
    const res = (await event.preloadResponse) || (await fetch(req));
    if (res.ok) event.waitUntil(savePage(keyOf(req), res.clone()));
    else if (res.status >= 500) {
      // 服务器出错时，有旧副本就先显示旧副本（页面会标出"N 小时前更新"，并在后台继续尝试更新）
      const copy = await caches.match(keyOf(req), { cacheName: PAGES });
      if (copy) return copy;
    }
    return res;
  } catch (err) {
    const copy = await caches.match(keyOf(req), { cacheName: PAGES });
    if (copy) return copy;
    throw err;
  }
}

async function savePage(key, res) {
  try {
    const cache = await caches.open(PAGES);
    await cache.put(key, res);
    const keys = await cache.keys();
    // 只留最近的 MAX_PAGES 个（keys 按写入顺序排列）
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(old);
  } catch {
    // 存储满了等：不影响正常浏览
  }
}

async function asset(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(ASSETS).then((c) => c.put(keyOf(req), copy)).catch(() => undefined));
    }
    return res;
  } catch (err) {
    const copy = await caches.match(keyOf(req), { cacheName: ASSETS });
    if (copy) return copy;
    throw err;
  }
}
