/**
 * 猜一猜、"预报准吗"的本地记录（localStorage）。纯函数部分单独放这里，方便测试。
 */

export const GUESS_KEY = 'weather.guess.v1';
export const VOTE_KEY = 'weather.vote.v1';
/** 本地最多记多少条，旧的先删 */
const MAX_ENTRIES = 60;

export type Choice = 'colder' | 'same' | 'warmer';
export type Vote = 'up' | 'down';

type Book = Record<string, { v: string; t: number }>;

export function readBook(raw: string | null): Book {
  try {
    const j = JSON.parse(raw ?? '{}') as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Book) : {};
  } catch {
    return {};
  }
}

export function writeBook(book: Book, key: string, value: string, nowMs: number): Book {
  const next: Book = { ...book, [key]: { v: value, t: nowMs } };
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => next[a]!.t - next[b]!.t)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete next[k]);
  }
  return next;
}

export const entryKey = (cityId: string, date: string) => `${cityId}|${date}`;

export function isChoice(v: unknown): v is Choice {
  return v === 'colder' || v === 'same' || v === 'warmer';
}

export interface Counts {
  colder: number;
  same: number;
  warmer: number;
}

/** "X% 的人猜对了"；不足 minVotes 票时为 null */
export function percentRight(counts: Counts, answer: Choice, minVotes: number): number | null {
  const total = counts.colder + counts.same + counts.warmer;
  if (total < minVotes) return null;
  return Math.round((counts[answer] / total) * 100);
}
