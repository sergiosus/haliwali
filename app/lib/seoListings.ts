import { listingMatchesDirectoryCategorySlug } from "./categoryLegacyMap";
import type { DirectoryItem } from "./categoryDirectory";
import type { Listing } from "./listingModel";
import { isListingPubliclyListed } from "./listingModel";
import { normalizeRussiaLocationLookupKey } from "./locationDisplay";
import { citySlugFromName } from "./seoRoutes";

export function listingMatchesCityName(listing: Pick<Listing, "city" | "location">, cityName: string): boolean {
  const target = normalizeRussiaLocationLookupKey(cityName);
  if (!target) return false;
  const fields = [
    listing.city,
    listing.location?.city,
    listing.location?.region,
    listing.location?.displayName,
  ].filter(Boolean) as string[];
  return fields.some((f) => {
    const key = normalizeRussiaLocationLookupKey(f);
    return key === target || key.includes(target) || target.includes(key);
  });
}

export function filterPublicListingsForSeoCategory(
  listings: Listing[],
  item: DirectoryItem,
  opts?: { cityName?: string | null; limit?: number },
): Listing[] {
  const limit = opts?.limit ?? 48;
  const cityName = (opts?.cityName ?? "").trim();

  let rows = listings.filter((l) => isListingPubliclyListed(l));
  rows = rows.filter((l) => item.listingTypes.includes(l.type));
  rows = rows.filter((l) => listingMatchesDirectoryCategorySlug(l, item.slug));
  if (cityName) rows = rows.filter((l) => listingMatchesCityName(l, cityName));
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows.slice(0, limit);
}

export function filterPublicListingsForCity(listings: Listing[], cityName: string, limit = 24): Listing[] {
  const rows = listings
    .filter((l) => isListingPubliclyListed(l))
    .filter((l) => listingMatchesCityName(l, cityName))
    .sort((a, b) => b.createdAt - a.createdAt);
  return rows.slice(0, limit);
}

export function collectCitySlugsFromListings(listings: Listing[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of listings) {
    const name = (l.city ?? "").trim();
    if (!name) continue;
    const slug = citySlugFromName(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
