import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminPassword } from "@/app/lib/admin-password";
import { isDebugAuthServer } from "@/app/lib/debugAuth";
import {
  adminRateLimitOk,
  createAdminSession,
  setAdminCookie,
} from "@/app/lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "@/app/lib/serverCsrf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: true, redirect: "/admin" });
  }

  const okRate = await adminRateLimitOk();
  if (!okRate) {
    return NextResponse.json({ ok: false, code: "rate" as const });
  }

  let password = "";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { password?: string };
    password = String(body.password ?? "");
  } else {
    const form = await req.formData();
    password = String(form.get("password") ?? "");
  }

  if (!getAdminPassword()) {
    if (isDebugAuthServer()) {
      console.log("[admin-auth] login", { success: false, reason: "no_password_config" });
    }
    return NextResponse.json({ ok: false, code: "nocfg" as const });
  }

  const okPwd = password === getAdminPassword();
  if (!okPwd) {
    if (isDebugAuthServer()) {
      console.log("[admin-auth] login", { success: false, reason: "bad_password" });
    }
    return NextResponse.json({ ok: false, code: "error" as const });
  }

  const jar = await cookies();
  const { token, maxAgeSec } = await createAdminSession();
  await setAdminCookie(jar, token, maxAgeSec);

  if (isDebugAuthServer()) {
    console.log("[admin-auth] login", { success: true });
  }

  return NextResponse.json({ ok: true, redirect: "/admin" });
}
