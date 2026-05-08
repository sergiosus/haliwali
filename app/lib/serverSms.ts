import { createHash, randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { isValidPhone, normalizeEmail, normalizePhone, PHONE_VALIDATION_MESSAGE } from "./identity";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

type VerifyType = "email" | "phone";
type VerificationCodeRecord = {
  value: string;
  type: VerifyType;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  createdAt: number;
};

type RateMap = Record<string, number[]>;
type VerifiedMap = Record<string, { type: VerifyType; verifiedAt: number }>;

const CODE_TTL_MS_EMAIL = 5 * 60 * 1000;
const CODE_TTL_MS_PHONE = 10 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export function otpGenerate6(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpHash(code: string): string {
  return sha256(code);
}

function smtpEnvPresence() {
  return {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
    userPresent: Boolean((process.env.SMTP_USER ?? "").trim()),
    passPresent: Boolean((process.env.SMTP_PASSWORD ?? "").trim()),
    from: process.env.SMTP_FROM,
  };
}

function smtpConfigOrThrow() {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const portRaw = (process.env.SMTP_PORT ?? "").trim();
  const secureRaw = (process.env.SMTP_SECURE ?? "").trim();
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASSWORD ?? "").trim();

  if (!host) throw new Error("SMTP_HOST is not configured");
  const port = Number(portRaw || "587");
  if (!Number.isFinite(port) || port <= 0) throw new Error("SMTP_PORT is invalid");

  const secure =
    secureRaw === "true" || secureRaw === "1"
      ? true
      : secureRaw === "false" || secureRaw === "0" || !secureRaw
        ? false
        : (() => {
            throw new Error("SMTP_SECURE is invalid");
          })();

  if (!user) throw new Error("SMTP_USER is not configured");
  if (!pass) throw new Error("SMTP_PASSWORD is not configured");

  return { host, port, secure, auth: { user, pass } };
}

function smtpFromField(): string {
  const address = (process.env.SMTP_FROM ?? "").trim() || "no-reply@haliwali.local";
  const name = (process.env.SMTP_FROM_NAME ?? "").trim();
  return name ? `${name} <${address}>` : address;
}

function maskEmailForLogs(email: string): string {
  const t = (email ?? "").trim();
  const at = t.indexOf("@");
  if (at < 1) return "***";
  const domain = t.slice(at + 1);
  const first = t.slice(0, 1) || "*";
  return `${first}*@${domain}`;
}

export async function sendVerificationCode(opts: {
  valueRaw: string;
  type: VerifyType;
  codesPath: string;
  ratePath: string;
}) {
  console.log("[OTP_SEND] send start", { channel: opts.type });
  const dev = process.env.NODE_ENV !== "production";
  const value = normalizeByType(opts.valueRaw, opts.type);
  if (opts.type === "email") {
    if (!value)
      return { ok: false as const, error: "Некорректный email или телефон", status: 400 };
  } else if (!value || !isValidPhone(value)) {
    return { ok: false as const, error: PHONE_VALIDATION_MESSAGE, status: 400 };
  }

  const now = Date.now();
  const purpose = `${derivePurpose(opts.codesPath)}:${opts.type}`;
  if (usesPostgres()) {
    const pool = getPool();
    const rateKey = `${purpose}:${value}`;
    const rateOk = await smsRateLimitOkPg(pool, { key: rateKey, nowMs: now, limit: MAX_SENDS_PER_WINDOW, windowMs: RATE_WINDOW_MS });
    if (!rateOk.ok) {
      return { ok: false as const, error: "Слишком много запросов. Попробуйте позже.", status: 429 };
    }

    const last = await findLastActiveCodePg(pool, { purpose, target: value });
    if (last && now - last.createdAtMs < RESEND_COOLDOWN_MS) {
      const left = Math.ceil((RESEND_COOLDOWN_MS - (now - last.createdAtMs)) / 1000);
      return { ok: false as const, error: `Отправить код повторно через ${left} сек`, status: 429, cooldownSec: left };
    }
  } else {
    assertFileStoreNotUsedInProduction("serverSms.sendVerificationCode", { codesPath: opts.codesPath, ratePath: opts.ratePath });
    const rate = await readJson<RateMap>(opts.ratePath, {});
    const recent = (rate[value] ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length >= MAX_SENDS_PER_WINDOW) {
      return { ok: false as const, error: "Слишком много запросов. Попробуйте позже.", status: 429 };
    }

    const records = await readJson<VerificationCodeRecord[]>(opts.codesPath, []);
    const last = [...records]
      .reverse()
      .find((r) => r.type === opts.type && r.value === value && !r.consumed && now < r.expiresAt);
    if (last && now - last.createdAt < RESEND_COOLDOWN_MS) {
      const left = Math.ceil((RESEND_COOLDOWN_MS - (now - last.createdAt)) / 1000);
      return { ok: false as const, error: `Отправить код повторно через ${left} сек`, status: 429, cooldownSec: left };
    }
  }

  const code = otpGenerate6();
  const ttlMs = opts.type === "phone" ? CODE_TTL_MS_PHONE : CODE_TTL_MS_EMAIL;
  console.log("[OTP_SEND] before store", { channel: opts.type, usesPostgres: usesPostgres() });
  if (usesPostgres()) {
    const pool = getPool();
    await insertCodePg(pool, {
      key: `sms-${now}-${Math.random().toString(16).slice(2)}`,
      codeHash: otpHash(code),
      purpose,
      target: value,
      expiresAtMs: now + ttlMs,
      createdAtMs: now,
    });
  } else {
    assertFileStoreNotUsedInProduction("serverSms.sendVerificationCode(writeJson)", { codesPath: opts.codesPath, ratePath: opts.ratePath });
    const records = await readJson<VerificationCodeRecord[]>(opts.codesPath, []);
    const rate = await readJson<RateMap>(opts.ratePath, {});
    records.push({
      value,
      type: opts.type,
      codeHash: otpHash(code),
      expiresAt: now + ttlMs,
      attempts: 0,
      consumed: false,
      createdAt: now,
    });
    await writeJson(opts.codesPath, records);
    const recent = (rate[value] ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
    recent.push(now);
    rate[value] = recent;
    await writeJson(opts.ratePath, rate);
  }
  console.log("[OTP_SEND] after store", { channel: opts.type });

  console.log("[OTP] send start", { channel: opts.type });
  if (opts.type === "phone") {
    console.log("[OTP] channel=phone");
    const sms = await sendSmsViaProvider(value, `Код подтверждения Haliwali: ${code}`);
    if (!sms.ok) return { ok: false as const, error: sms.error, status: sms.status };
  } else {
    console.log("[OTP] channel=email");
    console.log("[OTP_SEND] before email");
    await sendEmailOtp(value, "Код подтверждения", `Ваш код: ${code}`);
    console.log("[OTP_SEND] email sent");
  }
  return {
    ok: true as const,
    value,
    cooldownSec: 60,
    expiresInSec: Math.floor(ttlMs / 1000),
    ...(dev && opts.type === "email" ? { devCode: code } : {}),
  };
}

export async function verifyVerificationCode(opts: {
  valueRaw: string;
  type: VerifyType;
  codeRaw: string;
  codesPath: string;
  verifiedPath: string;
}) {
  console.log("[OTP] verification start", { channel: opts.type });
  const value = normalizeByType(opts.valueRaw, opts.type);
  const code = (opts.codeRaw ?? "").trim();
  if (!value || !/^\d{6}$/.test(code)) return { ok: false as const, error: "Неверный код", status: 400 };

  const now = Date.now();
  const purpose = `${derivePurpose(opts.codesPath)}:${opts.type}`;
  if (usesPostgres()) {
    const pool = getPool();
    const rec = await findLastAnyCodePg(pool, { purpose, target: value });
    if (!rec) return { ok: false as const, error: "Неверный код", status: 400 };
    if (now > rec.expiresAtMs) return { ok: false as const, error: "Код истёк", status: 410 };
    if (rec.attempts >= MAX_ATTEMPTS) return { ok: false as const, error: "Неверный код", status: 429 };
    if (otpHash(code) !== rec.codeHash) {
      await incrementAttemptsPg(pool, rec.key);
      console.log("[OTP] verification failed", { channel: opts.type });
      return { ok: false as const, error: "Неверный код", status: 400 };
    }
    await consumeCodePg(pool, rec.key);
    // Keep side-effect parity (verified markers) without filesystem writes in PG mode.
    await logVerifiedEventPg(pool, { type: opts.type, value, nowMs: now, verifiedPath: opts.verifiedPath, purpose });
    console.log("[OTP] verification ok", { channel: opts.type });
    return { ok: true as const, value };
  }

  assertFileStoreNotUsedInProduction("serverSms.verifyVerificationCode", { codesPath: opts.codesPath, verifiedPath: opts.verifiedPath });
  const records = await readJson<VerificationCodeRecord[]>(opts.codesPath, []);
  const idx = [...records]
    .map((r, i) => ({ r, i }))
    .reverse()
    .find((x) => x.r.type === opts.type && x.r.value === value && !x.r.consumed)?.i;
  if (idx === undefined) return { ok: false as const, error: "Неверный код", status: 400 };
  const rec = records[idx];

  if (now > rec.expiresAt) return { ok: false as const, error: "Код истёк", status: 410 };
  if (rec.attempts >= MAX_ATTEMPTS) return { ok: false as const, error: "Неверный код", status: 429 };
  if (otpHash(code) !== rec.codeHash) {
    rec.attempts += 1;
    records[idx] = rec;
    await writeJson(opts.codesPath, records);
    console.log("[OTP] verification failed", { channel: opts.type });
    return { ok: false as const, error: "Неверный код", status: 400 };
  }

  rec.consumed = true;
  records[idx] = rec;
  await writeJson(opts.codesPath, records);
  const verified = await readJson<VerifiedMap>(opts.verifiedPath, {});
  verified[value] = { type: opts.type, verifiedAt: now };
  await writeJson(opts.verifiedPath, verified);
  console.log("[OTP] verification ok", { channel: opts.type });
  return { ok: true as const, value };
}

export async function sendPhoneCode(opts: { phoneRaw: string; codesPath: string; ratePath: string }) {
  return await sendVerificationCode({ valueRaw: opts.phoneRaw, type: "phone", codesPath: opts.codesPath, ratePath: opts.ratePath });
}

export async function verifyPhoneCode(opts: {
  phoneRaw: string;
  codeRaw: string;
  codesPath: string;
  verifiedPath: string;
}) {
  return await verifyVerificationCode({
    valueRaw: opts.phoneRaw,
    type: "phone",
    codeRaw: opts.codeRaw,
    codesPath: opts.codesPath,
    verifiedPath: opts.verifiedPath,
  });
}

async function sendSmsViaProvider(phone: string, message: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const endpoint = process.env.SMS_PROVIDER_URL?.trim();
  const apiKey = process.env.SMS_PROVIDER_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    if (process.env.NODE_ENV === "development") {
      const tail = phone.replace(/[^\d]/g, "").slice(-2);
      console.log(`[sms-code][dev] to=***${tail} len=${message.length}`);
      return { ok: true };
    }
    // Production: SMS provider is not configured.
    return { ok: false, error: "SMS временно недоступны", status: 501 };
  }
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ phone, message }),
  });
  return { ok: true };
}

function maskEmail(email: string): string {
  const t = (email ?? "").trim();
  const at = t.indexOf("@");
  if (at < 1) return "***";
  const local = t.slice(0, at);
  const domain = t.slice(at + 1);
  const first = local.slice(0, 1) || "*";
  return `${first}*@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (digits.length < 4) return "+****";
  return `+${digits.slice(0, 1)}****${digits.slice(-4)}`;
}

async function sendEmailOtp(email: string, subject: string, text: string) {
  const toMasked = maskEmailForLogs(email);
  console.log("[SMTP] env presence", smtpEnvPresence());
  try {
    const transporter = nodemailer.createTransport(smtpConfigOrThrow());
    console.log("[SMTP] transporter created");
    console.log("[SMTP] before sendMail", { to: toMasked });
    const info = await transporter.sendMail({
      from: smtpFromField(),
      to: email,
      subject,
      text,
    });
    const messageId = typeof (info as any)?.messageId === "string" ? (info as any).messageId : undefined;
    console.log("[SMTP] sendMail success", { to: toMasked, messageId });
  } catch (e) {
    console.error("[SMTP] sendMail failed", {
      to: toMasked,
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
      code: (e as any)?.code,
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw e;
  }
}

function normalizeByType(raw: string, type: VerifyType) {
  return type === "email" ? normalizeEmail(raw) : normalizePhone(raw);
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
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

function derivePurpose(codesPath: string) {
  const norm = (codesPath ?? "").replaceAll("\\", "/");
  const base = norm.split("/").pop() || norm || "unknown";
  return base.toLowerCase();
}

async function smsRateLimitOkPg(
  pool: ReturnType<typeof getPool>,
  opts: { key: string; nowMs: number; limit: number; windowMs: number },
): Promise<{ ok: boolean }> {
  const now = new Date(opts.nowMs);
  const cutoff = new Date(opts.nowMs - opts.windowMs);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{
      attempts: number;
      first_attempt_at: Date;
      last_attempt_at: Date;
      blocked_until: Date | null;
    }>("SELECT attempts, first_attempt_at, last_attempt_at, blocked_until FROM sms_rate_limits WHERE key=$1 FOR UPDATE", [opts.key]);

    if (existing.rowCount === 0) {
      await client.query(
        "INSERT INTO sms_rate_limits(key, attempts, first_attempt_at, last_attempt_at, blocked_until) VALUES($1, $2, $3, $3, NULL)",
        [opts.key, 1, now],
      );
      await client.query("COMMIT");
      return { ok: true };
    }

    const row = existing.rows[0]!;
    if (row.blocked_until && row.blocked_until.getTime() > opts.nowMs) {
      await client.query("COMMIT");
      return { ok: false };
    }

    const reset = row.first_attempt_at.getTime() < cutoff.getTime();
    const nextAttempts = reset ? 1 : row.attempts + 1;
    const nextFirst = reset ? now : row.first_attempt_at;

    if (!reset && nextAttempts > opts.limit) {
      // Mirror file behavior: once over limit, deny; don't extend window beyond windowMs.
      await client.query("UPDATE sms_rate_limits SET attempts=$2, last_attempt_at=$3 WHERE key=$1", [opts.key, row.attempts, now]);
      await client.query("COMMIT");
      return { ok: false };
    }

    await client.query(
      "UPDATE sms_rate_limits SET attempts=$2, first_attempt_at=$3, last_attempt_at=$4, blocked_until=NULL WHERE key=$1",
      [opts.key, nextAttempts, nextFirst, now],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("sms_rate_limit_unavailable");
  } finally {
    client.release();
  }
}

async function insertCodePg(
  pool: ReturnType<typeof getPool>,
  rec: { key: string; codeHash: string; purpose: string; target: string; createdAtMs: number; expiresAtMs: number },
) {
  await pool.query(
    "INSERT INTO sms_codes(key, code_hash, purpose, target, created_at, expires_at, attempts) VALUES($1,$2,$3,$4,$5,$6,0)",
    [rec.key, rec.codeHash, rec.purpose, rec.target, new Date(rec.createdAtMs), new Date(rec.expiresAtMs)],
  );
}

async function findLastActiveCodePg(
  pool: ReturnType<typeof getPool>,
  opts: { purpose: string; target: string },
): Promise<{ key: string; createdAtMs: number } | null> {
  const res = await pool.query<{ key: string; created_at: Date }>(
    "SELECT key, created_at FROM sms_codes WHERE purpose=$1 AND target=$2 AND expires_at > now() AND attempts < $3 ORDER BY created_at DESC LIMIT 1",
    [opts.purpose, opts.target, MAX_ATTEMPTS],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0]!;
  return { key: row.key, createdAtMs: row.created_at.getTime() };
}

async function findLastAnyCodePg(
  pool: ReturnType<typeof getPool>,
  opts: { purpose: string; target: string },
): Promise<{ key: string; codeHash: string; expiresAtMs: number; attempts: number } | null> {
  const res = await pool.query<{ key: string; code_hash: string; expires_at: Date; attempts: number }>(
    "SELECT key, code_hash, expires_at, attempts FROM sms_codes WHERE purpose=$1 AND target=$2 ORDER BY created_at DESC LIMIT 1",
    [opts.purpose, opts.target],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0]!;
  return { key: row.key, codeHash: row.code_hash, expiresAtMs: row.expires_at.getTime(), attempts: row.attempts };
}

async function incrementAttemptsPg(pool: ReturnType<typeof getPool>, key: string) {
  await pool.query("UPDATE sms_codes SET attempts = attempts + 1 WHERE key=$1", [key]);
}

async function consumeCodePg(pool: ReturnType<typeof getPool>, key: string) {
  await pool.query("DELETE FROM sms_codes WHERE key=$1", [key]);
}

async function logVerifiedEventPg(
  pool: ReturnType<typeof getPool>,
  opts: { type: VerifyType; value: string; nowMs: number; verifiedPath: string; purpose: string },
) {
  const safeKey = `${opts.type}:${opts.value}`;
  const payload = JSON.stringify({ type: opts.type, verifiedAt: opts.nowMs, verifiedPath: derivePurpose(opts.verifiedPath), purpose: opts.purpose });
  await pool.query(
    "INSERT INTO abuse_events(scope, key, event_type, payload_json) VALUES($1,$2,$3,$4)",
    ["sms_verified", safeKey, "verified", payload],
  );
}

