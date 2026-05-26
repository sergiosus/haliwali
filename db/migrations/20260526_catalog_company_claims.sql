-- Catalog company ownership and legal-safe interaction status.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260526_catalog_company_claims.sql

ALTER TABLE catalog_companies
  ADD COLUMN IF NOT EXISTS profile_status TEXT NOT NULL DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE catalog_companies
  DROP CONSTRAINT IF EXISTS catalog_companies_profile_status_check;

ALTER TABLE catalog_companies
  ADD CONSTRAINT catalog_companies_profile_status_check
  CHECK (profile_status IN ('imported', 'verified'));

CREATE INDEX IF NOT EXISTS idx_catalog_companies_profile_status
  ON catalog_companies (profile_status);

CREATE TABLE IF NOT EXISTS catalog_company_claim_requests (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES catalog_companies (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  full_name TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  company_website TEXT NOT NULL DEFAULT '',
  proof_method TEXT NOT NULL DEFAULT 'other',
  proof_text TEXT NOT NULL DEFAULT '',
  proof_file_url TEXT NOT NULL DEFAULT '',
  proof_type TEXT NOT NULL DEFAULT 'manual',
  proof_value TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

ALTER TABLE catalog_company_claim_requests
  DROP CONSTRAINT IF EXISTS catalog_company_claim_requests_status_check;

ALTER TABLE catalog_company_claim_requests
  ADD CONSTRAINT catalog_company_claim_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_company_claim_pending_unique
  ON catalog_company_claim_requests (company_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_catalog_company_claim_company
  ON catalog_company_claim_requests (company_id, status);
