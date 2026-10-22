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

export function fallbackCoords(): Coords {
  return { ...FALLBACK_COORDS };
}
