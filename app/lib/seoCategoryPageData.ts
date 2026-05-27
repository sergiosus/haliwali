import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CatalogCompanyListItem } from "./catalogTypes";
import type { DirectoryItem } from "./categoryDirectory";
import { findCityByName } from "./citiesData";
import {
  seoCategoryIntroText,
  seoCategoryPageDescription,
  seoCategoryPageTitle,
  seoCategoryUrlSlug,
} from "./seoContent";
import { filterPublicListingsForSeoCategory } from "./seoListings";
import {
  breadcrumbListJsonLd,
  itemListJsonLd,
  seoCategoryBreadcrumbs,
  companyListItemJsonLd,
} from "./seoSchema";
import { listingPath } from "./seo";
import {
  cityNameFromSlug,
  isValidSeoCitySlug,
  resolveDirectoryItemForSeoUrl,
  seoCategoryPath,
  seoCityCategoryPath,
  type SeoSegment,
} from "./seoRoutes";
import { absoluteUrl, siteUrl } from "./siteUrl";
import { listBootstrap } from "./serverListingsStore";
import { ensureCatalogReady, searchCatalogCompanies } from "./serverCatalogStore";
import type { Listing } from "./listingModel";

export type SeoCategoryPageData = {
  segment: SeoSegment;
  urlSlug: string;
  item: DirectoryItem;
  cityName: string | null;
  citySlug: string | null;
  listings: Listing[];
  companies: CatalogCompanyListItem[];
  canonicalPath: string;
  jsonLd: Record<string, unknown>[];
};

export async function loadSeoCategoryPageData(
  segment: SeoSegment,
  urlSlug: string,
  citySlug?: string | null,
): Promise<SeoCategoryPageData> {
  const item = resolveDirectoryItemForSeoUrl(segment, urlSlug);
  if (!item) notFound();

  let cityName: string | null = null;
  let resolvedCitySlug: string | null = null;
  if (citySlug) {
    if (!isValidSeoCitySlug(citySlug)) notFound();
    cityName = cityNameFromSlug(citySlug);
    if (!cityName) notFound();
    resolvedCitySlug = citySlug.trim().toLowerCase();
  }

  const [listingsAll, companies] = await Promise.all([
    listBootstrap(null, false),
    (async () => {
      await ensureCatalogReady();
      return searchCatalogCompanies({
        q: item.title,
        city: cityName ?? undefined,
        limit: 12,
      });
    })(),
  ]);

  const listings = filterPublicListingsForSeoCategory(listingsAll, item, {
    cityName,
    limit: 48,
  });

  const canonicalPath =
    cityName && resolvedCitySlug ?
      seoCityCategoryPath(resolvedCitySlug, segment, urlSlug)
    : seoCategoryPath(segment, urlSlug);

  const crumbs = seoCategoryBreadcrumbs(item, segment, urlSlug, cityName, resolvedCitySlug);
  const jsonLd: Record<string, unknown>[] = [
    breadcrumbListJsonLd(crumbs),
    itemListJsonLd(item.title, listings, (l) => listingPath(l.id, l.title)),
  ];
  if (companies.length > 0) jsonLd.push(companyListItemJsonLd(companies));

  return {
    segment,
    urlSlug,
    item,
    cityName,
    citySlug: resolvedCitySlug,
    listings,
    companies,
    canonicalPath,
    jsonLd,
  };
}

export function metadataForSeoCategoryPage(data: SeoCategoryPageData): Metadata {
  const title = seoCategoryPageTitle(data.item, data.segment, data.cityName);
  const description = seoCategoryPageDescription(data.item, data.segment, data.cityName);
  const url = absoluteUrl(data.canonicalPath);
  const robots =
    data.listings.length === 0 && data.companies.length === 0 ?
      { index: false, follow: true }
    : { index: true, follow: true };

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url, siteName: "Haliwali" },
    robots,
  };
}

export function mapCenterForSeoCity(cityName: string | null): { lat: number; lng: number } | null {
  if (!cityName) return null;
  const city = findCityByName(cityName);
  if (!city) return null;
  return { lat: city.lat, lng: city.lng };
}

export function introForSeoCategoryPage(data: SeoCategoryPageData): string {
  return seoCategoryIntroText(data.item, data.segment, data.cityName);
}

export function seoCategoryUrlSlugForItem(item: DirectoryItem, segment: SeoSegment): string {
  return seoCategoryUrlSlug(item, segment);
}

export function siteOrigin(): string {
  return siteUrl();
}
