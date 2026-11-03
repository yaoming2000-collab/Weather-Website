import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * 黑盒功能测试的公共部分。用例编号和 docs/TESTING.md 一一对应。
 *
 * 只依赖：网址、用户看得到的内容，以及 docs/TESTING.md"测试依赖的页面标记"一节列出的少量标记（data-*）。
 */

/** 设置了 BASE_URL：测真实站点（真实数据）；否则测本地模拟数据站点 */
export const REMOTE = !!process.env.BASE_URL;

/** 只适用于模拟数据的用例（需要固定的天气数据或会写入数据），测真实站点时跳过 */
export function mockOnly(info: TestInfo) {
  info.skip(REMOTE, '只在本地模拟数据模式下运行（需要固定数据或会写入数据）');
}

/** 测试用的城市（Foreca 地点 ID；模拟数据里也有这几个城市） */
export const CITY = {
  london: '102643743',
  shanghai: '101796236',
  istanbul: '100745044',
} as const;

export const CHANNELS = ['wmi', 'mi', 'wme', 'wchyin', 'wxiaomi', 'wsearch-mi'] as const;

export const LANGS = [
  'ar', 'bg', 'bp', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hi', 'id', 'it', 'ja',
  'ko', 'lm', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh',
] as const;

export const city = (id: string, lang = 'en', sub = '', channel = 'wmi') => `/${channel}/${lang}/w/${id}${sub ? `/${sub}` : ''}`;

/** 城市页的网址格式：/{渠道}/{语言}/w/{城市ID} */
export const CITY_URL = /^\/([a-z-]+)\/([a-z]{2})\/w\/([0-9A-Za-z_-]+)/;

/** 页面里交给浏览器脚本的数据（城市、时区等） */
export async function pageData(page: Page): Promise<{ tz?: string; city?: { id: string; name: string }; lang?: string }> {
  return page.evaluate(() => JSON.parse(document.getElementById('page-data')?.textContent ?? '{}'));
}

/** 城市当地今天的日期 YYYY-MM-DD */
export function localDate(tz: string, ms = Date.now()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

/** 收集页面脚本错误（未捕获的异常）；广告、统计等第三方请求失败不算 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** 不跟随跳转地请求一个网址，返回状态码和 Location */
export async function head(page: Page, url: string, headers: Record<string, string> = {}) {
  const res = await page.request.get(url, { maxRedirects: 0, headers });
  return { status: res.status(), location: res.headers()['location'] ?? '', headers: res.headers() };
}

/** 浏览器里可见的文字（不含 <template>、隐藏元素） */
export async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

export { expect };
