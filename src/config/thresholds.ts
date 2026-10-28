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
  /** Wikidata 的城市名（日语、阿拉伯语等 9 种语言），很少变化 */
  placeNames: 90 * DAY,
  current: 20 * MINUTE,
  hourly: 1 * HOUR,
  /** 另外在城市当地午夜过期（否则过了午夜"今天"还是昨天，15 天预报只剩 14 天） */
  daily: 3 * HOUR,
  /** 空气质量本身是预报，3 小时取一次足够（2026-10-27 从 1 小时改） */
  airQuality: 3 * HOUR,
  climateDaily: 365 * DAY,
  climateMonthly: 30 * DAY,
  nowcastRadar: 10 * MINUTE,
  nowcastModel: 30 * MINUTE,
} as const;

/** 供应商出错时，旧数据最多还能用多久（秒）。 */
export const MAX_STALE_SECONDS = 6 * HOUR;

/**
 * 每次向 Foreca 要多少个时间点（按请求次数计费，与时间点数量无关）。上限见 developer.foreca.com（2026-10-27）。
 * 逐小时 72：明天、后天两页也有完整的逐小时；15 天是接口上限；空气质量 48 小时；降雨时间轴 12 个 15 分钟。
 */
export const FORECAST_PERIODS = { hourly: 72, daily: 15, airQuality: 48, nowcast: 12 } as const;

/** 页面上显示多少个小时（多给 1 个：缓存的页面在浏览器里会隐藏已经过去的那一小时） */
export const HOURS_SHOWN = 25;

/**
 * 取不到的数据也记下来，免得每次都再问一遍 Foreca（秒）。
 * notFound：城市不存在、这个城市没有这类数据（404），全球共享；
 * forbidden：密钥或套餐问题（401/403），只记本机房，期间照常用旧数据；
 * transient：限流、超时、临时故障，只记本机房；没有旧数据可用时只等 transientNoData。
 */
export const FAILURE_TTL = { notFound: 1 * DAY, forbidden: 15 * MINUTE, transient: 2 * MINUTE, transientNoData: 20 } as const;

/** 非必需数据（逐小时、15 天、空气质量、往年、降雨时间轴）最多等多久（毫秒），超时先出页面，下一次再补 */
export const OPTIONAL_DATA_BUDGET_MS = 3000;

/**
 * 错开刷新：各机房的数据同时过期，过期后每个机房按机房代码再等 0 到"新鲜期 × share（最多 maxSeconds）"不等的时间才刷新，
 * 等待期间先看 KV 有没有别的机房刚取的。热门城市因此大多只请求一次 Foreca。代价是数据最多晚这么久更新。
 */
export const REFRESH_STAGGER = { share: 0.25, maxSeconds: 5 * MINUTE } as const;

/** 城市页面在 CDN 的缓存时长（秒）。 */
export const PAGE_TTL = 5 * MINUTE;
/**
 * 页面过期后，还能先给访客旧页面、后台重新生成的时长（秒）。
 * 以前是 60 秒，冷门城市过了这 60 秒，下一个访客就要等全部数据重新取完；现在 30 分钟。
 * 旧页面打开后，浏览器发现实况超过 20 分钟会自动补刷新。
 */
export const PAGE_STALE_WHILE_REVALIDATE = 30 * MINUTE;
/** 页面有部分数据没取到时（例如供应商限流），只缓存这么久（秒），尽快补全 */
export const PARTIAL_PAGE_TTL = 60;

/** 访客位置拿不到时使用的默认位置（伦敦）。 */
export const FALLBACK_COORDS = { lat: 51.5074, lon: -0.1278 } as const;

/** 当前天气超过这么多分钟没更新（接口故障时用的是旧数据），"N 小时前更新"显示成警示色 */
export const STALE_AFTER_MIN = 60;
