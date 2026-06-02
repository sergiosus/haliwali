-- Price amount + display text for source offers (safe to re-run).

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS price_amount INTEGER;

ALTER TABLE catalog_source_offer_import_drafts
  ADD COLUMN IF NOT EXISTS price_text TEXT;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS price_amount INTEGER;

ALTER TABLE catalog_source_offers
  ADD COLUMN IF NOT EXISTS price_text TEXT;

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
