import { describe, expect, it } from 'vitest';
import { ForecaProvider } from '../src/weather/foreca/client';
import { ProviderError } from '../src/weather/provider';

/** 以下样例数据摘自 Foreca 官方文档 developer.foreca.com（2026-10-22） */
const FIXTURES: Record<string, unknown> = {
  '/api/v1/location/-0.1278,51.5074': {
    id: 102643743, name: 'London', country: 'United Kingdom', timezone: 'Europe/London', language: 'en',
    adminArea: 'England', adminArea2: 'Greater London', adminArea3: null, lon: -0.1257, lat: 51.5085,
  },
  '/api/v1/current/102643743': {
    current: {
      time: '2021-12-20T09:28+02:00', symbol: 'n000', symbolPhrase: 'clear', temperature: -11.76, feelsLikeTemp: -18.97,
      relHumidity: 69, dewPoint: -15.81, windSpeed: 4.25, windDir: 16, windDirString: 'N', windGust: 11.66,
      precipProb: 1, precipRate: 0, cloudiness: 3, thunderProb: 0, uvIndex: 0, pressure: 1020.95, visibility: null,
    },
  },
  '/api/v1/forecast/hourly/102643743': {
    forecast: [
      { time: '2021-12-20T13:00+04:00', symbol: 'd400', temperature: -0.78, feelsLikeTemp: -6, windSpeed: 4.68, windGust: 10.43,
        relHumidity: 73, dewPoint: -3.59, windDir: 250, windDirString: 'W', precipProb: 44, precipAccum: 0.01, uvIndex: 0 },
      { time: null, symbol: 'd400' },
    ],
  },
  '/api/v1/forecast/daily/102643743': {
    forecast: [
      { date: '2026-08-12', symbol: 'd210', maxTemp: 18.03, minTemp: 9.12, precipProb: 39, precipAccum: 0.31,
        maxWindSpeed: 6.83, uvIndex: 3.22, sunrise: '05:25:32', sunset: '21:24:35' },
    ],
  },
  '/api/v1/air-quality/forecast/hourly/102643743': {
    forecast: [{ time: '2022-02-03T10:00Z', pollutant: 'Particulate matter <2.5um', AQI: 102, AQI_CO: 8, AQI_NO2: 6, AQI_O3: 24, AQI_SO2: 4, AQI_PM10: 64, AQI_PM2P5: 102 }],
  },
  '/api/v1/climate/daily/102643743': { climate: [{ month: '01', day: '12', avgMinTemp: -4.53, avgTemp: -2.77, avgMaxTemp: -0.87 }] },
  '/api/v1/climate/monthly/102643743': {
    climate: [{ month: '01', dayMaxTemp: -0.76, dayMinTemp: -5.68, dayAvgTemp: -3.2, precipSum: 55.17, dailyPrecip: 1.78, rainDays: 19.09 }],
  },
  '/api/v1/forecast/15minutely/102643743': {
    forecast: [{ time: '2021-12-20T10:30+01:00', symbol: 'd421', precipProb: 82, precipRate: 0.05 }],
  },
};

function fakeFetch(calls: { url: URL; auth: string | null }[]) {
  return async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, auth: new Headers(init?.headers).get('Authorization') });
    const body = FIXTURES[url.pathname];
    if (!body) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

describe('ForecaProvider', () => {
  it('refuses to start without a token', () => {
    expect(() => new ForecaProvider('')).toThrow(ProviderError);
  });

  it('sends the token and uses lon,lat order for coordinates', async () => {
    const calls: { url: URL; auth: string | null }[] = [];
    const p = new ForecaProvider('secret', fakeFetch(calls));
    const loc = await p.nearestLocation(51.5074, -0.1278);
    expect(loc).toMatchObject({ id: '102643743', name: 'London', timezone: 'Europe/London', country: 'United Kingdom' });
    expect(calls[0]!.auth).toBe('Bearer secret');
    expect(calls[0]!.url.pathname).toBe('/api/v1/location/-0.1278,51.5074');
  });

  it('maps current weather and keeps missing values as null', async () => {
    const p = new ForecaProvider('secret', fakeFetch([]));
    const c = await p.current('102643743');
    expect(c.icon).toBe('night');
    expect(c.temperature).toBeCloseTo(-11.76);
    expect(c.visibility).toBeNull();
  });

  it('maps hourly, daily, air quality, climate and nowcast', async () => {
    const calls: { url: URL; auth: string | null }[] = [];
    const p = new ForecaProvider('secret', fakeFetch(calls));

    const hourly = await p.hourly('102643743', 24);
    expect(hourly).toHaveLength(1); // 没有时间的条目被丢弃
    expect(hourly[0]).toMatchObject({ icon: 'cloudy', precipProb: 44 });
    // 默认数据集没有湿度和紫外线，必须要 full
    expect(calls.at(-1)!.url.searchParams.get('dataset')).toBe('full');

    const daily = await p.daily('102643743', 15);
    expect(daily[0]).toMatchObject({ date: '2026-08-12', icon: 'rainy-light', maxTemp: 18.03, sunrise: '05:25:32' });
    expect(calls.at(-1)!.url.searchParams.get('dataset')).toBe('full');
    expect(calls.at(-1)!.url.searchParams.get('periods')).toBe('15');

    const air = await p.airQuality('102643743', 24);
    expect(air[0]).toMatchObject({ aqi: 102, pm25: 102, o3: 24 });

    const cd = await p.climateDay('102643743', '01-12');
    expect(cd).toMatchObject({ monthDay: '01-12', avgMaxTemp: -0.87 });
    expect(calls.at(-1)!.url.searchParams.get('monthday')).toBe('01-12');

    const cm = await p.climateMonthly('102643743');
    expect(cm[0]).toMatchObject({ month: 1, rainDays: 19.09 });

    const nc = await p.nowcast('102643743');
    expect(nc[0]).toMatchObject({ precipRate: 0.05, precipProb: 82 });
  });

  it('turns HTTP errors into ProviderError with the status', async () => {
    const p = new ForecaProvider('secret', fakeFetch([]));
    await expect(p.current('999')).rejects.toMatchObject({ status: 404 });
  });

  it('retries once when rate-limited or the server hiccups', async () => {
    for (const status of [429, 503]) {
      let n = 0;
      const p = new ForecaProvider('secret', async (input, init) => {
        n++;
        if (n === 1) return new Response('slow down', { status });
        return fakeFetch([])(input, init);
      }, 8000, 1);
      const nc = await p.nowcast('102643743');
      expect(nc[0], String(status)).toMatchObject({ precipRate: 0.05 });
      expect(n, String(status)).toBe(2);
    }
  });

  it('does not retry other errors, and gives up after one retry', async () => {
    let n = 0;
    const p404 = new ForecaProvider('secret', async () => (n++, new Response('no', { status: 404 })), 8000, 1);
    await expect(p404.current('1')).rejects.toMatchObject({ status: 404 });
    expect(n).toBe(1);
    n = 0;
    const p429 = new ForecaProvider('secret', async () => (n++, new Response('no', { status: 429 })), 8000, 1);
    await expect(p429.current('1')).rejects.toMatchObject({ status: 429 });
    expect(n).toBe(2);
  });

  it('turns network failures into ProviderError', async () => {
    const p = new ForecaProvider('secret', async () => {
      throw new Error('boom');
    });
    await expect(p.current('1')).rejects.toBeInstanceOf(ProviderError);
  });
});
