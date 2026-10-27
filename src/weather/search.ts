/** 城市搜索的规则，服务器和浏览器共用。 */

/** 搜索关键字：去掉首尾空格、转小写、最长 60 个字符 */
export function normalizeSearch(query: string): string {
  return query.trim().toLowerCase().slice(0, 60);
}

/** 至少 3 个字符；中日韩文字 2 个字即可（"北京"、"東京"、"서울"） */
export function searchLongEnough(q: string): boolean {
  const n = Array.from(q).length;
  if (n >= 3) return true;
  return n === 2 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(q);
}
