import type {
  AirQualityPoint,
  ClimateDay,
  ClimateMonth,
  CurrentWeather,
  DailyPoint,
  HourlyPoint,
  NowcastPoint,
  WeatherLocation,
} from './types';

/**
 * 天气供应商接口。网站其他部分只通过这个接口拿数据。
 * 换供应商 = 新写一个实现这个接口的类，再在 src/weather/index.ts 里切换。
 */
export interface WeatherProvider {
  readonly name: string;
  /** 离给定坐标最近的地点 */
  nearestLocation(lat: number, lon: number): Promise<WeatherLocation>;
  locationById(id: string): Promise<WeatherLocation>;
  searchLocations(query: string, lang: string): Promise<WeatherLocation[]>;
  current(id: string): Promise<CurrentWeather>;
  hourly(id: string, hours: number): Promise<HourlyPoint[]>;
  daily(id: string, days: number): Promise<DailyPoint[]>;
  airQuality(id: string, hours: number): Promise<AirQualityPoint[]>;
  /** monthDay 形如 "10-22" */
  climateDay(id: string, monthDay: string): Promise<ClimateDay>;
  climateMonthly(id: string): Promise<ClimateMonth[]>;
  /** 未来约 2 小时、15 分钟一档的降水 */
  nowcast(id: string): Promise<NowcastPoint[]>;
}

/** 供应商返回错误（网络失败、非 200、数据缺失）。 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
