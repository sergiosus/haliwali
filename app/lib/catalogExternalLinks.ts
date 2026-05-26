function normalizeLinkKey(url: string): string {
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const u = new URL(withProto);
    return `${u.hostname.replace(/^www\./i, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function catalogExternalHref(url: string): string {
  const t = url.trim();
  if (!t) return "#";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Public source link when it differs from the company website. */
export function catalogPublicSourceHref(
  sourceUrl: string | null | undefined,
  website: string | null | undefined,
): string | null {
  const src = sourceUrl?.trim();
  if (!src) return null;
  const site = website?.trim();
  if (site && normalizeLinkKey(src) === normalizeLinkKey(site)) return null;
  return catalogExternalHref(src);
}
