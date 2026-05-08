/**
 * OTP send for **existing-account login** (email or phone). Writes to `sms-codes.json` and ties into
 * `/api/verify-code` for session creation when the identifier matches `verified-users.json`.
 *
 * **Not for signup:** new registrations must use `/api/auth/request-registration-code` (pending
 * registration row + hashed password). Resending the signup code through this route is deprecated —
 * it skips registration state and targets the login/SMS pipeline instead.
 */
import { NextResponse } from "next/server";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isValidPhone, normalizeEmail, normalizePhone, PHONE_VALIDATION_MESSAGE } from "../../lib/identity";
import { getPool, usesPostgres } from "../../lib/pgPool";
import { assertFileStoreNotUsedInProduction } from "../../lib/productionGuards";
import { migrateLegacyPhoneOwnersJsonToPgIfNeeded } from "../../lib/serverPhoneVerified";
import { readUsersDb } from "../../lib/serverUsersStore";
import { sendVerificationCode } from "../../lib/serverSms";
import {
  SMS_LOGIN_ACCOUNT_NOT_FOUND_MESSAGE,
  SMS_LOGIN_PHONE_NOT_VERIFIED_MESSAGE,
} from "../../lib/smsLoginMessages";
import { captchaIsEnabled, captchaPasses, checkIpRateLimit, extractIp, logSuspicious } from "../../lib/serverAbuse";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";

const DATA_DIR = path.join(process.cwd(), ".data");
const CODES_PATH = path.join(DATA_DIR, "sms-codes.json");
const RATE_PATH = path.join(DATA_DIR, "sms-rate.json");
const CODE_IP_RATE_PATH = path.join(DATA_DIR, "code-ip-rate.json");
const ABUSE_LOG_PATH = path.join(DATA_DIR, "suspicious-activity.log.jsonl");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");
const OWNERS_PATH = path.join(DATA_DIR, "profile-phone-owners.json");
const RATE_WINDOW_MS = 10 * 60 * 1000;

/** Roughly equal response duration for SMS login paths (enumeration resistance). */
const PHONE_SEND_MIN_MS = 520;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function readOwnersMap(): Promise<Record<string, string>> {
  if (usesPostgres()) {
    await migrateLegacyPhoneOwnersJsonToPgIfNeeded();
    const { rows } = await getPool().query<{ phone: string; user_id: string }>(
      `SELECT phone, user_id FROM phone_owners`,
    );
    const out: Record<string, string> = {};
    for (const r of rows) {
      const p = String(r.phone ?? "").trim();
      const u = String(r.user_id ?? "").trim();
      if (p && u) out[p] = u;
    }
    return out;
  }
  assertFileStoreNotUsedInProduction("sendCode.readOwnersJson", { path: OWNERS_PATH });
  try {
    const raw = await readFile(OWNERS_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

/** Server-side SMS-login gate: profile-phone owners (confirmed via OTP) OR phone-registered server user without owner row → not_verified / not_found */
function resolvePhoneLoginSmsGate(
  normalized: string,
  owners: Record<string, string>,
  db: Awaited<ReturnType<typeof readUsersDb>>,
): "ok" | "not_found" | "not_verified" {
  const ownerUserId = (owners[normalized] ?? "").trim();
  if (ownerUserId) {
    return db.usersById[ownerUserId] ? "ok" : "not_found";
  }
  const indexedUserId = (db.phoneIndex[normalized] ?? "").trim();
  if (indexedUserId && db.usersById[indexedUserId]) {
    return "not_verified";
  }
  return "not_found";
}

export async function POST(req: Request) {
  console.log("[OTP_SEND] route hit");
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const body = (await req.json().catch(() => ({}))) as {
    value?: string;
    type?: "email" | "phone";
    captchaToken?: string;
  };
  console.log("[OTP_SEND] body parsed", { bodyKeys: Object.keys(body ?? {}) });
  console.log("[OTP_SEND] body keys", { keys: Object.keys(body ?? {}) });
  const value = body.value ?? "";
  const type = body.type;
  console.log("[OTP_SEND] email present", { present: value.includes("@") });
  console.log("[OTP] route start", { route: "/api/send-code", channel: type });
  const ip = extractIp(req);
  const phoneSendStart = type === "phone" ? Date.now() : 0;

  async function finishPhone(res: NextResponse): Promise<Response> {
    if (type !== "phone") return res;
    const wait = Math.max(0, PHONE_SEND_MIN_MS - (Date.now() - phoneSendStart));
    if (wait > 0) await sleep(wait);
    return res;
  }

  if (type !== "email" && type !== "phone") {
    return NextResponse.json({ error: "Укажите способ подтверждения" }, { status: 400 });
  }
  if (type === "email" && !normalizeEmail(value)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }
  if (type === "phone" && !isValidPhone(value)) {
    return await finishPhone(NextResponse.json({ error: PHONE_VALIDATION_MESSAGE }, { status: 400 }));
  }
  console.log("[OTP_SEND] validation passed");

  await mkdir(DATA_DIR, { recursive: true });
  const codeIpLimit = await checkIpRateLimit({
    path: CODE_IP_RATE_PATH,
    ip,
    limit: 5,
    windowMs: RATE_WINDOW_MS,
  });
  if (!codeIpLimit.ok) {
    await logSuspicious(ABUSE_LOG_PATH, { type: "code_ip_limit", ip, verifyType: type });
    if (type === "phone") {
      return await finishPhone(
        NextResponse.json({ error: "Слишком много запросов кода. Попробуйте позже." }, { status: 429 }),
      );
    }
    return NextResponse.json({ error: "Слишком много запросов кода. Попробуйте позже." }, { status: 429 });
  }
  if (captchaIsEnabled() && codeIpLimit.count >= 4 && !captchaPasses(body.captchaToken)) {
    await logSuspicious(ABUSE_LOG_PATH, { type: "captcha_required", ip, verifyType: type });
    if (type === "phone") {
      return await finishPhone(
        NextResponse.json({ error: "Подтвердите, что вы не робот", captchaRequired: true }, { status: 400 }),
      );
    }
    return NextResponse.json({ error: "Подтвердите, что вы не робот", captchaRequired: true }, { status: 400 });
  }

  if (type === "phone") {
    const normalized = normalizePhone(value);
    const [owners, usersDb] = await Promise.all([readOwnersMap(), readUsersDb(USERS_PATH)]);
    const gate = resolvePhoneLoginSmsGate(normalized, owners, usersDb);
    if (gate === "not_found") {
      return await finishPhone(
        NextResponse.json({ error: SMS_LOGIN_ACCOUNT_NOT_FOUND_MESSAGE }, { status: 400 }),
      );
    }
    if (gate === "not_verified") {
      return await finishPhone(
        NextResponse.json({ error: SMS_LOGIN_PHONE_NOT_VERIFIED_MESSAGE }, { status: 400 }),
      );
    }
  }

  console.log("[OTP_SEND] calling sendVerificationCode");
  let result: Awaited<ReturnType<typeof sendVerificationCode>>;
  try {
    result = await sendVerificationCode({ valueRaw: value, type, codesPath: CODES_PATH, ratePath: RATE_PATH });
    console.log("[OTP_SEND] sendVerificationCode result", { ok: (result as any)?.ok, status: (result as any)?.status });
  } catch (e) {
    console.error("[OTP_SEND] failed", {
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
      code: (e as any)?.code,
      stack: e instanceof Error ? e.stack : undefined,
    });
    const errPayload = NextResponse.json(
      { error: "Не удалось отправить код подтверждения" },
      { status: 500 },
    );
    if (type === "phone") return await finishPhone(errPayload);
    return errPayload;
  }
  if (!result.ok) {
    if (type === "phone") {
      return await finishPhone(
        NextResponse.json({ error: result.error, cooldownSec: result.cooldownSec ?? 0 }, { status: result.status }),
      );
    }
    return NextResponse.json({ error: result.error, cooldownSec: result.cooldownSec ?? 0 }, { status: result.status });
  }
  const dev = process.env.NODE_ENV !== "production";
  const devCode =
    dev && type === "email" && typeof (result as { devCode?: unknown }).devCode === "string"
      ? ((result as { devCode?: string }).devCode ?? "")
      : "";
  if (devCode) {
    console.log("[DEV EMAIL CODE]", devCode);
  }
  const okPayload = NextResponse.json({
    ok: true,
    cooldownSec: result.cooldownSec,
    expiresInSec: result.expiresInSec,
    ...(devCode ? { devCode } : {}),
  });
  if (type === "phone") return await finishPhone(okPayload);
  return okPayload;
}
