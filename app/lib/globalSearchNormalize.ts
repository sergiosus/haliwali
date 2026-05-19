import { normalizeQuery } from "./categoryDirectory";
import { buildSearchVariants, convertEnToRuKeyboard, shouldConvertEnToRuKeyboard } from "./utils/keyboardLayout";

export type GlobalSearchNormalizedQuery = {
  /** Trimmed user input (unchanged casing). */
  original: string;
  /** Trimmed, lowercased, collapsed spaces — primary match key. */
  primary: string;
  keyboardFixed: string | null;
  transliterated: string | null;
  /** Deduped non-empty variants for matching (includes primary, keyboard, translit). */
  normalizedUniqueVariants: string[];
  /** @deprecated Alias for {@link normalizedUniqueVariants}. */
  variants: string[];
};

const LAT_MULTI: readonly [string, string][] = [
  ["sch", "щ"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["yo", "ё"],
  ["ya", "я"],
  ["yu", "ю"],
  ["zh", "ж"],
  ["ts", "ц"],
  ["kh", "х"],
  ["ye", "е"],
];

const LAT_SINGLE: Record<string, string> = {
  a: "а",
  b: "б",
  v: "в",
  w: "в",
  g: "г",
  d: "д",
  e: "е",
  z: "з",
  i: "и",
  y: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  f: "ф",
  h: "х",
  c: "к",
  q: "к",
  x: "кс",
  j: "дж",
};

/** Trim, lowercase, collapse repeated spaces. */
export function collapseSearchSpaces(text: string): string {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Approximate Latin typing → Russian (e.g. noutbuk → ноутбук, remont → ремонт). */
export function latinTypingToRussianApprox(text: string): string {
  const src = collapseSearchSpaces(text);
  if (!src || /[\u0400-\u04FF]/.test(src)) return "";
  let i = 0;
  let out = "";
  while (i < src.length) {
    let matched = false;
    for (const [lat, ru] of LAT_MULTI) {
      if (src.startsWith(lat, i)) {
        out += ru;
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = src[i]!;
    if (ch === " " || ch === "-" || ch === ",") {
      out += ch;
      i += 1;
      continue;
    }
    out += LAT_SINGLE[ch] ?? ch;
    i += 1;
  }
  return collapseSearchSpaces(out);
}

/** Normalize user query: spaces, EN keyboard fix, simple Latin→RU, deduped variants. */
export function normalizeGlobalSearchQuery(raw: string): GlobalSearchNormalizedQuery {
  const original = (raw ?? "").trim();
  const primary = collapseSearchSpaces(original);
  const unique = new Set<string>();

  if (primary) unique.add(primary);

  let keyboardFixed: string | null = null;
  if (shouldConvertEnToRuKeyboard(original)) {
    const kb = collapseSearchSpaces(convertEnToRuKeyboard(original));
    if (kb) {
      keyboardFixed = kb;
      unique.add(kb);
    }
  }

  let transliterated: string | null = null;
  const latRu = latinTypingToRussianApprox(original);
  if (latRu && latRu !== primary && latRu !== keyboardFixed) {
    transliterated = latRu;
    unique.add(latRu);
  }

  for (const v of buildSearchVariants(original)) {
    const n = collapseSearchSpaces(v);
    if (n) unique.add(n);
  }

  const normalizedUniqueVariants = [...unique].filter((v) => v.length >= 1);

  return {
    original,
    primary,
    keyboardFixed,
    transliterated,
    normalizedUniqueVariants,
    variants: normalizedUniqueVariants,
  };
}

/** Client/server helper: all match variants for a raw query string. */
export function getSearchQueryVariants(raw: string): string[] {
  return normalizeGlobalSearchQuery(raw).normalizedUniqueVariants;
}

export function globalSearchNormalizedPayload(n: GlobalSearchNormalizedQuery) {
  return {
    original: n.original,
    primary: n.primary,
    keyboardFixed: n.keyboardFixed,
    transliterated: n.transliterated,
    normalizedUniqueVariants: n.normalizedUniqueVariants,
    variants: n.normalizedUniqueVariants,
  };
}
