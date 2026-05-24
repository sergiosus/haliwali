-- Catalog company import drafts (admin review before publish).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260522_catalog_import_drafts.sql

CREATE TABLE IF NOT EXISTS catalog_company_import_drafts (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  name TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  image_url TEXT,
  source_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  duplicate_hint TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT TRUE,
  published_company_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_drafts_status ON catalog_company_import_drafts (status);
CREATE INDEX IF NOT EXISTS idx_catalog_import_drafts_category ON catalog_company_import_drafts (category_slug);
CREATE INDEX IF NOT EXISTS idx_catalog_import_drafts_created ON catalog_company_import_drafts (created_at DESC);
