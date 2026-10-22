/**
 * 合作渠道。沿用旧站（umetech/weather-v3 backend/app/site.go）的 6 个渠道。
 * 渠道出现在网址第一段，例如 /wxiaomi/en/w/102643743，并决定加载哪一套广告配置。
 */
export const CHANNELS = ['wmi', 'mi', 'wme', 'wchyin', 'wxiaomi', 'wsearch-mi'] as const;

export type Channel = (typeof CHANNELS)[number];

/** 网址没有渠道前缀时使用的渠道（与旧站一致）。 */
export const DEFAULT_CHANNEL: Channel = 'wmi';

export function isChannel(value: string | undefined | null): value is Channel {
  return !!value && (CHANNELS as readonly string[]).includes(value.toLowerCase());
}

export function normalizeChannel(value: string | undefined | null): Channel | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  return isChannel(lower) ? lower : null;
}
