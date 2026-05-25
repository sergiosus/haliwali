-- Multi-city catalog company coverage.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260526_catalog_company_service_cities.sql

ALTER TABLE catalog_companies
  ADD COLUMN IF NOT EXISTS service_cities JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_catalog_companies_service_cities_gin
  ON catalog_companies USING GIN (service_cities);
