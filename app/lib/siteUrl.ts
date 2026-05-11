/** Canonical public site origin (no trailing slash). */
export const CANONICAL_SITE_ORIGIN = "https://haliwali.ru";

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Public site origin for metadata, sitemap, robots, and absolute links.
 * `www.haliwali.ru` in env or URLs is normalized to the apex host.
 */
export function normalizePublicSiteOrigin(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const url = new URL(t.includes("://") ? t : `https://${t}`);
    const host = url.hostname.toLowerCase();
    if (host === "haliwali.ru" || host === "www.haliwali.ru") {
      return CANONICAL_SITE_ORIGIN;
    }
    return stripTrailingSlashes(`${url.protocol}//${url.host}`);
  } catch {
    return null;
  }
}

export function siteUrl(): string {
  return (
    normalizePublicSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? "") ??
    normalizePublicSiteOrigin(process.env.SITE_URL ?? "") ??
    CANONICAL_SITE_ORIGIN
  );
}

export function absoluteUrl(pathname: string): string {
  const p = String(pathname ?? "").trim();
  if (!p) return siteUrl();
  if (p.startsWith("http://") || p.startsWith("https://")) {
    const normalized = normalizePublicSiteOrigin(p);
    return normalized ?? stripTrailingSlashes(p);
  }
  return `${siteUrl()}${p.startsWith("/") ? "" : "/"}${p}`;
}
