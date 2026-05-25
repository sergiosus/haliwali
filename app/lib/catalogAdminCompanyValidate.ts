import { normalizeWebsite } from "./catalogExtractShared";
import {
  dedupeCatalogCities,
  normalizeCatalogCompanyCities,
  splitCatalogCityList,
} from "./catalogCompanyCities";
import { CATALOG_CATEGORY_SEED } from "./catalogTypes";

export type CatalogCompanyAdminPatch = {
  name: string;
  city: string;
  description: string;
  websiteUrl: string;
  categorySlug: string;
  logoUrl: string | null;
  serviceCities: string[];
};

const VALID_CATEGORY_SLUGS = new Set(CATALOG_CATEGORY_SEED.map((c) => c.slug));

export function parseCatalogCompanyAdminPatch(
  body: Record<string, unknown>,
):
  | { ok: true; data: CatalogCompanyAdminPatch }
  | { ok: false; error: string; code: string } {
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    return { ok: false, error: "Название компании обязательно (минимум 2 символа)", code: "NAME_REQUIRED" };
  }

  const cityRaw = String(body.primaryCity ?? body.city ?? "").trim();
  const serviceCitiesRaw = Array.isArray(body.serviceCities)
    ? body.serviceCities.map((city) => String(city))
    : splitCatalogCityList(String(body.serviceCities ?? ""));
  const normalizedCities = normalizeCatalogCompanyCities(cityRaw, dedupeCatalogCities(serviceCitiesRaw));
  const city = normalizedCities.primaryCity;
  const description = String(body.description ?? "").trim();
  const websiteRaw = String(body.websiteUrl ?? body.website ?? "").trim();
  const websiteUrl = websiteRaw ? normalizeWebsite(websiteRaw) : "";

  const categoryIds = Array.isArray(body.categoryIds)
    ? body.categoryIds.map((id) => String(id).trim().toLowerCase()).filter(Boolean)
    : [];
  const legacySlug = String(body.categorySlug ?? "").trim().toLowerCase();
  const categorySlug = categoryIds[0] ?? legacySlug;

  if (!categorySlug || !VALID_CATEGORY_SLUGS.has(categorySlug)) {
    return { ok: false, error: "Укажите корректную категорию", code: "CATEGORY_INVALID" };
  }

  const logoRaw = body.logoUrl;
  const logoUrl =
    logoRaw === null || logoRaw === undefined || logoRaw === "" ?
      null
    : String(logoRaw).trim();

  return {
    ok: true,
    data: {
      name,
      city,
      description,
      websiteUrl,
      categorySlug,
      logoUrl,
      serviceCities: normalizedCities.serviceCities,
    },
  };
}
