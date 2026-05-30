/** Reserved under `/catalogs/*` — not company category slugs. */
export const CATALOG_RESERVED_SEGMENTS = [
  "companies",
  "predlozheniya",
  "poisk-postavshchikov",
  "company",
] as const;

export const CATALOG_OFFERS_SECTIONS = [
  { slug: "companies", href: "/catalogs/companies", label: "Компании" },
  {
    slug: "predlozheniya",
    href: "/catalogs/predlozheniya",
    label: "Объявления из источников",
  },
  {
    slug: "poisk-postavshchikov",
    href: "/catalogs/poisk-postavshchikov",
    label: "Поиск поставщиков",
  },
] as const;

export const CATALOG_OFFERS_HUB_LABEL = "Каталог предложений";
export const CATALOG_OFFERS_HUB_HREF = "/catalogs/companies";

export function isCatalogCompaniesSection(pathname: string): boolean {
  if (pathname === "/catalogs" || pathname.startsWith("/catalogs/companies")) return true;
  if (
    pathname.startsWith("/catalogs/predlozheniya") ||
    pathname.startsWith("/catalogs/poisk-postavshchikov")
  ) {
    return false;
  }
  if (pathname.startsWith("/catalogs/company/")) return true;
  if (!pathname.startsWith("/catalogs/")) return false;
  const rest = pathname.slice("/catalogs/".length);
  const segment = rest.split("/")[0] ?? "";
  return !CATALOG_RESERVED_SEGMENTS.includes(segment as (typeof CATALOG_RESERVED_SEGMENTS)[number]);
}
