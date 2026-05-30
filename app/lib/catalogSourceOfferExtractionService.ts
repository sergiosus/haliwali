import { classifySourceUrl } from "./catalogSourceClassifier";
import { extractSourceOfferFromHtml } from "./catalogSourceOfferExtract";
import { findSourceOfferDuplicate } from "./catalogSourceOfferDedup";
import { fetchPublicHtml } from "./catalogHtmlFetch";
import { MAX_URLS_PER_BATCH } from "./catalogImportLimits";
import type { ExtractionDefaults } from "./catalogExtractionTypes";
import type { CatalogSourceOfferUpsertResult } from "./catalogSourceOfferTypes";
import {
  loadSourceOfferDedupSeed,
  upsertSourceOfferDrafts,
} from "./serverCatalogSourceOfferStore";
import { logCatalogImport } from "./catalogCatalogLog";

function isSourceOfferUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    return classifySourceUrl(url) === "listing";
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
