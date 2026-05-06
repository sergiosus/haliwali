import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getPool, usesPostgres } from "./pgPool";
import { normalizeEmail } from "./identity";
import { readUsersDb, updateUserPasswordHashPersist } from "./serverUsersStore";
import { sendMail } from "./serverMail";
import { siteUrl } from "./siteUrl";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");
const JSON_TOKENS_PATH = path.join(DATA_DIR, "password-reset-tokens.json");

export type PasswordResetTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

type JsonDb = { tokens: PasswordResetTokenRow[] };

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawResetToken(): string {
  // 32 bytes -> 64 hex chars
  return randomBytes(32).toString("hex");
}

export function tokenHashFromRaw(rawToken: string): string {
  return sha256Hex(rawToken.trim());
}

async function jsonReadTokens(): Promise<JsonDb> {
  assertFileStoreNotUsedInProduction("serverPasswordReset.jsonReadTokens", { path: JSON_TOKENS_PATH });
  try {
    const raw = await readFile(JSON_TOKENS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { tokens: [] };
    const t = (parsed as { tokens?: unknown }).tokens;
    if (!Array.isArray(t)) return { tokens: [] };
    return { tokens: t as PasswordResetTokenRow[] };
  } catch {
    return { tokens: [] };
  }
}

async function jsonWriteTokens(db: JsonDb): Promise<void> {
  assertFileStoreNotUsedInProduction("serverPasswordReset.jsonWriteTokens", { path: JSON_TOKENS_PATH });
  await writeFile(JSON_TOKENS_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function createPasswordResetIfUserExists(args: {
  email: string;
  expiresInMs: number;
}): Promise<{ ok: true } | { ok: true; debugLink?: string }> {
  const email = normalizeEmail(args.email);
  if (!email) return { ok: true };

  await mkdir(DATA_DIR, { recursive: true });

  const rawToken = generateRawResetToken();
  const tokenHash = tokenHashFromRaw(rawToken);
  const now = Date.now();
  const expiresAt = now + Math.max(1, args.expiresInMs);

  let userId = "";

  if (usesPostgres()) {
    const { rows } = await getPool().query<{ user_id: string }>(
      `SELECT user_id FROM users WHERE email = $1 AND email <> '' LIMIT 1`,
      [email],
    );
    userId = (rows[0]?.user_id ?? "").trim();
    if (!userId) return { ok: true };

    const id = randomUUID();
    await getPool().query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, tokenHash, expiresAt, now],
    );
  } else {
    // Development-only JSON user storage: still support reset locally.
    const db = await readUsersDb(USERS_PATH);
    userId = (db.emailIndex[email] ?? "").trim();
    if (!userId) return { ok: true };
    const j = await jsonReadTokens();
    j.tokens = (j.tokens ?? []).filter((t) => now < (t.expiresAt ?? 0));
    j.tokens.push({ id: randomUUID(), userId, tokenHash, expiresAt, createdAt: now });
    await jsonWriteTokens(j);
  }

  const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

  try {
    await sendMail({
      to: email,
      subject: "Сброс пароля",
      text:
        `Вы запросили сброс пароля.\n\n` +
        `Откройте ссылку, чтобы задать новый пароль (действует ограниченное время):\n${link}\n\n` +
        `Если вы не запрашивали сброс — просто проигнорируйте это письмо.`,
    });
  } catch (e) {
    // Never log raw tokens.
    console.error("[password reset] failed to send email", { email, err: e instanceof Error ? e.message : String(e) });
    // Best-effort cleanup: don't leave an unused token around if email delivery failed.
    try {
      if (usesPostgres()) {
        await getPool().query(`DELETE FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash]);
      } else {
        const j = await jsonReadTokens();
        j.tokens = (j.tokens ?? []).filter((t) => t.tokenHash !== tokenHash);
        await jsonWriteTokens(j);
      }
    } catch {
      /* ignore */
    }
  }

  if (process.env.NODE_ENV !== "production") {
    return { ok: true, debugLink: link };
  }
  return { ok: true };
}

export async function consumePasswordResetToken(args: {
  rawToken: string;
  newPasswordHash: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: "BAD_TOKEN" | "EXPIRED" | "BAD_INPUT" | "NOT_FOUND" }
> {
  const rawToken = (args.rawToken ?? "").trim();
  const newHash = (args.newPasswordHash ?? "").trim();
  if (!rawToken || !newHash) return { ok: false, error: "BAD_INPUT" };

  await mkdir(DATA_DIR, { recursive: true });

  const now = Date.now();
  const tokenHash = tokenHashFromRaw(rawToken);

  let userId = "";

  if (usesPostgres()) {
    const { rows } = await getPool().query<{ user_id: string; expires_at: string }>(
      `SELECT user_id, expires_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const r = rows[0];
    if (!r) return { ok: false, error: "BAD_TOKEN" };
    const expiresAt = Number(r.expires_at);
    if (!Number.isFinite(expiresAt) || now > expiresAt) {
      await getPool().query(`DELETE FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash]);
      return { ok: false, error: "EXPIRED" };
    }
    userId = (r.user_id ?? "").trim();
    if (!userId) return { ok: false, error: "NOT_FOUND" };
    await updateUserPasswordHashPersist(USERS_PATH, userId, newHash);
    await getPool().query(`DELETE FROM password_reset_tokens WHERE token_hash = $1`, [tokenHash]);
    return { ok: true };
  }

  const j = await jsonReadTokens();
  const row = (j.tokens ?? []).find((t) => (t.tokenHash ?? "") === tokenHash) ?? null;
  if (!row) return { ok: false, error: "BAD_TOKEN" };
  if (!Number.isFinite(row.expiresAt) || now > row.expiresAt) {
    j.tokens = (j.tokens ?? []).filter((t) => t.tokenHash !== tokenHash);
    await jsonWriteTokens(j);
    return { ok: false, error: "EXPIRED" };
  }
  userId = (row.userId ?? "").trim();
  if (!userId) return { ok: false, error: "NOT_FOUND" };
  await updateUserPasswordHashPersist(USERS_PATH, userId, newHash);
  j.tokens = (j.tokens ?? []).filter((t) => t.tokenHash !== tokenHash);
  await jsonWriteTokens(j);
  return { ok: true };
}

