-- Catalog company origin labels for public/admin-added/owner-submitted rows.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260526_catalog_company_origin.sql

ALTER TABLE catalog_companies
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'imported_public';

ALTER TABLE catalog_companies
  DROP CONSTRAINT IF EXISTS catalog_companies_origin_check;

ALTER TABLE catalog_companies
  ADD CONSTRAINT catalog_companies_origin_check
  CHECK (origin IN ('imported_by_admin', 'imported_public', 'owner_submitted', 'user_submitted'));

CREATE INDEX IF NOT EXISTS idx_catalog_companies_origin
  ON catalog_companies (origin);

DO $$
BEGIN
  IF to_regclass('catalog_company_import_drafts') IS NOT NULL THEN
    UPDATE catalog_companies co
    SET origin = 'user_submitted'
    FROM catalog_company_import_drafts d
    WHERE d.published_company_slug = co.slug
      AND (
        d.raw_payload->>'origin' = 'user_submitted'
        OR d.raw_payload->>'sourceType' = 'user_submitted'
        OR d.raw_payload->>'submissionStatus' = 'user_submitted'
        OR d.raw_payload->>'submissionType' = 'public_company_form'
      );

    UPDATE catalog_companies co
    SET origin = 'owner_submitted'
    FROM catalog_company_import_drafts d
    WHERE d.published_company_slug = co.slug
      AND (
        d.raw_payload->>'origin' = 'owner_submitted'
        OR d.raw_payload->>'sourceType' = 'owner_submitted'
      );
  END IF;

  IF to_regclass('catalog_company_source_history') IS NOT NULL THEN
    UPDATE catalog_companies co
    SET origin = 'user_submitted'
    WHERE EXISTS (
      SELECT 1
      FROM catalog_company_source_history h
      WHERE h.company_id = co.id
        AND h.source_type = 'user_submitted'
    );

    UPDATE catalog_companies co
    SET origin = 'owner_submitted'
    WHERE EXISTS (
      SELECT 1
      FROM catalog_company_source_history h
      WHERE h.company_id = co.id
        AND h.source_type = 'owner_submitted'
    );
  END IF;
END $$;

