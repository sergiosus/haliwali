import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { normalizeListingId } from "./listingId";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const REPLY_STATS_PATH = ".data/reply-stats.json";
const LISTING_VIEWS_PATH = ".data/listing-views.json";
const VIEW_DEDUP_PATH = ".data/listing-view-dedup.json";
const REPORTS_PATH = ".data/reports.jsonl";

const VIEW_DEDUP_MS = 30 * 60 * 1000;

export type ReplyStatRow = { count: number; sumMs: number };

export type ReplyStatsDb = Record<string, ReplyStatRow>;

export type ListingViewsDb = Record<string, number>;

export type ReportRecord = {
  id: string;
  reporterId: string;
  targetType: "listing" | "user";
  targetId: string;
  reason: string;
  comment: string;
  createdAt: number;
  /** Moderation: dismissed complaints are hidden from the admin inbox. */
  dismissed?: boolean;
};

async function ensureDir(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  assertFileStoreNotUsedInProduction("serverTrustStore.readJson", { path });
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  assertFileStoreNotUsedInProduction("serverTrustStore.writeJson", { path });
  await ensureDir(path);
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export async function readReplyStats(): Promise<ReplyStatsDb> {
  if (usesPostgres()) {
    const { rows } = await getPool().query<{
      key: string;
      replies_count: number;
      sum_ms: string | number;
    }>(`SELECT key, replies_count, sum_ms FROM reply_stats`);
    const out: ReplyStatsDb = {};
    for (const r of rows) {
      const k = String(r.key ?? "").trim();
      if (!k) continue;
      const count = Number(r.replies_count);
      const sumMs = Number(r.sum_ms);
      out[k] = {
        count: Number.isFinite(count) ? count : 0,
        sumMs: Number.isFinite(sumMs) ? sumMs : 0,
      };
    }
    return out;
  }
  return await readJson<ReplyStatsDb>(REPLY_STATS_PATH, {});
}

export async function appendReplySample(userId: string, replyMs: number): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id || !Number.isFinite(replyMs) || replyMs < 0) return;
  const capped = Math.min(replyMs, 24 * 60 * 60 * 1000);
  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO reply_stats (key, user_id, listing_id, replies_count, sum_ms, updated_at)
       VALUES ($1, $2, NULL, 1, $3, now())
       ON CONFLICT (key) DO UPDATE SET
         replies_count = reply_stats.replies_count + 1,
         sum_ms = reply_stats.sum_ms + EXCLUDED.sum_ms,
         updated_at = now()`,
      [id, id, capped],
    );
    return;
  }
  const db = await readReplyStats();
  const prev = db[id] ?? { count: 0, sumMs: 0 };
  db[id] = { count: prev.count + 1, sumMs: prev.sumMs + capped };
  await writeJson(REPLY_STATS_PATH, db);
}

export function fastReplyEligible(stats: ReplyStatRow | undefined): boolean {
  if (!stats || stats.count < 3) return false;
  const avg = stats.sumMs / stats.count;
  return avg <= 15 * 60 * 1000;
}

export async function readListingViews(): Promise<ListingViewsDb> {
  if (usesPostgres()) {
    const { rows } = await getPool().query<{ listing_id: string; views_count: string }>(
      `SELECT listing_id, COUNT(*)::text AS views_count
       FROM listing_view_events
       GROUP BY listing_id`,
    );
    const out: ListingViewsDb = {};
    for (const r of rows) {
      const id = String(r.listing_id ?? "").trim();
      if (!id) continue;
      const n = Number(r.views_count);
      out[id] = Number.isFinite(n) ? n : 0;
    }
    return out;
  }
  return await readJson<ListingViewsDb>(LISTING_VIEWS_PATH, {});
}

export async function incrementListingView(listingId: string): Promise<number> {
  const id = (listingId ?? "").trim();
  if (!id) return 0;
  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO listing_view_events (listing_id, viewer_user_id, viewer_fingerprint)
       VALUES ($1, NULL, $2)`,
      [id, `dev:${id}:${Date.now()}`],
    );
    const { rows } = await getPool().query<{ views_count: string }>(
      `SELECT COUNT(*)::text AS views_count
       FROM listing_view_events
       WHERE listing_id = $1`,
      [id],
    );
    const n = Number(rows[0]?.views_count);
    return Number.isFinite(n) ? n : 0;
  }
  const db = await readListingViews();
  const next = (db[id] ?? 0) + 1;
  db[id] = next;
  await writeJson(LISTING_VIEWS_PATH, db);
  return next;
}

type ViewDedupDb = Record<string, Record<string, number>>;

/** Dev-only JSON dedup path (production uses `recordListingView` in serverListingViews). */
export async function maybeIncrementListingViewDev(
  listingId: string,
  viewerKey: string,
): Promise<{ count: number; incremented: boolean }> {
  const id = (listingId ?? "").trim();
  const vk = (viewerKey ?? "").trim();
  if (!id) return { count: 0, incremented: false };

  if (!vk) {
    const next = await incrementListingView(id);
    return { count: next, incremented: true };
  }

  const counts = await readListingViews();
  const dedup = await readJson<ViewDedupDb>(VIEW_DEDUP_PATH, {});
  const now = Date.now();
  const prev = dedup[vk]?.[id] ?? 0;
  if (now - prev < VIEW_DEDUP_MS) {
    return { count: counts[id] ?? 0, incremented: false };
  }
  if (!dedup[vk]) dedup[vk] = {};
  dedup[vk][id] = now;
  await writeJson(VIEW_DEDUP_PATH, dedup);
  const next = await incrementListingView(id);
  return { count: next, incremented: true };
}

/** Increment view count at most once per viewer per listing per dedup window. */
export async function maybeIncrementListingView(listingId: string, viewerKey: string): Promise<{ count: number; incremented: boolean }> {
  const { recordListingView } = await import("./serverListingViews");
  const result = await recordListingView({
    listingId,
    viewerUserId: null,
    anonymousViewerId: viewerKey,
  });
  return { count: result.count, incremented: result.incremented };
}

export async function getListingViewCounts(ids: string[]): Promise<Record<string, number>> {
  if (usesPostgres()) {
    const { countListingViewsByIds } = await import("./serverListingViews");
    return countListingViewsByIds(ids);
  }
  const db = await readListingViews();
  const out: Record<string, number> = {};
  for (const raw of ids) {
    const id = (raw ?? "").trim();
    if (!id) continue;
    out[id] = db[id] ?? 0;
  }
  return out;
}

export async function appendReport(row: Omit<ReportRecord, "id" | "createdAt"> & { createdAt?: number }): Promise<ReportRecord> {
  const rec: ReportRecord = {
    id: randomBytes(12).toString("hex"),
    reporterId: row.reporterId,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    comment: row.comment,
    createdAt: row.createdAt ?? Date.now(),
  };
  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, comment, created_at, dismissed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE)
       ON CONFLICT (id) DO NOTHING`,
      [rec.id, rec.reporterId, rec.targetType, rec.targetId, rec.reason, rec.comment, rec.createdAt],
    );
    return rec;
  }
  assertFileStoreNotUsedInProduction("serverTrustStore.appendReport.fileFallback", { path: REPORTS_PATH });
  await ensureDir(REPORTS_PATH);
  await writeFile(REPORTS_PATH, `${JSON.stringify(rec)}\n`, { flag: "a" });
  return rec;
}

export async function readAllReports(limit = 500): Promise<ReportRecord[]> {
  if (usesPostgres()) {
    const lim = Math.max(1, Math.min(5000, Number.isFinite(limit) ? limit : 500));
    const { rows } = await getPool().query<{
      id: string;
      reporter_id: string;
      target_type: "listing" | "user";
      target_id: string;
      reason: string;
      comment: string;
      created_at: number;
      dismissed: boolean;
    }>(
      `SELECT id, reporter_id, target_type, target_id, reason, comment, created_at, dismissed
       FROM reports
       ORDER BY created_at DESC
       LIMIT $1`,
      [lim],
    );
    return rows.map((r) => ({
      id: r.id,
      reporterId: r.reporter_id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      comment: r.comment,
      createdAt: Number(r.created_at),
      ...(r.dismissed ? { dismissed: true } : {}),
    }));
  }
  assertFileStoreNotUsedInProduction("serverTrustStore.readAllReports.fileFallback", { path: REPORTS_PATH });
  try {
    const raw = await readFile(REPORTS_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const slice = lines.slice(-limit);
    const out: ReportRecord[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line) as ReportRecord);
      } catch {
        // skip bad line
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Mark a complaint as dismissed (rewrites jsonl; ignores unknown ids). */
export async function dismissReportById(reportId: string): Promise<boolean> {
  const id = (reportId ?? "").trim();
  if (!id) return false;
  if (usesPostgres()) {
    const res = await getPool().query(`UPDATE reports SET dismissed = TRUE WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
  assertFileStoreNotUsedInProduction("serverTrustStore.dismissReportById.fileFallback", { path: REPORTS_PATH });
  try {
    const raw = await readFile(REPORTS_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let found = false;
    const next = lines.map((line) => {
      try {
        const row = JSON.parse(line) as ReportRecord;
        if ((row.id ?? "").trim() !== id) return line;
        found = true;
        return JSON.stringify({ ...row, dismissed: true });
      } catch {
        return line;
      }
    });
    if (!found) return false;
    await writeFile(REPORTS_PATH, `${next.join("\n")}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Permanently remove one report line from jsonl (admin). */
export async function deleteReportByIdPermanently(reportId: string): Promise<boolean> {
  const id = (reportId ?? "").trim();
  if (!id) return false;
  if (usesPostgres()) {
    const res = await getPool().query(`DELETE FROM reports WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
  assertFileStoreNotUsedInProduction("serverTrustStore.deleteReportByIdPermanently.fileFallback", { path: REPORTS_PATH });
  try {
    const raw = await readFile(REPORTS_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let found = false;
    const next = lines.filter((line) => {
      try {
        const row = JSON.parse(line) as ReportRecord;
        if ((row.id ?? "").trim() === id) {
          found = true;
          return false;
        }
        return true;
      } catch {
        return true;
      }
    });
    if (!found) return false;
    await writeFile(REPORTS_PATH, next.length ? `${next.join("\n")}\n` : "", "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Remove all non-dismissed listing reports whose target listing id is in `listingIds`. */
export async function removeReportsTargetingListingIds(listingIds: readonly string[]): Promise<number> {
  const idSet = new Set(listingIds.map((x) => normalizeListingId(String(x ?? ""))).filter(Boolean));
  if (idSet.size === 0) return 0;
  if (usesPostgres()) {
    const ids = [...idSet];
    const res = await getPool().query(
      `DELETE FROM reports
       WHERE target_type = 'listing' AND dismissed = FALSE AND target_id = ANY($1::text[])`,
      [ids],
    );
    return Number(res.rowCount ?? 0);
  }
  assertFileStoreNotUsedInProduction("serverTrustStore.removeReportsTargetingListingIds.fileFallback", { path: REPORTS_PATH });
  try {
    const raw = await readFile(REPORTS_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let removed = 0;
    const next = lines.filter((line) => {
      try {
        const row = JSON.parse(line) as ReportRecord;
        if (row.targetType !== "listing") return true;
        const tid = normalizeListingId((row.targetId ?? "").trim());
        if (!tid || !idSet.has(tid)) return true;
        removed += 1;
        return false;
      } catch {
        return true;
      }
    });
    if (removed === 0) return 0;
    await writeFile(REPORTS_PATH, next.length ? `${next.join("\n")}\n` : "", "utf8");
    return removed;
  } catch {
    return 0;
  }
}

/** Drop listing-target reports whose listing id is not in the given set (orphans after listing delete). */
export async function purgeListingReportsNotInValidIdSet(validListingIds: ReadonlySet<string>): Promise<number> {
  if (usesPostgres()) {
    // For PG path, caller should pass a reasonable set; we delete only listing-target reports.
    const ids = [...validListingIds].map((x) => normalizeListingId(String(x ?? ""))).filter(Boolean);
    if (ids.length === 0) {
      const res0 = await getPool().query(`DELETE FROM reports WHERE target_type = 'listing'`);
      return Number(res0.rowCount ?? 0);
    }
    const res = await getPool().query(
      `DELETE FROM reports
       WHERE target_type = 'listing' AND NOT (target_id = ANY($1::text[]))`,
      [ids],
    );
    return Number(res.rowCount ?? 0);
  }
  assertFileStoreNotUsedInProduction("serverTrustStore.purgeListingReportsNotInValidIdSet.fileFallback", { path: REPORTS_PATH });
  try {
    const raw = await readFile(REPORTS_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let removed = 0;
    const next = lines.filter((line) => {
      try {
        const row = JSON.parse(line) as ReportRecord;
        if (row.targetType !== "listing") return true;
        const tid = normalizeListingId((row.targetId ?? "").trim());
        if (!tid) return true;
        if (validListingIds.has(tid)) return true;
        removed += 1;
        return false;
      } catch {
        return true;
      }
    });
    if (removed === 0) return 0;
    await writeFile(REPORTS_PATH, next.length ? `${next.join("\n")}\n` : "", "utf8");
    return removed;
  } catch {
    return 0;
  }
}
