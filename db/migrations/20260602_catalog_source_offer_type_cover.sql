-- Soft offer type + cover image for external source offers (safe to re-run).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260602_catalog_source_offer_type_cover.sql

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS offer_type TEXT DEFAULT 'other';

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS offer_type TEXT DEFAULT 'other';

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Backfill nulls on existing rows (if column existed without default).
UPDATE catalog_source_offer_import_drafts
SET offer_type = 'other'
WHERE offer_type IS NULL;

UPDATE catalog_source_offers
SET offer_type = 'other'
WHERE offer_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_source_offers_offer_type
  ON catalog_source_offers (offer_type);

CREATE INDEX IF NOT EXISTS idx_catalog_source_offer_drafts_offer_type
  ON catalog_source_offer_import_drafts (offer_type);
