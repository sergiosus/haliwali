-- OPTIONAL: thumbnail column (not in 20260531 base migration).
-- App stores imageUrl in raw_payload until this is applied.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260601_catalog_source_offer_image_url.sql

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS image_url TEXT;
