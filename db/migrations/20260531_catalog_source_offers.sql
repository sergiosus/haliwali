-- External source offers index (Avito/Drom/VK/company sites) — separate from user listings and company catalog.

CREATE TABLE IF NOT EXISTS catalog_source_offers (
  id SERIAL PRIMARY KEY,
  draft_id INT,
  title TEXT NOT NULL DEFAULT '',
  price TEXT,
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  brand TEXT,
  oem_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  article_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_name TEXT NOT NULL DEFAULT 'other',
  source_url TEXT NOT NULL,
  short_snippet TEXT NOT NULL DEFAULT '',
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  haliwali_company_id INT,
  title_search TEXT NOT NULL DEFAULT '',
  brand_search TEXT NOT NULL DEFAULT '',
  oem_search TEXT NOT NULL DEFAULT '',
  company_search TEXT NOT NULL DEFAULT '',
  city_search TEXT NOT NULL DEFAULT '',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_source_offer_import_drafts (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'saved', 'approved', 'rejected', 'published', 'duplicate')
  ),
  title TEXT NOT NULL DEFAULT '',
  price TEXT,
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  brand TEXT,
  oem_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  article_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_name TEXT NOT NULL DEFAULT 'other',
  source_url TEXT NOT NULL DEFAULT '',
  short_snippet TEXT NOT NULL DEFAULT '',
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  duplicate_hint TEXT,
  duplicate_of_offer_id INT REFERENCES catalog_source_offers (id) ON DELETE SET NULL,
  published_offer_id INT REFERENCES catalog_source_offers (id) ON DELETE SET NULL,
  title_search TEXT NOT NULL DEFAULT '',
  brand_search TEXT NOT NULL DEFAULT '',
  oem_search TEXT NOT NULL DEFAULT '',
  company_search TEXT NOT NULL DEFAULT '',
  city_search TEXT NOT NULL DEFAULT '',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_source_offers_source_url
  ON catalog_source_offers (lower(trim(source_url)))
  WHERE trim(source_url) <> '';

CREATE INDEX IF NOT EXISTS idx_catalog_source_offer_drafts_status
  ON catalog_source_offer_import_drafts (status);
CREATE INDEX IF NOT EXISTS idx_catalog_source_offer_drafts_source_url
  ON catalog_source_offer_import_drafts (lower(trim(source_url)));
CREATE INDEX IF NOT EXISTS idx_catalog_source_offers_category
  ON catalog_source_offers (category_slug);
