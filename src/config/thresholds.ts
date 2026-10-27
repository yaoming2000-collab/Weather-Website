/**
 * 可调整的规则参数。改这里不需要动业务代码。
 */

/** 图标映射用的降水率阈值（mm/h），见需求文档"天气图标与状态"。 */
export const ICON_THRESHOLDS = {
  /** 小于此值的小雨显示为毛毛雨 */
  drizzleBelow: 0.3,
  /** 中雨、雨夹雪大于等于此值显示为大雨、大雨夹雪 */
  heavyRainAtLeast: 4,
  /** 中雪大于等于此值（水当量）显示为大雪 */
  heavySnowAtLeast: 2,
  /** 雷暴降水率小于此值显示为干雷 */
  dryThunderBelow: 0.1,
  /** 雷暴降水率小于此值显示为弱雷雨 */
  lightThunderBelow: 1,
  /** 下雨且气温小于等于此值显示为冻雨 */
  freezingAtOrBelow: 0,
} as const;

/**
 * sleet-moderate 这张图原来误画了闪电，2026-10-27 已修好（闪电换成三滴雨，和 4 片雪花一起：介于小、大雨夹雪之间）。
 * 改回 false 时，中雨夹雪会改用 sleet-light。
 */
export const SLEET_MODERATE_ICON_FIXED = true;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 服务器端天气数据的缓存时长（秒），见需求文档"天气数据：切换到 Foreca"。
 * 过期后下一个访问者触发重新获取；获取失败时，在 maxStale 内继续用旧数据。
 */
export const DATA_TTL = {
  location: 30 * DAY,
  current: 20 * MINUTE,
  hourly: 1 * HOUR,
  daily: 3 * HOUR,
  airQuality: 1 * HOUR,
  climateDaily: 365 * DAY,
  climateMonthly: 30 * DAY,
  nowcastRadar: 10 * MINUTE,
  nowcastModel: 30 * MINUTE,
} as const;

/** 供应商出错时，旧数据最多还能用多久（秒）。 */
export const MAX_STALE_SECONDS = 6 * HOUR;

/** 城市页面在 CDN 的缓存时长（秒）。 */
export const PAGE_TTL = 5 * MINUTE;
export const PAGE_STALE_WHILE_REVALIDATE = 60;

/** 访客位置拿不到时使用的默认位置（伦敦）。 */
export const FALLBACK_COORDS = { lat: 51.5074, lon: -0.1278 } as const;
