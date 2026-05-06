/**
 * OTP verify for **existing-account login** (`/api/send-code`). Completes login via `verified-users.json`.
 *
 * **Not for signup:** completing registration must use `/api/auth/verify-registration-code`.
 * Pairing `/api/send-code` with this route for registration is deprecated and breaks signup flow.
 */
import { NextResponse } from "next/server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { normalizeEmail, normalizePhone } from "../../lib/identity";
import { verifyVerificationCode } from "../../lib/serverSms";
import { extractIp, logSuspicious } from "../../lib/serverAbuse";
import { createUserSession, setUserSessionCookie } from "../../lib/serverSession";
import { readUsersDb } from "../../lib/serverUsersStore";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";
import { toUserPublicDTO } from "../../lib/dto";

const DATA_DIR = path.join(process.cwd(), ".data");
const CODES_PATH = path.join(DATA_DIR, "sms-codes.json");
const VERIFIED_PATH = path.join(DATA_DIR, "verified-phones.json");
const ABUSE_LOG_PATH = path.join(DATA_DIR, "suspicious-activity.log.jsonl");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const body = (await req.json().catch(() => ({}))) as { value?: string; code?: string };
  const value = body.value ?? "";
  const type: "email" | "phone" = value.includes("@") ? "email" : "phone";
  const normalized = type === "email" ? normalizeEmail(value) : normalizePhone(value);
  const ip = extractIp(req);
  if (!normalized) return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  await mkdir(DATA_DIR, { recursive: true });
  const result = await verifyVerificationCode({
    valueRaw: normalized,
    type,
    codeRaw: body.code ?? "",
    codesPath: CODES_PATH,
    verifiedPath: VERIFIED_PATH,
  });
  if (!result.ok) {
    if (result.error === "Неверный код") {
      await logSuspicious(ABUSE_LOG_PATH, { type: "failed_verify", ip, verifyType: type, value: normalized });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // If the identifier belongs to a server user, create a server session (no phone/email returned).
  const db = await readUsersDb(USERS_PATH);
  const userId = type === "email" ? (db.emailIndex[normalized] ?? "") : (db.phoneIndex[normalized] ?? "");
  const user = userId ? db.usersById[userId] : null;
  if (!user) return NextResponse.json({ ok: true });

  const { token, maxAgeSec } = await createUserSession(user.userId);
  const res = NextResponse.json({ ok: true, user: toUserPublicDTO(user) });
  await setUserSessionCookie(res, token, maxAgeSec);
  return res;
}

