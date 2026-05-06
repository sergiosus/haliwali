import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePhone } from "../../../../lib/identity";
import { getPool, usesPostgres } from "../../../../lib/pgPool";
import { assertFileStoreNotUsedInProduction } from "../../../../lib/productionGuards";
import { migrateLegacyPhoneOwnersJsonToPgIfNeeded } from "../../../../lib/serverPhoneVerified";
import { verifyVerificationCode } from "../../../../lib/serverSms";
import { denyIfMutationOriginForbidden } from "../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../lib/serverSession";
import { touchUserLastSeen } from "../../../../lib/serverUsersStore";

type ReqBody = { phone?: string; code?: string };
type OwnerMap = Record<string, string>;

const DATA_DIR = path.join(process.cwd(), ".data");
const CODES_PATH = path.join(DATA_DIR, "profile-phone-codes.json");
const VERIFIED_PATH = path.join(DATA_DIR, "verified-phones.json");
const OWNERS_PATH = path.join(DATA_DIR, "profile-phone-owners.json");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = await getUserIdFromSessionCookie();
  if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as ReqBody;
  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "Неверный код" }, { status: 400 });

  await mkdir(DATA_DIR, { recursive: true });
  let ownersJson: OwnerMap | null = null;
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
    assertFileStoreNotUsedInProduction("profilePhone.verifyCode.readOwnersJson", { path: OWNERS_PATH });
    ownersJson = await readJson<OwnerMap>(OWNERS_PATH, {});
    if (ownersJson[phone] && ownersJson[phone] !== userId) {
      return NextResponse.json({ error: "Этот номер уже используется другим аккаунтом." }, { status: 409 });
    }
  }

  const result = await verifyVerificationCode({
    valueRaw: phone,
    type: "phone",
    codeRaw: body.code ?? "",
    codesPath: CODES_PATH,
    verifiedPath: VERIFIED_PATH,
  });
  if (!result.ok) {
    const mappedError = result.error === "Код истёк" ? "Код истёк. Получите новый." : result.error;
    return NextResponse.json({ error: mappedError }, { status: result.status });
  }

  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO phone_owners (phone, user_id) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [phone, userId],
    );
  } else {
    const owners = ownersJson ?? (await readJson<OwnerMap>(OWNERS_PATH, {}));
    owners[phone] = userId;
    assertFileStoreNotUsedInProduction("profilePhone.verifyCode.writeOwnersJson", { path: OWNERS_PATH });
    await writeFile(OWNERS_PATH, JSON.stringify(owners, null, 2), "utf8");
  }
  await touchUserLastSeen(USERS_PATH, userId);
  return NextResponse.json({ ok: true, phoneVerified: true, verifiedAt: Date.now() });
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  assertFileStoreNotUsedInProduction("profilePhone.verifyCode.readJson", { path: p });
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

