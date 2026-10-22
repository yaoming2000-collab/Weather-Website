/**
 * "我的城市"的存储，以及旧站数据的迁移。
 *
 * 新格式：localStorage "weather.cities.v2" = [{ id, name, admin, country }]，id 为 Foreca 地点 ID。
 * 旧格式（旧站 frontend/src/data/savedCities.ts）：
 *   localStorage "weather.savedCities.v1" 和 Cookie "weather_saved_cities_v1"，
 *   内容为 [{ id, name, displayName, countryCode, state, lat, lon }]，按经纬度记录。
 * 迁移时按经纬度找到 Foreca 地点，旧数据保留不删。
 */

export const STORAGE_KEY = 'weather.cities.v2';
export const LEGACY_STORAGE_KEY = 'weather.savedCities.v1';
export const LEGACY_COOKIE = 'weather_saved_cities_v1';
export const MIGRATED_FLAG = 'weather.cities.migrated';
/** 与旧站一致，最多保存 10 个城市 */
export const MAX_CITIES = 10;

export interface SavedCity {
  id: string;
  name: string;
  admin: string | null;
  country: string | null;
}

export interface LegacyCity {
  name: string;
  lat: number;
  lon: number;
}

function isSaved(x: unknown): x is SavedCity {
  return !!x && typeof x === 'object' && typeof (x as SavedCity).id === 'string' && typeof (x as SavedCity).name === 'string';
}

export function parseSaved(raw: string | null): SavedCity[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isSaved).slice(0, MAX_CITIES) : [];
  } catch {
    return [];
  }
}

/** 解析旧站保存的城市；无效条目丢弃 */
export function parseLegacy(raw: string | null): LegacyCity[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.flatMap((x): LegacyCity[] => {
      const lat = Number(x?.lat);
      const lon = Number(x?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
      return [{ name: String(x?.name ?? ''), lat, lon }];
    });
  } catch {
    return [];
  }
}

/** 从 document.cookie 里取旧站的 Cookie 值 */
export function readCookie(cookie: string, name: string): string | null {
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      const v = rest.join('=');
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}

export function addCity(list: SavedCity[], city: SavedCity): SavedCity[] {
  const without = list.filter((c) => c.id !== city.id);
  return [city, ...without].slice(0, MAX_CITIES);
}

export function removeCity(list: SavedCity[], id: string): SavedCity[] {
  return list.filter((c) => c.id !== id);
}

/** 合并迁移结果，去重并保持原顺序 */
export function mergeCities(base: SavedCity[], extra: SavedCity[]): SavedCity[] {
  const out = [...base];
  for (const c of extra) if (!out.some((x) => x.id === c.id)) out.push(c);
  return out.slice(0, MAX_CITIES);
}

/** localStorage 在隐私模式等情况下可能不可用，所有读写都要兜底 */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 忽略：存不进去只影响收藏功能
    }
  },
};
