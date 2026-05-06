import path from "node:path";
import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { finalizePendingDeletionIfDue } from "../../../lib/serverAccountDeletion";
import { toUserPrivateDTO } from "../../../lib/dto";
import {
  fetchStoredUserById,
  readUsersDb,
  updateUserProfileFullName,
} from "../../../lib/serverUsersStore";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

export async function PATCH(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  await mkdir(DATA_DIR, { recursive: true });
  const overdue = await finalizePendingDeletionIfDue(USERS_PATH, userId);
  if (overdue) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).name : undefined;
  /** Accept string (trimmed / empty) or explicit null to clear. Omitting `name` returns 400. */
  if (typeof raw !== "string" && raw !== null) {
    return NextResponse.json({ ok: false, error: "NAME_REQUIRED" }, { status: 400 });
  }

  const normalized = raw === null ? "" : String(raw).trim();

  const before = await fetchStoredUserById(USERS_PATH, userId);
  if (!before || (before.deletionStatus ?? "") === "deleted") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    await updateUserProfileFullName(USERS_PATH, userId, normalized);
  } catch {
    return NextResponse.json({ ok: false, error: "UPDATE_FAILED" }, { status: 500 });
  }

  const db = await readUsersDb(USERS_PATH);
  const fresh = db.usersById[userId];
  if (!fresh) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ ok: true, user: toUserPrivateDTO(fresh) });
}
