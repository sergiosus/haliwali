import fs from "node:fs";
import path from "node:path";
import pgPkg from "pg";

const { Pool } = pgPkg;

function parseDotenv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (!k) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function loadEnvIfNeeded() {
  if ((process.env.DATABASE_URL ?? "").trim()) return;
  const root = process.cwd();
  for (const f of [".env.local", ".env.production", ".env"]) {
    const p = path.join(root, f);
    try {
      if (!fs.existsSync(p)) continue;
      const parsed = parseDotenv(fs.readFileSync(p, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k]) process.env[k] = String(v ?? "");
      }
    } catch {
      // ignore
    }
  }
}

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const REPLY_STATS_PATH = path.join(DATA_DIR, "reply-stats.json");
const LISTING_VIEWS_PATH = path.join(DATA_DIR, "listing-views.json");
const VIEW_DEDUP_PATH = path.join(DATA_DIR, "listing-view-dedup.json");
const REPORTS_PATH = path.join(DATA_DIR, "reports.jsonl");

const VIEW_DEDUP_MS = 30 * 60 * 1000;

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

let importedReply = 0;
let skippedReply = 0;
let replyErrors = 0;

let importedViews = 0;
let skippedViews = 0;
let viewErrors = 0;

let importedDedup = 0;
let skippedDedup = 0;
let dedupErrors = 0;

let importedReports = 0;
let skippedReports = 0;
let reportErrors = 0;

function safeJsonRead(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

try {
  // reply-stats.json schema: { [userId]: { count:number, sumMs:number } }
  const reply = safeJsonRead(REPLY_STATS_PATH);
  if (reply && typeof reply === "object") {
    for (const [keyRaw, row] of Object.entries(reply)) {
      const key = String(keyRaw ?? "").trim();
      if (!key || !row || typeof row !== "object") {
        skippedReply++;
        continue;
      }
      const count = typeof row.count === "number" ? row.count : 0;
      const sumMs = typeof row.sumMs === "number" ? row.sumMs : 0;
      const c = Number(count);
      const s = Number(sumMs);
      if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(s) || s < 0) {
        skippedReply++;
        continue;
      }
      try {
        await pool.query(
          `INSERT INTO reply_stats (key, user_id, listing_id, replies_count, sum_ms, updated_at)
           VALUES ($1, $2, NULL, $3, $4, now())
           ON CONFLICT (key) DO UPDATE SET
             replies_count = EXCLUDED.replies_count,
             sum_ms = EXCLUDED.sum_ms,
             updated_at = now()`,
          [key, key, Math.floor(c), Math.floor(s)],
        );
        importedReply++;
      } catch {
        replyErrors++;
      }
    }
  }

  // listing-views.json schema: { [listingId]: number }
  const views = safeJsonRead(LISTING_VIEWS_PATH);
  if (views && typeof views === "object") {
    for (const [listingIdRaw, nRaw] of Object.entries(views)) {
      const listingId = String(listingIdRaw ?? "").trim();
      const n = Number(nRaw);
      if (!listingId || !Number.isFinite(n) || n < 0) {
        skippedViews++;
        continue;
      }
      try {
        await pool.query(
          `INSERT INTO listing_views (listing_id, views_count, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (listing_id) DO UPDATE SET
             views_count = EXCLUDED.views_count,
             updated_at = now()`,
          [listingId, Math.floor(n)],
        );
        importedViews++;
      } catch {
        viewErrors++;
      }
    }
  }

  // listing-view-dedup.json schema: { [viewerKey]: { [listingId]: timestampMs } }
  const dedup = safeJsonRead(VIEW_DEDUP_PATH);
  const now = Date.now();
  if (dedup && typeof dedup === "object") {
    for (const [viewerKeyRaw, map] of Object.entries(dedup)) {
      const viewerKey = String(viewerKeyRaw ?? "").trim();
      if (!viewerKey || !map || typeof map !== "object") {
        skippedDedup++;
        continue;
      }
      for (const [listingIdRaw, tsRaw] of Object.entries(map)) {
        const listingId = String(listingIdRaw ?? "").trim();
        const ts = Number(tsRaw);
        if (!listingId || !Number.isFinite(ts) || ts <= 0) {
          skippedDedup++;
          continue;
        }
        // skip expired dedup entries
        if (now - ts >= VIEW_DEDUP_MS) {
          skippedDedup++;
          continue;
        }
        const dedupKey = `${viewerKey}\0${listingId}`;
        const expiresAt = ts + VIEW_DEDUP_MS;
        try {
          await pool.query(
            `INSERT INTO listing_view_dedup (dedup_key, listing_id, viewer_key, created_at, expires_at)
             VALUES ($1,$2,$3,to_timestamp($4 / 1000.0),to_timestamp($5 / 1000.0))
             ON CONFLICT (dedup_key) DO UPDATE SET
               listing_id = EXCLUDED.listing_id,
               viewer_key = EXCLUDED.viewer_key,
               created_at = EXCLUDED.created_at,
               expires_at = EXCLUDED.expires_at`,
            [dedupKey, listingId, viewerKey, ts, expiresAt],
          );
          importedDedup++;
        } catch {
          dedupErrors++;
        }
      }
    }
  }

  // reports.jsonl fallback (if present): each line is a ReportRecord JSON
  if (fs.existsSync(REPORTS_PATH)) {
    let raw = "";
    try {
      raw = fs.readFileSync(REPORTS_PATH, "utf8");
    } catch {
      raw = "";
    }
    const lines = raw.split("\n").filter(Boolean);
    for (const line of lines) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        skippedReports++;
        continue;
      }
      if (!r || typeof r !== "object") {
        skippedReports++;
        continue;
      }
      const id = typeof r.id === "string" ? r.id.trim() : "";
      const reporterId = typeof r.reporterId === "string" ? r.reporterId.trim() : "";
      const targetType = r.targetType === "listing" ? "listing" : r.targetType === "user" ? "user" : "";
      const targetId = typeof r.targetId === "string" ? r.targetId.trim() : "";
      const reason = typeof r.reason === "string" ? r.reason : "";
      const comment = typeof r.comment === "string" ? r.comment : "";
      const createdAt = typeof r.createdAt === "number" ? r.createdAt : 0;
      const dismissed = r.dismissed === true;
      if (!id || !reporterId || !targetType || !targetId || !Number.isFinite(createdAt) || createdAt <= 0) {
        skippedReports++;
        continue;
      }
      try {
        await pool.query(
          `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, comment, created_at, dismissed)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [id, reporterId, targetType, targetId, reason, comment, createdAt, dismissed],
        );
        importedReports++;
      } catch {
        reportErrors++;
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log({
    replyStats: { imported: importedReply, skipped: skippedReply, errors: replyErrors, path: REPLY_STATS_PATH },
    listingViews: { imported: importedViews, skipped: skippedViews, errors: viewErrors, path: LISTING_VIEWS_PATH },
    viewDedup: { imported: importedDedup, skipped: skippedDedup, errors: dedupErrors, path: VIEW_DEDUP_PATH },
    reports: { imported: importedReports, skipped: skippedReports, errors: reportErrors, path: REPORTS_PATH },
  });
} finally {
  await pool.end().catch(() => void 0);
}

