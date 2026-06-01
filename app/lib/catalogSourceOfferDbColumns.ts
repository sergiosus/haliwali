/**
 * Canonical columns for catalog source offers (20260531 + 20260602 type/cover).
 */

export const CATALOG_SOURCE_OFFERS_TABLE = "catalog_source_offers";
export const CATALOG_SOURCE_OFFER_DRAFTS_TABLE = "catalog_source_offer_import_drafts";

/** SELECT list for catalog_source_offer_import_drafts. */
export const SOURCE_OFFER_DRAFT_SELECT_COLS = `
  id, status, offer_type, title, price, city, region, category_slug, company_name, seller_name, brand,
  oem_codes, article_codes, source_name, source_url, short_snippet, cover_image_url, confidence_score,
  duplicate_hint, duplicate_of_offer_id, published_offer_id,
  title_search, brand_search, oem_search, company_search, city_search,
  raw_payload, imported_at, created_at, updated_at
`.trim();

/** SELECT list for catalog_source_offers. */
export const SOURCE_OFFER_PUBLISHED_SELECT_COLS = `
  id, draft_id, offer_type, title, price, city, region, category_slug, company_name, seller_name, brand,
  oem_codes, article_codes, source_name, source_url, short_snippet, cover_image_url, confidence_score,
  haliwali_company_id, title_search, brand_search, oem_search, company_search, city_search,
  imported_at, created_at, updated_at
`.trim();

export {
  resolveCoverImageUrl,
  slimSourceOfferRawPayload,
  rawPayloadForDb,
} from "./catalogSourceOfferCoverImage";
