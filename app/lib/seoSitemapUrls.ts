import { directoryColumns } from "./categoryDirectory";
import { cities } from "./citiesData";
import { catalogCategoryUrl, catalogCompaniesSectionUrl, catalogCompanyPath } from "./catalogSeo";
import { sourceOfferPublicPath } from "./catalogSourceOfferSeo";
import { listingPath } from "./seo";
import {
  companyPublicPath,
  isValidSeoCitySlug,
  seoCategoryPath,
  seoCityCategoryPath,
  segmentFromTab,
  citySlugFromName,
  seoUrlSlugFromDirectorySlug,
} from "./seoRoutes";
import { siteUrl } from "./siteUrl";
import type { Listing } from "./listingModel";
import type { CatalogCategory, CatalogCompanyListItem } from "./catalogTypes";
import { collectCitySlugsFromListings } from "./seoListings";

const STATIC_PATHS = [
  "/",
  "/tasks",
  "/services",
  "/products",
  "/map",
  "/catalogs/companies",
  "/catalogs/predlozheniya",
  "/catalogs/poisk-postavshchikov",
  "/privacy",
  "/terms",
  "/about",
  "/contact",
];

function categorySeoUrls(base: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const col of directoryColumns) {
    const segment = segmentFromTab(col.tab);
    for (const item of col.items) {
      const urlSlug = seoUrlSlugFromDirectorySlug(item.slug, segment);
      const path = seoCategoryPath(segment, urlSlug);
      if (seen.has(path)) continue;
      seen.add(path);
      urls.push(`${base}${path}`);
    }
  }
  return urls;
}

function citySeoUrls(base: string, citySlugs: string[]): string[] {
  const urls: string[] = [];
  const seenCities = new Set<string>();
  for (const slug of citySlugs) {
    if (!isValidSeoCitySlug(slug) || seenCities.has(slug)) continue;
    seenCities.add(slug);
    urls.push(`${base}/${encodeURIComponent(slug)}`);
    for (const col of directoryColumns) {
      const segment = segmentFromTab(col.tab);
      for (const item of col.items.slice(0, 8)) {
        const urlSlug = seoUrlSlugFromDirectorySlug(item.slug, segment);
        urls.push(`${base}${seoCityCategoryPath(slug, segment, urlSlug)}`);
      }
    }
  }
  return urls;
}

export function buildStaticSitemapUrls(): string[] {
  const base = siteUrl();
  return STATIC_PATHS.map((p) => `${base}${p}`);
}

export function buildCategorySitemapUrls(): string[] {
  return categorySeoUrls(siteUrl());
}

export function buildCitySitemapUrls(listings: Listing[]): string[] {
  const fromListings = collectCitySlugsFromListings(listings);
  const fromSeed = cities.map((c) => citySlugFromName(c.name));
  const merged = [...new Set([...fromSeed, ...fromListings])];
  return citySeoUrls(siteUrl(), merged);
}

export function buildCompanySitemapUrls(companies: CatalogCompanyListItem[]): string[] {
  const base = siteUrl();
  const urls = new Set<string>();
  for (const c of companies) {
    urls.add(`${base}${companyPublicPath(c.slug)}`);
    urls.add(`${base}${catalogCompanyPath(c)}`);
  }
  return [...urls];
}

export function buildCatalogCategorySitemapUrls(categories: CatalogCategory[]): string[] {
  return categories.map((c) => catalogCategoryUrl(c.slug));
}

export function buildListingSitemapUrls(listings: Listing[]): string[] {
  const base = siteUrl();
  const urls: string[] = [];
  for (const l of listings) {
    const id = (l.id ?? "").trim();
    const title = (l.title ?? "").trim();
    if (!id || !title) continue;
    urls.push(`${base}${listingPath(id, title)}`);
  }
  return urls;
}

export function buildSourceOfferSitemapUrls(offerIds: number[]): string[] {
  const base = siteUrl();
  const urls: string[] = [];
  const seen = new Set<number>();
  for (const id of offerIds) {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    urls.push(`${base}${sourceOfferPublicPath(id)}`);
  }
  return urls;
}

export function buildSitemapIndexEntries(): { loc: string }[] {
  const base = siteUrl();
  return [
    { loc: `${base}/sitemap-static.xml` },
    { loc: `${base}/sitemap-categories.xml` },
    { loc: `${base}/sitemap-cities.xml` },
    { loc: `${base}/sitemap-companies.xml` },
    { loc: `${base}/sitemap-listings.xml` },
    { loc: `${base}/sitemap-catalog.xml` },
    { loc: `${base}/sitemap-source-offers.xml` },
  ];
}

export function catalogSitemapUrls(categories: CatalogCategory[], companies: CatalogCompanyListItem[]): string[] {
  const urls = new Set<string>([catalogCompaniesSectionUrl()]);
  for (const c of categories) urls.add(catalogCategoryUrl(c.slug));
  for (const co of companies) urls.add(`${siteUrl()}${catalogCompanyPath(co)}`);
  return [...urls];
}
