import { localDate, localParts, monthDayOf, toLocalIso } from '../time/cityTime';
import { iconFor } from './icons';
import { ProviderError, type WeatherProvider } from './provider';
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
 * 模拟天气数据，用于开发和预览（WEATHER_PROVIDER=mock）。
 * 数据按城市和日期确定性生成：同一天反复打开看到的值相同，方便对比和测试。
 * 刻意覆盖各种天气代码（晴、雨、雷、雪、雾、夜间），方便检查图标。
 */

export const MOCK_LOCATIONS: WeatherLocation[] = [
  { id: '102643743', name: 'London', adminArea: 'England', country: 'United Kingdom', timezone: 'Europe/London', lat: 51.5085, lon: -0.1257 },
  { id: '104686017', name: 'Cheney', adminArea: 'Kansas', country: 'United States', timezone: 'America/Chicago', lat: 37.6331, lon: -97.7825 },
  { id: '100745044', name: 'Istanbul', adminArea: 'Istanbul', country: 'Turkey', timezone: 'Europe/Istanbul', lat: 41.0138, lon: 28.9497 },
  { id: '100108410', name: 'Riyadh', adminArea: 'Riyadh Region', country: 'Saudi Arabia', timezone: 'Asia/Riyadh', lat: 24.6877, lon: 46.7219 },
  { id: '101581130', name: 'Hanoi', adminArea: 'Hanoi', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh', lat: 21.0245, lon: 105.8412 },
  { id: '101796236', name: 'Shanghai', adminArea: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai', lat: 31.2222, lon: 121.4581 },
  { id: '100524901', name: 'Moscow', adminArea: 'Moscow', country: 'Russia', timezone: 'Europe/Moscow', lat: 55.7522, lon: 37.6156 },
];

/** 简单的确定性伪随机数（0–1） */
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 依次轮换的天气类型（不含 d/n），保证预览时能看到各种图标 */
const SYMBOL_CYCLE = ['000', '100', '200', '300', '400', '210', '220', '430', '240', '411', '212', '432', '600', '500'];

function baseTemp(loc: WeatherLocation, monthIndex: number): number {
  // 粗略模拟：纬度越高越冷，北半球 7 月最热
  const seasonal = Math.cos(((monthIndex - 6.5) / 12) * 2 * Math.PI) * -1;
  const south = loc.lat < 0 ? -1 : 1;
  return 28 - Math.abs(loc.lat) * 0.45 + seasonal * south * (4 + Math.abs(loc.lat) * 0.18);
}

export class MockProvider implements WeatherProvider {
  readonly name = 'mock';

  constructor(private readonly now: () => number = () => Date.now()) {}

  private find(id: string): WeatherLocation {
    const loc = MOCK_LOCATIONS.find((l) => l.id === id);
    if (!loc) throw new ProviderError(`Unknown mock location ${id}`, 404);
    return loc;
  }

  private symbolFor(loc: WeatherLocation, dayKey: string, hour: number): string {
    const i = Math.floor(rand(`${loc.id}|${dayKey}`) * SYMBOL_CYCLE.length);
    const code = SYMBOL_CYCLE[(i + Math.floor(hour / 6)) % SYMBOL_CYCLE.length] ?? '000';
    const night = hour < 6 || hour >= 19;
    return `${night ? 'n' : 'd'}${code}`;
  }

  private tempAt(loc: WeatherLocation, epochMs: number): number {
    const p = localParts(epochMs, loc.timezone);
    const base = baseTemp(loc, p.month - 1);
    const dayShift = (rand(`${loc.id}|${p.year}-${p.month}-${p.day}`) - 0.4) * 8;
    const diurnal = Math.cos(((p.hour - 15) / 24) * 2 * Math.PI) * 5;
    return round1(base + dayShift + diurnal);
  }

  private rateFor(symbol: string, seed: string): number {
    const precip = Number(symbol[2] ?? '0');
    if (precip === 0) return 0;
    const r = rand(seed);
    return round1(precip === 1 ? r * 0.8 : precip === 4 ? 1 + r * 6 : 0.5 + r * 5);
  }

  async nearestLocation(lat: number, lon: number): Promise<WeatherLocation> {
    let best = MOCK_LOCATIONS[0]!;
    let bestD = Infinity;
    for (const l of MOCK_LOCATIONS) {
      const d = (l.lat - lat) ** 2 + (l.lon - lon) ** 2;
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  async locationById(id: string) {
    return this.find(id);
  }

  async searchLocations(query: string): Promise<WeatherLocation[]> {
    const q = query.trim().toLowerCase();
    return q ? MOCK_LOCATIONS.filter((l) => l.name.toLowerCase().includes(q)) : [];
  }

  async current(id: string): Promise<CurrentWeather> {
    const loc = this.find(id);
    const now = this.now();
    const hour = localParts(now, loc.timezone).hour;
    const symbol = this.symbolFor(loc, localDate(now, loc.timezone), hour);
    const temperature = this.tempAt(loc, now);
    const precipRate = this.rateFor(symbol, `${id}|now|${hour}`);
    return {
      time: toLocalIso(now, loc.timezone),
      symbol,
      icon: iconFor({ symbol, precipRate, temperature }),
      temperature,
      feelsLike: round1(temperature - 1.5),
      humidity: Math.round(40 + rand(`${id}|hum|${hour}`) * 50),
      dewPoint: round1(temperature - 6),
      windSpeed: round1(1 + rand(`${id}|wind|${hour}`) * 8),
      windGust: round1(4 + rand(`${id}|gust|${hour}`) * 10),
      windDir: Math.round(rand(`${id}|dir|${hour}`) * 359),
      precipProb: precipRate > 0 ? 80 : 5,
      precipRate,
      cloudiness: Number(symbol[1] ?? 0) * 25,
      thunderProb: symbol[2] === '4' ? 70 : 0,
      uvIndex: hour >= 7 && hour <= 17 ? Math.round(rand(`${id}|uv`) * 8) : 0,
      pressure: Math.round(1000 + rand(`${id}|p`) * 30),
      // 每个城市留一个缺失值，用来检查页面的"—"显示
      visibility: id === '100108410' ? null : Math.round(8000 + rand(`${id}|vis`) * 20000),
    };
  }

  async hourly(id: string, hours: number): Promise<HourlyPoint[]> {
    const loc = this.find(id);
    const start = Math.floor(this.now() / 3600_000) * 3600_000;
    return Array.from({ length: hours }, (_, i) => {
      const t = start + i * 3600_000;
      const p = localParts(t, loc.timezone);
      const symbol = this.symbolFor(loc, localDate(t, loc.timezone), p.hour);
      const temperature = this.tempAt(loc, t);
      const precipAccum = this.rateFor(symbol, `${id}|h|${t}`);
      return {
        time: toLocalIso(t, loc.timezone),
        symbol,
        icon: iconFor({ symbol, precipRate: precipAccum, temperature }),
        temperature,
        feelsLike: round1(temperature - 1.5),
        precipProb: precipAccum > 0 ? Math.round(50 + rand(`${id}|pp|${t}`) * 50) : Math.round(rand(`${id}|pp|${t}`) * 20),
        precipAccum,
        windSpeed: round1(1 + rand(`${id}|w|${t}`) * 8),
        windDir: Math.round(rand(`${id}|d|${t}`) * 359),
        humidity: Math.round(40 + rand(`${id}|hm|${t}`) * 50),
        uvIndex: p.hour >= 7 && p.hour <= 17 ? Math.round(rand(`${id}|uv|${t}`) * 8) : 0,
      };
    });
  }

  async daily(id: string, days: number): Promise<DailyPoint[]> {
    const loc = this.find(id);
    const now = this.now();
    return Array.from({ length: days }, (_, i) => {
      const t = now + i * 86400_000;
      const date = localDate(t, loc.timezone);
      const symbol = `d${(this.symbolFor(loc, date, 12)).slice(1)}`;
      const base = baseTemp(loc, localParts(t, loc.timezone).month - 1) + (rand(`${id}|${date}`) - 0.4) * 8;
      const maxTemp = round1(base + 5);
      const minTemp = round1(base - 5);
      return {
        date,
        symbol,
        icon: iconFor({ symbol, precipRate: null, temperature: maxTemp }),
        maxTemp,
        minTemp,
        precipProb: symbol[2] === '0' ? Math.round(rand(`${id}|dp|${date}`) * 20) : Math.round(50 + rand(`${id}|dp|${date}`) * 50),
        precipAccum: symbol[2] === '0' ? 0 : round1(rand(`${id}|da|${date}`) * 15),
        maxWindSpeed: round1(3 + rand(`${id}|dw|${date}`) * 10),
        uvIndex: Math.round(rand(`${id}|du|${date}`) * 9),
        sunrise: '06:42:00',
        sunset: '17:58:00',
      };
    });
  }

  async airQuality(id: string, hours: number): Promise<AirQualityPoint[]> {
    const loc = this.find(id);
    const start = Math.floor(this.now() / 3600_000) * 3600_000;
    return Array.from({ length: hours }, (_, i) => {
      const t = start + i * 3600_000;
      const aqi = Math.round(15 + rand(`${id}|aqi|${Math.floor(i / 6)}`) * 120);
      return {
        time: toLocalIso(t, loc.timezone),
        aqi,
        pollutant: 'Particulate matter <2.5um',
        pm25: aqi,
        pm10: Math.round(aqi * 0.7),
        o3: Math.round(aqi * 0.5),
        no2: Math.round(aqi * 0.3),
        so2: Math.round(aqi * 0.1),
        co: Math.round(aqi * 0.05),
      };
    });
  }

  async climateDay(id: string, monthDay: string): Promise<ClimateDay> {
    const loc = this.find(id);
    const month = Number(monthDay.slice(0, 2)) - 1;
    const base = baseTemp(loc, month);
    return { monthDay, avgMaxTemp: round1(base + 4), avgMinTemp: round1(base - 4), avgTemp: round1(base) };
  }

  async climateMonthly(id: string): Promise<ClimateMonth[]> {
    const loc = this.find(id);
    return Array.from({ length: 12 }, (_, m) => {
      const base = baseTemp(loc, m);
      return {
        month: m + 1,
        avgMaxTemp: round1(base + 4),
        avgMinTemp: round1(base - 4),
        precipSum: round1(20 + rand(`${id}|ps|${m}`) * 100),
        rainDays: round1(3 + rand(`${id}|rd|${m}`) * 15),
      };
    });
  }

  async nowcast(id: string): Promise<NowcastPoint[]> {
    const loc = this.find(id);
    const start = Math.floor(this.now() / 900_000) * 900_000;
    const raining = rand(`${id}|nc|${localDate(start, loc.timezone)}`) > 0.5;
    return Array.from({ length: 8 }, (_, i) => {
      const t = start + i * 900_000;
      const rate = raining && i >= 2 && i <= 5 ? round1(0.3 + i * 0.4) : 0;
      return { time: toLocalIso(t, loc.timezone), precipRate: rate, precipProb: rate > 0 ? 70 : 10, symbol: rate > 0 ? 'd320' : 'd200' };
    });
  }
}

/** 模拟城市当天的月-日，测试用 */
export function mockMonthDay(nowMs: number, loc: WeatherLocation): string {
  return monthDayOf(localDate(nowMs, loc.timezone));
}
