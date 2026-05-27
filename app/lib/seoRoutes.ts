import { allDirectoryItems, getDirectoryItemBySlug, type DirectoryItem, type DirectoryTab } from "./categoryDirectory";
import { cities } from "./citiesData";
import { getGlobalRussiaCitiesForSearch } from "./staticRussiaCities";
import { translitRuToLat } from "./seo";

export type SeoSegment = "uslugi" | "zadachi" | "tovary";

export const SEO_SEGMENTS: readonly SeoSegment[] = ["uslugi", "zadachi", "tovary"] as const;

const SEGMENT_PREFIX: Record<SeoSegment, string> = {
  uslugi: "uslugi-",
  zadachi: "zadachi-",
  tovary: "tovary-",
};

const SEGMENT_TAB: Record<SeoSegment, DirectoryTab> = {
  uslugi: "services",
  zadachi: "tasks",
  tovary: "products",
};

/** App routes that must not be treated as city slugs at `/{citySlug}`. */
export const RESERVED_ROOT_SEGMENTS = new Set([
  "about",
  "account",
  "admin",
  "ads",
  "api",
  "catalogs",
  "category",
  "chat",
  "company",
  "contact",
  "edit",
  "favicon.ico",
  "listing",
  "login",
  "map",
  "marketplaces",
  "messages",
  "post",
  "privacy",
  "products",
  "reset-password",
  "robots.txt",
  "search",
  "services",
  "sitemap.xml",
  "sitemap-static.xml",
  "sitemap-categories.xml",
  "sitemap-cities.xml",
  "sitemap-companies.xml",
  "sitemap-listings.xml",
  "sitemap-catalog.xml",
  "support",
  "tasks",
  "terms",
  "users",
  "uslugi",
  "zadachi",
  "tovary",
  "_next",
]);

export function segmentFromTab(tab: DirectoryTab): SeoSegment {
  if (tab === "tasks") return "zadachi";
  if (tab === "services") return "uslugi";
  return "tovary";
}

export function tabFromSegment(segment: SeoSegment): DirectoryTab {
  return SEGMENT_TAB[segment];
}

export function seoUrlSlugFromDirectorySlug(directorySlug: string, segment: SeoSegment): string {
  const slug = (directorySlug ?? "").trim();
  const prefix = SEGMENT_PREFIX[segment];
  if (slug.startsWith(prefix)) return slug.slice(prefix.length);
  return slug;
}

export function resolveDirectoryItemForSeoUrl(segment: SeoSegment, urlSlug: string): DirectoryItem | null {
  const part = (urlSlug ?? "").trim();
  if (!part) return null;
  const tab = tabFromSegment(segment);
  const prefixed = `${SEGMENT_PREFIX[segment]}${part}`;
  const byPrefixed = getDirectoryItemBySlug(prefixed);
  if (byPrefixed && byPrefixed.tab === tab) return byPrefixed;
  const direct = getDirectoryItemBySlug(part);
  if (direct && direct.tab === tab) return direct;
  const match = allDirectoryItems.find(
    (i) => i.tab === tab && (i.slug === part || i.slug === prefixed || i.slug.endsWith(`-${part}`)),
  );
  return match ?? null;
}

export function seoCategoryPath(segment: SeoSegment, urlSlug: string): string {
  return `/${segment}/${encodeURIComponent(urlSlug.trim())}`;
}

export function seoCityCategoryPath(citySlug: string, segment: SeoSegment, urlSlug: string): string {
  return `/${encodeURIComponent(citySlug.trim())}/${segment}/${encodeURIComponent(urlSlug.trim())}`;
}

export function citySlugFromName(cityName: string): string {
  return translitRuToLat(cityName);
}

export function cityNameFromSlug(citySlug: string): string | null {
  const slug = (citySlug ?? "").trim().toLowerCase();
  if (!slug || RESERVED_ROOT_SEGMENTS.has(slug)) return null;
  for (const c of cities) {
    if (citySlugFromName(c.name) === slug) return c.name;
  }
  for (const c of getGlobalRussiaCitiesForSearch()) {
    const name = (c.city ?? "").trim();
    if (name && citySlugFromName(name) === slug) return name;
  }
  return null;
}

export function isValidSeoCitySlug(citySlug: string): boolean {
  return Boolean(cityNameFromSlug(citySlug));
}

export function companyPublicPath(slug: string): string {
  return `/company/${encodeURIComponent(slug.trim())}`;
}

export function companyPublicUrl(slug: string, base?: string): string {
  const origin = (base ?? "").replace(/\/$/, "");
  return `${origin}${companyPublicPath(slug)}`;
}
