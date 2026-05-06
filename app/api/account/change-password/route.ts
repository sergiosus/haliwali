import path from "node:path";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { finalizePendingDeletionIfDue } from "../../../lib/serverAccountDeletion";
import { fetchStoredUserById, updateUserPasswordHashPersist } from "../../../lib/serverUsersStore";
import { isDebugAuthServer } from "../../../lib/debugAuth";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "verified-users.json");

const MSG = {
  success: "Пароль успешно изменён.",
  currentRequired: "Введите текущий пароль.",
  newRequired: "Введите новый пароль.",
  mismatch: "Пароли не совпадают.",
  newTooShort: "Новый пароль должен содержать не менее 8 символов.",
  wrongCurrent: "Текущий пароль указан неверно.",
  genericError: "Не удалось изменить пароль. Попробуйте позже.",
} as const;

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const sessionUserId = (await getUserIdFromSessionCookie())?.trim() ?? "";

  if (isDebugAuthServer()) {
    console.log("[password-api] auth", { hasUser: Boolean(sessionUserId) });
  }

  if (!sessionUserId) {
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 400 });
  }
  const o = body as { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };
  const currentPassword = typeof o.currentPassword === "string" ? o.currentPassword : "";
  const newPassword = typeof o.newPassword === "string" ? o.newPassword : "";
  const confirmPassword = typeof o.confirmPassword === "string" ? o.confirmPassword : "";

  if (!currentPassword.trim()) {
    return NextResponse.json({ ok: false, message: MSG.currentRequired }, { status: 400 });
  }
  if (!newPassword.trim()) {
    return NextResponse.json({ ok: false, message: MSG.newRequired }, { status: 400 });
  }
  if (!confirmPassword.trim() || newPassword !== confirmPassword) {
    return NextResponse.json({ ok: false, message: MSG.mismatch }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, message: MSG.newTooShort }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 400 });
  }

  await mkdir(DATA_DIR, { recursive: true });

  const overdue = await finalizePendingDeletionIfDue(USERS_PATH, sessionUserId);
  if (overdue) {
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 401 });
  }

  try {
    const dbUser = await fetchStoredUserById(USERS_PATH, sessionUserId);

    if (isDebugAuthServer()) {
      console.log("[password-api] user found", {
        found: Boolean(dbUser),
        hasPasswordHash: Boolean(dbUser?.passwordHash?.trim()),
      });
    }

    if (!dbUser || (dbUser.deletionStatus ?? "") === "deleted") {
      return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 404 });
    }
    const storedHash = (dbUser.passwordHash ?? "").trim();
    if (!storedHash) {
      return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 400 });
    }

    const match = await bcrypt.compare(currentPassword, storedHash);
    if (!match) {
      return NextResponse.json({ ok: false, message: MSG.wrongCurrent }, { status: 400 });
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await updateUserPasswordHashPersist(USERS_PATH, sessionUserId, nextHash);

    return NextResponse.json({ ok: true, message: MSG.success });
  } catch {
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 500 });
  }
}
