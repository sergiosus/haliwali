/**
 * **Canonical registration** “send code” route: stores pending registration (hashed password) in
 * PostgreSQL (`registration_pending`) or `registration-requests.json`.
 * In production, phone sign-up sends SMS via provider; in development, a local OTP is stored (no provider).
 * All signup UI and resend should use this with `/api/auth/verify-registration-code` — not
 * `/api/send-code` + `/api/verify-code` (those are login-only).
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { isValidPhone, normalizeEmail, normalizePhone, PHONE_VALIDATION_MESSAGE } from "../../../lib/identity";
import { userEmailOrPhoneTaken } from "../../../lib/serverUsersStore";
import { sendMail } from "../../../lib/serverMail";
import { otpGenerate6, otpHash } from "../../../lib/serverSms";
import {
  type PendingRegistration,
  registrationFindLatestForCooldown,
  registrationInsertPending,
} from "../../../lib/serverRegistrationStore";
import { sendPhoneCode } from "../../../lib/serverSms";
import {
  captchaIsEnabled,
  captchaPasses,
  checkIdentifierRateLimit,
  checkIpRateLimit,
  extractIp,
  logSuspicious,
} from "../../../lib/serverAbuse";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";

type ConfirmMethod = "email" | "phone";
type ReqBody = {
  email?: string;
  phone?: string;
  password?: string;
  confirmMethod?: ConfirmMethod;
  captchaToken?: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");
const SMS_CODES_PATH = path.join(DATA_DIR, "sms-codes.json");
const SMS_RATE_PATH = path.join(DATA_DIR, "sms-rate.json");
const REG_IP_RATE_PATH = path.join(DATA_DIR, "registration-ip-rate.json");
const CODE_IP_RATE_PATH = path.join(DATA_DIR, "code-ip-rate.json");
const ABUSE_LOG_PATH = path.join(DATA_DIR, "suspicious-activity.log.jsonl");

const EXPIRY_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const isDev = process.env.NODE_ENV !== "production";
  const body = (await req.json().catch(() => ({}))) as ReqBody;
  const confirmMethod = body.confirmMethod;
  const email = normalizeEmail(body.email ?? "");
  const phone = normalizePhone(body.phone ?? "");
  const password = (body.password ?? "").trim();
  const ip = extractIp(req);

  if (confirmMethod !== "email" && confirmMethod !== "phone") {
    return NextResponse.json({ error: "Выберите способ подтверждения" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Пароль должен быть не короче 8 символов" }, { status: 400 });
  }
  if (confirmMethod === "email" && !email) {
    return NextResponse.json({ error: "Укажите email" }, { status: 400 });
  }
  if (confirmMethod === "phone") {
    if (!phone) return NextResponse.json({ error: "Укажите телефон" }, { status: 400 });
    if (!isValidPhone(phone)) return NextResponse.json({ error: PHONE_VALIDATION_MESSAGE }, { status: 400 });
  }

  await mkdir(DATA_DIR, { recursive: true });
  const regIpLimit = await checkIpRateLimit({
    path: REG_IP_RATE_PATH,
    ip,
    limit: 3,
    windowMs: RATE_WINDOW_MS,
  });
  if (!regIpLimit.ok) {
    await logSuspicious(ABUSE_LOG_PATH, { type: "reg_ip_limit", ip, confirmMethod });
    return NextResponse.json({ error: "Слишком много регистраций. Попробуйте позже." }, { status: 429 });
  }
  const codeIpLimit = await checkIpRateLimit({
    path: CODE_IP_RATE_PATH,
    ip,
    limit: 5,
    windowMs: RATE_WINDOW_MS,
  });
  if (!codeIpLimit.ok) {
    await logSuspicious(ABUSE_LOG_PATH, { type: "code_ip_limit", ip, confirmMethod });
    return NextResponse.json({ error: "Слишком много запросов кода. Попробуйте позже." }, { status: 429 });
  }
  if (captchaIsEnabled() && codeIpLimit.count >= 4 && !captchaPasses(body.captchaToken)) {
    await logSuspicious(ABUSE_LOG_PATH, { type: "captcha_required", ip, confirmMethod });
    return NextResponse.json({ error: "Подтвердите, что вы не робот", captchaRequired: true }, { status: 400 });
  }
  if (await userEmailOrPhoneTaken(USERS_PATH, email, phone)) {
    return NextResponse.json({ error: "Этот email или номер уже используется" }, { status: 409 });
  }

  const identifier = confirmMethod === "email" ? email : phone;
  // Development only: allow rapid iteration without waiting for identifier-based rate limit.
  // Keep IP limits and resend cooldown unchanged.
  if (!isDev) {
    const rl = await checkIdentifierRateLimit({
      scope: "registration_identifier",
      identifier,
      limit: RATE_MAX,
      windowMs: RATE_WINDOW_MS,
    });
    if (!rl.ok) {
      return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
    }
  }

  const now = Date.now();
  const latest = await registrationFindLatestForCooldown(confirmMethod, identifier);
  if (latest && now - latest.lastSentAt < RESEND_COOLDOWN_MS) {
    const left = Math.ceil((RESEND_COOLDOWN_MS - (now - latest.lastSentAt)) / 1000);
    return NextResponse.json({ error: `Повторная отправка через ${left} сек.`, cooldownSec: left }, { status: 429 });
  }

  const isDevBypass = process.env.NODE_ENV !== "production";

  console.log("[OTP] route start", { route: "/api/auth/request-registration-code", channel: confirmMethod });

  /** Plaintext OTP for `registration_pending.codeHash`; never sent in production JSON responses or logs via this branch. */
  let code = "";
  if (isDevBypass) {
    code = otpGenerate6();
  } else if (confirmMethod === "phone") {
    const sms = await sendPhoneCode({ phoneRaw: phone, codesPath: SMS_CODES_PATH, ratePath: SMS_RATE_PATH });
    if (!sms.ok) {
      return NextResponse.json({ error: sms.error, cooldownSec: sms.cooldownSec ?? 0 }, { status: sms.status });
    }
  } else {
    code = otpGenerate6();
    // Production email OTP delivery via SMTP.
    try {
      await sendMail({ to: email, subject: "Код подтверждения", text: `Ваш код: ${code}` });
    } catch (e) {
      // Don't leak code; server logs will contain SMTP error details from serverMail.
      console.error("[OTP] smtp send failed", {
        route: "/api/auth/request-registration-code",
        to: email.includes("@") ? `${email.slice(0, 1)}*@${email.split("@")[1]}` : "***",
        err: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json({ error: "Не удалось отправить код" }, { status: 500 });
    }
  }
  const next: PendingRegistration = {
    id: `reg-${now}-${Math.random().toString(16).slice(2)}`,
    email,
    phone,
    passwordHash: await bcrypt.hash(password, 10),
    confirmMethod,
    codeHash: code ? otpHash(code) : "",
    expiresAt: now + EXPIRY_MS,
    attempts: 0,
    consumed: false,
    createdAt: now,
    lastSentAt: now,
  };
  await registrationInsertPending(next);

  if (isDevBypass && code) {
    console.log("[DEV REGISTRATION CODE]", code);
  }

  const payload: {
    ok: true;
    expiresInSec: number;
    cooldownSec: number;
    /** Sent only when `NODE_ENV !== "production"`. Never in production. */
    devCode?: string;
  } = {
    ok: true,
    expiresInSec: EXPIRY_MS / 1000,
    cooldownSec: RESEND_COOLDOWN_MS / 1000,
    ...(isDevBypass && code ? { devCode: code } : {}),
  };

  return NextResponse.json(payload);
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}
