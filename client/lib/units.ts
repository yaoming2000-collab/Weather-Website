/**
 * 单位换算。页面统一按摄氏度、m/s（原始值）、mm、米输出，浏览器按用户的单位就地换算。
 *
 * 温度和风速分开设置（Darren 2026-10-28）：
 * - 温度：°C / °F。降水和能见度跟随温度：°F 用户显示英寸、英里，°C 用户显示毫米、公里。
 * - 风速：km/h / m/s / mph，默认按地区。
 */
export type TempUnit = 'c' | 'f';
export type WindUnit = 'kmh' | 'ms' | 'mph';
export interface Units {
  temp: TempUnit;
  wind: WindUnit;
}

/** 默认使用华氏度的国家和地区（美国及少数几个使用美制单位的地区） */
const FAHRENHEIT_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'PR', 'GU', 'VI', 'AS']);
/** 风速习惯用 mph 的地区：美国及其属地、英国 */
const MPH_REGIONS = new Set([...FAHRENHEIT_REGIONS, 'GB', 'IM', 'JE', 'GG']);
/** 风速习惯用 m/s 的地区：北欧、俄罗斯和部分前苏联国家、日本、韩国 */
const MS_REGIONS = new Set(['NO', 'SE', 'FI', 'DK', 'IS', 'FO', 'GL', 'RU', 'BY', 'UA', 'KZ', 'EE', 'LV', 'LT', 'JP', 'KR']);
/** 浏览器语言没带地区时按语言推断 m/s */
const MS_LANGS = new Set(['no', 'nb', 'nn', 'sv', 'fi', 'da', 'is', 'ru', 'be', 'uk', 'kk', 'et', 'lv', 'lt', 'ja', 'ko']);

function regionOf(tag: string): string | null {
  const region = tag.replace(/_/g, '-').split('-').find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : null;
}

/** 按浏览器语言里的地区决定默认单位，例如 en-US → °F + mph，en-GB → °C + mph，ru-RU → °C + m/s */
export function defaultUnits(locales: readonly string[]): Units {
  for (const tag of locales) {
    const region = regionOf(tag);
    if (region) {
      return {
        temp: FAHRENHEIT_REGIONS.has(region) ? 'f' : 'c',
        wind: MPH_REGIONS.has(region) ? 'mph' : MS_REGIONS.has(region) ? 'ms' : 'kmh',
      };
    }
  }
  const base = (locales[0] ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return { temp: 'c', wind: MS_LANGS.has(base) ? 'ms' : 'kmh' };
}

/** 旧版只保存了 metric / imperial */
export function fromLegacy(saved: string | null, fallback: Units): Units | null {
  if (saved === 'imperial') return { temp: 'f', wind: 'mph' };
  if (saved === 'metric') return { temp: 'c', wind: fallback.wind === 'mph' ? 'kmh' : fallback.wind };
  return null;
}

export function parseUnits(raw: string | null): Units | null {
  try {
    const u = JSON.parse(raw ?? '') as Partial<Units>;
    if ((u.temp === 'c' || u.temp === 'f') && (u.wind === 'kmh' || u.wind === 'ms' || u.wind === 'mph')) return { temp: u.temp, wind: u.wind };
  } catch {
    // 忽略损坏的设置
  }
  return null;
}

export const cToF = (c: number): number => (c * 9) / 5 + 32;

export function formatTemp(c: number, u: Units): string {
  return String(Math.round(u.temp === 'f' ? cToF(c) : c));
}

/** 温差（往年对比用）：°F 的温差 = °C 温差 × 1.8 */
export function formatTempDelta(dc: number, u: Units): string {
  const v = Math.round(u.temp === 'f' ? dc * 1.8 : dc);
  return v > 0 ? `+${v}` : String(v);
}

export function formatSpeed(ms: number, u: Units): { value: string; unit: string } {
  if (u.wind === 'mph') return { value: String(Math.round(ms * 2.23694)), unit: 'mph' };
  if (u.wind === 'ms') return { value: String(Math.round(ms)), unit: 'm/s' };
  return { value: String(Math.round(ms * 3.6)), unit: 'km/h' };
}

export function formatPrecip(mm: number, u: Units): { value: string; unit: string } {
  return u.temp === 'f' ? { value: (mm / 25.4).toFixed(2), unit: 'in' } : { value: mm.toFixed(1), unit: 'mm' };
}

/** 能见度等距离（数据是米） */
export function formatDistance(m: number, u: Units): { value: string; unit: string } {
  if (u.temp === 'f') {
    const mi = m / 1609.344;
    return { value: mi < 10 ? (Math.round(mi * 10) / 10).toString() : String(Math.round(mi)), unit: 'mi' };
  }
  const km = m / 1000;
  return { value: km < 10 ? (Math.round(km * 10) / 10).toString() : String(Math.round(km)), unit: 'km' };
}
