import type { SeoSegment } from "./seoRoutes";

export type MapBrowseKind = "all" | "task" | "service" | "product";

export function mapKindFromSeoSegment(segment: SeoSegment): MapBrowseKind {
  if (segment === "zadachi") return "task";
  if (segment === "uslugi") return "service";
  return "product";
}

/** Link to `/map` with filters from SEO category/city pages. */
export function buildMapBrowseHref(opts: {
  categorySlug?: string;
  cityName?: string | null;
  kind?: MapBrowseKind;
}): string {
  const params = new URLSearchParams();
  const category = (opts.categorySlug ?? "").trim();
  const city = (opts.cityName ?? "").trim();
  if (category) params.set("category", category);
  if (city) params.set("city", city);
  if (opts.kind && opts.kind !== "all") params.set("kind", opts.kind);
  const q = params.toString();
  return q ? `/map?${q}` : "/map";
}

export function parseMapBrowseKind(raw: string | null): MapBrowseKind {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "task" || v === "service" || v === "product") return v;
  return "all";
}

/** Exact stored coordinates — used to show «На карте» on SEO cards. */
export function buildMapListingFocusHref(listingId: string): string {
  const id = listingId.trim();
  return `/map?listingId=${encodeURIComponent(id)}`;
}

export function buildMapCompanyFocusHref(companySlug: string): string {
  const slug = companySlug.trim();
  return `/map?company=${encodeURIComponent(slug)}`;
}

export function mapListingMarkerId(listingId: string): string {
  return listingId.trim();
}

export function mapCompanyMarkerId(companySlug: string): string {
  return `co:${companySlug.trim()}`;
}
