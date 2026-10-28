import { CAPITALS } from '../config/capitals';

/**
 * Foreca 返回的英文国家名 → ISO 两位代码（翻译国家名用）。
 * 用 Intl.DisplayNames 的英文名自动生成，再补上 Foreca 常见的其他写法。
 * 用 Foreca 的国家而不是 Wikidata 的，是为了香港、澳门、波多黎各等地区和英文页面保持一致。
 */
const ALIASES: Record<string, string> = {
  'hong kong': 'HK', macao: 'MO', macau: 'MO', 'viet nam': 'VN', 'korea, republic of': 'KR', 'republic of korea': 'KR',
  'korea, democratic people\'s republic of': 'KP', turkey: 'TR', 'russian federation': 'RU', 'czech republic': 'CZ',
  'iran, islamic republic of': 'IR', 'syrian arab republic': 'SY', "lao people's democratic republic": 'LA', laos: 'LA',
  'bolivia, plurinational state of': 'BO', 'venezuela, bolivarian republic of': 'VE', 'tanzania, united republic of': 'TZ',
  'moldova, republic of': 'MD', macedonia: 'MK', 'palestinian territory': 'PS', palestine: 'PS', 'ivory coast': 'CI',
  "cote d'ivoire": 'CI', burma: 'MM', 'democratic republic of the congo': 'CD', 'republic of the congo': 'CG',
  'united states of america': 'US', usa: 'US', 'great britain': 'GB', 'cape verde': 'CV', swaziland: 'SZ', 'east timor': 'TL',
  'taiwan, province of china': 'TW', 'micronesia, federated states of': 'FM', 'vatican city': 'VA', 'holy see': 'VA',
};

let table: Map<string, string> | null = null;

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/\s+/g, ' ')
    .trim();
}

function build(): Map<string, string> {
  const m = new Map<string, string>();
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const code of Object.keys(CAPITALS)) {
    const name = dn.of(code);
    if (!name || name === code) continue;
    m.set(norm(name), code);
    // "Myanmar (Burma)"、"Hong Kong SAR China"、"Congo - Kinshasa" 这类写法也收一份简短的
    m.set(norm(name.replace(/\s*\(.*\)$/, '').replace(/\s+SAR China$/, '')), code);
  }
  for (const [k, v] of Object.entries(ALIASES)) m.set(norm(k), v);
  return m;
}

export function isoOfCountry(englishName: string | null | undefined): string | null {
  if (!englishName) return null;
  table ??= build();
  return table.get(norm(englishName)) ?? null;
}
