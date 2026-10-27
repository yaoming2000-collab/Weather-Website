import { iconFor } from '../icons';
import type {
  AirQualityPoint,
  ClimateDay,
  ClimateMonth,
  CurrentWeather,
  DailyPoint,
  HourlyPoint,
  NowcastPoint,
  WeatherLocation,
} from '../types';
import type {
  RawAirQuality,
  RawClimateDaily,
  RawClimateMonthly,
  RawCurrent,
  RawDaily,
  RawHourly,
  RawLocation,
  RawNowcast,
} from './raw';

/** 把 Foreca 的值统一成 number | null（缺失、NaN 都变 null）。 */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export class ForecaDataError extends Error {}

export function mapLocation(raw: RawLocation): WeatherLocation {
  const id = raw.id === undefined || raw.id === null ? null : String(raw.id);
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  const timezone = str(raw.timezone);
  if (!id || lat === null || lon === null || !timezone) {
    throw new ForecaDataError('Foreca location response is missing id, coordinates or timezone');
  }
  return {
    id,
    name: str(raw.name) ?? id,
    adminArea: str(raw.adminArea),
    country: str(raw.country),
    timezone,
    lat,
    lon,
  };
}

export function mapCurrent(raw: RawCurrent): CurrentWeather {
  const c = raw.current;
  const time = str(c?.time);
  if (!c || !time) throw new ForecaDataError('Foreca current response is empty');
  const temperature = num(c.temperature);
  const precipRate = num(c.precipRate);
  const symbol = str(c.symbol);
  return {
    time,
    symbol,
    icon: iconFor({ symbol, precipRate, temperature }),
    temperature,
    feelsLike: num(c.feelsLikeTemp),
    humidity: num(c.relHumidity),
    dewPoint: num(c.dewPoint),
    windSpeed: num(c.windSpeed),
    windGust: num(c.windGust),
    windDir: num(c.windDir),
    precipProb: num(c.precipProb),
    precipRate,
    cloudiness: num(c.cloudiness),
    thunderProb: num(c.thunderProb),
    uvIndex: num(c.uvIndex),
    pressure: num(c.pressure),
    visibility: num(c.visibility),
  };
}

export function mapHourly(raw: RawHourly): HourlyPoint[] {
  return (raw.forecast ?? []).flatMap((h) => {
    const time = str(h.time);
    if (!time) return [];
    const temperature = num(h.temperature);
    const precipAccum = num(h.precipAccum);
    const symbol = str(h.symbol);
    return [
      {
        time,
        symbol,
        // 一小时的降水量约等于该小时的平均降水率（mm/h）
        icon: iconFor({ symbol, precipRate: precipAccum, temperature }),
        temperature,
        feelsLike: num(h.feelsLikeTemp),
        precipProb: num(h.precipProb),
        precipAccum,
        windSpeed: num(h.windSpeed),
        windDir: num(h.windDir),
        humidity: num(h.relHumidity),
        uvIndex: num(h.uvIndex),
      },
    ];
  });
}

export function mapDaily(raw: RawDaily): DailyPoint[] {
  return (raw.forecast ?? []).flatMap((d) => {
    const date = str(d.date);
    if (!date) return [];
    const symbol = str(d.symbol);
    const maxTemp = num(d.maxTemp);
    const minTemp = num(d.minTemp);
    return [
      {
        date,
        symbol,
        // 日降水量不是降水率，不做强度细分；冻雨按当天最高温判断
        icon: iconFor({ symbol, precipRate: null, temperature: maxTemp }),
        maxTemp,
        minTemp,
        precipProb: num(d.precipProb),
        precipAccum: num(d.precipAccum),
        maxWindSpeed: num(d.maxWindSpeed),
        uvIndex: num(d.uvIndex),
        sunrise: str(d.sunrise),
        sunset: str(d.sunset),
      },
    ];
  });
}

export function mapAirQuality(raw: RawAirQuality): AirQualityPoint[] {
  return (raw.forecast ?? []).flatMap((a) => {
    const time = str(a.time);
    if (!time) return [];
    return [
      {
        time,
        aqi: num(a.AQI),
        pollutant: str(a.pollutant),
        pm25: num(a.AQI_PM2P5),
        pm10: num(a.AQI_PM10),
        // 文档中逐小时接口用 AQI_O3，逐日接口用 AQI_GO3，两者都兼容
        o3: num(a.AQI_O3) ?? num(a.AQI_GO3),
        no2: num(a.AQI_NO2),
        so2: num(a.AQI_SO2),
        co: num(a.AQI_CO),
      },
    ];
  });
}

export function mapClimateDay(raw: RawClimateDaily, monthDay: string): ClimateDay {
  const c = raw.climate?.[0];
  return {
    monthDay,
    avgMaxTemp: num(c?.avgMaxTemp),
    avgMinTemp: num(c?.avgMinTemp),
    avgTemp: num(c?.avgTemp),
  };
}

export function mapClimateMonthly(raw: RawClimateMonthly): ClimateMonth[] {
  return (raw.climate ?? []).flatMap((m) => {
    const month = Number(m.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return [];
    return [
      {
        month,
        avgMaxTemp: num(m.dayMaxTemp),
        avgMinTemp: num(m.dayMinTemp),
        precipSum: num(m.precipSum),
        rainDays: num(m.rainDays),
      },
    ];
  });
}

export function mapNowcast(raw: RawNowcast): NowcastPoint[] {
  return (raw.forecast ?? []).flatMap((p) => {
    const time = str(p.time);
    if (!time) return [];
    return [{ time, precipRate: num(p.precipRate), precipProb: num(p.precipProb), symbol: str(p.symbol) }];
  });
}
