import { CAPITALS, LANGUAGE_COUNTRY } from '../config/capitals';
import { FALLBACK_COORDS } from '../config/thresholds';

export interface Coords {
  lat: number;
  lon: number;
}

/**
 * 访客的大致位置，来自 Cloudflare 按 IP 提供的 request.cf（免费，不需要额外的 IP 查询服务）。
 * 拿不到时返回 null。
 */
export function visitorCoords(request: Request): Coords | null {
  const cf = (request as Request & { cf?: { latitude?: string | number; longitude?: string | number } }).cf;
  const lat = Number(cf?.latitude);
  const lon = Number(cf?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** 解析并校验经纬度。 */
export function parseCoords(lat: unknown, lon: unknown): Coords | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '') return null;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lon: lo };
}

/** 网址里 "lat,lon" 的写法 */
export function parseLatLonPair(value: string | undefined): Coords | null {
  if (!value) return null;
  const [lat, lon] = value.split(',');
  return parseCoords(lat, lon);
}

/**
 * 拿不到访客坐标时的默认城市（Darren 2026-10-28 确认）：
 *   1. Cloudflare 判断的访客国家（request.cf.country）的首都；
 *   2. 浏览器语言里的地区（Accept-Language，例如 pt-BR → 巴西），没有地区时按语言推断（ja → 日本）；
 *   3. 都没有时用伦敦。
 */
export function fallbackCoords(request?: Request, acceptLanguage?: string | null): Coords {
  const cf = (request as (Request & { cf?: { country?: string } }) | undefined)?.cf;
  const fromCountry = capitalOf(cf?.country);
  if (fromCountry) return fromCountry;
  for (const item of (acceptLanguage ?? '').split(',')) {
    const parts = (item.split(';')[0] ?? '').trim().replace(/_/g, '-').split('-');
    const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
    const found = capitalOf(region) ?? capitalOf(LANGUAGE_COUNTRY[(parts[0] ?? '').toLowerCase()]);
    if (found) return found;
  }
  return { ...FALLBACK_COORDS };
}

function capitalOf(code: string | undefined | null): Coords | null {
  const c = code ? CAPITALS[code.toUpperCase()] : undefined;
  return c ? { lat: c[0], lon: c[1] } : null;
}
