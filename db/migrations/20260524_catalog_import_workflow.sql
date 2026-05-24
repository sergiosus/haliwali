-- Import workflow: new status model + import sessions.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260524_catalog_import_workflow.sql

UPDATE catalog_company_import_drafts SET status = 'new' WHERE status = 'draft';
UPDATE catalog_company_import_drafts SET status = 'saved' WHERE status = 'approved';

ALTER TABLE catalog_company_import_drafts DROP CONSTRAINT IF EXISTS catalog_company_import_drafts_status_check;
ALTER TABLE catalog_company_import_drafts ADD CONSTRAINT catalog_company_import_drafts_status_check
  CHECK (status IN ('new', 'saved', 'published', 'rejected'));

ALTER TABLE catalog_company_import_drafts ALTER COLUMN status SET DEFAULT 'new';

CREATE TABLE IF NOT EXISTS catalog_import_sessions (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  category_slug TEXT NOT NULL DEFAULT '',
  result_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_sessions_created ON catalog_import_sessions (created_at DESC);
