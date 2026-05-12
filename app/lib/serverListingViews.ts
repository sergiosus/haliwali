import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ListingViewStatsPayload } from "./listingViewStatsTypes";
import { getPool, usesPostgres } from "./pgPool";
import { normalizeListingId } from "./listingId";
import { sanitizePgText, sanitizePgTextOrNull } from "./pgTextSanitize";

export type { ListingViewStatsPayload } from "./listingViewStatsTypes";

export const LISTING_VIEW_DEDUP_MS = 30 * 60 * 1000;
const STATS_TIMEZONE = "Europe/Moscow";
const LISTING_VIEW_DEDUP_SEP = "\u001E";

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

function hashSensitiveValue(raw: string, field?: string): string {
  const v = sanitizePgText(raw, field).trim();
  if (!v) return "";
  const salt = process.env.ABUSE_LOG_SALT ?? "haliwali-abuse-log-salt";
  return createHash("sha256").update(`${salt}:${v}`).digest("hex").slice(0, 32);
}

export function hashListingViewIp(ip: string): string {
  return hashSensitiveValue(ip, "ip_hash");
}

export function hashListingViewUserAgent(userAgent: string): string {
  return hashSensitiveValue(userAgent, "user_agent_hash");
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

async function readAggregateCount(listingId: string, client?: PoolClient): Promise<number> {
  const runner = client ?? getPool();
  const { rows } = await runner.query<{ views_count: string }>(
    `SELECT COUNT(*)::text AS views_count
     FROM listing_view_events
     WHERE listing_id = $1`,
    [listingId],
  );
  const n = Number(rows[0]?.views_count);
  return Number.isFinite(n) ? n : 0;
}

export async function countListingViewsByIds(ids: string[]): Promise<Record<string, number>> {
  const clean = ids.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return {};
  if (!usesPostgres()) {
    const { readListingViews } = await import("./serverTrustStore");
    const db = await readListingViews();
    const out: Record<string, number> = {};
    for (const id of clean) out[id] = db[id] ?? 0;
    return out;
  }
  const { rows } = await getPool().query<{ listing_id: string; views_count: string }>(
    `SELECT listing_id, COUNT(*)::text AS views_count
     FROM listing_view_events
     WHERE listing_id = ANY($1::text[])
     GROUP BY listing_id`,
    [clean],
  );
  const out: Record<string, number> = {};
  for (const id of clean) out[id] = 0;
  for (const row of rows) {
    const id = String(row.listing_id ?? "").trim();
    if (!id) continue;
    out[id] = Number(row.views_count) || 0;
  }
  return out;
}

function buildListingViewDedupKey(viewerKey: string, listingId: string): string {
  const viewer = sanitizePgText(viewerKey, "viewer_key");
  const listing = sanitizePgText(listingId, "listing_id");
  return `${viewer}${LISTING_VIEW_DEDUP_SEP}${listing}`;
}

async function insertViewEventPg(
  client: PoolClient,
  args: {
    listingId: string;
    viewerUserId: string | null;
    anonymousViewerId: string | null;
    ipHash: string | null;
    userAgentHash: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO listing_view_events
       (listing_id, viewer_user_id, viewer_fingerprint, ip_hash, user_agent_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      sanitizePgText(args.listingId, "listing_id"),
      sanitizePgTextOrNull(args.viewerUserId, "viewer_user_id"),
      sanitizePgTextOrNull(args.anonymousViewerId, "viewer_fingerprint"),
      sanitizePgTextOrNull(args.ipHash, "ip_hash"),
      sanitizePgTextOrNull(args.userAgentHash, "user_agent_hash"),
    ],
  );
}

export async function recordListingView(input: RecordListingViewInput): Promise<{
  count: number;
  incremented: boolean;
  skipped: boolean;
}> {
  const listingId = sanitizePgText(normalizeListingId(input.listingId), "listing_id");
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

  const viewerUserId = sanitizePgTextOrNull(input.viewerUserId, "viewer_user_id");
  const anonymousViewerId = sanitizePgTextOrNull(input.anonymousViewerId, "viewer_fingerprint");
  const viewerKey = viewerUserId ?? anonymousViewerId;
  if (!viewerKey) return { count: 0, incremented: false, skipped: true };

  const ipHash = sanitizePgTextOrNull(input.ipHash, "ip_hash");
  const userAgentHash = sanitizePgTextOrNull(input.userAgentHash, "user_agent_hash");

  if (!usesPostgres()) {
    const { maybeIncrementListingViewDev } = await import("./serverTrustStore");
    const { count, incremented } = await maybeIncrementListingViewDev(listingId, viewerKey);
    logListingViewDebug({ listingId, incremented, skipped: false, count });
    return { count, incremented, skipped: false };
  }

  const now = Date.now();
  const dedupKey = buildListingViewDedupKey(viewerKey, listingId);
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
      [
        sanitizePgText(dedupKey, "dedup_key"),
        sanitizePgText(listingId, "listing_id"),
        sanitizePgText(viewerKey, "viewer_key"),
        now,
        expiresAt,
      ],
    );
    const incremented = ins.rows.length > 0;
    if (incremented) {
      await insertViewEventPg(client, {
        listingId,
        viewerUserId,
        anonymousViewerId,
        ipHash,
        userAgentHash,
      });
    }
    const count = await readAggregateCount(listingId, client);
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
       COUNT(*) FILTER (WHERE created_at >= to_timestamp($2 / 1000.0))::text AS today,
       COUNT(*) FILTER (WHERE created_at >= to_timestamp($3 / 1000.0))::text AS last7,
       COUNT(*) FILTER (WHERE created_at >= to_timestamp($4 / 1000.0))::text AS last30,
       COUNT(DISTINCT COALESCE(viewer_user_id, 'anon:' || viewer_fingerprint))::text AS unique_viewers
     FROM listing_view_events
     WHERE listing_id = $1`,
    [id, todayStart, last7Start, last30Start],
  );
  const w = windowRows[0];
  const today = Number(w?.today) || 0;
  const last7Days = Number(w?.last7) || 0;
  const last30Days = Number(w?.last30) || 0;
  const uniqueViewers = Number(w?.unique_viewers) || 0;

  const cities: ListingViewStatsPayload["cities"] = [];

  const { rows: dailyRows } = await pool.query<{ day: string; views: string }>(
    `SELECT to_char((created_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day, COUNT(*)::text AS views
     FROM listing_view_events
     WHERE listing_id = $1 AND created_at >= to_timestamp($3 / 1000.0)
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
