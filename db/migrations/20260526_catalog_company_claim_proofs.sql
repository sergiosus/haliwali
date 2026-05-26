-- Proof fields for catalog company ownership claims.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260526_catalog_company_claim_proofs.sql

ALTER TABLE catalog_company_claim_requests
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_website TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS proof_method TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS proof_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS proof_file_url TEXT NOT NULL DEFAULT '';

ALTER TABLE catalog_company_claim_requests
  DROP CONSTRAINT IF EXISTS catalog_company_claim_requests_proof_method_check;

ALTER TABLE catalog_company_claim_requests
  ADD CONSTRAINT catalog_company_claim_requests_proof_method_check
  CHECK (proof_method IN ('domain_email', 'official_phone', 'document_screenshot', 'other'));

