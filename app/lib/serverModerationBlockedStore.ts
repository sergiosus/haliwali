import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import { getPool, usesPostgres } from "./pgPool";

const BLOCKS_PATH = path.join(process.cwd(), ".data", "admin-user-blocks.json");

type BlockEntry = { blockedAt: number };
type BlockDb = Record<string, BlockEntry>;

async function readDb(): Promise<BlockDb> {
  assertFileStoreNotUsedInProduction("serverModerationBlockedStore.readDb", { path: BLOCKS_PATH });
  try {
    const raw = await readFile(BLOCKS_PATH, "utf8");
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    return p as BlockDb;
  } catch {
    return {};
  }
}

async function writeDb(db: BlockDb): Promise<void> {
  assertFileStoreNotUsedInProduction("serverModerationBlockedStore.writeDb", { path: BLOCKS_PATH });
  await mkdir(path.dirname(BLOCKS_PATH), { recursive: true });
  await writeFile(BLOCKS_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function isUserModerationBlocked(userId: string): Promise<boolean> {
  const id = (userId ?? "").trim();
  if (!id) return false;
  if (usesPostgres()) {
    const { rows } = await getPool().query<{ ok: number }>(
      `SELECT 1 AS ok FROM moderation_user_blocks WHERE user_id = $1 LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  }
  const db = await readDb();
  return id in db;
}

export async function getAllModerationBlockedIds(): Promise<Set<string>> {
  if (usesPostgres()) {
    const { rows } = await getPool().query<{ user_id: string }>(`SELECT user_id FROM moderation_user_blocks`);
    const out = new Set<string>();
    for (const r of rows) {
      const id = (r.user_id ?? "").trim();
      if (id) out.add(id);
    }
    return out;
  }
  const db = await readDb();
  return new Set(Object.keys(db));
}

export async function setUserModerationBlocked(userId: string, blocked: boolean): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;
  if (usesPostgres()) {
    if (blocked) {
      const now = Date.now();
      await getPool().query(
        `INSERT INTO moderation_user_blocks (user_id, reason, blocked_by, created_at)
         VALUES ($1, NULL, NULL, to_timestamp($2 / 1000.0))
         ON CONFLICT (user_id) DO UPDATE SET created_at = EXCLUDED.created_at`,
        [id, now],
      );
    } else {
      await getPool().query(`DELETE FROM moderation_user_blocks WHERE user_id = $1`, [id]);
    }
    return;
  }
  const db = await readDb();
  if (blocked) {
    db[id] = { blockedAt: Date.now() };
  } else {
    delete db[id];
  }
  await writeDb(db);
}

export async function moderationBlockedAt(userId: string): Promise<number | undefined> {
  const id = (userId ?? "").trim();
  if (!id) return undefined;
  if (usesPostgres()) {
    const { rows } = await getPool().query<{ blocked_at_ms: number }>(
      `SELECT (extract(epoch from created_at) * 1000)::bigint AS blocked_at_ms
       FROM moderation_user_blocks
       WHERE user_id = $1
       LIMIT 1`,
      [id],
    );
    const v = rows[0]?.blocked_at_ms;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const db = await readDb();
  return db[id]?.blockedAt;
}
