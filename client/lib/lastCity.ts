/**
 * 上次看的城市（Darren 2026-10-29）：
 * - 浏览器在城市页写 Cookie wcity（服务器在首页 /{渠道}/ 读它，直接去这个城市，见 src/app.tsx legacyHome）
 * - 同时在 localStorage 记下城市名和网址，收藏页的"返回"用它显示城市名
 * 纯函数，方便测试。
 */

export const LAST_CITY_COOKIE = 'wcity';
export const LAST_CITY_KEY = 'weather.lastCity';

export interface LastCity {
  id: string;
  name: string;
  /** 城市页网址（路径），例如 /wmi/zh/w/100281184/climate */
  path: string;
}

const CITY_PATH = /^\/[A-Za-z0-9_-]+\/[a-z]{2}\/w\/[^/]+/;

export function parseLastCity(raw: string | null): LastCity | null {
  try {
    const j = JSON.parse(raw ?? 'null') as Partial<LastCity> | null;
    if (!j || typeof j.id !== 'string' || typeof j.name !== 'string' || typeof j.path !== 'string' || !CITY_PATH.test(j.path)) return null;
    return { id: j.id, name: j.name, path: j.path };
  } catch {
    return null;
  }
}

export function lastCityCookie(id: string, secure: boolean): string {
  return `${LAST_CITY_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * 收藏页"返回"：从本站城市页进来的就回那一页；否则回上次看的城市；都没有时 path 为 null（保持服务器给的首页链接）。
 * 网址里的语言换成当前页面的语言。label：去的正好是上次看的城市时用它的名字，否则 null（显示"返回"）。
 */
export function citiesBack(referrer: string, host: string, last: LastCity | null, lang: string): { path: string | null; label: string | null } {
  let path: string | null = null;
  try {
    const ref = referrer ? new URL(referrer) : null;
    if (ref && ref.host === host && CITY_PATH.test(ref.pathname)) path = ref.pathname;
  } catch {
    path = null;
  }
  path ??= last?.path ?? null;
  if (!path) return { path: null, label: null };
  const id = path.split('/')[4];
  return { path: path.replace(/^(\/[^/]+\/)[a-z]{2}\//, `$1${lang}/`), label: last && id === last.id ? last.name : null };
}
