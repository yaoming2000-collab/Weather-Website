/**
 * 有实时雷达的国家（Foreca 地图图层文档 developer.foreca.com/map-layers，2026-10-22）。
 * 用于降雨时间轴：有雷达的地区缓存更短、文案可以精确到分钟。
 *
 * 匹配依据是 Foreca 地点接口返回的英文国家名。
 * 待办：Foreca 试用期内用真实数据核对国家名的写法（如 "Turkey" / "Türkiye"），并更新此表。
 */
const RADAR_COUNTRIES = new Set(
  [
    // 欧洲
    'Albania', 'Andorra', 'Austria', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Czech Republic',
    'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy',
    'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Monaco', 'Montenegro', 'Netherlands',
    'North Macedonia', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
    'Switzerland', 'United Kingdom',
    // 北美、拉美
    'United States', 'Canada', 'Mexico', 'Brazil',
    // 亚太
    'Japan', 'Taiwan', 'South Korea', 'Korea, Republic of', 'Thailand', 'Philippines', 'Malaysia', 'Vietnam', 'Viet Nam',
    'Singapore', 'Brunei', 'Australia',
    // 其他
    'Turkey', 'Türkiye',
  ].map((n) => n.toLowerCase()),
);

export function hasRadar(country: string | null | undefined): boolean {
  return !!country && RADAR_COUNTRIES.has(country.trim().toLowerCase());
}
