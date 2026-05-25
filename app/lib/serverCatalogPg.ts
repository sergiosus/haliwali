import { getPool } from "./pgPool";
import type {
  CatalogCategory,
  CatalogCompanyAdminItem,
  CatalogCompanyListItem,
  CatalogCompanyProfile,
  CatalogReport,
} from "./catalogTypes";
import { CATALOG_CATEGORY_SEED, type CatalogCompanyImportRow } from "./catalogTypes";
import { slugifyCatalogText } from "./catalogSlug";

function rowRating(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  if (q.length >= 2) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(
      `(co.name ILIKE $${i} OR co.city ILIKE $${i} OR co.description ILIKE $${i} OR co.address ILIKE $${i})`,
    );
  }
  params.push(limit);
  const { rows } = await pool.query<{
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    description: string;
    logo_url: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
    SELECT co.slug, co.name, co.category_slug, cat.title AS category_title,
           co.city, co.description, co.logo_url, co.rating,
           loc.latitude, loc.longitude
    FROM catalog_companies co
    JOIN catalog_categories cat ON cat.slug = co.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = co.id
    WHERE ${where.join(" AND ")}
    ORDER BY co.name ASC
    LIMIT $${params.length}
    `,
    params,
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    city: r.city ?? "",
    description: r.description ?? "",
    logoUrl: r.logo_url,
    rating: rowRating(r.rating),
    latitude: r.latitude,
    longitude: r.longitude,
  }));
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
    address: string;
    description: string;
    logo_url: string | null;
    website: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
    SELECT co.id, co.slug, co.name, co.category_slug, cat.title AS category_title,
           co.city, co.address, co.description, co.logo_url, co.website, co.rating,
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

  const [imgRes, contactRes] = await Promise.all([
    pool.query<{ url: string }>(
      `SELECT url FROM catalog_company_images WHERE company_id = $1 ORDER BY sort_order ASC, id ASC`,
      [r.id],
    ),
    pool.query<{ contact_type: string; value: string }>(
      `SELECT contact_type, value FROM catalog_company_contacts WHERE company_id = $1 ORDER BY sort_order ASC, id ASC`,
      [r.id],
    ),
  ]);

  const images = imgRes.rows.map((x) => x.url).filter(Boolean);
  if (r.logo_url && !images.includes(r.logo_url)) images.unshift(r.logo_url);

  return {
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    city: r.city ?? "",
    address: r.address ?? "",
    description: r.description ?? "",
    logoUrl: r.logo_url,
    website: r.website,
    rating: rowRating(r.rating),
    latitude: r.latitude,
    longitude: r.longitude,
    images,
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

    const ins = await pool.query<{ id: number }>(
      `
      INSERT INTO catalog_companies (slug, name, category_slug, city, address, description, website, is_published)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING id
      `,
      [slug, row.name.trim(), cat, row.city.trim(), row.address.trim(), row.description.trim(), row.website.trim() || null],
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
    description: string;
    logo_url: string | null;
    website: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(`
    SELECT co.id, co.slug, co.name, co.category_slug, cat.title AS category_title,
           co.city, co.description, co.logo_url, co.website, co.rating,
           loc.latitude, loc.longitude
    FROM catalog_companies co
    JOIN catalog_categories cat ON cat.slug = co.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = co.id
    ORDER BY co.updated_at DESC
    LIMIT 500
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    city: r.city ?? "",
    description: r.description ?? "",
    logoUrl: r.logo_url,
    website: r.website,
    rating: rowRating(r.rating),
    latitude: r.latitude,
    longitude: r.longitude,
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
  },
): Promise<CatalogCompanyAdminItem | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    slug: string;
    name: string;
    category_slug: string;
    category_title: string;
    city: string;
    description: string;
    logo_url: string | null;
    website: string | null;
    rating: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `
    WITH updated AS (
      UPDATE catalog_companies
      SET name = $2, city = $3, description = $4, website = NULLIF($5, ''),
          category_slug = $6, logo_url = $7, updated_at = NOW()
      WHERE id = $1
      RETURNING id, slug, name, category_slug, city, description, logo_url, website, rating
    )
    SELECT u.id, u.slug, u.name, u.category_slug, cat.title AS category_title,
           u.city, u.description, u.logo_url, u.website, u.rating,
           loc.latitude, loc.longitude
    FROM updated u
    JOIN catalog_categories cat ON cat.slug = u.category_slug
    LEFT JOIN catalog_company_locations loc ON loc.company_id = u.id
    `,
    [
      id,
      patch.name,
      patch.city,
      patch.description,
      patch.website,
      patch.categorySlug,
      patch.logoUrl,
    ],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    city: r.city ?? "",
    description: r.description ?? "",
    logoUrl: r.logo_url,
    website: r.website,
    rating: rowRating(r.rating),
    latitude: r.latitude,
    longitude: r.longitude,
  };
}
