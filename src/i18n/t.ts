import type { Lang } from './languages';
import ar from './locales/ar.json';
import bp from './locales/bp.json';
import da from './locales/da.json';
import de from './locales/de.json';
import el from './locales/el.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import he from './locales/he.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import lm from './locales/lm.json';
import nl from './locales/nl.json';
import no from './locales/no.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import sv from './locales/sv.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';

/**
 * 界面文案。翻译文件沿用旧站 i18n/（umetech/weather-v3），新增文案先写在 en.json，
 * 其他语言缺少的条目自动回退到英文（与旧站规则一致），第 4 步统一补齐翻译。
 */
export type Messages = Record<string, string>;

const CATALOG: Record<Lang, Messages> = { ar, bp, da, de, el, en, es, fi, fr, he, hi, id, it, ja, ko, lm, nl, no, pl, pt, ru, sv, th, tr, uk, vi, zh };

const merged = new Map<Lang, Messages>();

export function messages(lang: Lang): Messages {
  let m = merged.get(lang);
  if (!m) {
    m = { ...CATALOG.en, ...CATALOG[lang] };
    merged.set(lang, m);
  }
  return m;
}

/** 取文案，并替换 {name} 形式的变量。找不到时返回 key 本身，方便发现遗漏。 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let value = messages(lang)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) value = value.split(`{${k}}`).join(String(v));
  return value;
}

/** 英文基准里有、但某种语言还没翻译的条目（第 4 步用来核对） */
export function missingKeys(lang: Lang): string[] {
  return Object.keys(CATALOG.en).filter((k) => !(k in CATALOG[lang]));
}
