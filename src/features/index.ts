import type { CityBundle } from '../weather/service';
import type { DailyPoint } from '../weather/types';
import { nextLocalMidnight } from '../time/cityTime';
import {
  climateLabel,
  climateSeries,
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
  /** 15 天对比图 */
  series: ClimateSeriesPoint[];
  /** "去年这 15 天里 X 天下雨，今年预计 Y 天" */
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
  const series = climateSeries(fromToday, lastYear);
  return {
    comparison,
    label: climateLabel(comparison),
    series,
    rain: rainComparison(fromToday, lastYear),
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

/** 排行榜要记录的一行；没有今天的对比时为 null */
export function anomalyRecord(bundle: CityBundle, comparison: TodayComparison | null, nowMs: number): AnomalyRecord | null {
  if (!comparison) return null;
  return {
    cityId: bundle.location.id,
    name: bundle.location.name,
    country: bundle.location.country,
    date: comparison.date,
    deltaMax: comparison.deltaMax,
    maxTemp: comparison.maxTemp,
    avgMaxTemp: comparison.lastMaxTemp,
    level: comparison.level,
    updatedAt: nowMs,
    // 排行榜只算城市当地的"今天"：过了当地午夜就不上榜，等有人再访问时写入新的一天
    validUntil: nextLocalMidnight(nowMs, bundle.location.timezone),
  };
}

/**
 * 用当天定下来的对比结果（见 FeatureStore.freezeComparison）替换刚算出来的：
 * 今天的预报一天里会更新，答案中途翻转会让"连续猜对"不公平，所以每个城市每天以第一次算出的为准。
 * 15 天对比图的第一个点（今天）也换成同一个数，和标签一致。
 */
export function withFrozenComparison(features: CityFeatures, frozen: TodayComparison | null): CityFeatures {
  if (!frozen || !features.comparison || frozen.date !== features.comparison.date) return features;
  const series = features.series.map((p) =>
    p.date === frozen.date ? { ...p, maxTemp: frozen.maxTemp, lastMaxTemp: frozen.lastMaxTemp, delta: frozen.deltaMax, level: frozen.level } : p,
  );
  return { ...features, comparison: frozen, label: climateLabel(frozen), series };
}
