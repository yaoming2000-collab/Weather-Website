/** Foreca 地点接口（搜索、城市名）支持的语言。其余语言的城市名由第 4 步的对照表提供。 */
export const LOCATION_LANGS = new Set(['de', 'en', 'es', 'fr', 'it', 'pl', 'ru', 'fi', 'sv', 'nl', 'ko', 'pt', 'th', 'tr', 'zh']);

/** 网站语言代码 → Foreca 地点接口使用的语言（bp → pt，lm → es，不支持的按英文） */
export function forecaLocationLang(lang: string): string {
  const l = lang === 'bp' ? 'pt' : lang === 'lm' ? 'es' : lang;
  return LOCATION_LANGS.has(l) ? l : 'en';
}
