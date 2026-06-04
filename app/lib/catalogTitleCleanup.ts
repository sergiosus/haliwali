export type TitleSource = "card" | "listing" | "metadata" | "url_slug" | "manual";

/** @deprecated stored as url_slug */
const LEGACY_URL_SLUG = "url";

export function isUrlSlugTitleSource(src: string | null | undefined): boolean {
  const s = src?.trim();
  return s === "url_slug" || s === LEGACY_URL_SLUG;
}

export function normalizeTitleSource(src: string | null | undefined): TitleSource | null {
  const s = src?.trim();
  if (!s) return null;
  if (s === LEGACY_URL_SLUG) return "url_slug";
  if (s === "card" || s === "listing" || s === "metadata" || s === "url_slug" || s === "manual") {
    return s;
  }
  return null;
}

export function truncateSlugDebug(slug: string, max = 48): string {
  const s = slug.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function decodeSlugRaw(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

/** Normalize slug segment for admin debug line only (not shown as offer title). */
export function normalizeSlugDebugText(raw: string): string {
  return decodeSlugRaw(raw)
    .trim()
    .replace(/[_/]+/g, "_")
    .replace(/-+/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
}
