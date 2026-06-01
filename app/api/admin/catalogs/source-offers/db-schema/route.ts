import { NextResponse } from "next/server";
import { introspectSourceOfferDb } from "../../../../../lib/serverCatalogSourceOfferStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: live PostgreSQL table/column introspection for source offers. */
export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  try {
    const schema = await introspectSourceOfferDb();
    return NextResponse.json({ ok: true, schema });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
