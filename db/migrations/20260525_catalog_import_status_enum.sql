-- Canonical import draft statuses: draft | saved | approved | rejected | published
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260525_catalog_import_status_enum.sql

UPDATE catalog_company_import_drafts SET status = 'draft' WHERE status IN ('new', 'draft');
UPDATE catalog_company_import_drafts SET status = 'saved' WHERE status = 'saved';
UPDATE catalog_company_import_drafts SET status = 'approved' WHERE status = 'approved';
UPDATE catalog_company_import_drafts SET status = 'rejected' WHERE status = 'rejected';
UPDATE catalog_company_import_drafts SET status = 'published' WHERE status = 'published';

ALTER TABLE catalog_company_import_drafts DROP CONSTRAINT IF EXISTS catalog_company_import_drafts_status_check;
ALTER TABLE catalog_company_import_drafts ADD CONSTRAINT catalog_company_import_drafts_status_check
  CHECK (status IN ('draft', 'saved', 'approved', 'rejected', 'published'));

ALTER TABLE catalog_company_import_drafts ALTER COLUMN status SET DEFAULT 'draft';
