/**
 * Foreca 不支持的 11 种语言（日语、阿拉伯语、印地语、印尼语、越南语、丹麦语、挪威语、希腊语、乌克兰语、保加利亚语、罗马尼亚语）的城市名，
 * 从 Wikidata 查：Foreca 的城市 ID = 100000000 + GeoNames ID，Wikidata 用 P1566 记录 GeoNames ID。
 * 同一个 GeoNames ID 偶尔对应多个条目（例如北京和历史上的顺天府），取维基百科语言版本最多（sitelinks）且未废止的那个。
 * 同时取国家的 ISO 代码，国家名由浏览器和 Workers 自带的 Intl.DisplayNames 翻译。
 * 2026-10-28 实测：北京、上海、东京、伦敦、巴黎、迪拜、伊斯坦布尔等名字正确。
 */

/** 网站语言 → Wikidata 标签语言（按优先顺序） */
export const WIKIDATA_LANGS: Record<string, readonly string[]> = {
  ja: ['ja'],
  ar: ['ar'],
  hi: ['hi'],
  id: ['id'],
  vi: ['vi'],
  da: ['da'],
  no: ['nb', 'no', 'nn'],
  el: ['el'],
  uk: ['uk'],
  bg: ['bg'],
  ro: ['ro'],
};

export interface WikiPlace {
  /** Wikidata 标签语言 → 名字 */
  labels: Record<string, string>;
  /** 国家 ISO 3166-1 两位代码（Wikidata 上只有一个国家时才有，否则 null） */
  iso: string | null;
}

export interface PlaceNamesSource {
  /** 按 Foreca 城市 ID 批量查；查不到的城市不在结果里 */
  lookup(ids: string[]): Promise<Map<string, WikiPlace>>;
}

/** Foreca 城市 ID → GeoNames ID；不是 GeoNames 来源的 ID 返回 null */
export function geonameIdOf(forecaId: string): string | null {
  if (!/^\d{9,}$/.test(forecaId)) return null;
  const n = Number(forecaId) - 100_000_000;
  return n > 0 ? String(n) : null;
}

const ENDPOINT = 'https://query.wikidata.org/sparql';
const LABEL_LANGS = [...new Set(Object.values(WIKIDATA_LANGS).flat())];

export function buildQuery(geonameIds: string[]): string {
  return `SELECT ?gn ?item ?links ?lang ?label ?iso WHERE {
  VALUES ?gn { ${geonameIds.map((g) => `"${g}"`).join(' ')} }
  ?item wdt:P1566 ?gn; wikibase:sitelinks ?links.
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  OPTIONAL { ?item wdt:P17/wdt:P297 ?iso }
  OPTIONAL { ?item rdfs:label ?label. BIND(LANG(?label) AS ?lang) FILTER(?lang IN (${LABEL_LANGS.map((l) => `"${l}"`).join(',')})) }
}`;
}

interface Binding {
  gn?: { value: string };
  item?: { value: string };
  links?: { value: string };
  lang?: { value: string };
  label?: { value: string };
  iso?: { value: string };
}

/** 解析查询结果：每个 GeoNames ID 取 sitelinks 最多的条目 */
export function parseResults(bindings: Binding[]): Map<string, WikiPlace> {
  const best = new Map<string, { item: string; links: number }>();
  for (const b of bindings) {
    const gn = b.gn?.value;
    const item = b.item?.value;
    if (!gn || !item) continue;
    const links = Number(b.links?.value ?? 0);
    const cur = best.get(gn);
    if (!cur || links > cur.links) best.set(gn, { item, links });
  }
  const out = new Map<string, WikiPlace>();
  const isos = new Map<string, Set<string>>();
  for (const b of bindings) {
    const gn = b.gn?.value;
    if (!gn || best.get(gn)?.item !== b.item?.value) continue;
    const place = out.get(gn) ?? { labels: {}, iso: null };
    if (b.lang?.value && b.label?.value && !place.labels[b.lang.value]) place.labels[b.lang.value] = b.label.value;
    if (b.iso?.value) (isos.get(gn) ?? isos.set(gn, new Set()).get(gn)!).add(b.iso.value.toUpperCase());
    out.set(gn, place);
  }
  // 有多个国家（有争议的地区）时不猜
  for (const [gn, set] of isos) if (set.size === 1) out.get(gn)!.iso = [...set][0]!;
  return out;
}

export class WikidataNames implements PlaceNamesSource {
  constructor(
    private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (i, init) => fetch(i, init),
    private readonly timeoutMs = 4000,
  ) {}

  async lookup(ids: string[]): Promise<Map<string, WikiPlace>> {
    const byGn = new Map<string, string>();
    for (const id of ids) {
      const gn = geonameIdOf(id);
      if (gn) byGn.set(gn, id);
    }
    const out = new Map<string, WikiPlace>();
    if (byGn.size === 0) return out;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${ENDPOINT}?format=json&query=${encodeURIComponent(buildQuery([...byGn.keys()]))}`, {
        headers: {
          Accept: 'application/sparql-results+json',
          // Wikidata 要求标明来源（https://meta.wikimedia.org/wiki/User-Agent_policy）
          'User-Agent': 'itsfunmag-weather/1.0 (https://weather.itsfunmag.com)',
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Wikidata responded ${res.status}`);
      const json = (await res.json()) as { results?: { bindings?: Binding[] } };
      for (const [gn, place] of parseResults(json.results?.bindings ?? [])) {
        const id = byGn.get(gn);
        if (id) out.set(id, place);
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  }
}
