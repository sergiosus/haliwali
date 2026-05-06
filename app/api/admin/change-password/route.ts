import { NextResponse } from "next/server";
import { isDebugAuthServer } from "../../../lib/debugAuth";
import { getAdminPrivilegedFailure } from "../../../lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { getAdminPassword, setAdminPassword } from "@/app/lib/admin-password";
import { isProduction } from "@/app/lib/productionGuards";

export const runtime = "nodejs";

const MSG = {
  success: "Пароль администратора успешно изменён.",
  currentRequired: "Введите текущий пароль.",
  newRequired: "Введите новый пароль.",
  mismatch: "Пароли не совпадают.",
  newTooShort: "Новый пароль должен содержать не менее 8 символов.",
  genericError: "Не удалось изменить пароль. Попробуйте позже.",
} as const;

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const fail = await getAdminPrivilegedFailure();

  if (fail === "NO_ADMIN_COOKIE" || fail === "NO_USER_SESSION") {
    if (isDebugAuthServer()) console.log("[admin-password] change", { allowed: false, reason: fail });
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 401 });
  }
  if (fail === "NOT_PRIVILEGED") {
    if (isDebugAuthServer()) console.log("[admin-password] change", { allowed: false, reason: "NOT_PRIVILEGED" });
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 403 });
  }

  if (isDebugAuthServer()) console.log("[admin-password] change", { allowed: true });

  if (isProduction()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "В production пароль администратора задаётся только через переменную окружения ADMIN_PASSWORD (смена через панель недоступна).",
      },
      { status: 400 },
    );
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

  try {
    if (currentPassword !== getAdminPassword()) {
      return NextResponse.json({ ok: false, error: "Текущий пароль указан неверно." }, { status: 400 });
    }

    setAdminPassword(newPassword);
    return NextResponse.json({ ok: true, message: MSG.success });
  } catch {
    return NextResponse.json({ ok: false, message: MSG.genericError }, { status: 500 });
  }
}
