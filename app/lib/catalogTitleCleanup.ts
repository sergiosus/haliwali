export type TitleSource = "card" | "json" | "og" | "app-state" | "html" | "url_slug";

function hasCyrillic(s: string): boolean {
  return /[А-Яа-яЁё]/.test(s);
}

function titleCaseWord(w: string): string {
  if (!w) return w;
  return w[0]!.toUpperCase() + w.slice(1);
}

/**
 * Very conservative cleanup for URL-slug fallback titles only.
 * Do NOT try to transliterate generally.
 */
export function cleanUrlSlugTitle(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (hasCyrillic(t)) return t;

  // Keep only a few known mappings to avoid overdoing it.
  const map: Record<string, string> = {
    dvigatel: "двигатель",
    zaschita: "защита",
    zapchasti: "запчасти",
    aksessuary: "аксессуары",
    volkswagen: "Volkswagen",
    touran: "Touran",
  };

  const words = t
    .replace(/[_/]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const cleaned = words.map((w) => {
    const lower = w.toLowerCase();
    if (map[lower]) return map[lower]!;
    // Keep OEM-like tokens as-is.
    if (/^[a-z0-9]{2,8}$/i.test(w) && /\d/.test(w)) return w.toUpperCase();
    return w.length <= 2 ? w : titleCaseWord(w);
  });

  return cleaned.join(" ").trim();
}

export function maybeCleanTitleForPublic(title: string, titleSource?: string | null): string {
  if (titleSource !== "url_slug") return title;
  const cleaned = cleanUrlSlugTitle(title);
  return cleaned || title;
}

