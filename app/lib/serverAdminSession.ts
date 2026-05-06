import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDebugAuthServer } from "./debugAuth";
import { getPool, usesPostgres } from "./pgPool";
import { pgFetchUserAdminPrivileges, type PgUserAdminRow } from "./serverUsersPg";
import { getUserIdFromSessionCookie } from "./serverSession";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

type AdminSession = { createdAt: number; expiresAt: number };
type AdminDb = Record<string, AdminSession>;
type RateDb = Record<string, number[]>;

const DATA_DIR = path.join(process.cwd(), ".data");
const SESSIONS_PATH = path.join(DATA_DIR, "admin-sessions.json");
const RATE_PATH = path.join(DATA_DIR, "admin-login-rate.json");
// TODO: migrate to PostgreSQL before production VPS launch.

/**
 * Dedicated admin session — **never** the same cookie as normal users (`haliwali_session`).
 */
export const ADMIN_SESSION_COOKIE = "admin_session";

/** Older cookies: still read + cleared on logout for migration. */
export const ADMIN_SESSION_COOKIE_LEGACY_HALIWALI = "haliwali_admin_session";
export const ADMIN_SESSION_COOKIE_LEGACY_HOST = "__Host-haliwali_admin_session";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    /** Same rationale as user session cookie: `lax` for entry flows; CSRF mitigated on mutating API routes. */
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

function devAdminLog(event: string, payload: Record<string, unknown>) {
  if (!isDebugAuthServer()) return;
  console.log(event, payload);
}

function newToken() {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(p: string, data: T) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

function extractIpFromHeaders(h: Headers): string {
  const xf = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  if (xf) return xf;
  const xr = h.get("x-real-ip")?.trim();
  if (xr) return xr;
  return "unknown";
}

async function jsonClearRateForIp(ip: string): Promise<void> {
  assertFileStoreNotUsedInProduction("serverAdminSession.jsonClearRateForIp", { path: RATE_PATH });
  const rate = await readJson<RateDb>(RATE_PATH, {});
  if (rate[ip]?.length) {
    delete rate[ip];
    await writeJson(RATE_PATH, rate);
  }
}

async function pgClearRateForKey(key: string): Promise<void> {
  await getPool().query(`DELETE FROM admin_login_rate_limits WHERE key = $1`, [key]);
}

export async function adminRateLimitOk(): Promise<boolean> {
  const h = await headers();
  const ip = extractIpFromHeaders(h);
  const now = Date.now();

  if (usesPostgres()) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query<{
        attempts: number;
        first_attempt_at_ms: number;
        blocked_until_ms: number | null;
      }>(
        `SELECT
           attempts,
           (extract(epoch from first_attempt_at) * 1000)::bigint AS first_attempt_at_ms,
           CASE WHEN blocked_until IS NULL THEN NULL ELSE (extract(epoch from blocked_until) * 1000)::bigint END AS blocked_until_ms
         FROM admin_login_rate_limits
         WHERE key = $1
         FOR UPDATE`,
        [ip],
      );

      let attempts = 0;
      let firstAttemptAt = now;
      let blockedUntil: number | null = null;

      if (rows[0]) {
        attempts = Number(rows[0].attempts) || 0;
        const fa = Number(rows[0].first_attempt_at_ms);
        firstAttemptAt = Number.isFinite(fa) && fa > 0 ? fa : now;
        const bu = rows[0].blocked_until_ms;
        blockedUntil = bu == null ? null : Number(bu);
      }

      // Window semantics match the JSON implementation: keep only attempts within RATE_WINDOW_MS
      // by resetting the window start when it expires.
      if (now - firstAttemptAt >= RATE_WINDOW_MS) {
        attempts = 0;
        firstAttemptAt = now;
        blockedUntil = null;
      }

      attempts += 1;
      const lastAttemptAt = now;
      const windowEnd = firstAttemptAt + RATE_WINDOW_MS;
      const nextBlockedUntil = attempts > RATE_MAX ? windowEnd : blockedUntil;

      await client.query(
        `INSERT INTO admin_login_rate_limits (key, attempts, first_attempt_at, last_attempt_at, blocked_until)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5)
         ON CONFLICT (key) DO UPDATE SET
           attempts = EXCLUDED.attempts,
           first_attempt_at = EXCLUDED.first_attempt_at,
           last_attempt_at = EXCLUDED.last_attempt_at,
           blocked_until = EXCLUDED.blocked_until`,
        [
          ip,
          attempts,
          firstAttemptAt,
          lastAttemptAt,
          nextBlockedUntil != null ? new Date(nextBlockedUntil) : null,
        ],
      );

      await client.query("COMMIT");
      return attempts <= RATE_MAX;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  assertFileStoreNotUsedInProduction("serverAdminSession.adminRateLimitOk", { path: RATE_PATH });
  const rate = await readJson<RateDb>(RATE_PATH, {});
  const recent = (rate[ip] ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  recent.push(now);
  rate[ip] = recent;
  await writeJson(RATE_PATH, rate);
  return recent.length <= RATE_MAX;
}

export async function createAdminSession() {
  const now = Date.now();
  const token = newToken();
  const expiresAt = now + TTL_MS;

  const h = await headers();
  const ip = extractIpFromHeaders(h);

  if (usesPostgres()) {
    await getPool().query(`DELETE FROM admin_sessions WHERE expires_at < now()`);
    await getPool().query(
      `INSERT INTO admin_sessions (token, admin_id, created_at, expires_at)
       VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))`,
      [token, "admin_password", now, expiresAt],
    );
    // Spec: clear attempts on successful login.
    await pgClearRateForKey(ip);
    return { token, maxAgeSec: Math.floor(TTL_MS / 1000) };
  }

  assertFileStoreNotUsedInProduction("serverAdminSession.createAdminSession", { path: SESSIONS_PATH });
  const db = await readJson<AdminDb>(SESSIONS_PATH, {});
  db[token] = { createdAt: now, expiresAt };
  await writeJson(SESSIONS_PATH, db);
  await jsonClearRateForIp(ip);
  return { token, maxAgeSec: Math.floor(TTL_MS / 1000) };
}

export async function destroyAdminSession(token: string) {
  const t = (token ?? "").trim();
  if (!t) return;
  if (usesPostgres()) {
    await getPool().query(`DELETE FROM admin_sessions WHERE token = $1`, [t]);
    return;
  }
  const db = await readJson<AdminDb>(SESSIONS_PATH, {});
  if (db[t]) {
    delete db[t];
    await writeJson(SESSIONS_PATH, db);
  }
}

function readAdminTokenFromJar(jar: Awaited<ReturnType<typeof cookies>>): string {
  const a = jar.get(ADMIN_SESSION_COOKIE)?.value?.trim() ?? "";
  if (a) return a;
  const b = jar.get(ADMIN_SESSION_COOKIE_LEGACY_HALIWALI)?.value?.trim() ?? "";
  if (b) return b;
  return jar.get(ADMIN_SESSION_COOKIE_LEGACY_HOST)?.value?.trim() ?? "";
}

export async function isAdminAuthed(): Promise<boolean> {
  const jar = await cookies();
  const token = readAdminTokenFromJar(jar);
  const hasAdminCookie = Boolean(token);
  if (!token) {
    return false;
  }
  const now = Date.now();
  if (usesPostgres()) {
    await getPool().query(`DELETE FROM admin_sessions WHERE expires_at < now()`);
    const { rows } = await getPool().query<{ expires_at_ms: number }>(
      `SELECT (extract(epoch from expires_at) * 1000)::bigint AS expires_at_ms
       FROM admin_sessions
       WHERE token = $1
       LIMIT 1`,
      [token],
    );
    const exp = Number(rows[0]?.expires_at_ms);
    const ok = Number.isFinite(exp) && exp > now;
    devAdminLog("[admin-auth] check", { hasAdminCookie, isAdmin: ok });
    return ok;
  }

  const db = await readJson<AdminDb>(SESSIONS_PATH, {});
  const rec = db[token];
  if (!rec) {
    devAdminLog("[admin-auth] check", { hasAdminCookie, isAdmin: false });
    return false;
  }
  if (rec.expiresAt <= now) {
    delete db[token];
    await writeJson(SESSIONS_PATH, db);
    devAdminLog("[admin-auth] check", { hasAdminCookie, isAdmin: false });
    return false;
  }
  devAdminLog("[admin-auth] check", { hasAdminCookie, isAdmin: true });
  return true;
}

function parseHalwaliAdminUserAllowlist(): { active: boolean; ids: Set<string> } {
  const raw = (process.env.HALIWALI_ADMIN_USER_IDS ?? "").trim();
  if (!raw) return { active: false, ids: new Set<string>() };
  const ids = new Set(
    raw
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  );
  return { active: true, ids };
}

/** Unified admin marker: PostgreSQL `is_admin` OR legacy `role = 'admin'` (allowlist is handled separately). */
export function computeUserIsAdmin(user: Partial<PgUserAdminRow> | null | undefined): boolean {
  const isAdmin = user?.is_admin === true;
  const role = typeof user?.role === "string" ? user.role.trim() : "";
  return isAdmin || role === "admin";
}

async function userSessionGrantsAdminPrivileges(uid: string): Promise<boolean> {
  const trimmed = (uid ?? "").trim();
  if (!trimmed) return false;

  const { active, ids } = parseHalwaliAdminUserAllowlist();
  const allowlistConfigured = active && ids.size > 0;
  if (allowlistConfigured && ids.has(trimmed)) {
    if (isDebugAuthServer()) {
      devAdminLog("ADMIN CHECK", { privileged: true, via: "HALIWALI_ADMIN_USER_IDS" });
    }
    return true;
  }

  if (!usesPostgres()) {
    if (isDebugAuthServer()) {
      devAdminLog("ADMIN CHECK", { privileged: false, via: "non-postgres-no-db-flags" });
    }
    return false;
  }

  const row = await pgFetchUserAdminPrivileges(trimmed);
  const isAdmin = computeUserIsAdmin(row);
  if (isDebugAuthServer()) {
    if (row) {
      devAdminLog("ADMIN CHECK", { privileged: isAdmin, via: "postgres", hasDbRow: true });
    } else {
      devAdminLog("ADMIN CHECK", { privileged: false, via: "postgres", note: "no_pg_row" });
    }
  }
  return isAdmin;
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

let legacyDevPasswordOnlyWarned = false;

function maybeWarnDevPasswordOnlyModel() {
  if (legacyDevPasswordOnlyWarned) return;
  if (isProductionEnv()) return;
  if (!isDebugAuthServer()) return;
  legacyDevPasswordOnlyWarned = true;
  console.warn(
    "[admin-auth] Development: HALIWALI_ADMIN_USER_IDS unset — use PostgreSQL users.is_admin/role, or admin_session (ADMIN_PASSWORD). Production: session plus DB admin flags or allowlist; admin_session alone is not enough.",
  );
}

/** Why privileged admin access failed; null means granted. */
export type AdminPrivilegedFailure = "NO_ADMIN_COOKIE" | "NO_USER_SESSION" | "NOT_PRIVILEGED";

/**
 * Privileged admin (APIs, moderation tools):
 *
 * **Production:** requires `haliwali_session` and either `user_id` in `HALIWALI_ADMIN_USER_IDS`,
 * PostgreSQL `users.is_admin`, or legacy `users.role = 'admin'`.
 * Admin password / `admin_session` alone never grants access.
 *
 * **Development:** if `HALIWALI_ADMIN_USER_IDS` is non-empty, same rule as production (session + privilege).
 * If unset/empty, session may grant via PostgreSQL admin flags when `usesPostgres()`; otherwise legacy
 * `admin_session` (after ADMIN_PASSWORD login) remains available.
 */
export async function getAdminPrivilegedFailure(): Promise<AdminPrivilegedFailure | null> {
  const { active, ids } = parseHalwaliAdminUserAllowlist();
  const allowlistConfigured = active && ids.size > 0;

  if (isProductionEnv() || allowlistConfigured) {
    const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
    if (!uid) return "NO_USER_SESSION";
    if (!(await userSessionGrantsAdminPrivileges(uid))) return "NOT_PRIVILEGED";
    return null;
  }

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (uid && usesPostgres() && (await userSessionGrantsAdminPrivileges(uid))) return null;

  maybeWarnDevPasswordOnlyModel();
  if (!(await isAdminAuthed())) return "NO_ADMIN_COOKIE";
  return null;
}

export async function adminPrivilegesActive(): Promise<boolean> {
  return (await getAdminPrivilegedFailure()) === null;
}

export function restDenyPrivilegedAdminResponse(fail: AdminPrivilegedFailure | null): NextResponse | null {
  if (fail === null) return null;
  if (fail === "NO_ADMIN_COOKIE" || fail === "NO_USER_SESSION") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
}

/** Server-rendered /admin: what to show (no UI redesign — composition only). */
export async function getAdminPageView(): Promise<
  "dashboard" | "login_account" | "forbidden" | "password_form"
> {
  const { active, ids } = parseHalwaliAdminUserAllowlist();
  const allowlistConfigured = active && ids.size > 0;

  if (isProductionEnv() || allowlistConfigured) {
    const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
    if (!uid) return "login_account";
    if (!(await userSessionGrantsAdminPrivileges(uid))) return "forbidden";
    return "dashboard";
  }

  const uid = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (uid && usesPostgres() && (await userSessionGrantsAdminPrivileges(uid))) return "dashboard";

  if (await isAdminAuthed()) return "dashboard";
  return "password_form";
}

export async function setAdminCookie(jar: Awaited<ReturnType<typeof cookies>>, token: string, maxAgeSec: number) {
  jar.set(ADMIN_SESSION_COOKIE, token, cookieOptions(maxAgeSec));
}

export async function clearAdminCookie(jar: Awaited<ReturnType<typeof cookies>>) {
  const expire = { ...cookieOptions(0), maxAge: 0 };
  jar.set(ADMIN_SESSION_COOKIE, "", expire);
  jar.set(ADMIN_SESSION_COOKIE_LEGACY_HALIWALI, "", expire);
  jar.set(ADMIN_SESSION_COOKIE_LEGACY_HOST, "", expire);
}

export async function destroyCurrentAdminSessionsFromCookies() {
  const jar = await cookies();
  const t = readAdminTokenFromJar(jar);
  await destroyAdminSession(t);
}
