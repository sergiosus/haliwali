-- Thumbnail URL for published external offers (og:image from source page).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260601_catalog_source_offer_image_url.sql

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS image_url TEXT;
