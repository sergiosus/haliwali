/**
 * Canonical columns from db/migrations/20260531_catalog_source_offers.sql
 * (image_url is NOT in base migration — optional via 20260601_catalog_source_offer_image_url.sql)
 */

export const CATALOG_SOURCE_OFFERS_TABLE = "catalog_source_offers";
export const CATALOG_SOURCE_OFFER_DRAFTS_TABLE = "catalog_source_offer_import_drafts";

/** SELECT list for catalog_source_offer_import_drafts (matches 20260531 migration). */
export const SOURCE_OFFER_DRAFT_SELECT_COLS = `
  id, status, title, price, city, region, category_slug, company_name, seller_name, brand,
  oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
  duplicate_hint, duplicate_of_offer_id, published_offer_id,
  title_search, brand_search, oem_search, company_search, city_search,
  raw_payload, imported_at, created_at, updated_at
`.trim();

/** SELECT list for catalog_source_offers (matches 20260531 migration). */
export const SOURCE_OFFER_PUBLISHED_SELECT_COLS = `
  id, draft_id, title, price, city, region, category_slug, company_name, seller_name, brand,
  oem_codes, article_codes, source_name, source_url, short_snippet, confidence_score,
  haliwali_company_id, title_search, brand_search, oem_search, company_search, city_search,
  imported_at, created_at, updated_at
`.trim();

export function imageUrlFromRawPayload(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw.imageUrl ?? raw.image_url;
  if (typeof u !== "string") return null;
  const t = u.trim();
  return /^https?:\/\//i.test(t) ? t.slice(0, 500) : null;
}

export function rawPayloadForDb(
  raw: Record<string, unknown> | undefined,
  imageUrl: string | null | undefined,
): Record<string, unknown> {
  const base = { ...(raw ?? {}) };
  if (imageUrl && /^https?:\/\//i.test(imageUrl.trim())) {
    base.imageUrl = imageUrl.trim().slice(0, 500);
  }
  return base;
}
