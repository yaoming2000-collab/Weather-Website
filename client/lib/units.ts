/**
 * 单位换算。页面统一按摄氏度、km/h、mm 输出，浏览器按用户的单位就地换算。
 */
export type UnitSystem = 'metric' | 'imperial';

/** 默认使用华氏度的国家和地区（美国及少数几个使用美制单位的地区） */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'PR', 'GU', 'VI', 'AS']);

/** 按浏览器语言里的地区决定默认单位，例如 en-US → 华氏度 */
export function defaultSystem(locales: readonly string[]): UnitSystem {
  for (const tag of locales) {
    const region = tag.replace(/_/g, '-').split('-').find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
    if (region) return IMPERIAL_REGIONS.has(region.toUpperCase()) ? 'imperial' : 'metric';
  }
  return 'metric';
}

export const cToF = (c: number): number => (c * 9) / 5 + 32;

export function formatTemp(c: number, system: UnitSystem): string {
  return String(Math.round(system === 'imperial' ? cToF(c) : c));
}

/** 温差（往年对比用）：°F 的温差 = °C 温差 × 1.8 */
export function formatTempDelta(dc: number, system: UnitSystem): string {
  const v = Math.round(system === 'imperial' ? dc * 1.8 : dc);
  return v > 0 ? `+${v}` : String(v);
}

export function formatSpeed(ms: number, system: UnitSystem): { value: string; unit: string } {
  return system === 'imperial'
    ? { value: String(Math.round(ms * 2.23694)), unit: 'mph' }
    : { value: String(Math.round(ms * 3.6)), unit: 'km/h' };
}

export function formatPrecip(mm: number, system: UnitSystem): { value: string; unit: string } {
  return system === 'imperial' ? { value: (mm / 25.4).toFixed(2), unit: 'in' } : { value: mm.toFixed(1), unit: 'mm' };
}
