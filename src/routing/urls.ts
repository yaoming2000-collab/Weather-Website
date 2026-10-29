import type { Channel } from '../config/channels';
import type { Lang } from '../i18n/languages';

/**
 * 站内跳转时必须原样带上的参数（旧站 frontend/src/utils/lang.ts 的 withNavigationParams）。
 * session、uid 是锁屏产品的统计参数；locale 是语言提示。
 *
 * 注意：这些参数因人而异，不能进入页面缓存的 key，也不能写死在缓存的 HTML 里。
 * 服务端只在 302 跳转时带上它们；页面里的站内链接由前端脚本在浏览器里补上。
 */
export const NAV_PARAMS = ['session', 'uid', 'locale'] as const;

export function pickNavParams(source: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of NAV_PARAMS) {
    const value = source.get(key)?.trim();
    if (value) out.set(key, value);
  }
  return out;
}

export function withNavParams(path: string, source: URLSearchParams): string {
  const params = pickNavParams(source);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function cityPath(channel: Channel, lang: Lang, locationId: string, sub?: string): string {
  return `/${channel}/${lang}/w/${encodeURIComponent(locationId)}${sub ? `/${sub}` : ''}`;
}

/** 设置页（语言、温度单位、风速单位）；返回到哪一页由浏览器脚本记住（见 client/main.ts setupSettings） */
export function settingsPath(channel: Channel, lang: Lang): string {
  return `/${channel}/${lang}/settings`;
}

export function citiesPath(channel: Channel, lang: Lang): string {
  return `/${channel}/${lang}/cities`;
}

/**
 * 页面缓存用的 key：去掉所有查询参数。
 * 城市页面的内容只由路径（渠道、语言、城市、子页）决定，查询参数里只有统计用的 session/uid/locale。
 */
/** 页面缓存的键：去掉查询参数和渠道（各渠道共用一份，见 app.tsx 的 CHANNEL_PLACEHOLDER） */
export function pageCacheKey(url: URL): string {
  return `${url.origin}${url.pathname.replace(/^\/[^/]+\//, '/_/')}`;
}

export function rankingPath(channel: Channel, lang: Lang): string {
  return `/${channel}/${lang}/ranking`;
}
