import path from "node:path";
import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { readUsersDb } from "../../../lib/serverUsersStore";
import {
  finalizePendingDeletionIfDue,
  immediateAccountDeletion,
  scheduleAccountDeletion,
} from "../../../lib/serverAccountDeletion";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { clearUserSessionCookie, getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = (await getUserIdFromSessionCookie())?.trim();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }
  const mode = typeof (body as { mode?: unknown }).mode === "string" ? (body as { mode: string }).mode.trim() : "";
  if (mode !== "immediate" && mode !== "delayed") {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  await mkdir(DATA_DIR, { recursive: true });

  const overdue = await finalizePendingDeletionIfDue(USERS_PATH, userId);
  if (overdue) {
    const res = NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    clearUserSessionCookie(res);
    return res;
  }

  const db = await readUsersDb(USERS_PATH);
  const u = db.usersById[userId];
  if (!u) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const ds = u.deletionStatus ?? "";
  if (ds === "deleted") return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  if (mode === "immediate") {
    await immediateAccountDeletion(USERS_PATH, userId);
    const res = NextResponse.json({ ok: true });
    clearUserSessionCookie(res);
    return res;
  }

  await scheduleAccountDeletion(USERS_PATH, userId);
  return NextResponse.json({ ok: true });
}
