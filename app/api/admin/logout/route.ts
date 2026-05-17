import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearAdminCookie,
  destroyCurrentAdminSessionsFromCookies,
} from "@/app/lib/serverAdminSession";
import { denyIfMutationOriginForbidden } from "@/app/lib/serverCsrf";
import { invalidateCurrentUserSessionCookie } from "@/app/lib/serverSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  await invalidateCurrentUserSessionCookie();
  const jar = await cookies();
  await destroyCurrentAdminSessionsFromCookies();
  await clearAdminCookie(jar);

  return NextResponse.json({ ok: true, redirect: "/admin" });
}
