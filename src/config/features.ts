/**
 * 第 3 步新功能的可调整规则：往年对比、猜一猜、排行榜、降雨时间轴、生活指数。
 * 改这里不需要动业务代码。生活指数的阈值是开发初稿，需要 Darren 确认（需求文档"待确认"）。
 */

// ---------------------------------------------------------------------------
// 今天比往年热还是冷（需求文档"重点功能"）
// ---------------------------------------------------------------------------

export const CLIMATE = {
  /** 偏差（°C）≥ 此值为"明显偏暖"，≤ 负值为"明显偏冷" */
  muchAtLeast: 6,
  /** 偏差（°C）≥ 此值为"偏暖"，≤ 负值为"偏冷"；之间为"和往年差不多" */
  notableAtLeast: 2,
  /** 往年同日平均最高温 ≥ 此值的城市，偏暖说"更热"、偏冷说"更凉快" */
  hotClimateAtLeast: 22,
  /** 往年同日平均最高温 ≤ 此值的城市，偏暖说"更暖和"、偏冷说"更冷" */
  coldClimateAtMost: 12,
  /**
   * 热带城市：纬度在此范围内，且未来 7 天偏差都在 ±notableAtLeast 以内时，
   * 首页标签改为突出降水（"这个月往年有 18 天下雨"）。
   */
  tropicsLatitude: 23.5,
  tropicalCheckDays: 7,
  /** 本月往年下雨天数少于此值时不用降水标签（例如沙漠城市），仍显示温度标签 */
  tropicalMinRainDays: 5,
  /** 未来 15 天里，每日降水概率 ≥ 此值算"预计下雨的一天" */
  rainyDayProbAtLeast: 50,
} as const;

/** 往年对比的五个等级和颜色（需求文档"分级与颜色"） */
export const CLIMATE_LEVEL_COLORS = {
  'much-warmer': '#b91c1c',
  warmer: '#f97316',
  normal: '#9ca3af',
  cooler: '#7dd3fc',
  'much-cooler': '#1d4ed8',
} as const;

// ---------------------------------------------------------------------------
// 猜一猜 和 全球最反常城市排行榜
// ---------------------------------------------------------------------------

export const GUESS = {
  /** 当天该城市投票满这么多票才显示"X% 的人猜对了" */
  minVotesForPercent: 20,
  /** 计数保留天数 */
  keepDays: 7,
} as const;

export const RANKING = {
  /** 每个榜单显示多少个城市 */
  size: 10,
  /** 只统计最近这么多小时内有人访问过的城市 */
  windowHours: 24,
  /** 排行榜结果缓存时长（秒）：需求文档"每小时更新一次" */
  cacheSeconds: 3600,
  /** 同一个城市最多每隔多久写一次排行榜数据（秒），减少数据库写入 */
  recordEverySeconds: 3600,
  /** 排行榜数据保留天数 */
  keepDays: 2,
} as const;

// ---------------------------------------------------------------------------
// 降雨时间轴（需求文档"降雨时间轴"）
// ---------------------------------------------------------------------------

export const NOWCAST = {
  /** 降水率（mm/h）≥ 此值算"在下雨"。更小的值视为无降水，避免"下 0.01 mm"也提示。 */
  wetAtLeast: 0.1,
  /** 时间轴格子的强度分档（mm/h）：< light 为小，< heavy 为中，≥ heavy 为大 */
  moderateAtLeast: 1,
  heavyAtLeast: 4,
  /** 有雷达地区的分钟数取整到这个粒度 */
  roundMinutesTo: 5,
} as const;

// ---------------------------------------------------------------------------
// 生活指数（需求文档"生活指数"）——开发初稿，待 Darren 确认
// 每个指数分三档：good 适合、fair 一般、poor 不适合。先判断"不适合"，再判断"一般"，都不满足就是"适合"。
// 理由取第一个触发的条件。
// ---------------------------------------------------------------------------

export const LIFE = {
  /** 跑步：看现在和未来 3 小时 */
  running: {
    hours: 3,
    poor: {
      precipProbAtLeast: 60,
      feelsBelow: -10,
      feelsAbove: 32,
      aqiAbove: 150,
      windAtLeast: 14,
    },
    fair: {
      precipProbAtLeast: 30,
      feelsBelow: 0,
      feelsAbove: 27,
      aqiAbove: 100,
      windAtLeast: 9,
      /** 闷热：湿度 ≥ 此值且气温 ≥ humidTempAtLeast */
      humidityAtLeast: 85,
      humidTempAtLeast: 24,
    },
  },
  /** 晾衣：看今天和未来 6 小时 */
  laundry: {
    hours: 6,
    poor: { precipProbAtLeast: 50, humidityAtLeast: 90 },
    fair: { precipProbAtLeast: 30, humidityAtLeast: 75, tempBelow: 5 },
    /** 风速 ≥ 此值（m/s）时理由写"干燥有风，干得快" */
    breezyAtLeast: 3,
  },
  /** 洗车：看今天和明天 */
  carwash: {
    days: 2,
    poor: { precipProbAtLeast: 60, precipAccumAtLeast: 2 },
    fair: { precipProbAtLeast: 30, maxTempAtMost: 0 },
  },
  /** 穿衣：按体感温度（°C）分 7 档，从热到冷，取第一个满足"体感 ≥ 下限"的档 */
  clothing: [
    { band: 'hot', feelsAtLeast: 28 },
    { band: 'warm', feelsAtLeast: 22 },
    { band: 'mild', feelsAtLeast: 16 },
    { band: 'cool', feelsAtLeast: 10 },
    { band: 'chilly', feelsAtLeast: 3 },
    { band: 'cold', feelsAtLeast: -5 },
    { band: 'freezing', feelsAtLeast: -Infinity },
  ],
  /** 防晒：看今天最大紫外线指数（WHO 分级）。< fairAtLeast 不需要，< poorAtLeast 建议，其余必须 */
  sunscreen: { fairAtLeast: 3, poorAtLeast: 6 },
} as const;

// ---------------------------------------------------------------------------
// 背景天空：沙尘和大风（2026-10-27 加）
// ---------------------------------------------------------------------------

export const SKY = {
  /**
   * 沙尘：Foreca 的天气代码里没有沙尘，用空气质量判断。
   * PM10 分指数 ≥ dustAtLeast、而且 PM10 比 PM2.5 高（粗颗粒为主，是沙尘而不是烟雾），且没有雨雪雾时，显示沙尘天空。
   */
  dustAtLeast: 200,
  heavyDustAtLeast: 400,
  /** 风（m/s，取风速和阵风 × 0.7 中较大的）：达到这些值时云飘得更快、雨更斜，并出现风的线条 */
  breezyAtLeast: 6,
  windyAtLeast: 10.8,
  galeAtLeast: 17.2,
} as const;
