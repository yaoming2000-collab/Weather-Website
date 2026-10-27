/**
 * Foreca 接口返回的原始格式（摘自 developer.foreca.com 文档，2026-10-22）。
 * 所有字段都按"可能缺失"处理：Foreca 文档说明上游缺数据时会返回 null。
 */

type N = number | null | undefined;
type S = string | null | undefined;

export interface RawLocation {
  id?: number | string;
  name?: S;
  country?: S;
  timezone?: S;
  language?: S;
  adminArea?: S;
  adminArea2?: S;
  adminArea3?: S;
  lon?: N;
  lat?: N;
}

export interface RawLocationSearch {
  locations?: RawLocation[];
}

export interface RawCurrent {
  current?: {
    time?: S;
    symbol?: S;
    symbolPhrase?: S;
    temperature?: N;
    feelsLikeTemp?: N;
    relHumidity?: N;
    dewPoint?: N;
    windSpeed?: N;
    windDir?: N;
    windDirString?: S;
    windGust?: N;
    precipProb?: N;
    precipRate?: N;
    cloudiness?: N;
    thunderProb?: N;
    uvIndex?: N;
    pressure?: N;
    visibility?: N;
  };
}

export interface RawHourly {
  forecast?: Array<{
    time?: S;
    symbol?: S;
    temperature?: N;
    feelsLikeTemp?: N;
    windSpeed?: N;
    windGust?: N;
    relHumidity?: N;
    windDir?: N;
    precipProb?: N;
    precipAccum?: N;
    uvIndex?: N;
  }>;
}

export interface RawDaily {
  forecast?: Array<{
    date?: S;
    symbol?: S;
    maxTemp?: N;
    minTemp?: N;
    precipProb?: N;
    precipAccum?: N;
    maxWindSpeed?: N;
    uvIndex?: N;
    sunrise?: S;
    sunset?: S;
    maxFeelsLikeTemp?: N;
    minFeelsLikeTemp?: N;
    maxRelHumidity?: N;
    minRelHumidity?: N;
    windDir?: N;
    maxWindGust?: N;
    cloudiness?: N;
    sunhours?: N;
    moonPhase?: N;
    moonrise?: S;
    moonset?: S;
    snowAccum?: N;
  }>;
}

export interface RawAirQuality {
  forecast?: Array<{
    time?: S;
    AQI?: N;
    pollutant?: S;
    AQI_PM2P5?: N;
    AQI_PM10?: N;
    AQI_O3?: N;
    AQI_GO3?: N;
    AQI_NO2?: N;
    AQI_SO2?: N;
    AQI_CO?: N;
  }>;
}

export interface RawClimateDaily {
  climate?: Array<{
    month?: S;
    day?: S;
    avgMinTemp?: N;
    avgTemp?: N;
    avgMaxTemp?: N;
  }>;
}

export interface RawClimateMonthly {
  climate?: Array<{
    month?: S;
    dayMaxTemp?: N;
    dayMinTemp?: N;
    dayAvgTemp?: N;
    precipSum?: N;
    rainDays?: N;
  }>;
}

export interface RawNowcast {
  forecast?: Array<{
    time?: S;
    symbol?: S;
    precipRate?: N;
    precipProb?: N;
  }>;
}
