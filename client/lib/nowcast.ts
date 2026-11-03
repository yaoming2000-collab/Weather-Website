/**
 * 降雨时间轴在浏览器里按当前时间重算（2026-10-30）。
 *
 * "35 分钟后开始下雨"原来是服务器生成页面那一刻算的，页面会缓存（新鲜 5 分钟，过期后还可能先给 30 分钟内的旧页面），
 * 用户也可能一直开着页面，分钟数就会过时，过了开始时刻状态也会错。
 * 服务器把原始的逐 15 分钟数据写进卡片（data-nc），浏览器每分钟用同一个规则（src/features/nowcast.ts）重算。
 */
import { summarizeNowcast, type NowcastSummary } from '../../src/features/nowcast';

/** 卡片上 data-nc 的内容：每格 [开始时间, 降水率 mm/h, Foreca 天气代码] */
export interface NowcastData {
  radar: boolean;
  points: Array<[string, number | null, string | null]>;
  /** 用到的文案（只放这张卡片可能用到的，不放进全站的 strings） */
  strings: Record<string, string>;
}

export function parseNowcastData(raw: string | undefined): NowcastData | null {
  try {
    const d = JSON.parse(raw ?? '') as Partial<NowcastData>;
    if (!d || typeof d.radar !== 'boolean' || !Array.isArray(d.points) || !d.strings || typeof d.strings !== 'object') return null;
    return d as NowcastData;
  } catch {
    return null;
  }
}

/** 按 nowMs 重算；格子全部过去（页面太旧）时返回 null */
export function nowcastAt(d: NowcastData, nowMs: number): NowcastSummary | null {
  const points = d.points
    .filter((p) => Array.isArray(p) && typeof p[0] === 'string')
    .map(([time, precipRate, symbol]) => ({ time, precipRate: typeof precipRate === 'number' ? precipRate : null, precipProb: null, symbol: symbol ?? null }));
  return summarizeNowcast(points, d.radar, nowMs);
}

/** 文案里的 {min}、{dur} 换成数字 */
export function fillText(template: string | undefined, vars: Record<string, number>): string {
  let v = template ?? '';
  for (const [k, x] of Object.entries(vars)) v = v.split(`{${k}}`).join(String(x));
  return v;
}
