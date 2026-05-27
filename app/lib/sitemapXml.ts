export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderUrlSet(urls: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map((u) => `<url><loc>${xmlEscape(u)}</loc></url>`).join("") +
    `</urlset>`
  );
}

export function renderSitemapIndex(entries: { loc: string }[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    entries.map((e) => `<sitemap><loc>${xmlEscape(e.loc)}</loc></sitemap>`).join("") +
    `</sitemapindex>`
  );
}

export const SITEMAP_CACHE_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
} as const;
