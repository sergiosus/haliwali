import { allDirectoryItems, normalizeQuery } from "./categoryDirectory";
import { listingPath } from "./seo";
import type { Listing, ListingType } from "./listingModel";
import { isListingPubliclyListed } from "./listingModel";
import { getPool, usesPostgres } from "./pgPool";
import { listBootstrap } from "./serverListingsStore";
import { listingFromPersistentRow } from "./serverListingsMap";
import { normalizeGlobalSearchQuery, type GlobalSearchNormalizedQuery } from "./globalSearchNormalize";
import type { GlobalSearchListingTypeFilter, GlobalSearchResultItem, GlobalSearchSuggestItem } from "./globalSearchTypes";
import { listingMatchesSearchScope, type SearchScopeLocation } from "./searchScopeLocation";
import { buildSearchVariants } from "./utils/keyboardLayout";
import { filterGlobalRussiaCitiesByQuery } from "./staticRussiaCities";

const DESCRIPTION_SNIPPET_MAX = 160;

function listingResultType(type: ListingType): GlobalSearchResultItem["type"] {
  if (type === "task") return "task";
  if (type === "service") return "service";
  return "product";
}

function inferListingRegion(listing: Listing): string {
  const loc = listing.location;
  if (typeof loc?.region === "string" && loc.region.trim()) return loc.region.trim();
  return "";
}

function descriptionSnippet(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= DESCRIPTION_SNIPPET_MAX) return t;
  return `${t.slice(0, DESCRIPTION_SNIPPET_MAX)}…`;
}

export function listingToGlobalSearchResult(listing: Listing, score: number): GlobalSearchResultItem {
  const photos = Array.isArray(listing.photos) ? listing.photos : [];
  const imageUrl = typeof photos[0] === "string" && photos[0].trim() ? photos[0].trim() : null;
  const spec =
    listing.type === "service" && "specialization" in listing ?
      String((listing as { specialization?: string }).specialization ?? "").trim()
    : "";
  return {
    id: listing.id,
    type: listingResultType(listing.type),
    title: (listing.title ?? "").trim() || "Объявление",
    descriptionSnippet: descriptionSnippet(listing.description ?? ""),
    category: (listing.categoryName ?? "").trim(),
    subcategory: spec || (listing.categorySlug ?? "").trim(),
    city: (listing.city ?? "").trim(),
    region: inferListingRegion(listing),
    imageUrl,
    href: listingPath(listing.id, listing.title ?? ""),
    score,
  };
}

function listingHaystackNormalized(listing: Listing): string {
  const spec = listing.type === "service" && "specialization" in listing ?
    String((listing as { specialization?: string }).specialization ?? "")
  : "";
  return normalizeQuery(
    [
      listing.title,
      listing.description,
      listing.categoryName,
      listing.categorySlug,
      listing.city,
      spec,
      listing.type,
    ].join(" "),
  );
}

function listingMatchesSearchVariants(listing: Listing, rawQuery: string, variants: string[]): boolean {
  const hay = listingHaystackNormalized(listing);
  const vs = variants.length > 0 ? variants : buildSearchVariants(rawQuery);
  if (vs.length === 0) return true;
  return vs.some((v) => hay.includes(v));
}

function haystackMatchesQuery(haystackLower: string, rawQuery: string): boolean {
  const variants = buildSearchVariants(rawQuery);
  if (variants.length === 0) return true;
  return variants.some((v) => haystackLower.includes(v));
}

function scoreListingFallback(listing: Listing, variants: string[]): number {
  const title = normalizeQuery(listing.title ?? "");
  const hay = normalizeQuery(
    [
      listing.title,
      listing.description,
      listing.categoryName,
      listing.categorySlug,
      listing.city,
      "specialization" in listing ? (listing as { specialization?: string }).specialization : "",
    ].join(" "),
  );
  let score = 0;
  for (const v of variants) {
    if (!v) continue;
    if (title === v) score = Math.max(score, 100);
    else if (title.includes(v)) score = Math.max(score, 50);
    else if (hay.includes(v)) score = Math.max(score, 20);
  }
  return score;
}

async function searchListingsPg(
  normalized: GlobalSearchNormalizedQuery,
  type: GlobalSearchListingTypeFilter,
  limit: number,
): Promise<{ rows: Listing[]; scores: Map<string, number> }> {
  const variants = normalized.variants.length > 0 ? normalized.variants : [normalized.primary].filter(Boolean);
  if (variants.length === 0) return { rows: [], scores: new Map() };

  const pool = getPool();
  const fetchLimit = Math.min(limit * 4, 200);
  const params: unknown[] = [variants, fetchLimit];
  let typeSql = "";
  if (type === "task") typeSql = `AND l.type = 'task'`;
  else if (type === "service") typeSql = `AND l.type = 'service'`;
  else if (type === "product") typeSql = `AND l.type IN ('product_sell','product_buy')`;

  const sql = `
    SELECT l.*,
      (
        CASE WHEN lower(l.title) = ANY($1::text[]) THEN 100 ELSE 0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM unnest($1::text[]) v
            WHERE lower(l.title) LIKE '%' || v || '%'
          ) THEN 50 ELSE 0 END
        + GREATEST(
            COALESCE((SELECT MAX(similarity(lower(l.title), v)) FROM unnest($1::text[]) v), 0),
            COALESCE((SELECT MAX(similarity(lower(COALESCE(l.description, '')), v)) FROM unnest($1::text[]) v), 0),
            COALESCE((SELECT MAX(similarity(lower(COALESCE(l.category_name, '')), v)) FROM unnest($1::text[]) v), 0),
            COALESCE((SELECT MAX(similarity(lower(COALESCE(l.specialization, '')), v)) FROM unnest($1::text[]) v), 0)
          ) * 10
        + CASE WHEN EXISTS (
            SELECT 1 FROM unnest($1::text[]) v
            WHERE lower(COALESCE(l.description, '')) LIKE '%' || v || '%'
               OR lower(COALESCE(l.category_name, '')) LIKE '%' || v || '%'
          ) THEN 15 ELSE 0 END
      )::double precision AS search_score
    FROM listings l
    WHERE l.status IN ('auto','approved')
      AND COALESCE(NULLIF(TRIM(l.deal_status), ''), 'active') = 'active'
      AND COALESCE(NULLIF(TRIM(l.listing_lifecycle), ''), 'live') = 'live'
      ${typeSql}
      AND EXISTS (
        SELECT 1 FROM unnest($1::text[]) v
        WHERE lower(l.title) LIKE '%' || v || '%'
           OR lower(COALESCE(l.description, '')) LIKE '%' || v || '%'
           OR lower(COALESCE(l.category_name, '')) LIKE '%' || v || '%'
           OR lower(COALESCE(l.specialization, '')) LIKE '%' || v || '%'
           OR lower(COALESCE(l.city, '')) LIKE '%' || v || '%'
           OR l.title % v
           OR COALESCE(l.description, '') % v
           OR COALESCE(l.category_name, '') % v
      )
    ORDER BY search_score DESC, l.created_at DESC
    LIMIT $2
  `;

  try {
    const { rows } = await pool.query(sql, params.slice(0, type === "all" ? 2 : params.length));
    const listings: Listing[] = [];
    const scores = new Map<string, number>();
    for (const row of rows) {
      const scoreRaw = (row as { search_score?: unknown }).search_score;
      const score = typeof scoreRaw === "number" && Number.isFinite(scoreRaw) ? scoreRaw : 0;
      const listing = listingFromPersistentRow(row as Record<string, unknown>);
      if (!listing) continue;
      listings.push(listing);
      scores.set(listing.id, score);
    }
    return { rows: listings, scores };
  } catch {
    const likeSql = `
      SELECT l.*,
        (
          CASE WHEN lower(l.title) = ANY($1::text[]) THEN 100 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1 FROM unnest($1::text[]) v WHERE lower(l.title) LIKE '%' || v || '%'
            ) THEN 50 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1 FROM unnest($1::text[]) v
              WHERE lower(COALESCE(l.description, '')) LIKE '%' || v || '%'
                 OR lower(COALESCE(l.category_name, '')) LIKE '%' || v || '%'
            ) THEN 15 ELSE 0 END
        )::double precision AS search_score
      FROM listings l
      WHERE l.status IN ('auto','approved')
        AND COALESCE(NULLIF(TRIM(l.deal_status), ''), 'active') = 'active'
        AND COALESCE(NULLIF(TRIM(l.listing_lifecycle), ''), 'live') = 'live'
        ${typeSql}
        AND EXISTS (
          SELECT 1 FROM unnest($1::text[]) v
          WHERE lower(l.title) LIKE '%' || v || '%'
             OR lower(COALESCE(l.description, '')) LIKE '%' || v || '%'
             OR lower(COALESCE(l.category_name, '')) LIKE '%' || v || '%'
             OR lower(COALESCE(l.specialization, '')) LIKE '%' || v || '%'
             OR lower(COALESCE(l.city, '')) LIKE '%' || v || '%'
        )
      ORDER BY search_score DESC, l.created_at DESC
      LIMIT $2
    `;
    const { rows } = await pool.query(likeSql, params);
    const listings: Listing[] = [];
    const scores = new Map<string, number>();
    for (const row of rows) {
      const scoreRaw = (row as { search_score?: unknown }).search_score;
      const score = typeof scoreRaw === "number" && Number.isFinite(scoreRaw) ? scoreRaw : 0;
      const listing = listingFromPersistentRow(row as Record<string, unknown>);
      if (!listing) continue;
      listings.push(listing);
      scores.set(listing.id, score);
    }
    return { rows: listings, scores };
  }
}

async function searchListingsFile(
  normalized: GlobalSearchNormalizedQuery,
  type: GlobalSearchListingTypeFilter,
  limit: number,
): Promise<{ rows: Listing[]; scores: Map<string, number> }> {
  const all = await listBootstrap(null, false);
  const q = normalized.raw || normalized.primary;
  const variants = normalized.variants;

  let pool = all.filter(isListingPubliclyListed);
  if (type === "task") pool = pool.filter((l) => l.type === "task");
  else if (type === "service") pool = pool.filter((l) => l.type === "service");
  else if (type === "product") pool = pool.filter((l) => l.type === "product_sell" || l.type === "product_buy");

  const matched = pool.filter((l) => listingMatchesSearchVariants(l, q, variants));
  const scored = matched.map((l) => ({ l, score: scoreListingFallback(l, variants) }));
  scored.sort((a, b) => b.score - a.score || (b.l.createdAt ?? 0) - (a.l.createdAt ?? 0));
  const top = scored.slice(0, limit * 4);
  const scores = new Map<string, number>();
  for (const { l, score } of top) scores.set(l.id, score);
  return { rows: top.map((x) => x.l), scores };
}

export async function globalSearchListings(opts: {
  query: string;
  type?: GlobalSearchListingTypeFilter;
  limit?: number;
  scope: SearchScopeLocation;
}): Promise<{
  normalized: GlobalSearchNormalizedQuery;
  results: GlobalSearchResultItem[];
}> {
  const normalized = normalizeGlobalSearchQuery(opts.query);
  const type = opts.type ?? "all";
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);

  if (!normalized.primary && normalized.variants.length === 0) {
    return { normalized, results: [] };
  }

  const { rows, scores } =
    usesPostgres() ?
      await searchListingsPg(normalized, type, limit)
    : await searchListingsFile(normalized, type, limit);

  const scoped = rows.filter((l) => listingMatchesSearchScope(l, opts.scope));
  const results: GlobalSearchResultItem[] = [];
  const seen = new Set<string>();
  for (const l of scoped) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    results.push(listingToGlobalSearchResult(l, scores.get(l.id) ?? scoreListingFallback(l, normalized.variants)));
    if (results.length >= limit) break;
  }

  results.sort((a, b) => b.score - a.score);
  return { normalized, results };
}

function suggestCategories(q: string, max: number): GlobalSearchSuggestItem[] {
  const out: GlobalSearchSuggestItem[] = [];
  const seen = new Set<string>();
  for (const item of allDirectoryItems) {
    const hay = normalizeQuery(item.title);
    if (!haystackMatchesQuery(hay, q)) continue;
    const key = item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "category", label: item.title, query: item.title });
    if (out.length >= max) return out;
  }
  return out;
}

function suggestCities(q: string, max: number): GlobalSearchSuggestItem[] {
  const out: GlobalSearchSuggestItem[] = [];
  for (const c of filterGlobalRussiaCitiesByQuery(q).slice(0, max)) {
    const label = c.region ? `${c.city}, ${c.region}` : c.city;
    out.push({ kind: "city", label, query: c.city });
  }
  return out;
}

export async function globalSearchSuggest(opts: {
  query: string;
  scope: SearchScopeLocation;
}): Promise<{ normalized: GlobalSearchNormalizedQuery; suggestions: GlobalSearchSuggestItem[] }> {
  const normalized = normalizeGlobalSearchQuery(opts.query);
  const q = normalized.raw;
  if (q.length < 2) {
    return { normalized, suggestions: [] };
  }

  const suggestions: GlobalSearchSuggestItem[] = [];
  const seen = new Set<string>();

  function push(item: GlobalSearchSuggestItem) {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(item);
  }

  for (const c of suggestCategories(q, 3)) push(c);
  for (const c of suggestCities(q, 2)) push(c);

  const { results } = await globalSearchListings({
    query: q,
    type: "all",
    limit: 6,
    scope: opts.scope,
  });
  for (const r of results) {
    if (suggestions.length >= 8) break;
    push({ kind: "listing", label: r.title, query: r.title });
  }

  return { normalized, suggestions: suggestions.slice(0, 8) };
}
