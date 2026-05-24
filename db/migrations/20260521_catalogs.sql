-- B2B company catalogs (separate from listings).
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/20260521_catalogs.sql

CREATE TABLE IF NOT EXISTS catalog_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  icon_key TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_companies (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_slug TEXT NOT NULL REFERENCES catalog_categories (slug) ON UPDATE CASCADE,
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  website TEXT,
  rating NUMERIC(3, 2),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_companies_category ON catalog_companies (category_slug);
CREATE INDEX IF NOT EXISTS idx_catalog_companies_city ON catalog_companies (city);
CREATE INDEX IF NOT EXISTS idx_catalog_companies_published ON catalog_companies (is_published);

CREATE TABLE IF NOT EXISTS catalog_company_images (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES catalog_companies (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog_company_contacts (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES catalog_companies (id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog_company_locations (
  company_id INT PRIMARY KEY REFERENCES catalog_companies (id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS catalog_reports (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES catalog_companies (id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  reporter_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO catalog_categories (slug, title, subtitle, icon_key, sort_order)
VALUES
  ('auto', 'Авто', 'Сервисы, запчасти, автоуслуги', 'auto', 10),
  ('stroitelstvo', 'Строительство', 'Подрядчики и материалы', 'build', 20),
  ('remont', 'Ремонт', 'Ремонт и отделка', 'repair', 30),
  ('perevozki', 'Перевозки', 'Грузоперевозки и логистика', 'truck', 40),
  ('tekhnika', 'Техника', 'Оборудование и сервис', 'gear', 50),
  ('magaziny', 'Магазины', 'Розница и опт', 'shop', 60),
  ('drugie', 'Другие', 'Прочие компании', 'other', 70)
ON CONFLICT (slug) DO NOTHING;
