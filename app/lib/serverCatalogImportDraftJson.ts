import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type { CatalogImportDraft, CatalogImportDraftInput, CatalogImportDraftStatus } from "./catalogImportTypes";
import { draftStatusDbValues, normalizeDraftStatus } from "./catalogImportTypes";
import type { CatalogImportUpsertResult } from "./catalogImportTypes";
import type { CatalogImportSource, CatalogSocialLink, CatalogSourceType } from "./catalogExtractionTypes";
import { draftDomainKey } from "./catalogImportDedup";
import { normalizeImportDomain } from "./catalogImportDomain";
import { mergeDraftInputs } from "./catalogImportMerge";
import { buildDraftWarnings } from "./catalogImportEnrich";
import { normalizeCatalogCompanyCities } from "./catalogCompanyCities";
import { catalogCompanyOriginFromDraftPayload } from "./catalogCompanyOrigin";
import { uniqueCompanySlug } from "./catalogSlug";
import { CATALOG_CATEGORY_SEED } from "./catalogTypes";

const STORE_PATH = ".data/catalog-import-drafts.json";

type JsonSource = CatalogImportSource;

type JsonDraft = CatalogImportDraftInput & {
  id: number;
  status: CatalogImportDraftStatus;
  sourceId: number | null;
  sourceType: CatalogSourceType | null;
  duplicateHint: string | null;
  duplicateOfCompanyId: number | null;
  needsReview: boolean;
  publishedCompanySlug: string | null;
  socialLinks: CatalogSocialLink[];
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
};

type JsonStore = {
  nextDraftId: number;
  nextSourceId: number;
  sources: JsonSource[];
  drafts: JsonDraft[];
};

async function readStore(): Promise<JsonStore> {
  assertFileStoreNotUsedInProduction("serverCatalogImportDraftJson.readStore");
  try {
    const raw = await readFile(path.join(process.cwd(), STORE_PATH), "utf8");
    const parsed = JSON.parse(raw) as JsonStore & { nextId?: number };
    return {
      nextDraftId: parsed.nextDraftId ?? parsed.nextId ?? 1,
      nextSourceId: parsed.nextSourceId ?? 1,
      sources: parsed.sources ?? [],
      drafts: parsed.drafts ?? [],
    };
  } catch {
    return { nextDraftId: 1, nextSourceId: 1, sources: [], drafts: [] };
  }
}

async function writeStore(store: JsonStore): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCatalogImportDraftJson.writeStore");
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), STORE_PATH), JSON.stringify(store, null, 2), "utf8");
}

function sourceById(store: JsonStore, id: number | null): JsonSource | null {
  if (!id) return null;
  return store.sources.find((s) => s.id === id) ?? null;
}

function toDraft(store: JsonStore, d: JsonDraft): CatalogImportDraft {
  const src = sourceById(store, d.sourceId);
  const warnings = buildDraftWarnings(d);
  return {
    id: d.id,
    status: normalizeDraftStatus(d.status),
    name: d.name,
    categorySlug: d.categorySlug,
    city: d.city,
    address: d.address,
    phone: d.phone,
    email: d.email,
    website: d.website,
    description: d.description,
    latitude: d.latitude,
    longitude: d.longitude,
    imageUrl: d.imageUrl,
    sourceUrl: d.sourceUrl,
    socialLinks: d.socialLinks ?? [],
    confidenceScore: d.confidenceScore ?? 0.5,
    rawPayload: d.rawPayload,
    sourceId: d.sourceId,
    sourceType: d.sourceType ?? src?.sourceType ?? null,
    sourceUrlDisplay: src?.sourceUrl ?? d.sourceUrl,
    duplicateHint: d.duplicateHint,
    duplicateOfCompanyId: d.duplicateOfCompanyId,
    needsReview: d.needsReview,
    warnings,
    publishedCompanySlug: d.publishedCompanySlug,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function jsonCreateImportSource(
  sourceUrl: string,
  sourceType: CatalogSourceType,
): Promise<CatalogImportSource> {
  const store = await readStore();
  const source: JsonSource = {
    id: store.nextSourceId++,
    sourceUrl,
    sourceType,
    status: "pending",
    errorMessage: null,
    createdAt: new Date().toISOString(),
  };
  store.sources.push(source);
  await writeStore(store);
  return source;
}

export async function jsonUpdateImportSourceStatus(
  id: number,
  status: CatalogImportSource["status"],
  errorMessage: string | null,
): Promise<void> {
  const store = await readStore();
  const s = store.sources.find((x) => x.id === id);
  if (s) {
    s.status = status;
    s.errorMessage = errorMessage;
  }
  await writeStore(store);
}

export async function jsonLoadDedupSeedData(): Promise<{
  published: { id: number; name: string; city: string; phone: string; website: string; address: string }[];
  drafts: { id: number; name: string; city: string; phone: string; website: string; address: string }[];
}> {
  const store = await readStore();
  const drafts = store.drafts
    .filter((d) => !["rejected", "published"].includes(d.status) && !d.publishedCompanySlug)
    .map((d) => ({
      id: d.id,
      name: d.name,
      city: d.city,
      phone: d.phone,
      website: d.website,
      address: d.address,
    }));
  let published: { id: number; name: string; city: string; phone: string; website: string; address: string }[] = [];
  try {
    const raw = await readFile(path.join(process.cwd(), ".data/catalog-store.json"), "utf8");
    const catalog = JSON.parse(raw) as {
      companies?: {
        id: number;
        name: string;
        city: string;
        website: string | null;
        address: string;
        contacts: { type: string; value: string }[];
        isPublished: boolean;
      }[];
    };
    published = (catalog.companies ?? [])
      .filter((c) => c.isPublished)
      .map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        phone: c.contacts?.find((x) => x.type === "phone")?.value ?? "",
        website: c.website ?? "",
        address: c.address ?? "",
      }));
  } catch {
    /* empty */
  }
  return { published, drafts };
}

export async function jsonListImportDrafts(opts?: {
  status?: CatalogImportDraftStatus;
}): Promise<CatalogImportDraft[]> {
  const store = await readStore();
  let list = store.drafts;
  if (opts?.status) {
    const allowed = new Set(draftStatusDbValues(opts.status));
    list = list.filter((d) => allowed.has(d.status) || normalizeDraftStatus(d.status) === opts.status);
  }
  return list.map((d) => toDraft(store, d)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type JsonImportWriteItem = {
  input: CatalogImportDraftInput;
  duplicateHint: string | null;
  duplicateOfCompanyId: number | null;
  needsReview: boolean;
  sourceId: number;
  existingDraftId?: number;
};

function jsonFindDraftByDomain(store: JsonStore, domain: string): JsonDraft | undefined {
  const dk = domain.trim().toLowerCase();
  if (!dk) return undefined;
  return store.drafts.find(
    (d) =>
      !["rejected", "published"].includes(normalizeDraftStatus(d.status)) &&
      !d.publishedCompanySlug &&
      (String(d.rawPayload?.rootDomain ?? "").toLowerCase() === dk ||
        normalizeImportDomain(d.website || d.sourceUrl || "") === dk),
  );
}

export async function jsonUpsertImportDraftsWithMeta(
  items: JsonImportWriteItem[],
): Promise<CatalogImportUpsertResult> {
  const store = await readStore();
  const now = new Date().toISOString();
  const drafts: CatalogImportDraft[] = [];
  const createdIds: number[] = [];
  const updatedIds: number[] = [];
  const sourceIds = new Set<number>();
  const src = sourceById(store, items[0]?.sourceId ?? null);

  for (const item of items) {
    if (item.sourceId > 0) sourceIds.add(item.sourceId);
    const domain = draftDomainKey({
      website: item.input.website,
      sourceUrl: item.input.sourceUrl ?? "",
      rawPayload: item.input.rawPayload ?? {},
    });
    let existing =
      item.existingDraftId ?
        store.drafts.find((d) => d.id === item.existingDraftId)
      : jsonFindDraftByDomain(store, domain);

    if (existing) {
      const patch = mergeDraftInputs(existing, item.input);
      Object.assign(existing, patch, {
        updatedAt: now,
        duplicateHint: item.duplicateHint ?? existing.duplicateHint,
        duplicateOfCompanyId: item.duplicateOfCompanyId ?? existing.duplicateOfCompanyId,
        needsReview:
          item.needsReview ||
          buildDraftWarnings({ ...existing, ...patch }).length > 0 ||
          Boolean(item.duplicateHint),
      });
      drafts.push(toDraft(store, existing));
      updatedIds.push(existing.id);
      continue;
    }

    const w = buildDraftWarnings(item.input);
    const d: JsonDraft = {
      id: store.nextDraftId++,
      status: "draft",
      sourceId: item.sourceId > 0 ? item.sourceId : null,
      sourceType: (item.input.rawPayload?.sourceType as CatalogSourceType) ?? src?.sourceType ?? null,
      ...item.input,
      socialLinks: item.input.socialLinks ?? [],
      confidenceScore: item.input.confidenceScore ?? 0.5,
      duplicateHint: item.duplicateHint,
      duplicateOfCompanyId: item.duplicateOfCompanyId,
      needsReview: item.needsReview || w.length > 0 || Boolean(item.duplicateHint),
      publishedCompanySlug: null,
      createdAt: now,
      updatedAt: now,
    };
    store.drafts.push(d);
    drafts.push(toDraft(store, d));
    createdIds.push(d.id);
  }
  await writeStore(store);
  return { drafts, createdIds, updatedIds, sourcesCreated: sourceIds.size };
}

export async function jsonUpsertImportDraftsV2(items: JsonImportWriteItem[]): Promise<CatalogImportDraft[]> {
  return (await jsonUpsertImportDraftsWithMeta(items)).drafts;
}

export async function jsonInsertImportDraftsV2(items: JsonImportWriteItem[]): Promise<CatalogImportDraft[]> {
  return jsonUpsertImportDraftsV2(items);
}

export async function jsonCountImportDrafts(): Promise<number> {
  const store = await readStore();
  return store.drafts.length;
}

export async function jsonUpdateImportDraft(
  id: number,
  patch: Partial<CatalogImportDraftInput> & { status?: CatalogImportDraftStatus },
): Promise<CatalogImportDraft | null> {
  const store = await readStore();
  const idx = store.drafts.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const cur = store.drafts[idx]!;
  const merged: JsonDraft = {
    ...cur,
    ...patch,
    socialLinks: patch.socialLinks ?? cur.socialLinks,
    confidenceScore: patch.confidenceScore ?? cur.confidenceScore,
    updatedAt: new Date().toISOString(),
  };
  const warnings = buildDraftWarnings(merged);
  merged.needsReview = warnings.length > 0 || Boolean(merged.duplicateHint);
  if (patch.status) merged.status = patch.status;
  store.drafts[idx] = merged;
  await writeStore(store);
  return toDraft(store, merged);
}

export async function jsonSetImportDraftStatuses(
  ids: number[],
  status: CatalogImportDraftStatus,
): Promise<number> {
  const store = await readStore();
  let n = 0;
  const now = new Date().toISOString();
  for (const d of store.drafts) {
    if (ids.includes(d.id)) {
      d.status = status;
      d.updatedAt = now;
      n += 1;
    }
  }
  await writeStore(store);
  return n;
}

/** Permanently remove import draft rows only (never catalog_companies). */
export async function jsonDeleteImportDrafts(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const store = await readStore();
  const before = store.drafts.length;
  store.drafts = store.drafts.filter((d) => !ids.includes(d.id));
  const deleted = before - store.drafts.length;
  await writeStore(store);
  return deleted;
}

export async function jsonPublishImportDrafts(ids: number[]): Promise<{
  published: number;
  skipped: number;
  slugs: string[];
}> {
  const store = await readStore();
  let catalogStore: {
    nextId: number;
    companies: {
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
      sourceUrl?: string | null;
      origin?: "imported_by_admin" | "imported_public" | "owner_submitted" | "user_submitted";
      profileStatus?: "imported" | "verified";
      rating: number | null;
      latitude: number | null;
      longitude: number | null;
      images: string[];
      contacts: { type: "phone" | "email" | "other"; value: string }[];
      isPublished: boolean;
    }[];
    reports: unknown[];
  };
  try {
    const raw = await readFile(path.join(process.cwd(), ".data/catalog-store.json"), "utf8");
    catalogStore = JSON.parse(raw);
  } catch {
    catalogStore = { nextId: 1, companies: [], reports: [] };
  }

  const used = new Set(catalogStore.companies.map((c) => c.slug));
  let published = 0;
  let skipped = 0;
  const slugs: string[] = [];
  const now = new Date().toISOString();

  for (const id of ids) {
    const d = store.drafts.find((x) => x.id === id);
    if (
      !d ||
      d.status === "rejected" ||
      d.publishedCompanySlug ||
      normalizeDraftStatus(d.status) !== "approved"
    ) {
      skipped += 1;
      continue;
    }
    const cat = d.categorySlug.trim().toLowerCase();
    if (!CATALOG_CATEGORY_SEED.some((c) => c.slug === cat) || !d.name.trim()) {
      skipped += 1;
      continue;
    }
    const slug = uniqueCompanySlug(d.name, used);
    const companyId = catalogStore.nextId++;
    const contacts: { type: "phone" | "email" | "other"; value: string }[] = [];
    if (d.phone.trim()) contacts.push({ type: "phone", value: d.phone.trim() });
    if (d.email.trim()) contacts.push({ type: "email", value: d.email.trim() });
    for (const link of d.socialLinks ?? []) {
      if (link.url) contacts.push({ type: "other", value: link.url });
    }
    const images = d.imageUrl?.trim() ? [d.imageUrl.trim()] : [];
    const normalizedCities = normalizeCatalogCompanyCities(d.city.trim());
    catalogStore.companies.push({
      id: companyId,
      slug,
      name: d.name.trim(),
      categorySlug: cat,
      city: normalizedCities.primaryCity,
      serviceCities: normalizedCities.serviceCities,
      address: d.address.trim(),
      description: d.description.trim(),
      logoUrl: d.imageUrl,
      website: d.website.trim() || null,
      sourceUrl: d.sourceUrl?.trim() || null,
      origin: catalogCompanyOriginFromDraftPayload(d.rawPayload),
      rating: null,
      latitude: d.latitude,
      longitude: d.longitude,
      images,
      contacts,
      isPublished: true,
      profileStatus: "imported",
    });
    d.status = "published";
    d.publishedCompanySlug = slug;
    d.updatedAt = now;
    published += 1;
    slugs.push(slug);
  }

  await writeFile(
    path.join(process.cwd(), ".data/catalog-store.json"),
    JSON.stringify(catalogStore, null, 2),
    "utf8",
  );
  await writeStore(store);
  return { published, skipped, slugs };
}

export async function jsonSaveImportDraft(
  id: number,
  patch: Partial<CatalogImportDraftInput>,
): Promise<CatalogImportDraft | null> {
  const store = await readStore();
  const idx = store.drafts.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const cur = store.drafts[idx]!;
  const st = normalizeDraftStatus(cur.status);
  if (st === "published" || st === "rejected") return null;
  return jsonUpdateImportDraft(id, { ...patch, status: "saved" });
}

export async function jsonMergeDraftIntoCompany(
  draftId: number,
  companyId: number,
): Promise<CatalogImportDraft | null> {
  const store = await readStore();
  const d = store.drafts.find((x) => x.id === draftId);
  if (!d) return null;
  let catalogStore: {
    nextId: number;
    companies: {
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
      sourceUrl?: string | null;
      origin?: "imported_by_admin" | "imported_public" | "owner_submitted" | "user_submitted";
      profileStatus?: "imported" | "verified";
      rating: number | null;
      latitude: number | null;
      longitude: number | null;
      images: string[];
      contacts: { type: "phone" | "email" | "other"; value: string }[];
      isPublished: boolean;
    }[];
    reports: unknown[];
  };
  try {
    const raw = await readFile(path.join(process.cwd(), ".data/catalog-store.json"), "utf8");
    catalogStore = JSON.parse(raw);
  } catch {
    return null;
  }
  const co = catalogStore.companies.find((c) => c.id === companyId);
  if (!co) return null;
  const normalizedCities = normalizeCatalogCompanyCities(d.city.trim(), co.serviceCities ?? []);
  co.name = d.name.trim() || co.name;
  co.city = normalizedCities.primaryCity || co.city;
  co.serviceCities = normalizedCities.serviceCities;
  co.address = d.address.trim() || co.address;
  co.description = d.description.trim() || co.description;
  if (d.imageUrl) co.logoUrl = d.imageUrl;
  if (d.website.trim()) co.website = d.website.trim();
  co.contacts = [];
  if (d.phone.trim()) co.contacts.push({ type: "phone", value: d.phone.trim() });
  if (d.email.trim()) co.contacts.push({ type: "email", value: d.email.trim() });
  d.status = "published";
  d.publishedCompanySlug = co.slug;
  d.duplicateOfCompanyId = companyId;
  d.updatedAt = new Date().toISOString();
  await writeFile(
    path.join(process.cwd(), ".data/catalog-store.json"),
    JSON.stringify(catalogStore, null, 2),
    "utf8",
  );
  await writeStore(store);
  return toDraft(store, d);
}
