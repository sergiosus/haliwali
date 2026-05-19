import { normalizeQuery } from "./categoryDirectory";
import { buildSearchVariants, convertEnToRuKeyboard, shouldConvertEnToRuKeyboard } from "./utils/keyboardLayout";

export type GlobalSearchNormalizedQuery = {
  raw: string;
  primary: string;
  variants: string[];
  keyboardFixed: string | null;
  transliterated: string | null;
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

/** Approximate Latin typing → Russian (e.g. noutbuk → ноутбук). */
export function latinTypingToRussianApprox(text: string): string {
  const src = text.trim().toLowerCase();
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
  return out.replace(/\s+/g, " ").trim();
}

/** Normalize user query: lowercase, EN keyboard fix, simple Latin→RU, deduped variants. */
export function normalizeGlobalSearchQuery(raw: string): GlobalSearchNormalizedQuery {
  const trimmed = (raw ?? "").trim();
  const primary = normalizeQuery(trimmed);
  const variants = new Set<string>();

  if (primary) variants.add(primary);

  let keyboardFixed: string | null = null;
  if (shouldConvertEnToRuKeyboard(trimmed)) {
    const kb = normalizeQuery(convertEnToRuKeyboard(trimmed));
    if (kb) {
      keyboardFixed = kb;
      variants.add(kb);
    }
  }

  let transliterated: string | null = null;
  const latRu = latinTypingToRussianApprox(trimmed);
  if (latRu && latRu !== primary && latRu !== keyboardFixed) {
    transliterated = latRu;
    variants.add(latRu);
  }

  for (const v of buildSearchVariants(trimmed)) {
    if (v) variants.add(v);
  }

  return {
    raw: trimmed,
    primary,
    variants: [...variants].filter((v) => v.length >= 1),
    keyboardFixed,
    transliterated,
  };
}
