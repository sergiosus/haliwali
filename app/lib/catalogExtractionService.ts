import { logCatalogImport, logCatalogParse } from "./catalogCatalogLog";
import { computeImportConfidence, confidenceToStored } from "./catalogConfidence";
import { parseCatalogImportCsv } from "./catalogCsvImport";
import { csvRowToDraftInput } from "./catalogImportEnrich";
import type { CatalogImportDraft, CatalogImportDraftInput } from "./catalogImportTypes";
import { parseCatalogPastedText } from "./catalogTextParser";
import { extractDirectoryFromHtml } from "./catalogExtractDirectory";
import { extractListingFromHtml } from "./catalogExtractListing";
import type { CatalogSourceType, ExtractedCompanyDraft, ExtractionDefaults } from "./catalogExtractionTypes";
import { extractVkFromHtml, extractVkFromPastedText } from "./catalogExtractVk";
import { extractWebsiteFromHtml } from "./catalogExtractWebsite";
import { fetchPublicHtml } from "./catalogHtmlFetch";
import { buildDedupIndex, findDuplicate, registerInDedupIndex } from "./catalogImportDedup";
import { classifySourceUrl } from "./catalogSourceClassifier";
import { buildDraftWarnings } from "./catalogImportEnrich";
import {
  createImportSource,
  failImportSource,
  loadDedupSeedData,
  parsedImportSource,
  saveExtractedDrafts,
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

async function extractFromFetched(
  sourceType: CatalogSourceType,
  fetched: Awaited<ReturnType<typeof fetchPublicHtml>>,
  defaults: ExtractionDefaults,
): Promise<ExtractedCompanyDraft[]> {
  if (sourceType === "vk") return extractVkFromHtml(fetched, defaults);
  if (sourceType === "listing") return extractListingFromHtml(fetched, defaults);
  const directory = extractDirectoryFromHtml(fetched, defaults);
  if (directory.length >= 2) return directory;
  return extractWebsiteFromHtml(fetched, defaults);
}

export async function extractFromUrl(
  rawUrl: string,
  defaults: ExtractionDefaults,
): Promise<{ sourceId: number; drafts: ExtractedCompanyDraft[] }> {
  const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  const sourceType = classifySourceUrl(url);
  const source = await createImportSource(url.toString(), sourceType);

  try {
    logCatalogParse("extract_start", { host: url.hostname, sourceType });
    const fetched = await fetchPublicHtml(url.toString());
    let extracted = await extractFromFetched(sourceType, fetched, defaults);
    if (extracted.length === 0) {
      extracted = extractWebsiteFromHtml(fetched, defaults);
    }
    for (const d of extracted) {
      if (!d.sourceUrl) d.sourceUrl = url.toString();
      const score100 = computeImportConfidence({
        name: d.name,
        phone: d.phone,
        address: d.address,
        website: d.website,
        description: d.description,
        imageUrl: d.imageUrl,
        city: d.city,
        targetCity: defaults.city,
      });
      d.confidenceScore = confidenceToStored(score100);
    }
    logCatalogParse("extract_done", { host: url.hostname, drafts: extracted.length });
    await parsedImportSource(source.id);
    return { sourceId: source.id, drafts: extracted };
  } catch (e) {
    const msg = mapExtractionError(e);
    await failImportSource(source.id, msg);
    throw new Error(msg);
  }
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
): Promise<{ drafts: CatalogImportDraft[]; errors: { url: string; error: string }[] }> {
  const limited = urls.slice(0, MAX_URLS_PER_BATCH);
  const seed = await loadDedupSeedData();
  const dedupIndex = buildDedupIndex(seed.published, seed.drafts);
  const allDrafts: CatalogImportDraft[] = [];
  const errors: { url: string; error: string }[] = [];

  logCatalogImport("url_batch_start", { count: limited.length });

  for (const raw of limited) {
    try {
      const { sourceId, drafts: extracted } = await extractFromUrl(raw, defaults);
      const saved = await persistExtractedBatch(extracted, sourceId, dedupIndex, defaults);
      allDrafts.push(...saved);
    } catch (e) {
      errors.push({ url: raw, error: e instanceof Error ? e.message : "PARSE_FAILED" });
    }
  }

  return { drafts: allDrafts, errors };
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
    return {
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
      sourceUrl: input.sourceUrl ?? "csv://upload",
      socialLinks: [],
      confidenceScore: 0.55,
      rawPayload: { extractor: "csv" },
    };
  });
  await parsedImportSource(source.id);
  const seed = await loadDedupSeedData();
  const dedupIndex = buildDedupIndex(seed.published, seed.drafts);
  return persistExtractedBatch(extracted, source.id, dedupIndex, defaults);
}

async function persistExtractedBatch(
  extracted: ExtractedCompanyDraft[],
  sourceId: number,
  dedupIndex: ReturnType<typeof buildDedupIndex>,
  defaults: ExtractionDefaults,
): Promise<CatalogImportDraft[]> {
  const items: {
    input: CatalogImportDraftInput;
    duplicateHint: string | null;
    duplicateOfCompanyId: number | null;
    needsReview: boolean;
    sourceId: number;
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
      needsReview: warnings.length > 0 || Boolean(dup),
      sourceId,
    });
    registerInDedupIndex(dedupIndex, e, -1);
  }

  return saveExtractedDrafts(items);
}
