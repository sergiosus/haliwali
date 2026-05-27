import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { directoryColumns } from "./categoryDirectory";
import { findCityByName } from "./citiesData";
import { filterPublicListingsForCity } from "./seoListings";
import { breadcrumbListJsonLd, itemListJsonLd, seoCityBreadcrumbs } from "./seoSchema";
import { seoCityIntroText, seoCityLandingDescription, seoCityLandingTitle } from "./seoContent";
import { listingPath } from "./seo";
import {
  cityNameFromSlug,
  isValidSeoCitySlug,
  segmentFromTab,
  seoUrlSlugFromDirectorySlug,
} from "./seoRoutes";
import { absoluteUrl } from "./siteUrl";
import { listBootstrap } from "./serverListingsStore";
import { ensureCatalogReady, searchCatalogCompanies } from "./serverCatalogStore";
import type { Listing } from "./listingModel";
import type { CatalogCompanyListItem } from "./catalogTypes";

export type SeoCityPopularCategory = {
  title: string;
  href: string;
};

export type SeoCityPageData = {
  cityName: string;
  citySlug: string;
  listings: Listing[];
  companies: CatalogCompanyListItem[];
  popularCategories: SeoCityPopularCategory[];
  mapCenter: { lat: number; lng: number } | null;
  jsonLd: Record<string, unknown>[];
};

export async function loadSeoCityPageData(citySlug: string): Promise<SeoCityPageData> {
  if (!isValidSeoCitySlug(citySlug)) notFound();
  const cityName = cityNameFromSlug(citySlug);
  if (!cityName) notFound();

  const [listingsAll, companies] = await Promise.all([
    listBootstrap(null, false),
    (async () => {
      await ensureCatalogReady();
      return searchCatalogCompanies({ city: cityName, limit: 12 });
    })(),
  ]);

  const listings = filterPublicListingsForCity(listingsAll, cityName, 24);
  const city = findCityByName(cityName);

  const popularCategories: SeoCityPopularCategory[] = [];
  for (const col of directoryColumns) {
    const segment = segmentFromTab(col.tab);
    for (const item of col.items.slice(0, 3)) {
      const urlSlug = seoUrlSlugFromDirectorySlug(item.slug, segment);
      popularCategories.push({
        title: item.title,
        href: `/${citySlug}/${segment}/${urlSlug}`,
      });
    }
  }

  const crumbs = seoCityBreadcrumbs(cityName, citySlug);
  const jsonLd = [
    breadcrumbListJsonLd(crumbs),
    itemListJsonLd(`Объявления в ${cityName}`, listings, (l) => listingPath(l.id, l.title)),
  ];

  return {
    cityName,
    citySlug: citySlug.trim().toLowerCase(),
    listings,
    companies,
    popularCategories,
    mapCenter: city ? { lat: city.lat, lng: city.lng } : null,
    jsonLd,
  };
}

export function metadataForSeoCityPage(data: SeoCityPageData): Metadata {
  const title = seoCityLandingTitle(data.cityName);
  const description = seoCityLandingDescription(data.cityName);
  const url = absoluteUrl(`/${data.citySlug}`);
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

export function introForSeoCityPage(data: SeoCityPageData): string {
  return seoCityIntroText(data.cityName);
}
