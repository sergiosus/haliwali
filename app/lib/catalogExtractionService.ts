import { logCatalogImport, logCatalogParse } from "./catalogCatalogLog";
import { computeImportConfidence, confidenceToStored } from "./catalogConfidence";
import { parseCatalogImportCsv } from "./catalogCsvImport";
import { csvRowToDraftInput } from "./catalogImportEnrich";
import type { CatalogImportDraft, CatalogImportDraftInput } from "./catalogImportTypes";
import { parseCatalogPastedText } from "./catalogTextParser";
import type { CatalogSourceType, ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
import { extractVkFromHtml, extractVkFromPastedText } from "./catalogExtractVk";
import { extractWebsiteFromHtml } from "./catalogExtractWebsite";
import { extractListingFromHtml } from "./catalogExtractListing";
import { fetchPublicHtml } from "./catalogHtmlFetch";
import { buildDedupIndex, findDuplicate, registerInDedupIndex } from "./catalogImportDedup";
import {
  domainSiteUrl,
  findContactUrlInList,
  normalizeImportDomain,
  pickBestUrlForDomain,
} from "./catalogImportDomain";
import { mergeDraftInputs, mergeExtractedCompanyDrafts } from "./catalogImportMerge";
import { classifySourceUrl } from "./catalogSourceClassifier";
import { isLikelyBadCompanyName } from "./catalogCompanyNameExtract";
import { buildDraftWarnings } from "./catalogImportEnrich";
import type { CatalogImportUpsertResult } from "./catalogImportTypes";
import {
  createImportSource,
  failImportSource,
  loadDedupSeedData,
  parsedImportSource,
  upsertExtractedDraftsWithMeta,
} from "./serverCatalogImportPipeline";

export const MAX_URLS_PER_BATCH = 20;

export function parseUrlList(text: string): string[] {
  return text
    .split(/[\r\n,;]+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l))
    .slice(0, MAX_URLS_PER_BATCH);
}

function extractedToInput(
  e: ExtractedCompanyDraft,
  sourceType: CatalogSourceType,
): CatalogImportDraftInput {
  return {
    name: e.name,
    categorySlug: e.categorySlug,
    city: e.city,
    address: e.address,
    phone: e.phone,
    email: e.email,
    website: e.website,
    description: e.description,
    latitude: e.latitude,
    longitude: e.longitude,
    imageUrl: e.imageUrl,
    sourceUrl: e.sourceUrl,
    socialLinks: e.socialLinks,
    confidenceScore: e.confidenceScore,
    rawPayload: { ...e.rawPayload, sourceType },
  };
}

/** One company per page — never multi-card / category parsing. */
async function extractFromFetched(
  sourceType: CatalogSourceType,
  fetched: Awaited<ReturnType<typeof fetchPublicHtml>>,
  defaults: ExtractionDefaults,
): Promise<ExtractedCompanyDraft[]> {
  if (sourceType === "vk") return extractVkFromHtml(fetched, defaults);
  if (sourceType === "listing") return extractListingFromHtml(fetched, defaults);
  return extractWebsiteFromHtml(fetched, defaults);
}

function groupUrlsByDomain(urls: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const raw of urls) {
    try {
      const domain = normalizeImportDomain(raw);
      if (!domain) continue;
      const list = map.get(domain) ?? [];
      list.push(raw);
      map.set(domain, list);
    } catch {
      /* skip invalid */
    }
  }
  return map;
}

function attachDomainMeta(draft: ExtractedCompanyDraft, domain: string): void {
  draft.rawPayload.rootDomain = domain;
  draft.website = domainSiteUrl(domain);
}

async function extractCompanyForDomain(
  domainUrls: string[],
  defaults: ExtractionDefaults,
): Promise<{ sourceId: number; draft: ExtractedCompanyDraft | null; error?: string }> {
  const primaryUrl = pickBestUrlForDomain(domainUrls);
  if (!primaryUrl) return { sourceId: 0, draft: null, error: "URL_REQUIRED" };

  const domain = normalizeImportDomain(primaryUrl);
  const url = new URL(primaryUrl.startsWith("http") ? primaryUrl : `https://${primaryUrl}`);
  const sourceType = classifySourceUrl(url);

  if (sourceType === "vk" || sourceType === "listing") {
    const { sourceId, drafts } = await extractFromUrl(primaryUrl, defaults);
    const d = drafts[0];
    if (d) attachDomainMeta(d, domain);
    return { sourceId, draft: d ?? null };
  }

  const source = await createImportSource(domainSiteUrl(domain), sourceType);
  try {
    logCatalogParse("extract_domain_start", { domain, primaryUrl });
    const fetched = await fetchPublicHtml(primaryUrl);
    let extracted = await extractFromFetched(sourceType, fetched, defaults);
    if (extracted.length === 0) extracted = extractWebsiteFromHtml(fetched, defaults);
    let draft = extracted[0] ?? null;
    if (!draft) {
      await parsedImportSource(source.id);
      return { sourceId: source.id, draft: null };
    }
    attachDomainMeta(draft, domain);

    const contactUrl = findContactUrlInList(domainUrls);
    if (contactUrl && contactUrl !== primaryUrl) {
      try {
        const contactFetched = await fetchPublicHtml(contactUrl);
        const contactDrafts = await extractFromFetched(sourceType, contactFetched, defaults);
        const contactDraft = contactDrafts[0];
        if (contactDraft) {
          attachDomainMeta(contactDraft, domain);
          draft = mergeExtractedCompanyDrafts(draft, contactDraft);
        }
      } catch {
        /* contact page optional */
      }
    }

    const score100 = computeImportConfidence({
      name: draft.name,
      phone: draft.phone,
      address: draft.address,
      website: draft.website,
      description: draft.description,
      imageUrl: draft.imageUrl,
      city: draft.city,
      targetCity: defaults.city,
    });
    draft.confidenceScore = confidenceToStored(score100);

    logCatalogParse("extract_domain_done", { domain, name: draft.name.slice(0, 40) });
    await parsedImportSource(source.id);
    return { sourceId: source.id, draft };
  } catch (e) {
    const msg = mapExtractionError(e);
    await failImportSource(source.id, msg);
    return { sourceId: source.id, draft: null, error: msg };
  }
}

export async function extractFromUrl(
  rawUrl: string,
  defaults: ExtractionDefaults,
): Promise<{ sourceId: number; drafts: ExtractedCompanyDraft[] }> {
  const domain = normalizeImportDomain(rawUrl);
  const { sourceId, draft, error } = await extractCompanyForDomain([rawUrl], defaults);
  if (error) throw new Error(error);
  return { sourceId, drafts: draft ? [draft] : [] };
}

function mapExtractionError(e: unknown): string {
  const code = e instanceof Error ? e.message : "PARSE_FAILED";
  if (code === "AUTH_REQUIRED") return "Источник недоступен без авторизации";
  if (code === "BLOCKED_PLATFORM") return "Платформа не поддерживается для автоматического извлечения";
  if (code === "RESPONSE_TOO_LARGE") return "Страница слишком большая";
  if (code === "FETCH_FAILED") return "Не удалось загрузить страницу";
  return code;
}

export async function processUrlBatch(
  urls: string[],
  defaults: ExtractionDefaults,
): Promise<{
  drafts: CatalogImportDraft[];
  errors: { url: string; error: string }[];
  upsert: CatalogImportUpsertResult;
}> {
  const limited = urls.slice(0, MAX_URLS_PER_BATCH);
  const seed = await loadDedupSeedData();
  const dedupIndex = buildDedupIndex(seed.published, seed.drafts);
  const allDrafts: CatalogImportDraft[] = [];
  const errors: { url: string; error: string }[] = [];
  const byDomain = groupUrlsByDomain(limited);
  const agg: CatalogImportUpsertResult = {
    drafts: [],
    createdIds: [],
    updatedIds: [],
    sourcesCreated: 0,
  };

  logCatalogImport("url_batch_start", { urlCount: limited.length, domainCount: byDomain.size });

  for (const [, domainUrls] of byDomain) {
    const { sourceId, draft, error } = await extractCompanyForDomain(domainUrls, defaults);
    if (error || !draft) {
      errors.push({ url: domainUrls[0] ?? "", error: error ?? "NO_COMPANY_EXTRACTED" });
      continue;
    }
    const batch = await persistExtractedBatchWithMeta([draft], sourceId, dedupIndex, defaults);
    allDrafts.push(...batch.drafts);
    agg.drafts.push(...batch.drafts);
    agg.createdIds.push(...batch.createdIds);
    agg.updatedIds.push(...batch.updatedIds);
    agg.sourcesCreated += batch.sourcesCreated;
  }

  return { drafts: allDrafts, errors, upsert: agg };
}

export async function processTextInput(
  text: string,
  defaults: ExtractionDefaults,
  opts?: { vkPaste?: boolean; sourceUrl?: string },
): Promise<CatalogImportDraft[]> {
  const sourceType: CatalogSourceType = opts?.vkPaste || /vk\.com/i.test(text) ? "vk" : "text";
  const sourceUrl = opts?.sourceUrl ?? (text.match(/https?:\/\/[^\s]+/)?.[0] ?? "");
  const source = await createImportSource(sourceUrl || "text://paste", sourceType);

  let extracted: ExtractedCompanyDraft[];
  if (sourceType === "vk") {
    extracted = extractVkFromPastedText(text, defaults, sourceUrl || null);
  } else {
    const input = parseCatalogPastedText(text, { ...defaults, sourceUrl: sourceUrl || null });
    extracted = [
      {
        name: input.name,
        categorySlug: input.categorySlug,
        city: input.city,
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
        imageUrl: input.imageUrl,
        sourceUrl: input.sourceUrl ?? sourceUrl,
        socialLinks: [],
        confidenceScore: 0.4,
        rawPayload: { extractor: "text" },
      },
    ];
  }

  await parsedImportSource(source.id);
  const seed = await loadDedupSeedData();
  const dedupIndex = buildDedupIndex(seed.published, seed.drafts);
  return persistExtractedBatch(extracted, source.id, dedupIndex, defaults);
}

export async function processCsvInput(
  csvText: string,
  defaults: ExtractionDefaults,
): Promise<CatalogImportDraft[]> {
  const source = await createImportSource("csv://upload", "csv");
  const rows = parseCatalogImportCsv(csvText);
  const extracted: ExtractedCompanyDraft[] = rows.map((row) => {
    const input = csvRowToDraftInput(row, defaults);
    const domain = normalizeImportDomain(input.website || input.sourceUrl || "");
    return {
      name: input.name,
      categorySlug: input.categorySlug,
      city: input.city,
      address: input.address,
      phone: input.phone,
      email: input.email,
      website: domain ? domainSiteUrl(domain) : input.website,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      imageUrl: input.imageUrl,
      sourceUrl: input.sourceUrl ?? "csv://upload",
      socialLinks: [],
      confidenceScore: 0.55,
      rawPayload: { extractor: "csv", rootDomain: domain || undefined },
    };
  });
  await parsedImportSource(source.id);
  const seed = await loadDedupSeedData();
  const dedupIndex = buildDedupIndex(seed.published, seed.drafts);
  return persistExtractedBatch(extracted, source.id, dedupIndex, defaults);
}

async function persistExtractedBatchWithMeta(
  extracted: ExtractedCompanyDraft[],
  sourceId: number,
  dedupIndex: ReturnType<typeof buildDedupIndex>,
  defaults: ExtractionDefaults,
): Promise<CatalogImportUpsertResult> {
  const items: {
    input: CatalogImportDraftInput;
    duplicateHint: string | null;
    duplicateOfCompanyId: number | null;
    needsReview: boolean;
    sourceId: number;
    existingDraftId?: number;
  }[] = [];

  for (const e of extracted) {
    if (!e.categorySlug) e.categorySlug = defaults.categorySlug;
    if (!e.city) e.city = defaults.city;
    const dup = findDuplicate(dedupIndex, e);
    const input = extractedToInput(e, "website");
    const warnings = buildDraftWarnings(input);
    items.push({
      input,
      duplicateHint: dup?.hint ?? null,
      duplicateOfCompanyId: dup?.duplicateOfCompanyId ?? null,
      needsReview:
        warnings.length > 0 ||
        Boolean(dup?.duplicateOfCompanyId) ||
        isLikelyBadCompanyName(input.name) ||
        Boolean((e.rawPayload as { nameSanitized?: boolean })?.nameSanitized),
      sourceId,
      existingDraftId: dup?.existingDraftId,
    });
  }

  const result = await upsertExtractedDraftsWithMeta(items);
  for (let i = 0; i < result.drafts.length; i++) {
    const ex = extracted[i];
    if (ex) registerInDedupIndex(dedupIndex, ex, result.drafts[i]!.id);
  }
  return result;
}

async function persistExtractedBatch(
  extracted: ExtractedCompanyDraft[],
  sourceId: number,
  dedupIndex: ReturnType<typeof buildDedupIndex>,
  defaults: ExtractionDefaults,
): Promise<CatalogImportDraft[]> {
  return (await persistExtractedBatchWithMeta(extracted, sourceId, dedupIndex, defaults)).drafts;
}
