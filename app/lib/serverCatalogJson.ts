import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type {
  CatalogCategory,
  CatalogCompanyAdminItem,
  CatalogCompanyImportRow,
  CatalogCompanyListItem,
  CatalogCompanyProfile,
  CatalogReport,
} from "./catalogTypes";
import { CATALOG_CATEGORY_SEED } from "./catalogTypes";
import {
  matchedServiceCity,
  normalizeCatalogCompanyCities,
} from "./catalogCompanyCities";
import { uniqueCompanySlug } from "./catalogSlug";

const STORE_PATH = ".data/catalog-store.json";

type JsonCompany = {
  id: number;
  slug: string;
  name: string;
  categorySlug: string;
  city: string;
  serviceCities?: string[];
  address: string;
  description: string;
  logoUrl: string | null;
  website: string | null;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  contacts: { type: "phone" | "email" | "other"; value: string }[];
  isPublished: boolean;
};

type JsonStore = {
  nextId: number;
  companies: JsonCompany[];
  reports: CatalogReport[];
};

async function readStore(): Promise<JsonStore> {
  assertFileStoreNotUsedInProduction("serverCatalogJson.readStore");
  try {
    const raw = await readFile(path.join(process.cwd(), STORE_PATH), "utf8");
    const parsed = JSON.parse(raw) as JsonStore;
    if (!parsed.companies) return { nextId: 1, companies: [], reports: [] };
    return parsed;
  } catch {
    return { nextId: 1, companies: [], reports: [] };
  }
}

async function writeStore(store: JsonStore): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCatalogJson.writeStore");
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), STORE_PATH), JSON.stringify(store, null, 2), "utf8");
}

function categoryTitle(slug: string): string {
  return CATALOG_CATEGORY_SEED.find((c) => c.slug === slug)?.title ?? slug;
}

function toListItem(c: JsonCompany, query = ""): CatalogCompanyListItem {
  const normalized = normalizeCatalogCompanyCities(c.city, c.serviceCities ?? []);
  return {
    slug: c.slug,
    name: c.name,
    categorySlug: c.categorySlug,
    categoryTitle: categoryTitle(c.categorySlug),
    city: normalized.primaryCity,
    serviceCities: normalized.serviceCities,
    locationContext: matchedServiceCity(normalized.primaryCity, normalized.serviceCities, query),
    description: c.description,
    logoUrl: c.logoUrl,
    rating: c.rating,
    latitude: c.latitude,
    longitude: c.longitude,
  };
}

export async function jsonListCategories(): Promise<CatalogCategory[]> {
  const store = await readStore();
  return CATALOG_CATEGORY_SEED.map((c) => ({
    ...c,
    companyCount: store.companies.filter((co) => co.categorySlug === c.slug && co.isPublished).length,
  })).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function jsonGetCategory(slug: string): Promise<CatalogCategory | null> {
  const base = CATALOG_CATEGORY_SEED.find((c) => c.slug === slug);
  if (!base) return null;
  const store = await readStore();
  return {
    ...base,
    companyCount: store.companies.filter((co) => co.categorySlug === slug && co.isPublished).length,
  };
}

export async function jsonSearchCompanies(opts: {
  categorySlug?: string;
  q?: string;
  city?: string;
  limit?: number;
}): Promise<CatalogCompanyListItem[]> {
  const store = await readStore();
  const q = (opts.q ?? "").trim().toLowerCase();
  const cityQuery = (opts.city ?? "").trim().toLowerCase();
  let list = store.companies.filter((c) => c.isPublished);
  if (opts.categorySlug) list = list.filter((c) => c.categorySlug === opts.categorySlug);
  if (q.length >= 2) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        (c.serviceCities ?? []).some((city) => city.toLowerCase().includes(q) || q.includes(city.toLowerCase())) ||
        c.description.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }
  if (cityQuery.length >= 2) {
    list = list.filter(
      (c) =>
        c.city.toLowerCase().includes(cityQuery) ||
        (c.serviceCities ?? []).some((city) => city.toLowerCase().includes(cityQuery) || cityQuery.includes(city.toLowerCase())),
    );
  }
  const limit = Math.min(opts.limit ?? 200, 500);
  return list.slice(0, limit).map((c) => toListItem(c, cityQuery || q));
}

export async function jsonGetCompanyBySlug(slug: string): Promise<CatalogCompanyProfile | null> {
  const store = await readStore();
  const c = store.companies.find((x) => x.slug === slug && x.isPublished);
  if (!c) return null;
  const images = [...c.images];
  if (c.logoUrl && !images.includes(c.logoUrl)) images.unshift(c.logoUrl);
  return {
    ...toListItem(c),
    address: c.address,
    website: c.website,
    images,
    contacts: c.contacts,
    services: [],
  };
}

export async function jsonGetRelatedCompanies(
  categorySlug: string,
  excludeSlug: string,
  limit: number,
): Promise<CatalogCompanyListItem[]> {
  const items = await jsonSearchCompanies({ categorySlug, limit: limit + 8 });
  return items.filter((c) => c.slug !== excludeSlug).slice(0, limit);
}

export async function jsonImportCompanies(
  rows: CatalogCompanyImportRow[],
): Promise<{ imported: number; skipped: number }> {
  const store = await readStore();
  const used = new Set(store.companies.map((c) => c.slug));
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const cat = row.category.trim().toLowerCase();
    if (!CATALOG_CATEGORY_SEED.some((c) => c.slug === cat)) {
      skipped += 1;
      continue;
    }
    const slug = uniqueCompanySlug(row.name, used);
    const id = store.nextId++;
    const normalizedCities = normalizeCatalogCompanyCities(row.city.trim());
    store.companies.push({
      id,
      slug,
      name: row.name.trim(),
      categorySlug: cat,
      city: normalizedCities.primaryCity,
      serviceCities: normalizedCities.serviceCities,
      address: row.address.trim(),
      description: row.description.trim(),
      logoUrl: null,
      website: row.website.trim() || null,
      rating: null,
      latitude: row.latitude,
      longitude: row.longitude,
      images: [],
      contacts: row.phone.trim() ? [{ type: "phone", value: row.phone.trim() }] : [],
      isPublished: true,
    });
    imported += 1;
  }
  await writeStore(store);
  return { imported, skipped };
}

export async function jsonListCatalogReports(): Promise<CatalogReport[]> {
  const store = await readStore();
  return store.reports;
}

export async function jsonListAllCompaniesAdmin(): Promise<CatalogCompanyAdminItem[]> {
  const store = await readStore();
  return store.companies.map((c) => ({
    ...toListItem(c),
    id: c.id,
    website: c.website,
    contacts: c.contacts,
  }));
}

export async function jsonUpdateCatalogCompanyAdmin(
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
  const store = await readStore();
  const idx = store.companies.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const cur = store.companies[idx]!;
  const normalizedCities = normalizeCatalogCompanyCities(patch.city, patch.serviceCities);
  const next: JsonCompany = {
    ...cur,
    name: patch.name,
    city: normalizedCities.primaryCity,
    serviceCities: normalizedCities.serviceCities,
    description: patch.description,
    website: patch.website || null,
    categorySlug: patch.categorySlug,
    logoUrl: patch.logoUrl,
  };
  store.companies[idx] = next;
  await writeStore(store);
  return { ...toListItem(next), id: next.id, website: next.website };
}

export async function jsonDeleteCatalogCompaniesByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const store = await readStore();
  const idSet = new Set(ids);
  const before = store.companies.length;
  store.companies = store.companies.filter((c) => !idSet.has(c.id));
  await writeStore(store);
  return before - store.companies.length;
}
