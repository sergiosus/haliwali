function normalizeQuery(q: string) {
  return (q ?? "").trim().toLowerCase();
}

/** Lowercase US QWERTY → Russian ЙЦУКЕН (unshifted) layout mapping. */
const EN_LOWER_TO_RU: Record<string, string> = {
  q: "й",
  w: "ц",
  e: "у",
  r: "к",
  t: "е",
  y: "н",
  u: "г",
  i: "ш",
  o: "щ",
  p: "з",
  "[": "х",
  "]": "ъ",
  a: "ф",
  s: "ы",
  d: "в",
  f: "а",
  g: "п",
  h: "р",
  j: "о",
  k: "л",
  l: "д",
  ";": "ж",
  "'": "э",
  z: "я",
  x: "ч",
  c: "с",
  v: "м",
  b: "и",
  n: "т",
  m: "ь",
  ",": "б",
  ".": "ю",
};

function isLatinLetter(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch);
}

/**
 * Convert typed-on-English-layout text to Russian keys (character by character).
 * Non-mapped characters are kept; does not change the original input elsewhere.
 */
export function convertEnToRuKeyboard(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch === "{" || ch === "}") {
      const mapped = ch === "{" ? "[" : "]";
      const ru = EN_LOWER_TO_RU[mapped.toLowerCase()];
      out += ru ? (ch === "{" ? ru.toUpperCase() : ru) : ch;
      continue;
    }
    const lower = ch.toLowerCase();
    const ru = EN_LOWER_TO_RU[lower];
    if (!ru) {
      out += ch;
      continue;
    }
    if (isLatinLetter(ch) && ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
      out += ru.toUpperCase();
    } else {
      out += ru;
    }
  }
  return out;
}

const CYRILLIC_RE = /[\u0400-\u04FF]/;

export function shouldConvertEnToRuKeyboard(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CYRILLIC_RE.test(t)) return false;
  return /[a-zA-Z]/.test(t);
}

/** Normalized (lowercase, trimmed) search variants: original + EN→RU when applicable. */
export function buildSearchVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const primary = normalizeQuery(trimmed);
  const variants = new Set<string>();
  if (primary) variants.add(primary);
  if (shouldConvertEnToRuKeyboard(trimmed)) {
    const alt = normalizeQuery(convertEnToRuKeyboard(trimmed));
    if (alt) variants.add(alt);
  }
  return [...variants];
}

/** Case-insensitive substring match using all search variants (for filters / city search). */
export function matchesSearchVariantsInText(fullText: string, rawQuery: string): boolean {
  const variants = buildSearchVariants(rawQuery);
  if (variants.length === 0) return true;
  const hay = normalizeQuery(fullText);
  return variants.some((v) => hay.includes(v));
}
