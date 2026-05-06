import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertProductionDatabaseUrl, usesPostgres } from "./pgPool";
import { pgSessionDelete, pgSessionDeleteAllForUser, pgSessionGetUserId, pgSessionInsert } from "./serverSessionsPg";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

type SessionRecord = {
  userId: string;
  createdAt: number;
  expiresAt: number;
};

type SessionsDb = Record<string, SessionRecord>;

const DATA_DIR = path.join(process.cwd(), ".data");
const SESSIONS_PATH = path.join(DATA_DIR, "sessions.json");

/**
 * Source of truth for logged-in user identity on the server (opaque session token in cookie).
 * APIs must use `getUserIdFromSessionCookie()` / session DB — never trust `userId`/localStorage
 * or legacy non-HttpOnly hints for authorization.
 */
/** Not `__Host-` — that prefix requires `Secure`, which breaks http://localhost. */
export const USER_SESSION_COOKIE = "haliwali_session";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    /** `lax`: keeps cookies on top-level cross-site GET (e.g. from search/email links). `strict` would drop session on many legitimate entry paths. Pair with `denyIfMutationOriginForbidden` (serverCsrf) on API mutations. */
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

function newToken() {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function readJsonSessions(): Promise<SessionsDb> {
  assertFileStoreNotUsedInProduction("serverSession.readJsonSessions", { path: SESSIONS_PATH });
  try {
    const raw = await readFile(SESSIONS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SessionsDb;
  } catch {
    return {};
  }
}

async function writeJsonSessions(db: SessionsDb) {
  assertFileStoreNotUsedInProduction("serverSession.writeJsonSessions", { path: SESSIONS_PATH });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SESSIONS_PATH, JSON.stringify(db, null, 2), "utf8");
}

export async function createUserSession(userId: string, opts?: { ttlMs?: number }) {
  assertProductionDatabaseUrl();
  const ttlMs = Math.max(60_000, opts?.ttlMs ?? DEFAULT_TTL_MS);
  const now = Date.now();
  const token = newToken();
  const expiresAt = now + ttlMs;

  if (usesPostgres()) {
    await pgSessionInsert(token, userId, now, expiresAt);
  } else {
    const db = await readJsonSessions();
    db[token] = { userId, createdAt: now, expiresAt };
    await writeJsonSessions(db);
  }
  return { token, maxAgeSec: Math.floor(ttlMs / 1000) };
}

export async function destroyUserSession(token: string) {
  assertProductionDatabaseUrl();
  const t = (token ?? "").trim();
  if (!t) return;
  if (usesPostgres()) {
    await pgSessionDelete(t);
    return;
  }
  const db = await readJsonSessions();
  if (db[t]) {
    delete db[t];
    await writeJsonSessions(db);
  }
}

export async function destroyAllSessionsForUser(userId: string) {
  assertProductionDatabaseUrl();
  const id = (userId ?? "").trim();
  if (!id) return;
  if (usesPostgres()) {
    await pgSessionDeleteAllForUser(id);
    return;
  }
  const db = await readJsonSessions();
  let touched = false;
  for (const [tok, rec] of Object.entries(db)) {
    if (rec.userId === id) {
      delete db[tok];
      touched = true;
    }
  }
  if (touched) await writeJsonSessions(db);
}

export async function getUserIdFromSessionCookie(): Promise<string | null> {
  assertProductionDatabaseUrl();
  const jar = await cookies();
  const token = jar.get(USER_SESSION_COOKIE)?.value ?? "";
  if (!token) return null;

  if (usesPostgres()) {
    return pgSessionGetUserId(token);
  }

  const now = Date.now();
  const db = await readJsonSessions();
  const rec = db[token];
  if (!rec) return null;
  if (rec.expiresAt <= now) {
    delete db[token];
    await writeJsonSessions(db);
    return null;
  }
  return rec.userId;
}

export async function setUserSessionCookie(res: NextResponse, token: string, maxAgeSec: number) {
  res.cookies.set(USER_SESSION_COOKIE, token, cookieOptions(maxAgeSec));
}

export function clearUserSessionCookie(res: NextResponse) {
  res.cookies.set(USER_SESSION_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

/** Server Actions / RSC: revoke DB/file session and clear the httpOnly user cookie. */
export async function invalidateCurrentUserSessionCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(USER_SESSION_COOKIE)?.value ?? "";
  if (token) await destroyUserSession(token);
  jar.set(USER_SESSION_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}
