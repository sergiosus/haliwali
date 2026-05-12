import path from "node:path";
import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isDebugAuthServer } from "../../../lib/debugAuth";
import { finalizePendingDeletionIfDue } from "../../../lib/serverAccountDeletion";
import { readUsersDb } from "../../../lib/serverUsersStore";
import { clearUserSessionCookie, getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { isUserLoginDenied } from "../../../lib/serverUserSoftDelete";
import { toUserPrivateDTO } from "../../../lib/dto";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

export async function GET() {
  const userId = await getUserIdFromSessionCookie();
  if (!userId) {
    if (isDebugAuthServer()) {
      console.log("[auth-api] /me", { hasUser: false });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await mkdir(DATA_DIR, { recursive: true });

  const overdue = await finalizePendingDeletionIfDue(USERS_PATH, userId);
  if (overdue) {
    const res = NextResponse.json({ ok: false }, { status: 401 });
    clearUserSessionCookie(res);
    return res;
  }

  const db = await readUsersDb(USERS_PATH);
  const user = db.usersById[userId];
  if (!user) {
    if (isDebugAuthServer()) {
      console.log("[auth-api] /me", { hasUser: false });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (isUserLoginDenied(user)) {
    const res = NextResponse.json({ ok: false }, { status: 401 });
    clearUserSessionCookie(res);
    return res;
  }

  if (isDebugAuthServer()) {
    console.log("[auth-api] /me", { hasUser: true });
  }
  return NextResponse.json({ ok: true, user: toUserPrivateDTO(user) });
}

