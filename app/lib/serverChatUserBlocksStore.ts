import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";
import { getPool, usesPostgres } from "./pgPool";

const BLOCKS_PATH = path.join(process.cwd(), ".data", "chat-user-blocks.json");

type BlockRow = { blockerUserId: string; blockedUserId: string; createdAt: number };
type BlockDb = { blocks: BlockRow[] };

function normalizePair(blocker: string, blocked: string): { blocker: string; blocked: string } | null {
  const blockerUserId = (blocker ?? "").trim();
  const blockedUserId = (blocked ?? "").trim();
  if (!blockerUserId || !blockedUserId) return null;
  if (blockerUserId === blockedUserId) return null;
  return { blocker: blockerUserId, blocked: blockedUserId };
}

async function readDb(): Promise<BlockDb> {
  assertFileStoreNotUsedInProduction("serverChatUserBlocksStore.readDb", { path: BLOCKS_PATH });
  try {
    const raw = await readFile(BLOCKS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { blocks: [] };
    const blocksRaw = (parsed as { blocks?: unknown }).blocks;
    if (!Array.isArray(blocksRaw)) return { blocks: [] };
    const blocks: BlockRow[] = [];
    for (const row of blocksRaw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const blockerUserId = typeof r.blockerUserId === "string" ? r.blockerUserId.trim() : "";
      const blockedUserId = typeof r.blockedUserId === "string" ? r.blockedUserId.trim() : "";
      const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
      if (!blockerUserId || !blockedUserId || blockerUserId === blockedUserId) continue;
      blocks.push({ blockerUserId, blockedUserId, createdAt });
    }
    return { blocks };
  } catch {
    return { blocks: [] };
  }
}

async function writeDb(db: BlockDb): Promise<void> {
  assertFileStoreNotUsedInProduction("serverChatUserBlocksStore.writeDb", { path: BLOCKS_PATH });
  await mkdir(path.dirname(BLOCKS_PATH), { recursive: true });
  await writeFile(BLOCKS_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function hasUserBlockedPeer(blockerUserId: string, peerUserId: string): Promise<boolean> {
  const pair = normalizePair(blockerUserId, peerUserId);
  if (!pair) return false;
  if (usesPostgres()) {
    const { rows } = await getPool().query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM chat_user_blocks
       WHERE blocker_user_id = $1 AND blocked_user_id = $2
       LIMIT 1`,
      [pair.blocker, pair.blocked],
    );
    return rows.length > 0;
  }
  const db = await readDb();
  return db.blocks.some((row) => row.blockerUserId === pair.blocker && row.blockedUserId === pair.blocked);
}

export async function isChatBlockedBetweenUsers(userA: string, userB: string): Promise<boolean> {
  const a = (userA ?? "").trim();
  const b = (userB ?? "").trim();
  if (!a || !b || a === b) return false;
  if (usesPostgres()) {
    const { rows } = await getPool().query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM chat_user_blocks
       WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
          OR (blocker_user_id = $2 AND blocked_user_id = $1)
       LIMIT 1`,
      [a, b],
    );
    return rows.length > 0;
  }
  const db = await readDb();
  return db.blocks.some(
    (row) =>
      (row.blockerUserId === a && row.blockedUserId === b) || (row.blockerUserId === b && row.blockedUserId === a),
  );
}

export async function setUserBlockedPeer(
  blockerUserId: string,
  peerUserId: string,
  blocked: boolean,
): Promise<"ok" | "self" | "invalid"> {
  const pair = normalizePair(blockerUserId, peerUserId);
  if (!pair) {
    if ((blockerUserId ?? "").trim() && (blockerUserId ?? "").trim() === (peerUserId ?? "").trim()) return "self";
    return "invalid";
  }

  if (usesPostgres()) {
    if (blocked) {
      const now = Date.now();
      await getPool().query(
        `INSERT INTO chat_user_blocks (blocker_user_id, blocked_user_id, created_at)
         VALUES ($1, $2, to_timestamp($3 / 1000.0))
         ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING`,
        [pair.blocker, pair.blocked, now],
      );
    } else {
      await getPool().query(
        `DELETE FROM chat_user_blocks
         WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
        [pair.blocker, pair.blocked],
      );
    }
    return "ok";
  }

  const db = await readDb();
  const next = db.blocks.filter(
    (row) => !(row.blockerUserId === pair.blocker && row.blockedUserId === pair.blocked),
  );
  if (blocked) {
    next.push({ blockerUserId: pair.blocker, blockedUserId: pair.blocked, createdAt: Date.now() });
  }
  await writeDb({ blocks: next });
  return "ok";
}
