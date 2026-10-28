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
  /** 今天和往年同日的对比；缺少气候数据或今天的预报时为 null（页面不显示标签） */
  comparison: TodayComparison | null;
  /** 首页标签（温度或热带城市的降水） */
  label: ClimateLabel | null;
  /** 15 天对比图 */
  series: ClimateSeriesPoint[];
  /** "往年同期 15 天里平均约 X 天下雨，未来 15 天预计 Y 天" */
  rain: RainComparison | null;
  /** 降雨时间轴；晴天（没有请求逐 15 分钟数据）为 null */
  nowcast: NowcastSummary | null;
  life: LifeIndex[];
  /** 每日预报，从城市当地的今天开始 */
  days: DailyPoint[];
}

export function cityFeatures(bundle: CityBundle, nowMs: number): CityFeatures {
  const daily = bundle.daily?.data ?? [];
  const months = bundle.climateMonthly?.data ?? null;
  const climate = bundle.climate?.data ?? null;
  const todayPoint = daily.find((d) => d.date === bundle.today);
  const fromToday = todayPoint ? daily.slice(daily.indexOf(todayPoint)) : daily;

  const comparison = compareToday(todayPoint, climate);
  const series = climateSeries(fromToday, months, climate);
  return {
    comparison,
    label: climateLabel(bundle.location, comparison, series, months),
    series,
    rain: rainComparison(fromToday, months),
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
    avgMaxTemp: comparison.avgMaxTemp,
    level: comparison.level,
    updatedAt: nowMs,
    // 排行榜只算城市当地的"今天"：过了当地午夜就不上榜，等有人再访问时写入新的一天
    validUntil: nextLocalMidnight(nowMs, bundle.location.timezone),
  };
}
