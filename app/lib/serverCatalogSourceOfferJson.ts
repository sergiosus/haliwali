import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import type {
  CatalogSourceOffer,
  CatalogSourceOfferDraft,
  CatalogSourceOfferDraftStatus,
  CatalogSourceOfferInput,
} from "./catalogSourceOfferTypes";
import {
  normalizeSourceOfferDraftStatus,
  sourceOfferDraftStatusDbValues,
} from "./catalogSourceOfferTypes";
import { buildSourceOfferSearchFields } from "./catalogSourceOfferSearchFields";
import { sanitizeSourceOfferInput } from "./catalogSourceOfferNormalize";
import {
  formatSourceOfferRejectHint,
  inputFromSourceOfferFields,
  isValidPublishedSourceOffer,
  validateSourceOfferInput,
} from "./catalogSourceOfferValidation";
import {
  filterSourceOffersInMemory,
  type CatalogSourceOfferListQuery,
  type CatalogSourceOfferListResult,
} from "./catalogSourceOfferQuery";

const STORE_PATH = ".data/catalog-source-offers.json";

type JsonDraft = CatalogSourceOfferInput & {
  id: number;
  status: CatalogSourceOfferDraftStatus;
  duplicateHint: string | null;
  duplicateOfOfferId: number | null;
  publishedOfferId: number | null;
  titleSearch: string;
  brandSearch: string;
  oemSearch: string;
  companySearch: string;
  citySearch: string;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
};

type JsonOffer = CatalogSourceOfferInput & {
  id: number;
  draftId: number | null;
  haliwaliCompanyId: number | null;
  titleSearch: string;
  brandSearch: string;
  oemSearch: string;
  companySearch: string;
  citySearch: string;
  importedAt: string;
  createdAt: string;
  updatedAt: string;
};

type JsonStore = {
  nextDraftId: number;
  nextOfferId: number;
  drafts: JsonDraft[];
  offers: JsonOffer[];
};

async function readStore(): Promise<JsonStore> {
  assertFileStoreNotUsedInProduction("serverCatalogSourceOfferJson.readStore");
  try {
    const raw = await readFile(path.join(process.cwd(), STORE_PATH), "utf8");
    const parsed = JSON.parse(raw) as JsonStore;
    return {
      nextDraftId: parsed.nextDraftId ?? 1,
      nextOfferId: parsed.nextOfferId ?? 1,
      drafts: parsed.drafts ?? [],
      offers: parsed.offers ?? [],
    };
  } catch {
    return { nextDraftId: 1, nextOfferId: 1, drafts: [], offers: [] };
  }
}

async function writeStore(store: JsonStore): Promise<void> {
  assertFileStoreNotUsedInProduction("serverCatalogSourceOfferJson.writeStore");
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), STORE_PATH), JSON.stringify(store, null, 2), "utf8");
}

function toDraft(d: JsonDraft): CatalogSourceOfferDraft {
  return { ...d, status: normalizeSourceOfferDraftStatus(d.status) };
}

function toOffer(o: JsonOffer): CatalogSourceOffer {
  return {
    id: o.id,
    title: o.title,
    price: o.price,
    city: o.city,
    region: o.region,
    categorySlug: o.categorySlug,
    companyName: o.companyName,
    sellerName: o.sellerName,
    brand: o.brand,
    oemCodes: o.oemCodes,
    articleCodes: o.articleCodes,
    sourceName: o.sourceName,
    sourceUrl: o.sourceUrl,
    shortSnippet: o.shortSnippet,
    imageUrl: o.imageUrl ?? null,
    confidenceScore: o.confidenceScore,
    haliwaliCompanyId: o.haliwaliCompanyId,
    titleSearch: o.titleSearch,
    brandSearch: o.brandSearch,
    oemSearch: o.oemSearch,
    companySearch: o.companySearch,
    citySearch: o.citySearch,
    importedAt: o.importedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function inputWithSearch(input: CatalogSourceOfferInput): CatalogSourceOfferInput & ReturnType<typeof buildSourceOfferSearchFields> {
  return { ...input, ...buildSourceOfferSearchFields(input) };
}

export async function jsonListSourceOfferDrafts(
  status?: CatalogSourceOfferDraftStatus,
): Promise<CatalogSourceOfferDraft[]> {
  const store = await readStore();
  let list = store.drafts.map(toDraft);
  if (status) {
    const allowed = new Set(sourceOfferDraftStatusDbValues(status));
    list = list.filter((d) => allowed.has(d.status));
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function jsonUpsertSourceOfferDrafts(
  items: {
    input: CatalogSourceOfferInput;
    duplicateHint: string | null;
    duplicateOfOfferId: number | null;
    existingDraftId?: number;
  }[],
): Promise<{ drafts: CatalogSourceOfferDraft[]; createdIds: number[]; updatedIds: number[] }> {
  const store = await readStore();
  const now = new Date().toISOString();
  const createdIds: number[] = [];
  const updatedIds: number[] = [];
  const drafts: CatalogSourceOfferDraft[] = [];

  for (const item of items) {
    const clean = sanitizeSourceOfferInput(item.input);
    if (!clean) continue;
    const enriched = inputWithSearch(clean);
    const status: CatalogSourceOfferDraftStatus =
      item.duplicateHint || item.duplicateOfOfferId ? "duplicate" : "draft";
    const existing =
      item.existingDraftId ? store.drafts.find((d) => d.id === item.existingDraftId) : undefined;

    if (existing) {
      Object.assign(existing, {
        ...enriched,
        status,
        duplicateHint: item.duplicateHint,
        duplicateOfOfferId: item.duplicateOfOfferId,
        updatedAt: now,
        importedAt: now,
      });
      updatedIds.push(existing.id);
      drafts.push(toDraft(existing));
    } else {
      const id = store.nextDraftId++;
      const row: JsonDraft = {
        id,
        ...enriched,
        status,
        duplicateHint: item.duplicateHint,
        duplicateOfOfferId: item.duplicateOfOfferId,
        publishedOfferId: null,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      store.drafts.push(row);
      createdIds.push(id);
      drafts.push(toDraft(row));
    }
  }

  await writeStore(store);
  return { drafts, createdIds, updatedIds };
}

export async function jsonSetSourceOfferDraftStatuses(
  ids: number[],
  status: CatalogSourceOfferDraftStatus,
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

function jsonOfferFieldsToInput(
  d: CatalogSourceOfferInput & { rawPayload?: Record<string, unknown> },
): CatalogSourceOfferInput {
  return inputFromSourceOfferFields({
    title: d.title,
    price: d.price,
    city: d.city,
    region: d.region,
    categorySlug: d.categorySlug,
    companyName: d.companyName,
    sellerName: d.sellerName,
    brand: d.brand,
    oemCodes: d.oemCodes,
    articleCodes: d.articleCodes,
    sourceName: d.sourceName,
    sourceUrl: d.sourceUrl,
    shortSnippet: d.shortSnippet,
    imageUrl: d.imageUrl,
    confidenceScore: d.confidenceScore,
    rawPayload: d.rawPayload,
  });
}

export async function jsonCleanupInvalidPublishedSourceOffers(): Promise<number> {
  const store = await readStore();
  const now = new Date().toISOString();
  let removed = 0;
  const keep: JsonOffer[] = [];
  for (const o of store.offers) {
    const check = validateSourceOfferInput(jsonOfferFieldsToInput(o));
    if (!check.ok) {
      removed += 1;
      for (const d of store.drafts) {
        if (d.publishedOfferId === o.id) {
          d.status = "rejected";
          d.duplicateHint = formatSourceOfferRejectHint(check.reason);
          d.publishedOfferId = null;
          d.updatedAt = now;
        }
      }
      continue;
    }
    keep.push(o);
  }
  if (removed > 0) {
    store.offers = keep;
    await writeStore(store);
  }
  return removed;
}

export async function jsonPublishSourceOfferDrafts(ids: number[]): Promise<CatalogSourceOfferDraft[]> {
  const store = await readStore();
  const now = new Date().toISOString();
  const out: CatalogSourceOfferDraft[] = [];

  for (const id of ids) {
    const d = store.drafts.find((x) => x.id === id);
    if (!d || normalizeSourceOfferDraftStatus(d.status) !== "approved") continue;

    const publishCheck = validateSourceOfferInput(jsonOfferFieldsToInput(d));
    if (!publishCheck.ok) {
      d.status = "rejected";
      d.duplicateHint = formatSourceOfferRejectHint(publishCheck.reason);
      d.publishedOfferId = null;
      d.updatedAt = now;
      out.push(toDraft(d));
      continue;
    }

    const existingOffer = store.offers.find(
      (o) => o.sourceUrl.trim().toLowerCase() === d.sourceUrl.trim().toLowerCase(),
    );
    if (existingOffer) {
      d.status = "duplicate";
      d.duplicateOfOfferId = existingOffer.id;
      d.publishedOfferId = existingOffer.id;
      d.updatedAt = now;
      out.push(toDraft(d));
      continue;
    }

    const offerId = store.nextOfferId++;
    const offer: JsonOffer = {
      id: offerId,
      draftId: d.id,
      title: d.title,
      price: d.price,
      city: d.city,
      region: d.region,
      categorySlug: d.categorySlug,
      companyName: d.companyName,
      sellerName: d.sellerName,
      brand: d.brand,
      oemCodes: d.oemCodes,
      articleCodes: d.articleCodes,
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      shortSnippet: d.shortSnippet,
      imageUrl: d.imageUrl ?? null,
      confidenceScore: d.confidenceScore,
      haliwaliCompanyId: null,
      titleSearch: d.titleSearch,
      brandSearch: d.brandSearch,
      oemSearch: d.oemSearch,
      companySearch: d.companySearch,
      citySearch: d.citySearch,
      rawPayload: d.rawPayload,
      importedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    store.offers.push(offer);
    d.status = "published";
    d.publishedOfferId = offerId;
    d.updatedAt = now;
    out.push(toDraft(d));
  }

  await writeStore(store);
  return out;
}

export async function jsonListPublishedSourceOffers(
  opts?: CatalogSourceOfferListQuery,
): Promise<CatalogSourceOfferListResult> {
  await jsonCleanupInvalidPublishedSourceOffers();
  const store = await readStore();
  const offers = store.offers
    .map(toOffer)
    .filter((o) =>
      isValidPublishedSourceOffer(
        inputFromSourceOfferFields({
          title: o.title,
          price: o.price,
          city: o.city,
          region: o.region,
          categorySlug: o.categorySlug,
          companyName: o.companyName,
          sellerName: o.sellerName,
          brand: o.brand,
          oemCodes: o.oemCodes,
          articleCodes: o.articleCodes,
          sourceName: o.sourceName,
          sourceUrl: o.sourceUrl,
          shortSnippet: o.shortSnippet,
          imageUrl: o.imageUrl,
          confidenceScore: o.confidenceScore,
        }),
      ),
    );
  return filterSourceOffersInMemory(offers, opts ?? {});
}

export async function jsonLoadSourceOfferDedupSeed(): Promise<{
  published: {
    id: number;
    sourceUrl: string;
    title: string;
    companyName: string;
    sellerName: string;
    city: string;
    oemCodes: string[];
    articleCodes: string[];
  }[];
  drafts: {
    id: number;
    status: string;
    sourceUrl: string;
    title: string;
    companyName: string;
    sellerName: string;
    city: string;
    oemCodes: string[];
    articleCodes: string[];
    publishedOfferId: number | null;
  }[];
}> {
  const store = await readStore();
  return {
    published: store.offers.map((o) => ({
      id: o.id,
      sourceUrl: o.sourceUrl,
      title: o.title,
      companyName: o.companyName,
      sellerName: o.sellerName,
      city: o.city,
      oemCodes: o.oemCodes,
      articleCodes: o.articleCodes,
    })),
    drafts: store.drafts.map((d) => ({
      id: d.id,
      status: d.status,
      sourceUrl: d.sourceUrl,
      title: d.title,
      companyName: d.companyName,
      sellerName: d.sellerName,
      city: d.city,
      oemCodes: d.oemCodes,
      articleCodes: d.articleCodes,
      publishedOfferId: d.publishedOfferId,
    })),
  };
}

export async function jsonCheckSourceOffersTablesReady(): Promise<boolean> {
  return true;
}

export async function jsonCountPublishedSourceOffers(): Promise<number> {
  const store = await readStore();
  return store.offers.length;
}

export async function jsonCountActionableSourceOfferDrafts(): Promise<number> {
  const store = await readStore();
  return store.drafts.filter((d) => {
    const s = normalizeSourceOfferDraftStatus(d.status);
    return s === "draft" || s === "saved" || s === "approved" || s === "duplicate";
  }).length;
}

export async function jsonDeletePublishedSourceOffers(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const store = await readStore();
  const set = new Set(ids);
  const before = store.offers.length;
  store.offers = store.offers.filter((o) => !set.has(o.id));
  await writeStore(store);
  return before - store.offers.length;
}

const CANDIDATE_DRAFT_STATUSES = new Set(["draft", "new", "saved", "approved"]);

export async function jsonCountSourceOfferDraftQueues(): Promise<{
  candidates: number;
  rejected: number;
  duplicate: number;
}> {
  const store = await readStore();
  let candidates = 0;
  let rejected = 0;
  let duplicate = 0;
  for (const d of store.drafts) {
    const s = normalizeSourceOfferDraftStatus(d.status);
    if (CANDIDATE_DRAFT_STATUSES.has(s)) candidates += 1;
    else if (s === "rejected") rejected += 1;
    else if (s === "duplicate") duplicate += 1;
  }
  return { candidates, rejected, duplicate };
}
