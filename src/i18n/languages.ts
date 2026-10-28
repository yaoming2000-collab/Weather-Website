/**
 * 支持的 26 种语言，沿用旧站 i18n/ 目录（2026-10-28 去掉了希伯来语，旧的希伯来语网址跳转到英文）。
 * 网址里的语言代码就是这里的 code，例如 /wmi/bp/w/...
 *
 * 业务代码说明（与旧站一致）：
 *   bp = 巴西葡萄牙语（pt-BR）
 *   lm = 拉美西班牙语（西班牙以外地区的 es-*）
 *   id = 印尼语（旧站内部有时写作 in）
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', intl: 'en' },
  { code: 'zh', name: '简体中文', intl: 'zh-Hans' },
  { code: 'ja', name: '日本語', intl: 'ja' },
  { code: 'ko', name: '한국어', intl: 'ko' },
  { code: 'es', name: 'Español', intl: 'es-ES' },
  { code: 'lm', name: 'Español (Latinoamérica)', intl: 'es-419' },
  { code: 'fr', name: 'Français', intl: 'fr' },
  { code: 'de', name: 'Deutsch', intl: 'de' },
  { code: 'it', name: 'Italiano', intl: 'it' },
  { code: 'pt', name: 'Português', intl: 'pt-PT' },
  { code: 'bp', name: 'Português (Brasil)', intl: 'pt-BR' },
  { code: 'ru', name: 'Русский', intl: 'ru' },
  { code: 'ar', name: 'العربية', intl: 'ar' },
  { code: 'hi', name: 'हिन्दी', intl: 'hi' },
  { code: 'id', name: 'Bahasa Indonesia', intl: 'id' },
  { code: 'th', name: 'ไทย', intl: 'th' },
  { code: 'vi', name: 'Tiếng Việt', intl: 'vi' },
  { code: 'tr', name: 'Türkçe', intl: 'tr' },
  { code: 'nl', name: 'Nederlands', intl: 'nl' },
  { code: 'pl', name: 'Polski', intl: 'pl' },
  { code: 'sv', name: 'Svenska', intl: 'sv' },
  { code: 'da', name: 'Dansk', intl: 'da' },
  { code: 'fi', name: 'Suomi', intl: 'fi' },
  { code: 'no', name: 'Norsk', intl: 'nb' },
  { code: 'el', name: 'Ελληνικά', intl: 'el' },
  { code: 'uk', name: 'Українська', intl: 'uk' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANG: Lang = 'en';

const CODES = new Set<string>(LANGUAGES.map((l) => l.code));

const RTL = new Set<Lang>(['ar']);

/** 不再支持的语言：网址里出现时跳转到英文 */
export const DROPPED_LANGS = new Set(['he', 'iw']);

export function isLang(value: string | undefined | null): value is Lang {
  return !!value && CODES.has(value);
}

export function textDirection(lang: Lang): 'rtl' | 'ltr' {
  return RTL.has(lang) ? 'rtl' : 'ltr';
}

/** 用于 Intl.DateTimeFormat 等浏览器 API 的语言标签。 */
export function intlLocale(lang: Lang): string {
  return LANGUAGES.find((l) => l.code === lang)?.intl ?? 'en';
}

/** 语言代码别名：浏览器或系统可能给出的代码 → 我们的代码。 */
const BASE_ALIASES: Record<string, Lang> = {
  in: 'id',
  nb: 'no',
  nn: 'no',
};

function isRegion(value: string): boolean {
  return /^[a-z0-9]{2,3}$/i.test(value);
}

/**
 * 把一个语言值（locale 参数、lang 参数或 Accept-Language 的一项）解析成我们支持的语言。
 * 规则移植自旧站 backend/app/site.go 的 localeBusinessAlias：
 *   pt-BR → bp；es-ES 或 es → es；其他 es-* → lm；id / in → id。
 * 不支持的语言返回 null，由调用方继续尝试下一个来源。
 */
export function parseLanguage(raw: string | undefined | null): Lang | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/_/g, '-');
  if (!value) return null;
  if (value === 'bp' || value === 'lm') return value;

  const parts = value.split('-').filter(Boolean);
  const base = parts[0] ?? '';
  const region = (parts.slice(1).find(isRegion) ?? '').toUpperCase();

  if (base === 'pt') return region === 'BR' ? 'bp' : 'pt';
  if (base === 'es') return region === '' || region === 'ES' ? 'es' : 'lm';
  if (base === 'zh') return 'zh';

  const aliased = BASE_ALIASES[base];
  if (aliased) return aliased;
  return isLang(base) ? base : null;
}

/**
 * 按旧站顺序决定语言：locale 参数 → lang 参数 → Accept-Language → en。
 */
export function resolveLanguage(input: {
  locale?: string | null;
  lang?: string | null;
  acceptLanguage?: string | null;
}): Lang {
  const fromLocale = parseLanguage(input.locale);
  if (fromLocale) return fromLocale;

  const fromLang = parseLanguage(input.lang);
  if (fromLang) return fromLang;

  for (const item of (input.acceptLanguage ?? '').split(',')) {
    const tag = item.split(';')[0];
    const parsed = parseLanguage(tag);
    if (parsed) return parsed;
  }
  return DEFAULT_LANG;
}
