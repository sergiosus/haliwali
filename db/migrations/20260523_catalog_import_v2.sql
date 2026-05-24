-- Catalog import sources + draft v2 fields + company source history.
-- Apply after 20260522: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260523_catalog_import_v2.sql

CREATE TABLE IF NOT EXISTS catalog_import_sources (
  id SERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('website', 'directory', 'vk', 'listing', 'text', 'csv')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_sources_url ON catalog_import_sources (source_url);
CREATE INDEX IF NOT EXISTS idx_catalog_import_sources_created ON catalog_import_sources (created_at DESC);

ALTER TABLE catalog_company_import_drafts
  ADD COLUMN IF NOT EXISTS source_id INT REFERENCES catalog_import_sources (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_score REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS duplicate_of_company_id INT REFERENCES catalog_companies (id) ON DELETE SET NULL;

ALTER TABLE catalog_company_import_drafts DROP CONSTRAINT IF EXISTS catalog_company_import_drafts_status_check;
ALTER TABLE catalog_company_import_drafts ADD CONSTRAINT catalog_company_import_drafts_status_check
  CHECK (status IN ('draft', 'approved', 'rejected', 'published'));

CREATE TABLE IF NOT EXISTS catalog_company_source_history (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES catalog_companies (id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'import',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_company_source_history_company
  ON catalog_company_source_history (company_id);
