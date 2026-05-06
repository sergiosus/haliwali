import fs from "node:fs";
import fsp from "node:fs/promises";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return UUID_RE.test(String(s ?? "").trim());
}

function safeExt(ext) {
  return String(ext ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
}

loadEnvIfNeeded();
const DATABASE_URL = (process.env.DATABASE_URL ?? "").trim();
if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error("DATABASE_URL missing");
  process.exit(2);
}

const ROOT = path.join(process.cwd(), "uploads_private");
const META_DIR = path.join(ROOT, "meta");
const CHAT_DIR = path.join(ROOT, "chat");

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

let imported = 0;
let skipped = 0;
let errors = 0;

try {
  let files = [];
  try {
    files = await fsp.readdir(META_DIR);
  } catch {
    // eslint-disable-next-line no-console
    console.log("No meta dir found:", META_DIR);
    process.exit(0);
  }

  for (const f of files) {
    const m = /^([0-9a-f-]{36})\.json$/i.exec(f);
    if (!m) {
      skipped++;
      continue;
    }
    const fileId = (m[1] ?? "").trim();
    if (!isUuid(fileId)) {
      skipped++;
      continue;
    }
    const metaPath = path.join(META_DIR, f);
    let parsed;
    try {
      parsed = JSON.parse(await fsp.readFile(metaPath, "utf8"));
    } catch {
      errors++;
      continue;
    }
    if (!parsed || typeof parsed !== "object") {
      skipped++;
      continue;
    }
    const chatId = typeof parsed.chatId === "string" ? parsed.chatId.trim() : "";
    const uploadedBy = typeof parsed.uploadedBy === "string" ? parsed.uploadedBy.trim() : "";
    const ext = safeExt(typeof parsed.ext === "string" ? parsed.ext : "");
    const mime = typeof parsed.mime === "string" ? parsed.mime.trim() : "application/octet-stream";
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    if (!chatId || !uploadedBy || !ext || !createdAt) {
      skipped++;
      continue;
    }

    const storedName = `${fileId}.${ext}`;
    const storagePath = path.resolve(path.join(CHAT_DIR, storedName));

    try {
      await pool.query(
        `INSERT INTO chat_private_files (
          file_id, chat_id, uploaded_by, original_name, stored_name, ext, mime, size_bytes, storage_path, created_at
        ) VALUES ($1,$2,$3,NULL,$4,$5,$6,NULL,$7,$8)
        ON CONFLICT (file_id) DO NOTHING`,
        [fileId, chatId, uploadedBy, storedName, ext, mime, storagePath, createdAt],
      );
      imported++;
    } catch {
      errors++;
    }
  }

  // eslint-disable-next-line no-console
  console.log({ imported, skipped, errors, metaDir: META_DIR });
} finally {
  await pool.end().catch(() => void 0);
}

