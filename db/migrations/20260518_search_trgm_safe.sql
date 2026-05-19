-- Idempotent pg_trgm indexes (skips missing columns). Safe on partial schemas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'title'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listings_title_trgm_idx ON listings USING gin (lower(title) gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'description'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listings_description_trgm_idx ON listings USING gin (lower(description) gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category_name'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listings_category_name_trgm_idx ON listings USING gin (lower(category_name) gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category_slug'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listings_category_slug_trgm_idx ON listings USING gin (lower(category_slug) gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'city'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listings_city_trgm_idx ON listings USING gin (lower(city) gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'specialization'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS listings_specialization_trgm_idx ON listings USING gin (lower(COALESCE(specialization, '''')) gin_trgm_ops)';
  END IF;
END $$;
