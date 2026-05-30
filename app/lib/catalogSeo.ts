import type { CatalogCategory, CatalogCompanyProfile } from "./catalogTypes";
import { siteUrl } from "./siteUrl";
import { truncateMetaDescription } from "./seo";

function compactText(value: string | null | undefined): string {
  return `${value ?? ""}`.trim().replace(/\s+/g, " ");
}

function lowerFirst(value: string): string {
  const text = compactText(value);
  if (!text) return "";
  return text.charAt(0).toLocaleLowerCase("ru-RU") + text.slice(1);
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value.trim());
}

export function catalogRootUrl(): string {
  return `${siteUrl()}/catalogs`;
}

export function catalogCompaniesSectionUrl(): string {
  return `${siteUrl()}/catalogs/companies`;
}

export function catalogCategoryUrl(slug: string): string {
  return `${catalogRootUrl()}/${encodePathPart(slug)}`;
}

export function catalogCompanyPath(company: Pick<CatalogCompanyProfile, "categorySlug" | "slug">): string {
  return `/catalogs/${encodePathPart(company.categorySlug)}/${encodePathPart(company.slug)}`;
}

export function catalogCompanyUrl(company: Pick<CatalogCompanyProfile, "categorySlug" | "slug">): string {
  return `${siteUrl()}${catalogCompanyPath(company)}`;
}

export function catalogCategorySeoTitle(category: Pick<CatalogCategory, "title">): string {
  return `${compactText(category.title)} — каталог компаний | Haliwali`;
}

export function catalogCategorySeoDescription(category: Pick<CatalogCategory, "title" | "subtitle">): string {
  const title = compactText(category.title);
  const subtitle = compactText(category.subtitle);
  return truncateMetaDescription(
    `${subtitle || `Компании в категории «${title}»`}. Каталог компаний Haliwali: контакты, сайты, телефоны и адреса.`,
  );
}

export function catalogCompanySeoTitle(company: Pick<CatalogCompanyProfile, "name" | "categoryTitle" | "city" | "services">): string {
  const businessKind = lowerFirst(company.services?.[0] || company.categoryTitle || "компания");
  const city = compactText(company.city);
  const location = city ? ` в ${city}` : "";
  return `${compactText(company.name)} — ${businessKind}${location} | Haliwali`;
}

export function catalogCompanySeoDescription(
  company: Pick<CatalogCompanyProfile, "name" | "categoryTitle" | "city" | "description" | "address" | "services">,
): string {
  const name = compactText(company.name);
  const city = compactText(company.city);
  const address = compactText(company.address);
  const businessKind = lowerFirst(company.services?.[0] || company.categoryTitle || "компания");
  const fallback = `${name}: ${businessKind}${city ? ` в ${city}` : ""}${address ? `, ${address}` : ""}. Контакты, описание и ссылка на сайт в каталоге Haliwali.`;
  return truncateMetaDescription(compactText(company.description) || fallback);
}

