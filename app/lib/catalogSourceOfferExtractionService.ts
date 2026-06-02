import { classifySourceUrl } from "./catalogSourceClassifier";
import { extractSourceOfferFromHtml } from "./catalogSourceOfferExtract";
import { findSourceOfferDuplicate } from "./catalogSourceOfferDedup";
import {
  isGenericOfferTitle,
  isRealOfferListingUrl,
  sanitizeOfferText,
  titleFromListingUrl,
} from "./catalogOfferSearchText";
import { offerListingSourceFromUrl, sanitizeSourceOfferDraftInput } from "./catalogSourceOfferNormalize";
import { fetchPublicHtml } from "./catalogHtmlFetch";
import { MAX_URLS_PER_BATCH } from "./catalogImportLimits";
import type { ExtractionDefaults } from "./catalogExtractionTypes";
import type { CatalogSourceName, CatalogSourceOfferInput, CatalogSourceOfferUpsertResult } from "./catalogSourceOfferTypes";
import {
  loadSourceOfferDedupSeed,
  upsertSourceOfferDrafts,
} from "./serverCatalogSourceOfferStore";
import { logCatalogImport } from "./catalogCatalogLog";
import {
  sourceOfferImportError,
  type SourceOfferImportError,
} from "./catalogSourceOfferImportErrors";
import {
  classifyInvalidSourceUrl,
  validateSourceOfferDraftCandidate,
} from "./catalogSourceOfferValidation";
import { inferOfferTypeFromListing } from "./catalogSourceOfferType";
import { isCatalogMarketplaceSourceName } from "./catalogSourceOfferTypes";
import { mergeOfferPriceFields, offerPriceFromLegacyPrice } from "./catalogOfferPrice";
import type { SourceOfferImportOutcome } from "./catalogSourceOfferImportErrors";

export type SourceOfferSearchSelection = {
  url: string;
  title: string;
  price: string | null;
  priceAmount?: number | null;
  priceText?: string | null;
  city: string;
  companyName?: string;
  sellerName?: string;
  sourceName: CatalogSourceName;
  shortSnippet: string;
  brand?: string | null;
  oemCodes?: string[];
  articleCodes?: string[];
  coverImageUrl?: string | null;
  offerType?: import("./catalogSourceOfferType").CatalogSourceOfferType;
  year?: number | null;
  mileageKm?: number | null;
  parseQuality?: "link_only" | "search_card";
};

function resolveSourceName(url: string, hint: CatalogSourceName): CatalogSourceName | "" {
  const fromUrl = offerListingSourceFromUrl(url);
  if (fromUrl) return fromUrl;
  if (isCatalogMarketplaceSourceName(hint)) return hint;
  return "";
}

function isSearchCardComplete(sel: SourceOfferSearchSelection): boolean {
  if (sel.parseQuality === "search_card") return true;
  const title = sanitizeOfferText(sel.title);
  if (!title || title.length < 5 || !sel.url?.trim()) return false;
  const hasPrice = Boolean(
    (sel.priceAmount != null && sel.priceAmount > 0) ||
    offerPriceFromLegacyPrice(sel.price).priceAmount,
  );
  return Boolean(
    hasPrice ||
    (sel.shortSnippet && sel.shortSnippet.trim().length >= 8) ||
    (sel.coverImageUrl && /^https?:\/\//i.test(sel.coverImageUrl)),
  );
}

function buildInputFromSearchSelection(
  sel: SourceOfferSearchSelection,
  defaults: ExtractionDefaults,
  parseWarnings: string[],
): CatalogSourceOfferInput {
  const listingSource = offerListingSourceFromUrl(sel.url)!;
  const title =
    sanitizeOfferText(sel.title) || titleFromListingUrl(sel.url) || "Объявление";
  const shortSnippet = sanitizeOfferText(sel.shortSnippet || sel.title).slice(0, 280) || title.slice(0, 280);
  const parseQuality = isSearchCardComplete(sel) ? "search_card" : "link_only";
  const priceFields = mergeOfferPriceFields(offerPriceFromLegacyPrice(sel.price), {
    priceAmount: sel.priceAmount ?? null,
    priceText: sel.priceText ?? null,
  });
  return {
    title: title.slice(0, 200),
    price: priceFields.price,
    priceAmount: priceFields.priceAmount,
    priceText: priceFields.priceText,
    city: sanitizeOfferText(sel.city || defaults.city),
    region: defaults.city && defaults.city !== sel.city ? defaults.city : "",
    categorySlug: defaults.categorySlug,
    companyName: sanitizeOfferText(sel.companyName ?? ""),
    sellerName: sanitizeOfferText(sel.sellerName ?? sel.companyName ?? ""),
    brand: sel.brand ? sanitizeOfferText(sel.brand) : null,
    oemCodes: sel.oemCodes ?? [],
    articleCodes: sel.articleCodes ?? [],
    sourceName: listingSource,
    sourceUrl: sel.url.trim(),
    shortSnippet,
    offerType:
      sel.offerType ??
      inferOfferTypeFromListing({
        title,
        sourceUrl: sel.url,
        oemCodes: sel.oemCodes,
        articleCodes: sel.articleCodes,
        brand: sel.brand,
      }),
    coverImageUrl: sel.coverImageUrl ?? null,
    confidenceScore: parseQuality === "search_card" ? 0.42 : 0.35,
    rawPayload: {
      extractor: "search_selection",
      parseQuality,
      parseWarnings,
    },
  };
}

function mergeEnrichedInput(
  base: CatalogSourceOfferInput,
  enriched: CatalogSourceOfferInput,
): CatalogSourceOfferInput {
  const pickTitle = (): string => {
    if (!isGenericOfferTitle(base.title)) return base.title;
    if (enriched.title && !isGenericOfferTitle(enriched.title)) return enriched.title;
    const fromUrl = titleFromListingUrl(base.sourceUrl);
    if (fromUrl && !isGenericOfferTitle(fromUrl)) return fromUrl;
    return base.title;
  };
  return {
    ...base,
    title: pickTitle(),
    price: base.price ?? enriched.price,
    priceAmount: base.priceAmount ?? enriched.priceAmount,
    priceText: base.priceText ?? enriched.priceText,
    city: base.city || enriched.city,
    companyName: base.companyName || enriched.companyName,
    sellerName: base.sellerName || enriched.sellerName,
    brand: base.brand ?? enriched.brand,
    oemCodes: base.oemCodes.length ? base.oemCodes : enriched.oemCodes,
    articleCodes: base.articleCodes.length ? base.articleCodes : enriched.articleCodes,
    shortSnippet:
      base.shortSnippet.length > 40 ? base.shortSnippet : enriched.shortSnippet || base.shortSnippet,
    coverImageUrl: base.coverImageUrl ?? enriched.coverImageUrl,
    confidenceScore: Math.max(base.confidenceScore ?? 0.35, enriched.confidenceScore ?? 0.5),
    rawPayload: {
      ...base.rawPayload,
      enrichedFromPage: true,
      parseWarnings: base.rawPayload?.parseWarnings,
    },
  };
}

function duplicateImportError(
  url: string,
  sourceName: CatalogSourceName | "",
  dup: NonNullable<ReturnType<typeof findSourceOfferDuplicate>>,
  seed: Awaited<ReturnType<typeof loadSourceOfferDedupSeed>>,
): SourceOfferImportError {
  if (dup.duplicateOfOfferId) {
    const published = seed.published.find((p) => p.id === dup.duplicateOfOfferId);
    if (published) {
      return sourceOfferImportError(url, sourceName, "DUPLICATE_PUBLISHED");
    }
  }
  if (dup.existingDraftId) {
    return sourceOfferImportError(url, sourceName, "DUPLICATE_DRAFT");
  }
  if (dup.duplicateOfOfferId) {
    return sourceOfferImportError(url, sourceName, "DUPLICATE_PUBLISHED");
  }
  return sourceOfferImportError(url, sourceName, "DUPLICATE_DRAFT", dup.hint);
}

/** Create drafts from admin marketplace search selections (SERP metadata + optional page enrich). */
export async function processSourceOfferSearchSelections(
  selections: SourceOfferSearchSelection[],
  defaults: ExtractionDefaults,
): Promise<{
  drafts: CatalogSourceOfferUpsertResult["drafts"];
  errors: SourceOfferImportError[];
  outcomes: SourceOfferImportOutcome[];
  upsert: CatalogSourceOfferUpsertResult;
}> {
  const limited = selections.slice(0, MAX_URLS_PER_BATCH);
  const seed = await loadSourceOfferDedupSeed();
  const errors: SourceOfferImportError[] = [];
  const outcomes: SourceOfferImportOutcome[] = [];
  const items: Parameters<typeof upsertSourceOfferDrafts>[0] = [];

  logCatalogImport("source_offer_search_selections", { count: limited.length });

  for (const sel of limited) {
    const rawUrl = sel.url?.trim() ?? "";
    const sourceNameHint = resolveSourceName(rawUrl, sel.sourceName);

    const pushRejected = (err: SourceOfferImportError) => {
      errors.push(err);
      outcomes.push({
        url: err.url,
        status: "rejected",
        sourceName: err.sourceName,
        message: err.message,
      });
    };

    if (!rawUrl) {
      pushRejected(sourceOfferImportError(rawUrl, "", "MISSING_URL"));
      continue;
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      pushRejected(sourceOfferImportError(rawUrl, sourceNameHint, "INVALID_URL"));
      continue;
    }

    if (!sourceNameHint) {
      pushRejected(sourceOfferImportError(rawUrl, "", "UNSUPPORTED_SOURCE"));
      continue;
    }

    const searchCard = isSearchCardComplete(sel);
    if (!searchCard) {
      const urlReason = classifyInvalidSourceUrl(rawUrl);
      if (urlReason) {
        pushRejected(sourceOfferImportError(rawUrl, sourceNameHint, urlReason));
        continue;
      }
    }

    const parseWarnings: string[] = [];
    const searchTitle = sanitizeOfferText(sel.title) || titleFromListingUrl(rawUrl);
    let input = buildInputFromSearchSelection(
      { ...sel, url: rawUrl, sourceName: sourceNameHint, title: searchTitle || sel.title },
      defaults,
      parseWarnings,
    );

    if (sel.coverImageUrl && /^https?:\/\//i.test(sel.coverImageUrl)) {
      input = { ...input, coverImageUrl: sel.coverImageUrl.trim().slice(0, 500) };
    }

    if (searchCard) {
      input = {
        ...input,
        rawPayload: {
          ...input.rawPayload,
          parseQuality: "search_card",
          year: sel.year ?? undefined,
          mileageKm: sel.mileageKm ?? undefined,
        },
      };
    } else {
      try {
        const fetched = await fetchPublicHtml(rawUrl);
        const enriched = extractSourceOfferFromHtml(fetched, defaults);
        if (enriched) {
          const enrichedDraft = sanitizeSourceOfferDraftInput({
            ...enriched,
            sourceName: sourceNameHint,
            sourceUrl: rawUrl,
          });
          if (enrichedDraft) {
            input = mergeEnrichedInput(input, enrichedDraft);
          } else {
            parseWarnings.push("full_page_parse_failed");
          }
        } else {
          parseWarnings.push("full_page_parse_failed");
        }
      } catch {
        parseWarnings.push("full_page_parse_failed");
      }
    }

    if (!input.shortSnippet?.trim() || input.shortSnippet.length < 8) {
      input = {
        ...input,
        shortSnippet: sanitizeOfferText(sel.shortSnippet || sel.title || input.title).slice(0, 280),
      };
    }

    if (isGenericOfferTitle(input.title)) {
      const fallback =
        (searchTitle && !isGenericOfferTitle(searchTitle) ? searchTitle : "") ||
        titleFromListingUrl(rawUrl);
      if (fallback) input = { ...input, title: fallback.slice(0, 200) };
    }

    input = {
      ...input,
      rawPayload: {
        ...input.rawPayload,
        parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
        parseWarning: parseWarnings.includes("full_page_parse_failed") ?
          "full_page_parse_failed"
        : undefined,
      },
    };

    const preCheck = validateSourceOfferDraftCandidate(input);
    if (!preCheck.ok) {
      const code =
        preCheck.reason === "missing_required_fields" ? "MISSING_TITLE" : preCheck.reason;
      pushRejected(sourceOfferImportError(rawUrl, sourceNameHint, code));
      continue;
    }
    input = preCheck.input;

    const dup = findSourceOfferDuplicate(seed, input, input.rawPayload);
    if (dup) {
      const dupErr = duplicateImportError(rawUrl, sourceNameHint, dup, seed);
      errors.push(dupErr);
      outcomes.push({
        url: rawUrl,
        status: "duplicate",
        sourceName: sourceNameHint,
        message: dupErr.message,
      });
      continue;
    }

    const sanitized = sanitizeSourceOfferDraftInput(input);
    if (!sanitized) {
      pushRejected(sourceOfferImportError(rawUrl, sourceNameHint, "SANITIZE_FAILED"));
      continue;
    }

    if (!sanitized.categorySlug) sanitized.categorySlug = defaults.categorySlug;
    if (!sanitized.city && defaults.city) sanitized.city = defaults.city;

    const parseWarning =
      parseWarnings.includes("full_page_parse_failed") ? "full_page_parse_failed" : undefined;

    items.push({
      input: sanitized,
      duplicateHint: null,
      duplicateOfOfferId: null,
    });
    outcomes.push({
      url: rawUrl,
      status: "created",
      sourceName: sourceNameHint,
      message: parseWarning ? "Кандидат создан (данные с карточки поиска)" : "Кандидат создан",
      parseWarning,
    });
  }

  const upsert = await upsertSourceOfferDrafts(items);
  for (const draft of upsert.drafts) {
    const o = outcomes.find((x) => x.status === "created" && x.url === draft.sourceUrl);
    if (o) o.draftId = draft.id;
  }
  return { drafts: upsert.drafts, errors, outcomes, upsert };
}

function isSourceOfferUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    if (classifySourceUrl(url) !== "listing") return false;
    const src = offerListingSourceFromUrl(url.toString());
    if (!src) return true;
    return isRealOfferListingUrl(url.toString(), src);
  } catch {
    return false;
  }
}

export function partitionImportUrls(urls: string[]): { companyUrls: string[]; sourceOfferUrls: string[] } {
  const companyUrls: string[] = [];
  const sourceOfferUrls: string[] = [];
  for (const url of urls) {
    if (isSourceOfferUrl(url)) sourceOfferUrls.push(url);
    else companyUrls.push(url);
  }
  return { companyUrls, sourceOfferUrls };
}

export async function processSourceOfferUrlBatch(
  urls: string[],
  defaults: ExtractionDefaults,
): Promise<{
  drafts: CatalogSourceOfferUpsertResult["drafts"];
  errors: { url: string; error: string }[];
  upsert: CatalogSourceOfferUpsertResult;
}> {
  const limited = urls.slice(0, MAX_URLS_PER_BATCH);
  const seed = await loadSourceOfferDedupSeed();
  const errors: { url: string; error: string }[] = [];
  const items: Parameters<typeof upsertSourceOfferDrafts>[0] = [];

  logCatalogImport("source_offer_batch_start", { urlCount: limited.length });

  for (const rawUrl of limited) {
    if (!/^https?:\/\//i.test(rawUrl)) {
      errors.push({ url: rawUrl, error: "INVALID_URL" });
      continue;
    }
    try {
      const fetched = await fetchPublicHtml(rawUrl);
      const input = extractSourceOfferFromHtml(fetched, defaults);
      if (!input) {
        errors.push({ url: rawUrl, error: "NO_OFFER_EXTRACTED" });
        continue;
      }
      if (!input.categorySlug) input.categorySlug = defaults.categorySlug;
      if (!input.city) input.city = defaults.city;
      const dup = findSourceOfferDuplicate(seed, input, input.rawPayload);
      items.push({
        input,
        duplicateHint: dup?.hint ?? null,
        duplicateOfOfferId: dup?.duplicateOfOfferId ?? null,
        existingDraftId: dup?.existingDraftId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PARSE_FAILED";
      errors.push({ url: rawUrl, error: msg });
    }
  }

  const upsert = await upsertSourceOfferDrafts(items);
  return { drafts: upsert.drafts, errors, upsert };
}

/** Parse offer fields from URLs without writing to DB (admin search preview). */
export async function previewSourceOffersFromUrls(
  urls: string[],
  defaults: ExtractionDefaults,
): Promise<{
  previews: Array<{ url: string; input: NonNullable<Awaited<ReturnType<typeof extractSourceOfferFromHtml>>> }>;
  errors: { url: string; error: string }[];
}> {
  const previews: Array<{ url: string; input: NonNullable<Awaited<ReturnType<typeof extractSourceOfferFromHtml>>> }> = [];
  const errors: { url: string; error: string }[] = [];

  for (const rawUrl of urls) {
    if (!/^https?:\/\//i.test(rawUrl)) {
      errors.push({ url: rawUrl, error: "INVALID_URL" });
      continue;
    }
    try {
      const fetched = await fetchPublicHtml(rawUrl);
      const input = extractSourceOfferFromHtml(fetched, defaults);
      if (!input) {
        errors.push({ url: rawUrl, error: "NO_OFFER_EXTRACTED" });
        continue;
      }
      if (!input.categorySlug) input.categorySlug = defaults.categorySlug;
      if (!input.city && defaults.city) input.city = defaults.city;
      previews.push({ url: rawUrl, input });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PARSE_FAILED";
      errors.push({ url: rawUrl, error: msg });
    }
  }

  return { previews, errors };
}
