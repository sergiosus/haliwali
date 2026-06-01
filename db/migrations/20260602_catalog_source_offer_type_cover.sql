-- Soft offer type + single cover image for external offer index.

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS offer_type TEXT NOT NULL DEFAULT 'other';

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS offer_type TEXT NOT NULL DEFAULT 'other';

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_source_offers_offer_type
  ON catalog_source_offers (offer_type);

CREATE INDEX IF NOT EXISTS idx_catalog_source_offer_drafts_offer_type
  ON catalog_source_offer_import_drafts (offer_type);
