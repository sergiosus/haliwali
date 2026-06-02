-- Source offer columns: type, cover, price (safe to re-run).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260602_source_offer_price_fields.sql

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS offer_type TEXT DEFAULT 'other';

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS price_amount INTEGER;

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS price_text TEXT;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS offer_type TEXT DEFAULT 'other';

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS price_amount INTEGER;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS price_text TEXT;

-- brand exists on base 20260531 schema; ensure nullable TEXT if table predates it
ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS brand TEXT;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS brand TEXT;

UPDATE catalog_source_offer_import_drafts
SET offer_type = 'other'
WHERE offer_type IS NULL;

UPDATE catalog_source_offers
SET offer_type = 'other'
WHERE offer_type IS NULL;

UPDATE catalog_source_offer_import_drafts
SET
  price_amount = NULLIF(regexp_replace(COALESCE(price, ''), '[^0-9]', '', 'g'), '')::integer,
  price_text = CASE
    WHEN price IS NOT NULL AND trim(price) <> '' THEN
      trim(to_char(NULLIF(regexp_replace(price, '[^0-9]', '', 'g'), '')::bigint, 'FM999 999 999 999')) || ' ₽'
    ELSE NULL
  END
WHERE price_amount IS NULL AND price IS NOT NULL AND trim(price) <> '';

UPDATE catalog_source_offers
SET
  price_amount = NULLIF(regexp_replace(COALESCE(price, ''), '[^0-9]', '', 'g'), '')::integer,
  price_text = CASE
    WHEN price IS NOT NULL AND trim(price) <> '' THEN
      trim(to_char(NULLIF(regexp_replace(price, '[^0-9]', '', 'g'), '')::bigint, 'FM999 999 999 999')) || ' ₽'
    ELSE NULL
  END
WHERE price_amount IS NULL AND price IS NOT NULL AND trim(price) <> '';

CREATE INDEX IF NOT EXISTS idx_catalog_source_offers_offer_type
  ON catalog_source_offers (offer_type);

CREATE INDEX IF NOT EXISTS idx_catalog_source_offer_drafts_offer_type
  ON catalog_source_offer_import_drafts (offer_type);
