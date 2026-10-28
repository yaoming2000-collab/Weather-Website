/**
 * 由天气数据推导出的显示信息（等级、描述、颜色）。
 * 文案 key 沿用旧站 i18n，规则参考旧站 backend/route/index.go。
 */

/** 空气质量等级（旧站 airQualityAQILabel 的分档） */
export function aqiLevel(aqi: number | null): { key: string; color: string; level: number } | null {
  if (aqi === null) return null;
  if (aqi <= 50) return { key: 'AirQualityAQIExcellent', color: '#22c55e', level: 1 };
  if (aqi <= 100) return { key: 'AirQualityAQIGood', color: '#a3e635', level: 2 };
  if (aqi <= 150) return { key: 'AirQualityAQILightPollution', color: '#facc15', level: 3 };
  if (aqi <= 200) return { key: 'AirQualityAQIModeratePollution', color: '#f97316', level: 4 };
  if (aqi <= 300) return { key: 'AirQualityAQIHeavyPollution', color: '#ef4444', level: 5 };
  return { key: 'AirQualityAQISeverePollution', color: '#a855f7', level: 6 };
}

/** AQI 在 0–500 色条上的位置（百分比） */
export function aqiPercent(aqi: number | null): number {
  if (aqi === null) return 0;
  return Math.max(0, Math.min(100, (aqi / 300) * 100));
}

export function uvLevelKey(uv: number | null): string | null {
  if (uv === null) return null;
  if (uv <= 2) return 'UVLow';
  if (uv <= 5) return 'UVModerate';
  if (uv <= 7) return 'UVHigh';
  if (uv <= 10) return 'UVVeryHigh';
  return 'UVExtreme';
}

export function visibilityKey(meters: number | null): string {
  if (meters === null) return 'VisibilityCurrent';
  if (meters >= 10000) return 'VisibilityPerfect';
  if (meters >= 5000) return 'VisibilityClear';
  if (meters >= 1000) return 'VisibilityModerate';
  return 'VisibilityLow';
}

export function feelsKey(temp: number | null, feels: number | null): string {
  if (temp === null || feels === null) return 'FeelsCurrent';
  const diff = feels - temp;
  if (diff > 2) return 'FeelsWarmer';
  if (diff < -2) return 'FeelsCooler';
  return 'FeelsSimilar';
}

export function humidityKey(h: number | null): string {
  if (h === null) return 'HumidityCurrent';
  if (h >= 70) return 'HumidityHigh';
  if (h < 30) return 'HumidityLow';
  return 'HumidityComfortable';
}

export function pressureKey(hpa: number | null): string | null {
  if (hpa === null) return null;
  if (hpa < 1000) return 'PressureLevelLow';
  if (hpa > 1025) return 'PressureLevelHigh';
  return 'PressureLevelNormal';
}

/** 气压在表盘上的位置（980–1050 hPa → 0–100%），与旧站一致 */
export function pressurePercent(hpa: number | null): number {
  if (hpa === null) return 50;
  return Math.max(0, Math.min(100, ((hpa - 980) / 70) * 100));
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function windDirText(deg: number | null): string {
  if (deg === null) return '';
  return DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? '';
}

/** 温度条颜色（沿用旧站 dailyTempColorStops） */
const TEMP_STOPS: Array<[number, string]> = [
  [0, '#22C55E'],
  [10, '#A3E635'],
  [20, '#FACC15'],
  [28, '#F97316'],
  [38, '#EF4444'],
];

export function tempColor(temp: number): string {
  if (temp <= TEMP_STOPS[0]![0]) return TEMP_STOPS[0]![1];
  for (const [t, c] of TEMP_STOPS.slice(1)) if (temp <= t) return c;
  return TEMP_STOPS[TEMP_STOPS.length - 1]![1];
}

export function tempGradient(low: number, high: number): string {
  if (high <= low) return tempColor(high);
  const stops = [`${tempColor(low)} 0%`];
  for (const [t, c] of TEMP_STOPS) {
    if (t <= low || t >= high) continue;
    stops.push(`${c} ${(((t - low) / (high - low)) * 100).toFixed(1)}%`);
  }
  stops.push(`${tempColor(high)} 100%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** 一组日预报的温度范围，用来画每天的温度条 */
export function tempRange(days: Array<{ minTemp: number | null; maxTemp: number | null }>): { min: number; span: number } {
  const values = days.flatMap((d) => [d.minTemp, d.maxTemp]).filter((v): v is number => v !== null);
  if (values.length === 0) return { min: 0, span: 1 };
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  return { min, span: Math.max(1, max - min) };
}

/** 图标 key → 天气描述文案 key（夜间沿用白天描述，晴夜为 "Clear"） */
export function conditionKey(icon: string): string {
  // 占位（没有数据）：显示 "--"
  if (!icon) return 'Dash';
  if (icon === 'night') return 'Cond_night';
  return `Cond_${icon.replace(/^night-/, '')}`;
}
