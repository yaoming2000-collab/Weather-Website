import { addDays, PAST_DAYS, type CityBundle } from '../weather/service';
import type { DailyPoint } from '../weather/types';
import { nextLocalMidnight } from '../time/cityTime';
import {
  climateLabel,
  pastSeries,
  compareToday,
  rainComparison,
  type ClimateLabel,
  type ClimateSeriesPoint,
  type RainComparison,
  type TodayComparison,
} from './climate';
import { lifeIndices, type LifeIndex } from './life';
import { summarizeNowcast, type NowcastSummary } from './nowcast';
import type { AnomalyRecord } from './store';

/**
 * 城市页面用到的第 3 步功能数据，全部由 CityBundle 计算得到，不额外调用天气接口。
 * 页面（第 3 步界面部分）只需要读这里的结果。
 */
export interface CityFeatures {
  /** 今天和去年同一天的对比；缺少去年数据或今天的预报时为 null（页面显示 "--"） */
  comparison: TodayComparison | null;
  /** 首页标签 */
  label: ClimateLabel | null;
  /** 过去 7 天：今年实际 vs 去年同期（只有过去的日子，猜之前也可以完整显示） */
  series: ClimateSeriesPoint[];
  /** 同样这 7 天：今年 X 天下雨，去年 Y 天 */
  rain: RainComparison | null;
  /** 降雨时间轴；晴天（没有请求逐 15 分钟数据）为 null */
  nowcast: NowcastSummary | null;
  life: LifeIndex[];
  /** 每日预报，从城市当地的今天开始 */
  days: DailyPoint[];
}

export function cityFeatures(bundle: CityBundle, nowMs: number): CityFeatures {
  const daily = bundle.daily?.data ?? [];
  const lastYear = bundle.lastYear?.data ?? null;
  const todayPoint = daily.find((d) => d.date === bundle.today);
  const fromToday = todayPoint ? daily.slice(daily.indexOf(todayPoint)) : daily;

  const comparison = compareToday(todayPoint, lastYear?.[bundle.today]);
  const thisYear = bundle.pastWeek?.data ?? null;
  const series = pastSeries(bundle.today, thisYear, lastYear, PAST_DAYS);
  return {
    comparison,
    label: climateLabel(comparison),
    series,
    rain: rainComparison(
      series.map((p) => p.date),
      thisYear,
      lastYear,
    ),
    nowcast: summarizeNowcast(bundle.nowcast?.data, bundle.radar, nowMs),
    life: lifeIndices({
      current: bundle.current.data,
      hourly: bundle.hourly?.data,
      daily: fromToday,
      air: bundle.air?.data,
      nowMs,
    }),
    days: fromToday,
  };
}

/**
 * 排行榜要记录的一行：昨天（今年实际 vs 去年同一天）；没有昨天的数据时为 null。
 * 排行榜改成"昨天"（2026-10-29）：今天的偏差就是今天猜一猜的答案，不能提前给人看。
 */
export function anomalyRecord(bundle: CityBundle, series: ClimateSeriesPoint[], nowMs: number): AnomalyRecord | null {
  const yesterday = series.at(-1);
  // 只记真正的昨天（图往前挪了一天时不记，免得"昨天"榜上出现前天）
  if (!yesterday || yesterday.date !== addDays(bundle.today, -1) || yesterday.delta === null || yesterday.maxTemp === null || yesterday.lastMaxTemp === null) return null;
  return {
    cityId: bundle.location.id,
    name: bundle.location.name,
    country: bundle.location.country,
    date: yesterday.date,
    deltaMax: yesterday.delta,
    maxTemp: yesterday.maxTemp,
    avgMaxTemp: yesterday.lastMaxTemp,
    level: yesterday.level ?? 'normal',
    updatedAt: nowMs,
    // 只在城市当地的今天上榜（记的是这座城市的"昨天"）：过了当地午夜就不上榜，等有人再访问时写入新的一天
    validUntil: nextLocalMidnight(nowMs, bundle.location.timezone),
  };
}

/**
 * 用当天定下来的对比结果（见 FeatureStore.freezeComparison）替换刚算出来的：
 * 今天的预报一天里会更新，答案中途翻转会让"连续猜对"不公平，所以每个城市每天以第一次算出的为准。
 */
export function withFrozenComparison(features: CityFeatures, frozen: TodayComparison | null): CityFeatures {
  if (!frozen || (features.comparison && frozen.date !== features.comparison.date)) return features;
  return { ...features, comparison: frozen, label: climateLabel(frozen) };
}
