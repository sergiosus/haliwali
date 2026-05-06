-- Location reference data: subjects + settlements

CREATE TABLE IF NOT EXISTS location_subjects (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  federal_district TEXT NOT NULL,
  lat DOUBLE PRECISION NULL,
  lng DOUBLE PRECISION NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_settlements (
  id BIGSERIAL PRIMARY KEY,
  subject_slug TEXT NOT NULL REFERENCES location_subjects(slug) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  lat DOUBLE PRECISION NULL,
  lng DOUBLE PRECISION NULL,
  settlement_type TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_slug, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_location_subjects_federal_district ON location_subjects(federal_district);
CREATE INDEX IF NOT EXISTS idx_location_settlements_subject_slug ON location_settlements(subject_slug);
CREATE INDEX IF NOT EXISTS idx_location_settlements_normalized_name ON location_settlements(normalized_name);
CREATE INDEX IF NOT EXISTS idx_location_settlements_subject_slug_normalized_name ON location_settlements(subject_slug, normalized_name);
CREATE INDEX IF NOT EXISTS idx_location_settlements_name_lower ON location_settlements((lower(name)));

-- Optional trigram acceleration (if enabled).
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_location_settlements_name_trgm ON location_settlements USING gin (name gin_trgm_ops);

