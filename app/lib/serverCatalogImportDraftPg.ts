import { getPool } from "./pgPool";
import type { CatalogImportDraft, CatalogImportDraftInput, CatalogImportDraftStatus } from "./catalogImportTypes";
import type { CatalogImportSource, CatalogSocialLink, CatalogSourceType } from "./catalogExtractionTypes";
import { buildDraftWarnings } from "./catalogImportEnrich";
import { slugifyCatalogText } from "./catalogSlug";
import { pgEnsureCategoriesSeeded } from "./serverCatalogPg";

type DraftRow = {
  id: number;
  status: string;
  source_id: number | null;
  name: string;
  category_slug: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  source_url: string | null;
  social_links: CatalogSocialLink[] | null;
  confidence_score: number | null;
  raw_payload: Record<string, unknown>;
  duplicate_hint: string | null;
  duplicate_of_company_id: number | null;
  needs_review: boolean;
  published_company_slug: string | null;
  created_at: Date;
  updated_at: Date;
  src_type?: string | null;
  src_url?: string | null;
};

const DRAFT_SELECT = `
  SELECT d.*, s.source_type AS src_type, s.source_url AS src_url
  FROM catalog_company_import_drafts d
  LEFT JOIN catalog_import_sources s ON s.id = d.source_id
`;

function rowToDraft(r: DraftRow): CatalogImportDraft {
  const socialLinks = Array.isArray(r.social_links) ? r.social_links : [];
  const input: CatalogImportDraftInput = {
    name: r.name ?? "",
    categorySlug: r.category_slug ?? "",
    city: r.city ?? "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    website: r.website ?? "",
    description: r.description ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    imageUrl: r.image_url,
    sourceUrl: r.source_url,
    socialLinks,
    confidenceScore: r.confidence_score ?? 0.5,
    rawPayload: r.raw_payload ?? {},
  };
  const warnings = buildDraftWarnings(input);
  return {
    id: r.id,
    status: r.status as CatalogImportDraftStatus,
    ...input,
    sourceId: r.source_id,
    sourceType: (r.src_type as CatalogSourceType | null) ?? null,
    sourceUrlDisplay: r.src_url ?? r.source_url,
    socialLinks,
    confidenceScore: r.confidence_score ?? 0.5,
    duplicateHint: r.duplicate_hint,
    duplicateOfCompanyId: r.duplicate_of_company_id,
    needsReview: r.needs_review || warnings.length > 0,
    warnings,
    publishedCompanySlug: r.published_company_slug,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function pgCreateImportSource(
  sourceUrl: string,
  sourceType: CatalogSourceType,
): Promise<CatalogImportSource> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    source_url: string;
    source_type: string;
    status: string;
    error_message: string | null;
    created_at: Date;
  }>(
    `INSERT INTO catalog_import_sources (source_url, source_type, status) VALUES ($1, $2, 'pending') RETURNING *`,
    [sourceUrl, sourceType],
  );
  const r = rows[0]!;
  return {
    id: r.id,
    sourceUrl: r.source_url,
    sourceType: r.source_type as CatalogSourceType,
    status: r.status as CatalogImportSource["status"],
    errorMessage: r.error_message,
    createdAt: r.created_at.toISOString(),
  };
}

export async function pgUpdateImportSourceStatus(
  id: number,
  status: CatalogImportSource["status"],
  errorMessage: string | null,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE catalog_import_sources SET status = $2, error_message = $3 WHERE id = $1`,
    [id, status, errorMessage],
  );
}

export async function pgLoadDedupSeedData(): Promise<{
  published: { id: number; name: string; city: string; phone: string; website: string; address: string }[];
  drafts: { id: number; name: string; city: string; phone: string; website: string; address: string }[];
}> {
  const pool = getPool();
  const { rows: published } = await pool.query<{
    id: number;
    name: string;
    city: string;
    website: string | null;
    phone: string | null;
    address: string;
  }>(`
    SELECT co.id, co.name, co.city, co.website, co.address,
           (SELECT value FROM catalog_company_contacts cc
            WHERE cc.company_id = co.id AND cc.contact_type = 'phone' LIMIT 1) AS phone
    FROM catalog_companies co WHERE co.is_published = TRUE
  `);
  const { rows: drafts } = await pool.query<{
    id: number;
    name: string;
    city: string;
    phone: string;
    website: string;
    address: string;
  }>(`
    SELECT id, name, city, phone, website, address FROM catalog_company_import_drafts
    WHERE status NOT IN ('rejected', 'published') AND published_company_slug IS NULL
  `);
  return {
    published: published.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      phone: r.phone ?? "",
      website: r.website ?? "",
      address: r.address ?? "",
    })),
    drafts: drafts.map((r) => ({ ...r, address: r.address ?? "" })),
  };
}

export async function pgListImportDrafts(opts?: {
  status?: CatalogImportDraftStatus;
}): Promise<CatalogImportDraft[]> {
  const pool = getPool();
  const params: unknown[] = [];
  let where = "";
  if (opts?.status) {
    params.push(opts.status);
    where = `WHERE d.status = $${params.length}`;
  }
  const { rows } = await pool.query<DraftRow>(
    `${DRAFT_SELECT} ${where} ORDER BY d.created_at DESC LIMIT 500`,
    params,
  );
  return rows.map(rowToDraft);
}

export async function pgInsertImportDraftsV2(
  items: {
    input: CatalogImportDraftInput;
    duplicateHint: string | null;
    duplicateOfCompanyId: number | null;
    needsReview: boolean;
    sourceId: number;
  }[],
): Promise<CatalogImportDraft[]> {
  if (items.length === 0) return [];
  const pool = getPool();
  const out: CatalogImportDraft[] = [];
  for (const item of items) {
    const w = buildDraftWarnings(item.input);
    const needsReview = item.needsReview || w.length > 0 || Boolean(item.duplicateHint);
    const { rows } = await pool.query<DraftRow>(
      `
      INSERT INTO catalog_company_import_drafts (
        status, source_id, name, category_slug, city, address, phone, email, website, description,
        latitude, longitude, image_url, source_url, social_links, confidence_score,
        raw_payload, duplicate_hint, duplicate_of_company_id, needs_review
      ) VALUES (
        'draft', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16::jsonb, $17, $18, $19
      )
      RETURNING *
      `,
      [
        item.sourceId > 0 ? item.sourceId : null,
        item.input.name,
        item.input.categorySlug,
        item.input.city,
        item.input.address,
        item.input.phone,
        item.input.email,
        item.input.website,
        item.input.description,
        item.input.latitude,
        item.input.longitude,
        item.input.imageUrl,
        item.input.sourceUrl,
        JSON.stringify(item.input.socialLinks ?? []),
        item.input.confidenceScore ?? 0.5,
        item.input.rawPayload ?? {},
        item.duplicateHint,
        item.duplicateOfCompanyId,
        needsReview,
      ],
    );
    const row = rows[0];
    if (row) {
      const full = await pool.query<DraftRow>(`${DRAFT_SELECT} WHERE d.id = $1`, [row.id]);
      if (full.rows[0]) out.push(rowToDraft(full.rows[0]));
    }
  }
  return out;
}

/** @deprecated */
export async function pgInsertImportDrafts(
  items: { input: CatalogImportDraftInput; duplicateHint: string | null; needsReview: boolean }[],
): Promise<CatalogImportDraft[]> {
  return pgInsertImportDraftsV2(
    items.map((item) => ({
      ...item,
      duplicateOfCompanyId: null,
      sourceId: 0,
    })),
  );
}

export async function pgUpdateImportDraft(
  id: number,
  patch: Partial<CatalogImportDraftInput> & { status?: CatalogImportDraftStatus },
): Promise<CatalogImportDraft | null> {
  const pool = getPool();
  const cur = await pool.query<DraftRow>(`${DRAFT_SELECT} WHERE d.id = $1`, [id]);
  const row = cur.rows[0];
  if (!row) return null;

  const merged: CatalogImportDraftInput = {
    name: patch.name ?? row.name,
    categorySlug: patch.categorySlug ?? row.category_slug,
    city: patch.city ?? row.city,
    address: patch.address ?? row.address,
    phone: patch.phone ?? row.phone,
    email: patch.email ?? row.email,
    website: patch.website ?? row.website,
    description: patch.description ?? row.description,
    latitude: patch.latitude !== undefined ? patch.latitude : row.latitude,
    longitude: patch.longitude !== undefined ? patch.longitude : row.longitude,
    imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : row.image_url,
    sourceUrl: patch.sourceUrl !== undefined ? patch.sourceUrl : row.source_url,
    socialLinks: patch.socialLinks ?? (row.social_links ?? []),
    confidenceScore: patch.confidenceScore ?? row.confidence_score ?? 0.5,
    rawPayload: (patch.rawPayload ?? row.raw_payload) as Record<string, unknown>,
  };
  const warnings = buildDraftWarnings(merged);
  const needsReview = warnings.length > 0 || Boolean(row.duplicate_hint);
  const status = patch.status ?? (row.status as CatalogImportDraftStatus);

  await pool.query(
    `
    UPDATE catalog_company_import_drafts SET
      status = $2, name = $3, category_slug = $4, city = $5, address = $6,
      phone = $7, email = $8, website = $9, description = $10,
      latitude = $11, longitude = $12, image_url = $13, source_url = $14,
      social_links = $15::jsonb, confidence_score = $16,
      raw_payload = $17::jsonb, needs_review = $18, updated_at = NOW()
    WHERE id = $1
    `,
    [
      id,
      status,
      merged.name,
      merged.categorySlug,
      merged.city,
      merged.address,
      merged.phone,
      merged.email,
      merged.website,
      merged.description,
      merged.latitude,
      merged.longitude,
      merged.imageUrl,
      merged.sourceUrl,
      JSON.stringify(merged.socialLinks ?? []),
      merged.confidenceScore ?? 0.5,
      merged.rawPayload ?? {},
      needsReview,
    ],
  );
  const { rows } = await pool.query<DraftRow>(`${DRAFT_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] ? rowToDraft(rows[0]) : null;
}

export async function pgSetImportDraftStatuses(
  ids: number[],
  status: CatalogImportDraftStatus,
): Promise<number> {
  if (ids.length === 0) return 0;
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE catalog_company_import_drafts SET status = $1, updated_at = NOW() WHERE id = ANY($2::int[])`,
    [status, ids],
  );
  return rowCount ?? 0;
}

async function pgWriteCompanyFromDraft(
  d: DraftRow,
  companyId?: number,
): Promise<{ companyId: number; slug: string } | null> {
  const pool = getPool();
  const cat = d.category_slug.trim().toLowerCase();
  if (!d.name.trim()) return null;

  let slug: string;
  let cid = companyId;

  if (cid) {
    const ex = await pool.query<{ slug: string }>(`SELECT slug FROM catalog_companies WHERE id = $1`, [cid]);
    slug = ex.rows[0]?.slug ?? slugifyCatalogText(d.name);
    await pool.query(
      `
      UPDATE catalog_companies SET
        name = $2, category_slug = $3, city = $4, address = $5, description = $6,
        logo_url = COALESCE($7, logo_url), website = COALESCE($8, website), updated_at = NOW()
      WHERE id = $1
      `,
      [cid, d.name.trim(), cat, d.city.trim(), d.address.trim(), d.description.trim(), d.image_url, d.website.trim() || null],
    );
  } else {
    const { rows: slugRows } = await pool.query<{ slug: string }>(`SELECT slug FROM catalog_companies`);
    const used = new Set(slugRows.map((r) => r.slug));
    slug = slugifyCatalogText(d.name) || "company";
    if (used.has(slug)) {
      let i = 2;
      while (used.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    const ins = await pool.query<{ id: number }>(
      `
      INSERT INTO catalog_companies (
        slug, name, category_slug, city, address, description, logo_url, website, is_published
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING id
      `,
      [slug, d.name.trim(), cat, d.city.trim(), d.address.trim(), d.description.trim(), d.image_url, d.website.trim() || null],
    );
    cid = ins.rows[0]?.id;
    if (!cid) return null;
  }

  await pool.query(`DELETE FROM catalog_company_contacts WHERE company_id = $1`, [cid]);
  if (d.phone.trim()) {
    await pool.query(
      `INSERT INTO catalog_company_contacts (company_id, contact_type, value) VALUES ($1, 'phone', $2)`,
      [cid, d.phone.trim()],
    );
  }
  if (d.email.trim()) {
    await pool.query(
      `INSERT INTO catalog_company_contacts (company_id, contact_type, value) VALUES ($1, 'email', $2)`,
      [cid, d.email.trim()],
    );
  }
  const social = Array.isArray(d.social_links) ? d.social_links : [];
  for (const link of social.slice(0, 5)) {
    if (link?.url) {
      await pool.query(
        `INSERT INTO catalog_company_contacts (company_id, contact_type, value) VALUES ($1, 'other', $2)`,
        [cid, link.url.slice(0, 300)],
      );
    }
  }
  if (d.latitude != null && d.longitude != null) {
    await pool.query(
      `
      INSERT INTO catalog_company_locations (company_id, latitude, longitude)
      VALUES ($1, $2, $3)
      ON CONFLICT (company_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
      `,
      [cid, d.latitude, d.longitude],
    );
  }
  if (d.image_url?.trim()) {
    await pool.query(`DELETE FROM catalog_company_images WHERE company_id = $1`, [cid]);
    await pool.query(
      `INSERT INTO catalog_company_images (company_id, url, sort_order) VALUES ($1, $2, 0)`,
      [cid, d.image_url.trim()],
    );
  }

  const srcType = (d.raw_payload?.sourceType as string) ?? "import";
  if (d.source_url?.trim()) {
    await pool.query(
      `INSERT INTO catalog_company_source_history (company_id, source_url, source_type) VALUES ($1, $2, $3)`,
      [cid, d.source_url.trim(), srcType],
    );
  }

  return { companyId: cid, slug };
}

export async function pgPublishImportDrafts(ids: number[]): Promise<{
  published: number;
  skipped: number;
  slugs: string[];
}> {
  if (ids.length === 0) return { published: 0, skipped: 0, slugs: [] };
  const pool = getPool();
  await pgEnsureCategoriesSeeded();

  const { rows: drafts } = await pool.query<DraftRow>(
    `SELECT * FROM catalog_company_import_drafts WHERE id = ANY($1::int[])`,
    [ids],
  );

  let published = 0;
  let skipped = 0;
  const slugs: string[] = [];

  for (const d of drafts) {
    if (d.status === "rejected" || d.published_company_slug || d.status === "published") {
      skipped += 1;
      continue;
    }
    if (d.status !== "approved") {
      skipped += 1;
      continue;
    }
    const catCheck = await pool.query(`SELECT 1 FROM catalog_categories WHERE slug = $1`, [
      d.category_slug.trim().toLowerCase(),
    ]);
    if (catCheck.rowCount === 0) {
      skipped += 1;
      continue;
    }

    const result = await pgWriteCompanyFromDraft(d);
    if (!result) {
      skipped += 1;
      continue;
    }

    await pool.query(
      `
      UPDATE catalog_company_import_drafts
      SET status = 'published', published_company_slug = $2, updated_at = NOW()
      WHERE id = $1
      `,
      [d.id, result.slug],
    );

    published += 1;
    slugs.push(result.slug);
  }

  return { published, skipped, slugs };
}

export async function pgMergeDraftIntoCompany(
  draftId: number,
  companyId: number,
): Promise<CatalogImportDraft | null> {
  const pool = getPool();
  const cur = await pool.query<DraftRow>(`SELECT * FROM catalog_company_import_drafts WHERE id = $1`, [draftId]);
  const d = cur.rows[0];
  if (!d) return null;

  const merged = await pgWriteCompanyFromDraft(d, companyId);
  if (!merged) return null;

  await pool.query(
    `
    UPDATE catalog_company_import_drafts
    SET status = 'published', published_company_slug = $2, duplicate_of_company_id = $3, updated_at = NOW()
    WHERE id = $1
    `,
    [draftId, merged.slug, companyId],
  );

  const { rows } = await pool.query<DraftRow>(`${DRAFT_SELECT} WHERE d.id = $1`, [draftId]);
  return rows[0] ? rowToDraft(rows[0]) : null;
}
