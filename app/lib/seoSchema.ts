import type { CatalogCompanyListItem, CatalogCompanyProfile } from "./catalogTypes";
import type { DirectoryItem } from "./categoryDirectory";
import type { Listing } from "./listingModel";
import { absoluteUrl } from "./siteUrl";
import type { SeoSegment } from "./seoRoutes";
import { companyPublicPath, seoCategoryPath, seoCityCategoryPath } from "./seoRoutes";
import { hasCatalogCoordinates } from "./catalogMapLinks";

export type JsonLd = Record<string, unknown>;

export function breadcrumbListJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListJsonLd(
  name: string,
  listings: Pick<Listing, "id" | "title">[],
  pathForListing: (l: Pick<Listing, "id" | "title">) => string,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: listings.length,
    itemListElement: listings.slice(0, 20).map((l, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: l.title,
      url: absoluteUrl(pathForListing(l)),
    })),
  };
}

export function localBusinessJsonLd(
  company: CatalogCompanyProfile,
  canonicalPath: string,
): JsonLd {
  const phone = company.contacts.find((c) => c.type === "phone")?.value;
  const json: JsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: company.name,
    description: company.description || undefined,
    url: absoluteUrl(canonicalPath),
    ...(company.website ? { sameAs: [company.website] } : {}),
    ...(phone ? { telephone: phone } : {}),
    address: {
      "@type": "PostalAddress",
      ...(company.address ? { streetAddress: company.address } : {}),
      ...(company.city ? { addressLocality: company.city } : {}),
      addressCountry: "RU",
    },
  };
  if (hasCatalogCoordinates(company)) {
    json.geo = {
      "@type": "GeoCoordinates",
      latitude: company.latitude,
      longitude: company.longitude,
    };
  }
  return json;
}

export function organizationJsonLd(siteName = "Haliwali"): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: absoluteUrl("/"),
  };
}

export function seoCategoryBreadcrumbs(
  item: DirectoryItem,
  segment: SeoSegment,
  urlSlug: string,
  cityName?: string | null,
  citySlug?: string | null,
): { name: string; path: string }[] {
  const crumbs: { name: string; path: string }[] = [{ name: "Haliwali", path: "/" }];
  if (cityName && citySlug) {
    crumbs.push({ name: cityName, path: `/${citySlug}` });
    crumbs.push({
      name: item.title,
      path: seoCityCategoryPath(citySlug, segment, urlSlug),
    });
    return crumbs;
  }
  crumbs.push({
    name: item.title,
    path: seoCategoryPath(segment, urlSlug),
  });
  return crumbs;
}

export function seoCityBreadcrumbs(cityName: string, citySlug: string): { name: string; path: string }[] {
  return [
    { name: "Haliwali", path: "/" },
    { name: cityName, path: `/${citySlug}` },
  ];
}

export function companyBreadcrumbs(company: Pick<CatalogCompanyProfile, "name" | "slug">): {
  name: string;
  path: string;
}[] {
  return [
    { name: "Haliwali", path: "/" },
    { name: "Компании", path: "/catalogs/companies" },
    { name: company.name, path: companyPublicPath(company.slug) },
  ];
}

export function companyListItemJsonLd(companies: CatalogCompanyListItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Компании",
    numberOfItems: companies.length,
    itemListElement: companies.slice(0, 12).map((c, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: c.name,
      url: absoluteUrl(companyPublicPath(c.slug)),
    })),
  };
}
