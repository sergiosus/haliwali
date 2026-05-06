import { canonicalRussiaRegionLabel } from "@/app/lib/russiaRegionCanonical";
import { SUBJECTS_BY_DISTRICT } from "@/app/lib/russiaFederalDistricts";
import { slugify } from "@/app/lib/slugify";
import {
  isValidDetectedSettlement,
  looksLikeDistrictAdministrativeLabel,
  looksLikeRuralAutoSettlement,
} from "@/app/lib/russiaPlaceLabelHeuristics";
import { buildSearchVariants } from "@/app/lib/utils/keyboardLayout";
import { getPool, usesPostgres } from "@/app/lib/pgPool";

function isAllowedSettlementName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (!isValidDetectedSettlement(t)) return false;
  if (looksLikeDistrictAdministrativeLabel(t)) return false;
  if (looksLikeRuralAutoSettlement(t)) return false;
  return true;
}

function subjectSlugToCanonical(): Map<string, string> {
  const m = new Map<string, string>();
  for (const subjects of Object.values(SUBJECTS_BY_DISTRICT)) {
    for (const s of subjects) {
      const canon = canonicalRussiaRegionLabel(s).trim();
      if (!canon) continue;
      const slug = slugify(canon);
      if (!slug) continue;
      if (!m.has(slug)) m.set(slug, canon);
    }
  }
  return m;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const regionSlug = (url.searchParams.get("region") ?? "").trim(); // stable subject slug (optional)
    const qRaw = (url.searchParams.get("query") ?? "").trim();
    const districtRaw = (url.searchParams.get("district") ?? "").trim(); // optional, maps to subjects list

    // PostgreSQL is the only runtime source of truth for /api/cities.
    if (!usesPostgres()) {
      return Response.json({ ok: false, cities: [], error: "cities_unavailable" });
    }

    try {
      const pool = getPool();

        const allowedSubjectSlugs = (() => {
          if (regionSlug) return [regionSlug];
          if (districtRaw && districtRaw in SUBJECTS_BY_DISTRICT) {
            const slugs: string[] = [];
            for (const s of SUBJECTS_BY_DISTRICT[districtRaw as keyof typeof SUBJECTS_BY_DISTRICT]) {
              const canon = canonicalRussiaRegionLabel(s).trim();
              const slug = canon ? slugify(canon) : "";
              if (slug) slugs.push(slug);
            }
            return slugs;
          }
          return null;
        })();

        if ((!qRaw || qRaw.trim().length < 2) && regionSlug) {
          const r = await pool.query(
            `
            SELECT s.name, subj.name AS region, s.lat, s.lng
            FROM location_settlements s
            JOIN location_subjects subj ON subj.slug = s.subject_slug
            WHERE s.subject_slug = $1
            ORDER BY s.name ASC
            LIMIT 50
            `,
            [regionSlug],
          );
          return Response.json({ ok: true, cities: r.rows });
        }

        if (qRaw.trim().length < 2) {
          return Response.json({ ok: true, cities: [] });
        }

        const variants = buildSearchVariants(qRaw)
          .map((v) => v.toLowerCase().trim().replace(/\s+/g, " ").replace(/ё/g, "е"))
          .filter((v) => v.length >= 2);
        if (variants.length === 0) return Response.json({ ok: true, cities: [] });

        const params: unknown[] = [variants];
        let where = "";
        if (allowedSubjectSlugs && allowedSubjectSlugs.length > 0) {
          params.push(allowedSubjectSlugs);
          where = `AND s.subject_slug = ANY($2::text[])`;
        }

        const sql = `
          WITH vars AS (
            SELECT unnest($1::text[]) AS v
          ),
          candidates AS (
            SELECT
              s.id,
              s.name,
              subj.name AS region,
              s.lat,
              s.lng,
              COALESCE(s.settlement_type, 'settlement') AS settlement_type,
              MIN(
                CASE
                  WHEN s.normalized_name = vars.v THEN 0
                  WHEN s.normalized_name LIKE vars.v || '%' THEN 1
                  WHEN s.normalized_name LIKE '%' || vars.v || '%' THEN 2
                  ELSE 999
                END
              ) AS rank
            FROM location_settlements s
            JOIN location_subjects subj ON subj.slug = s.subject_slug
            JOIN vars ON TRUE
            WHERE (
              s.normalized_name LIKE vars.v || '%'
              OR s.normalized_name LIKE '%' || vars.v || '%'
            )
            ${where}
            GROUP BY s.id, s.name, subj.name, s.lat, s.lng, s.settlement_type
          )
          SELECT name, region, lat, lng
          FROM candidates
          ORDER BY
            rank ASC,
            CASE WHEN settlement_type = 'city' THEN 0 ELSE 1 END ASC,
            name ASC
          LIMIT 50
        `;

        const r = await pool.query(sql, params);
        return Response.json({ ok: true, cities: r.rows });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("[api/cities] DB error", e);
      }
      return Response.json({ ok: false, cities: [], error: "cities_unavailable" });
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[api/cities] handler error", e);
    }
    return Response.json({ ok: false, cities: [], error: "cities_unavailable" });
  }
}

