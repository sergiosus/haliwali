/**
 * **Canonical registration** “verify code” route: finalizes user in PostgreSQL or
 * `verified-users.json` from pending registration storage. Pair with
 * `/api/auth/request-registration-code` only.
 */
import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { normalizeEmail, normalizePhone } from "../../../lib/identity";
import {
  insertUserPersist,
  type StoredUser,
  UniqueConstraintError,
  userEmailOrPhoneTaken,
} from "../../../lib/serverUsersStore";
import {
  registrationBumpAttempts,
  registrationFindActive,
  registrationMarkConsumed,
} from "../../../lib/serverRegistrationStore";
import { verifyPhoneCode } from "../../../lib/serverSms";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { createUserSession, setUserSessionCookie } from "../../../lib/serverSession";
import { toUserPublicDTO } from "../../../lib/dto";

type ConfirmMethod = "email" | "phone";
type ReqBody = {
  email?: string;
  phone?: string;
  confirmMethod?: ConfirmMethod;
  code?: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");
const SMS_CODES_PATH = path.join(DATA_DIR, "sms-codes.json");
const VERIFIED_PHONE_PATH = path.join(DATA_DIR, "verified-phones.json");
const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const body = (await req.json().catch(() => ({}))) as ReqBody;
  const confirmMethod = body.confirmMethod;
  const email = normalizeEmail(body.email ?? "");
  const phone = normalizePhone(body.phone ?? "");
  const code = (body.code ?? "").trim();
  const identifier = confirmMethod === "email" ? email : phone;

  if (confirmMethod !== "email" && confirmMethod !== "phone") {
    return NextResponse.json({ error: "Выберите способ подтверждения" }, { status: 400 });
  }
  if (!identifier) return NextResponse.json({ error: "Нет данных для подтверждения" }, { status: 400 });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Введите 6-значный код" }, { status: 400 });

  await mkdir(DATA_DIR, { recursive: true });
  const now = Date.now();

  const current = await registrationFindActive(confirmMethod, identifier);
  if (!current) return NextResponse.json({ error: "Код не найден. Получите новый." }, { status: 404 });

  if (current.consumed) return NextResponse.json({ error: "Код уже использован. Получите новый." }, { status: 409 });
  if (now > current.expiresAt) return NextResponse.json({ error: "Код истёк. Получите новый." }, { status: 410 });
  if (current.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Превышено число попыток. Получите новый код." }, { status: 429 });
  }

  if (confirmMethod === "phone") {
    const pendingPhoneOtpDev =
      process.env.NODE_ENV !== "production" && typeof current.codeHash === "string" && current.codeHash.length > 0;
    if (pendingPhoneOtpDev) {
      if (sha256(code) !== current.codeHash) {
        await registrationBumpAttempts(current.id);
        return NextResponse.json({ error: "Неверный код" }, { status: 400 });
      }
    } else {
      const checked = await verifyPhoneCode({
        phoneRaw: phone,
        codeRaw: code,
        codesPath: SMS_CODES_PATH,
        verifiedPath: VERIFIED_PHONE_PATH,
      });
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: checked.status });
      }
    }
  } else if (sha256(code) !== current.codeHash) {
    await registrationBumpAttempts(current.id);
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }

  if (await userEmailOrPhoneTaken(USERS_PATH, current.email, current.phone)) {
    return NextResponse.json({ error: "Этот email или номер уже используется" }, { status: 409 });
  }

  const user: StoredUser = {
    userId: `user-${randomUUID()}`,
    email: current.email,
    phone: current.phone,
    phoneVisible: false,
    passwordHash: current.passwordHash,
    createdAt: now,
    lastSeenAt: now,
  };
  try {
    await insertUserPersist(USERS_PATH, user);
    await registrationMarkConsumed(current.id);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return NextResponse.json({ error: "Этот email или номер уже используется" }, { status: 409 });
    }
    throw error;
  }

  const { token, maxAgeSec } = await createUserSession(user.userId);
  const res = NextResponse.json({ ok: true, user: toUserPublicDTO(user) });
  await setUserSessionCookie(res, token, maxAgeSec);
  return res;
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}
