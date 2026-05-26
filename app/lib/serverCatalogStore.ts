import { logAdminCatalog } from "./catalogCatalogLog";
import { usesPostgres } from "./pgPool";
import type {
  CatalogCategory,
  CatalogCompanyAdminItem,
  CatalogCompanyClaimRequest,
  CatalogCompanyImportRow,
  CatalogCompanyListItem,
  CatalogCompanyProfile,
  CatalogReport,
} from "./catalogTypes";
import { CATALOG_CATEGORY_SEED } from "./catalogTypes";
import * as pg from "./serverCatalogPg";
import * as json from "./serverCatalogJson";

function categoriesFromSeed(): CatalogCategory[] {
  return CATALOG_CATEGORY_SEED.map((c) => ({ ...c, companyCount: 0 }));
}

async function withPg<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!usesPostgres()) return fallback();
  try {
    return await fn();
  } catch (e) {
    if (process.env.NODE_ENV === "production") throw e;
    return fallback();
  }
}

export async function listCatalogCategories(): Promise<CatalogCategory[]> {
  return withPg(() => pg.pgListCategories(), () => json.jsonListCategories());
}

export async function getCatalogCategory(slug: string): Promise<CatalogCategory | null> {
  return withPg(() => pg.pgGetCategory(slug), () => json.jsonGetCategory(slug));
}

export async function searchCatalogCompanies(opts: {
  categorySlug?: string;
  q?: string;
  city?: string;
  limit?: number;
}): Promise<CatalogCompanyListItem[]> {
  return withPg(() => pg.pgSearchCompanies(opts), () => json.jsonSearchCompanies(opts));
}

export async function getCatalogCompanyBySlug(slug: string): Promise<CatalogCompanyProfile | null> {
  return withPg(() => pg.pgGetCompanyBySlug(slug), () => json.jsonGetCompanyBySlug(slug));
}

export async function getRelatedCatalogCompanies(
  categorySlug: string,
  excludeSlug: string,
  limit = 4,
): Promise<CatalogCompanyListItem[]> {
  return withPg(
    () => pg.pgGetRelatedCompanies(categorySlug, excludeSlug, limit),
    () => json.jsonGetRelatedCompanies(categorySlug, excludeSlug, limit),
  );
}

export type CatalogCompanyChatTarget = {
  id: number;
  slug: string;
  name: string;
  categorySlug: string;
  profileStatus: "imported" | "verified";
  ownerUserId: string | null;
};

export async function getCatalogCompanyChatTarget(companyId: number): Promise<CatalogCompanyChatTarget | null> {
  return withPg(
    () => pg.pgGetCatalogCompanyChatTarget(companyId),
    () => json.jsonGetCatalogCompanyChatTarget(companyId),
  );
}

export async function listCatalogCompaniesSitemap(): Promise<CatalogCompanyListItem[]> {
  return withPg(
    () => pg.pgListCatalogCompaniesSitemap(),
    () => json.jsonListCatalogCompaniesSitemap(),
  );
}

export async function requestCatalogCompanyClaim(input: {
  slug: string;
  userId: string;
  fullName: string;
  position: string;
  email: string;
  phone: string;
  companyWebsite: string;
  proofMethod: "domain_email" | "official_phone" | "document_screenshot" | "other";
  proofText: string;
  proofFileUrl: string;
  proofType: string;
  proofValue: string;
  message: string;
}): Promise<CatalogCompanyClaimRequest | null> {
  return withPg(
    () => pg.pgRequestCatalogCompanyClaim(input),
    () => json.jsonRequestCatalogCompanyClaim(input),
  );
}

export async function listCatalogCompanyClaimsAdmin(): Promise<CatalogCompanyClaimRequest[]> {
  return withPg(
    () => pg.pgListCatalogCompanyClaimsAdmin(),
    () => json.jsonListCatalogCompanyClaimsAdmin(),
  );
}

export async function reviewCatalogCompanyClaim(input: {
  claimId: number;
  action: "approve" | "reject";
  reviewedBy: string;
}): Promise<CatalogCompanyClaimRequest | null> {
  return withPg(
    () => pg.pgReviewCatalogCompanyClaim(input),
    () => json.jsonReviewCatalogCompanyClaim(input),
  );
}

export async function importCatalogCompaniesFromCsv(
  rows: CatalogCompanyImportRow[],
): Promise<{ imported: number; skipped: number }> {
  if (usesPostgres()) {
    try {
      return await pg.pgImportCompanies(rows);
    } catch (e) {
      if (process.env.NODE_ENV === "production") throw e;
    }
  }
  return json.jsonImportCompanies(rows);
}

export async function listCatalogReportsAdmin(): Promise<CatalogReport[]> {
  return withPg(() => pg.pgListCatalogReports(), () => json.jsonListCatalogReports());
}

export async function listCatalogCompaniesAdmin(): Promise<CatalogCompanyAdminItem[]> {
  return withPg(() => pg.pgListAllCompaniesAdmin(), () => json.jsonListAllCompaniesAdmin());
}

export async function updateCatalogCompanyAdmin(
  id: number,
  patch: {
    name: string;
    city: string;
    description: string;
    website: string;
    categorySlug: string;
    logoUrl: string | null;
    serviceCities: string[];
  },
): Promise<CatalogCompanyAdminItem | null> {
  const updated = await withPg(
    () => pg.pgUpdateCatalogCompanyAdmin(id, patch),
    () => json.jsonUpdateCatalogCompanyAdmin(id, patch),
  );
  if (updated) {
    logAdminCatalog("company updated", { id, categorySlug: patch.categorySlug });
  }
  return updated;
}

/** Delete catalog company rows by DB id (category-scoped row; does not touch listings/users). */
export async function deleteCatalogCompaniesAdmin(ids: number[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return 0;
  const deleted = await withPg(
    () => pg.pgDeleteCatalogCompaniesByIds(unique),
    () => json.jsonDeleteCatalogCompaniesByIds(unique),
  );
  logAdminCatalog("company removed from category", { count: deleted, ids: unique.length });
  return deleted;
}

export async function ensureCatalogReady(): Promise<void> {
  if (usesPostgres()) {
    try {
      await pg.pgEnsureCategoriesSeeded();
      return;
    } catch {
      /* tables may be missing until migration */
    }
  }
}

export { categoriesFromSeed };
