-- Optional category-specific listing attributes (JSON object).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260520_listing_attributes.sql

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
