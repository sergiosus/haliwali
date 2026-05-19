-- Global marketplace search (pg_trgm). Safe to run multiple times; no-op on file-backed dev without Postgres.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS listings_title_trgm_idx
  ON listings USING gin (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_description_trgm_idx
  ON listings USING gin (lower(description) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_category_name_trgm_idx
  ON listings USING gin (lower(category_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_category_slug_trgm_idx
  ON listings USING gin (lower(category_slug) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_city_trgm_idx
  ON listings USING gin (lower(city) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS listings_specialization_trgm_idx
  ON listings USING gin (lower(COALESCE(specialization, '')) gin_trgm_ops);
