/**
 * 网站内部使用的天气数据格式，与天气供应商无关。
 * 页面只依赖这里的类型；换供应商时只需要重写 src/weather/<供应商>/ 下的转换代码。
 *
 * 约定：
 * - 温度一律摄氏度，风速一律 m/s，降水 mm，气压 hPa，能见度米。单位换算在显示时做。
 * - 时间字段是城市当地时间的 ISO 字符串（带时差，如 "2026-10-22T14:00+08:00"），
 *   日期字段是城市当地日期 "YYYY-MM-DD"。
 * - 供应商没给的值是 null，页面显示"—"，不能显示成 0。
 */

export interface WeatherLocation {
  id: string;
  name: string;
  /** 州、省等一级行政区 */
  adminArea: string | null;
  /** 国家名称（英文）。ISO 国家代码由第 4 步的城市名对照表补充。 */
  country: string | null;
  /** IANA 时区，如 "Europe/London" */
  timezone: string;
  lat: number;
  lon: number;
}

export interface CurrentWeather {
  time: string;
  /** 供应商原始天气代码（Foreca 为 d000 这类） */
  symbol: string | null;
  /** 我们的图标 key，见 src/weather/icons.ts */
  icon: string;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  dewPoint: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDir: number | null;
  precipProb: number | null;
  precipRate: number | null;
  cloudiness: number | null;
  thunderProb: number | null;
  uvIndex: number | null;
  pressure: number | null;
  visibility: number | null;
}

export interface HourlyPoint {
  time: string;
  symbol: string | null;
  icon: string;
  temperature: number | null;
  feelsLike: number | null;
  precipProb: number | null;
  /** 这一小时的降水量（mm），约等于降水率 mm/h */
  precipAccum: number | null;
  windSpeed: number | null;
  windDir: number | null;
  humidity: number | null;
  uvIndex: number | null;
}

export interface DailyPoint {
  date: string;
  symbol: string | null;
  icon: string;
  maxTemp: number | null;
  minTemp: number | null;
  precipProb: number | null;
  precipAccum: number | null;
  maxWindSpeed: number | null;
  uvIndex: number | null;
  /** 当地时间 "HH:MM:SS"；极昼极夜时为 null */
  sunrise: string | null;
  sunset: string | null;
}

export interface AirQualityPoint {
  time: string;
  aqi: number | null;
  /** 主要污染物 */
  pollutant: string | null;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
}

/** 往年同日平均（1991–2020） */
export interface ClimateDay {
  monthDay: string;
  avgMaxTemp: number | null;
  avgMinTemp: number | null;
  avgTemp: number | null;
}

/** 往年每月平均（1991–2020） */
export interface ClimateMonth {
  month: number;
  avgMaxTemp: number | null;
  avgMinTemp: number | null;
  precipSum: number | null;
  rainDays: number | null;
}

/** 未来约 2 小时、每 15 分钟一个点的降水预报 */
export interface NowcastPoint {
  time: string;
  precipRate: number | null;
  precipProb: number | null;
  symbol: string | null;
}

/** 一份缓存数据的外层：记录获取时间，页面据此显示"更新于 X 分钟前"。 */
export interface Fetched<T> {
  data: T;
  /** 从供应商获取数据的时间（毫秒时间戳） */
  fetchedAt: number;
}
