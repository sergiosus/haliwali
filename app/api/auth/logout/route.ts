import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { USER_SESSION_COOKIE, clearUserSessionCookie, destroyUserSession } from "../../../lib/serverSession";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const jar = await cookies();
  const token = jar.get(USER_SESSION_COOKIE)?.value ?? "";
  if (token) await destroyUserSession(token);
  const res = NextResponse.json({ ok: true });
  clearUserSessionCookie(res);
  return res;
}

