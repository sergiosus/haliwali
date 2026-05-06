import { appendFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

type AttemptsMap = Record<string, number[]>;

export function extractIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return fwd || real || "unknown";
}

export async function checkIpRateLimit(opts: {
  path: string;
  ip: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: boolean; count: number }> {
  if (usesPostgres()) {
    const pool = getPool();
    const scope = deriveScopeFromPath(opts.path);
    return await checkScopedRateLimitPg(pool, { scope, key: opts.ip, limit: opts.limit, windowMs: opts.windowMs });
  }

  assertFileStoreNotUsedInProduction("serverAbuse.checkIpRateLimit", { path: opts.path });
  const map = await readJson<AttemptsMap>(opts.path, {});
  const now = Date.now();
  const list = (map[opts.ip] ?? []).filter((ts) => now - ts < opts.windowMs);
  if (list.length >= opts.limit) {
    map[opts.ip] = list;
    await writeJson(opts.path, map);
    return { ok: false, count: list.length };
  }
  list.push(now);
  map[opts.ip] = list;
  await writeJson(opts.path, map);
  return { ok: true, count: list.length };
}

export async function logSuspicious(path: string, payload: Record<string, unknown>) {
  const safe = redactPayload(payload);
  if (usesPostgres()) {
    const pool = getPool();
    const now = Date.now();
    const scope = deriveScopeFromPath(path);
    const key =
      (typeof safe.ip === "string" && safe.ip.trim()) ? safe.ip.trim() :
      (typeof safe.value === "string" && safe.value.trim()) ? safe.value.trim() :
      "unknown";
    const eventType = (typeof safe.type === "string" && safe.type.trim()) ? safe.type.trim() : "suspicious";
    await pool.query(
      "INSERT INTO abuse_events(scope, key, event_type, payload_json, created_at) VALUES($1,$2,$3,$4,$5)",
      [scope, key, eventType, JSON.stringify({ ts: now, ...safe }), new Date(now)],
    );
    return;
  }

  assertFileStoreNotUsedInProduction("serverAbuse.logSuspicious", { path });
  const line = JSON.stringify({ ts: Date.now(), ...safe }) + "\n";
  await appendFile(path, line, "utf8");
}

function redactPayload(payload: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...payload };
  for (const key of ["value", "email", "phone"]) {
    const v = out[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = maskIdentifier(v);
    }
  }
  return out;
}

function maskIdentifier(raw: string) {
  const v = raw.trim();
  if (v.includes("@")) {
    const [user, domain] = v.split("@");
    const u = (user ?? "").slice(0, 1);
    return `${u}***@${domain ?? ""}`;
  }
  const digits = v.replace(/[^\d+]/g, "");
  if (digits.length >= 8) {
    const tail = digits.replace(/[^\d]/g, "").slice(-4);
    const head = digits.startsWith("+") ? `+${digits.replace(/[^\d]/g, "").slice(0, 4)}` : digits.replace(/[^\d]/g, "").slice(0, 4);
    return `${head}****${tail}`;
  }
  // Fallback: salted hash so we can correlate without storing raw.
  const salt = process.env.ABUSE_LOG_SALT ?? "haliwali-abuse-log-salt";
  return createHash("sha256").update(`${salt}:${v}`).digest("hex").slice(0, 16);
}

export function captchaIsEnabled(): boolean {
  return process.env.CAPTCHA_ENABLED === "1";
}

export function captchaPasses(token?: string): boolean {
  // Placeholder toggle; can be replaced by provider verification later.
  if (!captchaIsEnabled()) return true;
  return (token ?? "").trim() === "pass";
}

export async function checkIdentifierRateLimit(opts: {
  /** Rate-limit scope name, e.g. "registration_identifier". */
  scope: string;
  /** Identifier key, e.g. email or phone (already normalized). */
  identifier: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: boolean; count: number }> {
  if (usesPostgres()) {
    const pool = getPool();
    return await checkScopedRateLimitPg(pool, { scope: opts.scope, key: opts.identifier, limit: opts.limit, windowMs: opts.windowMs });
  }

  assertFileStoreNotUsedInProduction("serverAbuse.checkIdentifierRateLimit(devFallback)");
  // In dev without Postgres we keep the route-local behavior; callers should not rely on this in production.
  return { ok: true, count: 0 };
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(p: string, data: T) {
  await writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

function deriveScopeFromPath(p: string) {
  const norm = (p ?? "").replaceAll("\\", "/");
  const base = norm.split("/").pop() || norm || "unknown";
  return `file:${base.toLowerCase()}`;
}

async function checkScopedRateLimitPg(
  pool: ReturnType<typeof getPool>,
  opts: { scope: string; key: string; limit: number; windowMs: number },
): Promise<{ ok: boolean; count: number }> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const cutoffMs = nowMs - opts.windowMs;
  const compositeKey = `${opts.scope}:${opts.key}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{
      attempts: number;
      first_attempt_at: Date;
      last_attempt_at: Date;
      blocked_until: Date | null;
    }>(
      "SELECT attempts, first_attempt_at, last_attempt_at, blocked_until FROM abuse_rate_limits WHERE key=$1 AND scope=$2 FOR UPDATE",
      [compositeKey, opts.scope],
    );

    if (existing.rowCount === 0) {
      await client.query(
        "INSERT INTO abuse_rate_limits(key, scope, attempts, first_attempt_at, last_attempt_at, blocked_until) VALUES($1,$2,$3,$4,$4,NULL)",
        [compositeKey, opts.scope, 1, now],
      );
      await client.query("COMMIT");
      return { ok: true, count: 1 };
    }

    const row = existing.rows[0]!;
    if (row.blocked_until && row.blocked_until.getTime() > nowMs) {
      await client.query("COMMIT");
      return { ok: false, count: row.attempts };
    }

    const reset = row.first_attempt_at.getTime() < cutoffMs;
    const nextAttempts = reset ? 1 : row.attempts + 1;
    const nextFirst = reset ? now : row.first_attempt_at;

    if (!reset && nextAttempts > opts.limit) {
      // Deny without increasing attempts (mirrors file logic: check before push).
      await client.query("UPDATE abuse_rate_limits SET last_attempt_at=$3 WHERE key=$1 AND scope=$2", [compositeKey, opts.scope, now]);
      await client.query("COMMIT");
      return { ok: false, count: row.attempts };
    }

    await client.query(
      "UPDATE abuse_rate_limits SET attempts=$3, first_attempt_at=$4, last_attempt_at=$5, blocked_until=NULL WHERE key=$1 AND scope=$2",
      [compositeKey, opts.scope, nextAttempts, nextFirst, now],
    );
    await client.query("COMMIT");
    return { ok: true, count: nextAttempts };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("abuse_rate_limit_unavailable");
  } finally {
    client.release();
  }
}

