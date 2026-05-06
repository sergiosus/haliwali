/**
 * Idempotent migration:
 * - `.data/support-tickets.json` → PostgreSQL `support_tickets` + `support_messages`
 * - `.data/reports.jsonl` → PostgreSQL `reports`
 *
 * Safe to run multiple times. Does NOT delete/modify source `.data` files.
 *
 * Requirements:
 * - `psql` available in PATH
 * - `DATABASE_URL` set OR set `PG*` env vars recognized by `psql`
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data");

const SUPPORT_PATH = path.join(DATA_DIR, "support-tickets.json");
const REPORTS_PATH = path.join(DATA_DIR, "reports.jsonl");

function q(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function toBigint(n, fb = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fb;
}

async function readSupportTickets() {
  try {
    const raw = await fs.readFile(SUPPORT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const tickets = Array.isArray(parsed?.tickets) ? parsed.tickets : [];
    return tickets;
  } catch {
    return [];
  }
}

async function readReportsJsonl() {
  try {
    const raw = await fs.readFile(REPORTS_PATH, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // skip bad line
      }
    }
    return out;
  } catch {
    return [];
  }
}

function buildSql({ tickets, reports }) {
  const parts = [];
  parts.push("BEGIN;");

  // Support tickets + messages.
  for (const t of tickets) {
    if (!t || typeof t !== "object") continue;
    const id = typeof t.id === "string" ? t.id.trim() : "";
    const userId = typeof t.userId === "string" ? t.userId.trim() : "";
    const category = typeof t.category === "string" ? t.category : "";
    const subject = typeof t.subject === "string" ? t.subject : "";
    const status = typeof t.status === "string" ? t.status : "open";
    const createdAt = toBigint(t.createdAt, Date.now());
    const updatedAt = toBigint(t.updatedAt, createdAt);
    const listingId = typeof t.listingId === "string" && t.listingId.trim() ? t.listingId.trim() : null;
    const listingTitle = typeof t.listingTitle === "string" && t.listingTitle.trim() ? t.listingTitle.trim() : null;

    if (!id || !userId || !category) continue;

    parts.push(
      `INSERT INTO support_tickets (id, user_id, category, subject, status, created_at, updated_at, listing_id, listing_title)
VALUES ('${q(id)}','${q(userId)}','${q(category)}','${q(subject)}','${q(status)}',${createdAt},${updatedAt},${
        listingId ? `'${q(listingId)}'` : "NULL"
      },${listingTitle ? `'${q(listingTitle)}'` : "NULL"})
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  category = EXCLUDED.category,
  subject = EXCLUDED.subject,
  status = EXCLUDED.status,
  updated_at = GREATEST(support_tickets.updated_at, EXCLUDED.updated_at),
  listing_id = EXCLUDED.listing_id,
  listing_title = EXCLUDED.listing_title;`,
    );

    const msgs = Array.isArray(t.messages) ? t.messages : [];
    for (const m of msgs) {
      if (!m || typeof m !== "object") continue;
      const mid = typeof m.id === "string" ? m.id.trim() : "";
      const role = typeof m.role === "string" ? m.role : "user";
      const senderType = typeof m.senderType === "string" ? m.senderType : null;
      const text = typeof m.text === "string" ? m.text : "";
      const created = toBigint(m.createdAt, createdAt);
      if (!mid) continue;
      parts.push(
        `INSERT INTO support_messages (id, ticket_id, role, sender_type, text, created_at)
VALUES ('${q(mid)}','${q(id)}','${q(role)}',${senderType ? `'${q(senderType)}'` : "NULL"},'${q(text)}',${created})
ON CONFLICT (id) DO UPDATE SET
  ticket_id = EXCLUDED.ticket_id,
  role = EXCLUDED.role,
  sender_type = EXCLUDED.sender_type,
  text = EXCLUDED.text,
  created_at = LEAST(support_messages.created_at, EXCLUDED.created_at);`,
      );
    }
  }

  // Reports (complaints).
  for (const r of reports) {
    if (!r || typeof r !== "object") continue;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const reporterId = typeof r.reporterId === "string" ? r.reporterId.trim() : "";
    const targetType = typeof r.targetType === "string" ? r.targetType : "";
    const targetId = typeof r.targetId === "string" ? r.targetId.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason : "";
    const comment = typeof r.comment === "string" ? r.comment : "";
    const createdAt = toBigint(r.createdAt, Date.now());
    const dismissed = r.dismissed === true;
    if (!id || !reporterId || !targetType || !targetId) continue;
    parts.push(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, comment, created_at, dismissed)
VALUES ('${q(id)}','${q(reporterId)}','${q(targetType)}','${q(targetId)}','${q(reason)}','${q(comment)}',${createdAt},${
        dismissed ? "TRUE" : "FALSE"
      })
ON CONFLICT (id) DO UPDATE SET
  reporter_id = EXCLUDED.reporter_id,
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  reason = EXCLUDED.reason,
  comment = EXCLUDED.comment,
  created_at = LEAST(reports.created_at, EXCLUDED.created_at),
  dismissed = (reports.dismissed OR EXCLUDED.dismissed);`,
    );
  }

  parts.push("COMMIT;");
  return parts.join("\n");
}

function runPsql(sqlText) {
  const tmpDir = path.join(os.tmpdir(), "haliwali-migrate");
  const tmpPath = path.join(tmpDir, `support-reports-${Date.now()}.sql`);
  return fs
    .mkdir(tmpDir, { recursive: true })
    .then(() => fs.writeFile(tmpPath, sqlText, "utf8"))
    .then(() => {
      const args = ["-v", "ON_ERROR_STOP=1", "-f", tmpPath];
      const res = spawnSync("psql", args, { stdio: "inherit", env: process.env });
      if (res.status !== 0) {
        throw new Error(`psql failed (exit ${res.status ?? "unknown"})`);
      }
    });
}

async function main() {
  const [tickets, reports] = await Promise.all([readSupportTickets(), readReportsJsonl()]);
  console.log(`[migrate] tickets=${tickets.length} reports=${reports.length}`);
  const sql = buildSql({ tickets, reports });
  if (!sql.trim()) {
    console.log("[migrate] nothing to do");
    return;
  }
  await runPsql(sql);
  console.log("[migrate] done");
}

main().catch((e) => {
  console.error("[migrate] error", e);
  process.exit(1);
});

