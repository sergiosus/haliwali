import { createHash, randomUUID } from "node:crypto";
import type { ListingViewStatsPayload } from "./listingViewStatsTypes";
import { getPool, usesPostgres } from "./pgPool";
import { normalizeListingId } from "./listingId";

export type { ListingViewStatsPayload } from "./listingViewStatsTypes";

export const LISTING_VIEW_DEDUP_MS = 30 * 60 * 1000;
const STATS_TIMEZONE = "Europe/Moscow";
const UNKNOWN_CITY_LABEL = "Неизвестно";

function logListingViewDebug(payload: { listingId: string; incremented: boolean; skipped: boolean; count: number }) {
  console.log("[LISTING_VIEW]", payload);
}

export type ListingViewLocationHint = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export type RecordListingViewInput = {
  listingId: string;
  viewerUserId?: string | null;
  anonymousViewerId?: string | null;
  ownerUserId?: string | null;
  location?: ListingViewLocationHint;
  ipHash?: string | null;
  userAgentHash?: string | null;
  skipCount?: boolean;
};

function hashSensitiveValue(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const salt = process.env.ABUSE_LOG_SALT ?? "haliwali-abuse-log-salt";
  return createHash("sha256").update(`${salt}:${v}`).digest("hex").slice(0, 32);
}

export function hashListingViewIp(ip: string): string {
  return hashSensitiveValue(ip);
}

export function hashListingViewUserAgent(userAgent: string): string {
  return hashSensitiveValue(userAgent);
}

function normalizeCityLabel(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v || null;
}

function moscowDayStartMs(nowMs: number): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: STATS_TIMEZONE }).format(new Date(nowMs));
  const [y, m, d] = day.split("-").map((x) => Number(x));
  if (!Number.isFinite(y + m + d)) return nowMs - 24 * 60 * 60 * 1000;
  const utcGuess = Date.UTC(y, m - 1, d);
  const moscowLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(utcGuess));
  const [datePart, timePart] = moscowLabel.split(", ");
  if (datePart !== day || !timePart) return utcGuess;
  const [hh, mm, ss] = timePart.split(":").map((x) => Number(x));
  return utcGuess - ((hh * 3600 + mm * 60 + ss) * 1000);
}

async function readAggregateCount(listingId: string): Promise<number> {
  const { rows } = await getPool().query<{ views_count: number }>(
    `SELECT views_count FROM listing_views WHERE listing_id = $1 LIMIT 1`,
    [listingId],
  );
  const n = Number(rows[0]?.views_count);
  return Number.isFinite(n) ? n : 0;
}

async function insertViewEventPg(args: {
  listingId: string;
  viewerUserId: string | null;
  anonymousViewerId: string | null;
  ownerUserId: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO listing_view_events
       (id, listing_id, viewer_user_id, anonymous_viewer_id, owner_user_id, city, region, country, user_agent_hash, ip_hash, viewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())`,
    [
      randomUUID(),
      args.listingId,
      args.viewerUserId,
      args.anonymousViewerId,
      args.ownerUserId,
      args.city,
      args.region,
      args.country,
      args.userAgentHash,
      args.ipHash,
    ],
  );
}

export async function recordListingView(input: RecordListingViewInput): Promise<{
  count: number;
  incremented: boolean;
  skipped: boolean;
}> {
  const listingId = normalizeListingId(input.listingId);
  if (!listingId) return { count: 0, incremented: false, skipped: true };

  if (input.skipCount) {
    if (!usesPostgres()) {
      const { readListingViews } = await import("./serverTrustStore");
      const counts = await readListingViews();
      return { count: counts[listingId] ?? 0, incremented: false, skipped: true };
    }
    const count = await readAggregateCount(listingId);
    return { count, incremented: false, skipped: true };
  }

  const viewerUserId = (input.viewerUserId ?? "").trim() || null;
  const anonymousViewerId = (input.anonymousViewerId ?? "").trim() || null;
  const viewerKey = viewerUserId ?? anonymousViewerId;
  if (!viewerKey) return { count: 0, incremented: false, skipped: true };

  const ownerUserId = (input.ownerUserId ?? "").trim() || null;
  const city = normalizeCityLabel(input.location?.city);
  const region = normalizeCityLabel(input.location?.region);
  const country = normalizeCityLabel(input.location?.country);
  const ipHash = (input.ipHash ?? "").trim() || null;
  const userAgentHash = (input.userAgentHash ?? "").trim() || null;

  if (!usesPostgres()) {
    const { maybeIncrementListingViewDev } = await import("./serverTrustStore");
    const { count, incremented } = await maybeIncrementListingViewDev(listingId, viewerKey);
    logListingViewDebug({ listingId, incremented, skipped: false, count });
    return { count, incremented, skipped: false };
  }

  const now = Date.now();
  const dedupKey = `${viewerKey}\0${listingId}`;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM listing_view_dedup WHERE expires_at IS NOT NULL AND expires_at < now()`);
    const expiresAt = now + LISTING_VIEW_DEDUP_MS;
    const ins = await client.query<{ dedup_key: string }>(
      `INSERT INTO listing_view_dedup (dedup_key, listing_id, viewer_key, created_at, expires_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING dedup_key`,
      [dedupKey, listingId, viewerKey, now, expiresAt],
    );
    const incremented = ins.rows.length > 0;
    let count = 0;
    if (incremented) {
      const r = await client.query<{ views_count: number }>(
        `INSERT INTO listing_views (listing_id, views_count, updated_at)
         VALUES ($1, 1, now())
         ON CONFLICT (listing_id) DO UPDATE SET
           views_count = listing_views.views_count + 1,
           updated_at = now()
         RETURNING views_count`,
        [listingId],
      );
      count = Number(r.rows[0]?.views_count) || 0;
      try {
        await client.query("SAVEPOINT listing_view_event");
        await insertViewEventPg({
          listingId,
          viewerUserId,
          anonymousViewerId,
          ownerUserId,
          city,
          region,
          country,
          ipHash,
          userAgentHash,
        });
        await client.query("RELEASE SAVEPOINT listing_view_event");
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT listing_view_event");
      }
    } else {
      count = await readAggregateCount(listingId);
    }
    await client.query("COMMIT");
    logListingViewDebug({ listingId, incremented, skipped: false, count });
    return { count, incremented, skipped: false };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function roundShare(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function getListingViewStatsForOwner(listingId: string): Promise<ListingViewStatsPayload | null> {
  const id = normalizeListingId(listingId);
  if (!id) return null;
  if (!usesPostgres()) return null;

  const now = Date.now();
  const todayStart = moscowDayStartMs(now);
  const last7Start = now - 7 * 24 * 60 * 60 * 1000;
  const last30Start = now - 30 * 24 * 60 * 60 * 1000;
  const dailyStart = now - 29 * 24 * 60 * 60 * 1000;

  const pool = getPool();
  const total = await readAggregateCount(id);

  const { rows: windowRows } = await pool.query<{
    today: string;
    last7: string;
    last30: string;
    unique_viewers: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE viewed_at >= to_timestamp($2 / 1000.0))::text AS today,
       COUNT(*) FILTER (WHERE viewed_at >= to_timestamp($3 / 1000.0))::text AS last7,
       COUNT(*) FILTER (WHERE viewed_at >= to_timestamp($4 / 1000.0))::text AS last30,
       COUNT(DISTINCT COALESCE(viewer_user_id, 'anon:' || anonymous_viewer_id))::text AS unique_viewers
     FROM listing_view_events
     WHERE listing_id = $1`,
    [id, todayStart, last7Start, last30Start],
  );
  const w = windowRows[0];
  const today = Number(w?.today) || 0;
  const last7Days = Number(w?.last7) || 0;
  const last30Days = Number(w?.last30) || 0;
  const uniqueViewers = Number(w?.unique_viewers) || 0;

  const { rows: cityRows } = await pool.query<{ city: string | null; views: string }>(
    `SELECT COALESCE(NULLIF(TRIM(city), ''), $2) AS city, COUNT(*)::text AS views
     FROM listing_view_events
     WHERE listing_id = $1 AND viewed_at >= to_timestamp($3 / 1000.0)
     GROUP BY 1
     ORDER BY COUNT(*) DESC, city ASC
     LIMIT 12`,
    [id, UNKNOWN_CITY_LABEL, last30Start],
  );
  const cityTotal = cityRows.reduce((sum, row) => sum + (Number(row.views) || 0), 0);
  const cities = cityRows.map((row) => {
    const views = Number(row.views) || 0;
    return {
      city: (row.city ?? UNKNOWN_CITY_LABEL).trim() || UNKNOWN_CITY_LABEL,
      views,
      share: roundShare(views, cityTotal),
    };
  });

  const { rows: dailyRows } = await pool.query<{ day: string; views: string }>(
    `SELECT to_char((viewed_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day, COUNT(*)::text AS views
     FROM listing_view_events
     WHERE listing_id = $1 AND viewed_at >= to_timestamp($3 / 1000.0)
     GROUP BY 1
     ORDER BY 1 ASC`,
    [id, STATS_TIMEZONE, dailyStart],
  );
  const dailyMap = new Map<string, number>();
  for (const row of dailyRows) {
    dailyMap.set(row.day, Number(row.views) || 0);
  }
  const daily: Array<{ date: string; views: number }> = [];
  for (let i = 29; i >= 0; i -= 1) {
    const dayMs = todayStart - i * 24 * 60 * 60 * 1000;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: STATS_TIMEZONE }).format(new Date(dayMs));
    daily.push({ date: day, views: dailyMap.get(day) ?? 0 });
  }

  return {
    total,
    today,
    last7Days,
    last30Days,
    uniqueViewers,
    cities,
    daily,
  };
}
