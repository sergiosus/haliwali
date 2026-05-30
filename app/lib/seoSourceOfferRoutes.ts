/** Reserved SEO route prefixes for future source-offer landing pages (not wired yet). */
export const SEO_SOURCE_OFFER_ROUTE_PREFIXES = {
  brand: "/brand",
  oem: "/oem",
  source: "/source",
  cityParts: "/city",
} as const;

export function seoBrandPath(brandSlug: string): string {
  return `${SEO_SOURCE_OFFER_ROUTE_PREFIXES.brand}/${encodeURIComponent(brandSlug.trim())}`;
}

export function seoOemPath(code: string): string {
  return `${SEO_SOURCE_OFFER_ROUTE_PREFIXES.oem}/${encodeURIComponent(code.trim())}`;
}

export function seoSourcePath(sourceName: string): string {
  return `${SEO_SOURCE_OFFER_ROUTE_PREFIXES.source}/${encodeURIComponent(sourceName.trim())}`;
}
