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

/** Stricter: primary token must appear in visible title or snippet (not URL-only). */
export function offerMatchesSearchQueryInCardText(
  query: string,
  item: OfferSearchRelevanceFields,
): boolean {
  const tokens = queryTokensForRelevance(query);
  if (tokens.length === 0) return true;
  const cardBlob = normBlob(`${item.title} ${item.shortSnippet} ${item.brand ?? ""}`);
  if (tokens.some((token) => cardBlob.includes(token))) return true;
  return false;
}

/** Major auto brands — if title highlights another brand and query is a model, reject. */
const UNRELATED_AUTO_BRANDS = [
  "mitsubishi",
  "cadillac",
  "mercedes",
  "mercedes-benz",
  "bmw",
  "lexus",
  "porsche",
  "bentley",
  "rolls-royce",
  "ferrari",
  "lamborghini",
  "maserati",
  "jaguar",
  "land rover",
  "range rover",
  "hummer",
  "infiniti",
  "genesis",
  "lincoln",
  "chrysler",
  "dodge",
  "jeep",
  "gmc",
  "honda",
  "toyota",
  "nissan",
  "mazda",
  "subaru",
  "hyundai",
  "kia",
  "ford",
  "chevrolet",
  "opel",
  "peugeot",
  "renault",
  "citroen",
  "skoda",
  "seat",
  "fiat",
  "volvo",
  "saab",
  "audi",
];

function queryMentionsBrand(query: string, brand: string): boolean {
  const tokens = queryTokensForRelevance(query);
  const b = brand.toLowerCase();
  return tokens.some((t) => b.includes(t) || t.includes(b.slice(0, Math.min(4, b.length))));
}

/** Reject SERP rows whose visible text is dominated by an unrelated auto brand. */
export function offerHasUnrelatedAutoBrand(
  query: string,
  item: OfferSearchRelevanceFields,
): boolean {
  const tokens = queryTokensForRelevance(query);
  if (tokens.length === 0) return false;
  const cardBlob = normBlob(`${item.title} ${item.shortSnippet}`);
  if (!cardBlob.trim()) return false;
  for (const brand of UNRELATED_AUTO_BRANDS) {
    if (!cardBlob.includes(brand)) continue;
    if (queryMentionsBrand(query, brand)) continue;
    if (tokens.some((t) => cardBlob.includes(t))) continue;
    return true;
  }
  return false;
}

/** Drom (and strict mode): token in card text, no unrelated brand, optional URL fallback. */
export function offerMatchesSearchQueryStrict(
  query: string,
  item: OfferSearchRelevanceFields,
  opts?: { allowUrlFallback?: boolean },
): boolean {
  if (offerHasUnrelatedAutoBrand(query, item)) return false;
  if (offerMatchesSearchQueryInCardText(query, item)) return true;
  if (opts?.allowUrlFallback && offerMatchesSearchQuery(query, item)) return true;
  return false;
}

export function filterHitsByQueryRelevance<
  T extends OfferSearchRelevanceFields & { sourceName?: string },
>(query: string, hits: T[], opts?: { strictCardText?: boolean }): T[] {
  const strict = opts?.strictCardText ?? false;
  return hits.filter((hit) => {
    const fields: OfferSearchRelevanceFields = {
      title: hit.title,
      shortSnippet: hit.shortSnippet,
      url: hit.url,
      brand: hit.brand ?? null,
    };
    if (strict) {
      const allowUrl = hit.sourceName === "drom";
      return offerMatchesSearchQueryStrict(query, fields, { allowUrlFallback: allowUrl });
    }
    return offerMatchesSearchQuery(query, fields);
  });
}

/** True when most extracted links fail query match — broad unrelated dump. */
export function isBroadUnrelatedResultSet(
  query: string,
  hits: OfferSearchRelevanceFields[],
  opts?: { minSample?: number; minMatchRatio?: number },
): boolean {
  const minSample = opts?.minSample ?? 4;
  const minMatchRatio = opts?.minMatchRatio ?? 0.35;
  if (hits.length < minSample) return false;
  const tokens = queryTokensForRelevance(query);
  if (tokens.length === 0) return false;
  const matched = hits.filter((h) => offerMatchesSearchQueryStrict(query, h, { allowUrlFallback: true }));
  return matched.length / hits.length < minMatchRatio;
}
