import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { finalizePendingDeletionIfDue } from "../../../lib/serverAccountDeletion";
import { normalizeEmail, normalizePhone } from "../../../lib/identity";
import { readUsersDb, touchUserLastSeen } from "../../../lib/serverUsersStore";
import { createUserSession, setUserSessionCookie } from "../../../lib/serverSession";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { toUserPublicDTO } from "../../../lib/dto";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const body = (await req.json().catch(() => ({}))) as { value?: string; password?: string };
  const valueRaw = (body.value ?? "").trim();
  const password = String(body.password ?? "");
  if (!valueRaw || password.length < 1) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  await mkdir(DATA_DIR, { recursive: true });
  const db = await readUsersDb(USERS_PATH);

  const isEmail = valueRaw.includes("@");
  const key = isEmail ? normalizeEmail(valueRaw) : normalizePhone(valueRaw);
  if (!key) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const userId = isEmail ? (db.emailIndex[key] ?? "") : (db.phoneIndex[key] ?? "");
  const user = userId ? db.usersById[userId] : null;
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });

  const overdue = await finalizePendingDeletionIfDue(USERS_PATH, user.userId);
  if (overdue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const db2 = await readUsersDb(USERS_PATH);
  const fresh = db2.usersById[user.userId];
  if (!fresh) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if ((fresh.deletionStatus ?? "") === "deleted") {
    return NextResponse.json({ error: "ACCOUNT_REMOVED" }, { status: 403 });
  }

  await touchUserLastSeen(USERS_PATH, user.userId);
  const { token, maxAgeSec } = await createUserSession(user.userId);
  const res = NextResponse.json({ ok: true, user: toUserPublicDTO(fresh) });
  await setUserSessionCookie(res, token, maxAgeSec);
  return res;
}

