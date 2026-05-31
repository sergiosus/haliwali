/**
 * Query relevance for admin marketplace offer search results.
 */

import { sanitizeOfferText } from "./catalogOfferSearchText";

export type OfferSearchRelevanceFields = {
  title: string;
  shortSnippet: string;
  url: string;
  brand: string | null;
};

const STOP_WORDS = new Set([
  "для",
  "или",
  "and",
  "the",
  "купить",
  "продажа",
  "б",
  "у",
  "в",
  "на",
  "с",
]);

/** Optional Latin ↔ Cyrillic hints for common automotive queries. */
const TOKEN_ALIASES: Record<string, string[]> = {
  touran: ["touran", "туран"],
  туран: ["touran", "туран"],
  passat: ["passat", "пассат"],
  пассат: ["passat", "пассат"],
  polo: ["polo", "поло"],
  golf: ["golf", "гольф"],
  tiguan: ["tiguan", "тигуан"],
  octavia: ["octavia", "октави"],
  solaris: ["solaris", "солярис"],
  camry: ["camry", "камри"],
};

function normBlob(s: string): string {
  return sanitizeOfferText(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_\-./]+/g, " ");
}

export function queryTokensForRelevance(query: string): string[] {
  const raw = query
    .trim()
    .toLowerCase()
    .split(/[\s,;+/]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  const expanded = new Set<string>();
  for (const t of raw) {
    expanded.add(t);
    const aliases = TOKEN_ALIASES[t];
    if (aliases) aliases.forEach((a) => expanded.add(a));
    for (const variants of Object.values(TOKEN_ALIASES)) {
      if (variants.some((v) => v.includes(t) || t.includes(v))) {
        variants.forEach((v) => expanded.add(v));
      }
    }
  }
  return [...expanded].filter((t) => t.length >= 2);
}

export function offerSearchRelevanceBlob(item: OfferSearchRelevanceFields): string {
  return normBlob(`${item.title} ${item.shortSnippet} ${item.url} ${item.brand ?? ""}`);
}

/** True when any query token appears in title, snippet, URL, or brand. */
export function offerMatchesSearchQuery(query: string, item: OfferSearchRelevanceFields): boolean {
  const tokens = queryTokensForRelevance(query);
  if (tokens.length === 0) return true;
  const blob = offerSearchRelevanceBlob(item);
  return tokens.some((token) => blob.includes(token));
}
