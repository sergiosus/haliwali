import { getPool } from "./pgPool";
import type {
  CatalogCategory,
  CatalogCompanyAdminItem,
  CatalogCompanyContact,
  CatalogCompanyClaimRequest,
  CatalogCompanyListItem,
  CatalogCompanyProfile,
  CatalogReport,
} from "./catalogTypes";
import { CATALOG_CATEGORY_SEED, type CatalogCompanyImportRow } from "./catalogTypes";
import {
  matchedServiceCity,
  normalizeCatalogCompanyCities,
} from "./catalogCompanyCities";
import { slugifyCatalogText } from "./catalogSlug";

function rowRating(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowServiceCities(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function rowContacts(v: unknown): CatalogCompanyContact[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const item = x as { type?: unknown; value?: unknown };
      const value = String(item.value ?? "").trim();
      if (!value) return null;
      const type = item.type === "phone" || item.type === "email" ? item.type : "other";
      return { type, value };
    })
    .filter((x): x is CatalogCompanyContact => Boolean(x));
}

function rowProfileStatus(v: unknown): "imported" | "verified" {
  return v === "verified" ? "verified" : "imported";
}

function toCompanyListItem(
  r: {
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    service_cities?: unknown;
    description: string;
    logo_url: string | null;
    website?: string | null;
    phone?: string | null;
    profile_status?: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  },
  query = "",
): CatalogCompanyListItem {
  const normalized = normalizeCatalogCompanyCities(r.city ?? "", rowServiceCities(r.service_cities));
  return {
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    city: normalized.primaryCity,
    serviceCities: normalized.serviceCities,
    locationContext: matchedServiceCity(normalized.primaryCity, normalized.serviceCities, query),
    description: r.description ?? "",
    logoUrl: r.logo_url,
    website: r.website ?? null,
    phone: r.phone?.trim() || null,
    profileStatus: rowProfileStatus(r.profile_status),
    rating: rowRating(r.rating),
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

export async function pgListCategories(): Promise<CatalogCategory[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    slug: string;
    title: string;
    subtitle: string;
    icon_key: string;
    sort_order: number;
    company_count: string;
  }>(`
    SELECT c.slug, c.title, c.subtitle, c.icon_key, c.sort_order,
           COUNT(co.id)::text AS company_count
    FROM catalog_categories c
    LEFT JOIN catalog_companies co ON co.category_slug = c.slug AND co.is_published = TRUE
    GROUP BY c.slug, c.title, c.subtitle, c.icon_key, c.sort_order
    ORDER BY c.sort_order ASC, c.title ASC
  `);
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle ?? "",
    iconKey: r.icon_key ?? "",
    sortOrder: r.sort_order ?? 0,
    companyCount: Number(r.company_count) || 0,
  }));
}

export async function pgGetCategory(slug: string): Promise<CatalogCategory | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    slug: string;
    title: string;
    subtitle: string;
    icon_key: string;
    sort_order: number;
    company_count: string;
  }>(
    `
    SELECT c.slug, c.title, c.subtitle, c.icon_key, c.sort_order,
           COUNT(co.id)::text AS company_count
    FROM catalog_categories c
    LEFT JOIN catalog_companies co ON co.category_slug = c.slug AND co.is_published = TRUE
    WHERE c.slug = $1
    GROUP BY c.slug, c.title, c.subtitle, c.icon_key, c.sort_order
    `,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle ?? "",
    iconKey: r.icon_key ?? "",
    sortOrder: r.sort_order ?? 0,
    companyCount: Number(r.company_count) || 0,
  };
}

export async function pgSearchCompanies(opts: {
  categorySlug?: string;
  q?: string;
  city?: string;
  limit?: number;
}): Promise<CatalogCompanyListItem[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const params: unknown[] = [];
  const where: string[] = ["co.is_published = TRUE"];
  if (opts.categorySlug) {
    params.push(opts.categorySlug);
    where.push(`co.category_slug = $${params.length}`);
  }
  const q = (opts.q ?? "").trim();
  const cityQuery = (opts.city ?? "").trim();
  if (q.length >= 2) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(
      `(
        co.name ILIKE $${i}
        OR co.city ILIKE $${i}
        OR co.description ILIKE $${i}
        OR co.address ILIKE $${i}
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(co.service_cities) AS svc(city)
          WHERE svc.city ILIKE $${i}
        )
      )`,
    );
  }
  if (cityQuery.length >= 2) {
    params.push(`%${cityQuery}%`);
    const i = params.length;
    where.push(
      `(
        co.city ILIKE $${i}
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(co.service_cities) AS svc(city)
          WHERE svc.city ILIKE $${i}
        )
      )`,
    );
  }
  params.push(limit);
  const { rows } = await pool.query<{
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    service_cities: unknown;
    description: string;
    logo_url: string | null;
    website: string | null;
    phone: string | null;
    profile_status: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
    SELECT co.slug, co.name, co.category_slug, cat.title AS category_title,
           co.city, co.service_cities, co.description, co.logo_url, co.website, co.profile_status, co.rating,
           loc.latitude, loc.longitude,
           (
             SELECT cc.value
             FROM catalog_company_contacts cc
             WHERE cc.company_id = co.id AND cc.contact_type = 'phone'
             ORDER BY cc.sort_order ASC, cc.id ASC
             LIMIT 1
           ) AS phone
    FROM catalog_companies co
    JOIN catalog_categories cat ON cat.slug = co.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = co.id
    WHERE ${where.join(" AND ")}
    ORDER BY co.name ASC
    LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((r) => toCompanyListItem(r, cityQuery || q));
}

export async function pgGetCompanyBySlug(slug: string): Promise<CatalogCompanyProfile | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    service_cities: unknown;
    address: string;
    description: string;
    logo_url: string | null;
    website: string | null;
    profile_status: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
    SELECT co.id, co.slug, co.name, co.category_slug, cat.title AS category_title,
           co.city, co.service_cities, co.address, co.description, co.logo_url, co.website, co.profile_status, co.rating,
           loc.latitude, loc.longitude
    FROM catalog_companies co
    JOIN catalog_categories cat ON cat.slug = co.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = co.id
    WHERE co.slug = $1 AND co.is_published = TRUE
    `,
    [slug],
  );
  const r = rows[0];
  if (!r) return null;

  const [imgRes, contactRes, sourceRes] = await Promise.all([
    pool.query<{ url: string }>(
      `SELECT url FROM catalog_company_images WHERE company_id = $1 ORDER BY sort_order ASC, id ASC`,
      [r.id],
    ),
    pool.query<{ contact_type: string; value: string }>(
      `SELECT contact_type, value FROM catalog_company_contacts WHERE company_id = $1 ORDER BY sort_order ASC, id ASC`,
      [r.id],
    ),
    pool.query<{ source_url: string }>(
      `
      SELECT source_url
      FROM catalog_company_source_history
      WHERE company_id = $1
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
      `,
      [r.id],
    ),
  ]);

  const images = imgRes.rows.map((x) => x.url).filter(Boolean);
  if (r.logo_url && !images.includes(r.logo_url)) images.unshift(r.logo_url);
  const normalized = normalizeCatalogCompanyCities(r.city ?? "", rowServiceCities(r.service_cities));

  return {
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    city: normalized.primaryCity,
    serviceCities: normalized.serviceCities,
    locationContext: null,
    address: r.address ?? "",
    description: r.description ?? "",
    logoUrl: r.logo_url,
    website: r.website,
    sourceUrl: sourceRes.rows[0]?.source_url?.trim() || null,
    profileStatus: rowProfileStatus(r.profile_status),
    rating: rowRating(r.rating),
    latitude: r.latitude,
    longitude: r.longitude,
    images,
    phone: contactRes.rows.find((c) => c.contact_type === "phone")?.value?.trim() || null,
    contacts: contactRes.rows.map((c) => ({
      type: c.contact_type === "phone" || c.contact_type === "email" ? c.contact_type : "other",
      value: c.value,
    })),
    services: [],
  };
}

export async function pgGetRelatedCompanies(
  categorySlug: string,
  excludeSlug: string,
  limit: number,
): Promise<CatalogCompanyListItem[]> {
  const items = await pgSearchCompanies({ categorySlug, limit: limit + 8 });
  return items.filter((c) => c.slug !== excludeSlug).slice(0, limit);
}

export async function pgEnsureCategoriesSeeded(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    ALTER TABLE catalog_companies
      ADD COLUMN IF NOT EXISTS profile_status TEXT NOT NULL DEFAULT 'imported',
      ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT,
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_company_claim_requests (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES catalog_companies (id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      proof_type TEXT NOT NULL DEFAULT 'manual',
      proof_value TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_company_claim_pending_unique
      ON catalog_company_claim_requests (company_id, user_id)
      WHERE status = 'pending'
  `);
  for (const c of CATALOG_CATEGORY_SEED) {
    await pool.query(
      `
      INSERT INTO catalog_categories (slug, title, subtitle, icon_key, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (slug) DO NOTHING
      `,
      [c.slug, c.title, c.subtitle, c.iconKey, c.sortOrder],
    );
  }
}

export async function pgRequestCatalogCompanyClaim(input: {
  slug: string;
  userId: string;
  proofType: string;
  proofValue: string;
  message: string;
}): Promise<CatalogCompanyClaimRequest | null> {
  const pool = getPool();
  await pgEnsureCategoriesSeeded();
  const company = await pool.query<{ id: number }>(
    `SELECT id FROM catalog_companies WHERE slug = $1 AND is_published = TRUE LIMIT 1`,
    [input.slug],
  );
  const companyId = company.rows[0]?.id;
  if (!companyId) return null;

  const { rows } = await pool.query<{
    id: number;
    company_id: number;
    user_id: string;
    status: "pending" | "approved" | "rejected";
    proof_type: string;
    proof_value: string;
    message: string;
    created_at: Date;
  }>(
    `
    INSERT INTO catalog_company_claim_requests (company_id, user_id, proof_type, proof_value, message)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (company_id, user_id) WHERE status = 'pending'
    DO UPDATE SET proof_type = EXCLUDED.proof_type, proof_value = EXCLUDED.proof_value, message = EXCLUDED.message
    RETURNING id, company_id, user_id, status, proof_type, proof_value, message, created_at
    `,
    [
      companyId,
      input.userId,
      input.proofType.slice(0, 40),
      input.proofValue.slice(0, 300),
      input.message.slice(0, 1000),
    ],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    status: row.status,
    proofType: row.proof_type,
    proofValue: row.proof_value,
    message: row.message,
    createdAt: row.created_at.toISOString(),
  };
}

export async function pgListCatalogCompanyClaimsAdmin(): Promise<CatalogCompanyClaimRequest[]> {
  const pool = getPool();
  await pgEnsureCategoriesSeeded();
  const { rows } = await pool.query<{
    id: number;
    company_id: number;
    company_name: string;
    company_slug: string;
    user_id: string;
    status: "pending" | "approved" | "rejected";
    proof_type: string;
    proof_value: string;
    message: string;
    created_at: Date;
  }>(`
    SELECT r.id, r.company_id, co.name AS company_name, co.slug AS company_slug, r.user_id, r.status,
           r.proof_type, r.proof_value, r.message, r.created_at
    FROM catalog_company_claim_requests r
    JOIN catalog_companies co ON co.id = r.company_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `);
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    companySlug: row.company_slug,
    userId: row.user_id,
    status: row.status,
    proofType: row.proof_type,
    proofValue: row.proof_value,
    message: row.message,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function pgReviewCatalogCompanyClaim(input: {
  claimId: number;
  action: "approve" | "reject";
  reviewedBy: string;
}): Promise<CatalogCompanyClaimRequest | null> {
  const pool = getPool();
  await pgEnsureCategoriesSeeded();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      id: number;
      company_id: number;
      user_id: string;
      status: "pending" | "approved" | "rejected";
      proof_type: string;
      proof_value: string;
      message: string;
      created_at: Date;
    }>(
      `
      UPDATE catalog_company_claim_requests
      SET status = $2, reviewed_at = NOW(), reviewed_by = $3
      WHERE id = $1
      RETURNING id, company_id, user_id, status, proof_type, proof_value, message, created_at
      `,
      [input.claimId, input.action === "approve" ? "approved" : "rejected", input.reviewedBy],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    if (input.action === "approve") {
      await client.query(
        `UPDATE catalog_companies SET profile_status = 'verified', claimed_by_user_id = $2, verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.company_id, row.user_id],
      );
    }
    await client.query("COMMIT");
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      status: row.status,
      proofType: row.proof_type,
      proofValue: row.proof_value,
      message: row.message,
      createdAt: row.created_at.toISOString(),
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function pgImportCompanies(
  rows: CatalogCompanyImportRow[],
): Promise<{ imported: number; skipped: number }> {
  const pool = getPool();
  await pgEnsureCategoriesSeeded();
  let imported = 0;
  let skipped = 0;
  const { rows: slugRows } = await pool.query<{ slug: string }>(`SELECT slug FROM catalog_companies`);
  const used = new Set(slugRows.map((r) => r.slug));

  for (const row of rows) {
    const cat = row.category.trim().toLowerCase();
    const catCheck = await pool.query(`SELECT 1 FROM catalog_categories WHERE slug = $1`, [cat]);
    if (catCheck.rowCount === 0) {
      skipped += 1;
      continue;
    }
    let slug = slugifyCatalogText(row.name) || "company";
    if (used.has(slug)) {
      let i = 2;
      while (used.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    used.add(slug);

    const normalizedCities = normalizeCatalogCompanyCities(row.city.trim());
    const ins = await pool.query<{ id: number }>(
      `
      INSERT INTO catalog_companies (
        slug, name, category_slug, city, service_cities, address, description, website, profile_status, is_published
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'imported', TRUE)
      RETURNING id
      `,
      [
        slug,
        row.name.trim(),
        cat,
        normalizedCities.primaryCity,
        JSON.stringify(normalizedCities.serviceCities),
        row.address.trim(),
        row.description.trim(),
        row.website.trim() || null,
      ],
    );
    const companyId = ins.rows[0]?.id;
    if (!companyId) {
      skipped += 1;
      continue;
    }
    if (row.phone.trim()) {
      await pool.query(
        `INSERT INTO catalog_company_contacts (company_id, contact_type, value) VALUES ($1, 'phone', $2)`,
        [companyId, row.phone.trim()],
      );
    }
    if (row.latitude != null && row.longitude != null) {
      await pool.query(
        `
        INSERT INTO catalog_company_locations (company_id, latitude, longitude)
        VALUES ($1, $2, $3)
        ON CONFLICT (company_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
        `,
        [companyId, row.latitude, row.longitude],
      );
    }
    imported += 1;
  }
  return { imported, skipped };
}

export async function pgListCatalogReports(): Promise<CatalogReport[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    company_id: number | null;
    company_name: string | null;
    reason: string;
    details: string;
    status: string;
    created_at: Date;
  }>(`
    SELECT r.id, r.company_id, co.name AS company_name, r.reason, r.details, r.status, r.created_at
    FROM catalog_reports r
    LEFT JOIN catalog_companies co ON co.id = r.company_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `);
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    reason: r.reason,
    details: r.details ?? "",
    status: r.status,
    createdAt: r.created_at.toISOString(),
  }));
}

/** Remove catalog rows by id only (one category per row; CASCADE child rows). */
export async function pgDeleteCatalogCompaniesByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM catalog_companies WHERE id = ANY($1::int[])`,
    [ids],
  );
  return rowCount ?? 0;
}

export async function pgListAllCompaniesAdmin(): Promise<CatalogCompanyAdminItem[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    service_cities: unknown;
    description: string;
    logo_url: string | null;
    website: string | null;
    profile_status: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
    contacts: unknown;
  }>(`
    SELECT co.id, co.slug, co.name, co.category_slug, cat.title AS category_title,
           co.city, co.service_cities, co.description, co.logo_url, co.website, co.profile_status, co.rating,
           loc.latitude, loc.longitude,
           COALESCE(
             jsonb_agg(jsonb_build_object('type', cc.contact_type, 'value', cc.value) ORDER BY cc.sort_order, cc.id)
               FILTER (WHERE cc.id IS NOT NULL),
             '[]'::jsonb
           ) AS contacts
    FROM catalog_companies co
    JOIN catalog_categories cat ON cat.slug = co.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = co.id
    LEFT JOIN catalog_company_contacts cc ON cc.company_id = co.id
    GROUP BY co.id, cat.title, loc.latitude, loc.longitude
    ORDER BY co.updated_at DESC
    LIMIT 500
  `);
  return rows.map((r) => ({
    ...toCompanyListItem(r),
    id: r.id,
    contacts: rowContacts(r.contacts),
  }));
}

export async function pgUpdateCatalogCompanyAdmin(
  id: number,
  patch: {
    name: string;
    city: string;
    description: string;
    website: string;
    categorySlug: string;
    logoUrl: string | null;
    serviceCities: string[];
  },
): Promise<CatalogCompanyAdminItem | null> {
  const pool = getPool();
  const normalizedCities = normalizeCatalogCompanyCities(patch.city, patch.serviceCities);
  const { rows } = await pool.query<{
    id: number;
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    service_cities: unknown;
    description: string;
    logo_url: string | null;
    website: string | null;
    profile_status: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
    WITH updated AS (
      UPDATE catalog_companies
      SET name = $2, city = $3, description = $4, website = NULLIF($5, ''),
          category_slug = $6, logo_url = $7, service_cities = $8::jsonb, updated_at = NOW()
      WHERE id = $1
      RETURNING id, slug, name, category_slug, city, service_cities, description, logo_url, website, profile_status, rating
    )
    SELECT u.id, u.slug, u.name, u.category_slug, cat.title AS category_title,
           u.city, u.service_cities, u.description, u.logo_url, u.website, u.profile_status, u.rating,
           loc.latitude, loc.longitude
    FROM updated u
    JOIN catalog_categories cat ON cat.slug = u.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = u.id
    `,
    [
      id,
      patch.name,
      normalizedCities.primaryCity,
      patch.description,
      patch.website,
      patch.categorySlug,
      patch.logoUrl,
      JSON.stringify(normalizedCities.serviceCities),
    ],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...toCompanyListItem(r),
    id: r.id,
  };
}
