import { NextResponse } from "next/server";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isValidPhone, normalizePhone, PHONE_VALIDATION_MESSAGE } from "../../../../lib/identity";
import { getPool, usesPostgres } from "../../../../lib/pgPool";
import { assertFileStoreNotUsedInProduction } from "../../../../lib/productionGuards";
import { migrateLegacyPhoneOwnersJsonToPgIfNeeded } from "../../../../lib/serverPhoneVerified";
import { sendVerificationCode } from "../../../../lib/serverSms";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";

type ReqBody = { phone?: string };
type OwnerMap = Record<string, string>;

const DATA_DIR = path.join(process.cwd(), ".data");
const CODES_PATH = path.join(DATA_DIR, "profile-phone-codes.json");
const RATE_PATH = path.join(DATA_DIR, "profile-phone-rate.json");
const OWNERS_PATH = path.join(DATA_DIR, "profile-phone-owners.json");

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as ReqBody;
  const phone = normalizePhone(body.phone ?? "");
  if (!phone || !isValidPhone(phone)) {
    return NextResponse.json({ error: PHONE_VALIDATION_MESSAGE }, { status: 400 });
  }

  await mkdir(DATA_DIR, { recursive: true });
  if (usesPostgres()) {
    await migrateLegacyPhoneOwnersJsonToPgIfNeeded();
    const { rows } = await getPool().query<{ user_id: string }>(
      `SELECT user_id FROM phone_owners WHERE phone = $1 LIMIT 1`,
      [phone],
    );
    const ownerUserId = (rows[0]?.user_id ?? "").trim();
    if (ownerUserId && ownerUserId !== userId) {
      return NextResponse.json({ error: "Этот номер уже используется другим аккаунтом." }, { status: 409 });
    }
  } else {
    assertFileStoreNotUsedInProduction("profilePhone.requestCode.readOwnersJson", { path: OWNERS_PATH });
    const owners = await readJson<OwnerMap>(OWNERS_PATH, {});
    if (owners[phone] && owners[phone] !== userId) {
      return NextResponse.json({ error: "Этот номер уже используется другим аккаунтом." }, { status: 409 });
    }
  }

  const sent = await sendVerificationCode({
    valueRaw: phone,
    type: "phone",
    codesPath: CODES_PATH,
    ratePath: RATE_PATH,
  });
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });

  return NextResponse.json({ ok: true, cooldownSec: sent.cooldownSec, expiresInSec: sent.expiresInSec });
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  assertFileStoreNotUsedInProduction("profilePhone.requestCode.readJson", { path: p });
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

