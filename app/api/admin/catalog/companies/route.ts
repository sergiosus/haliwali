import { NextResponse } from "next/server";
import {
  deleteCatalogCompaniesAdmin,
  listCatalogCompaniesAdmin,
} from "../../../../lib/serverCatalogStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;
  const companies = await listCatalogCompaniesAdmin();
  return NextResponse.json({ ok: true, companies });
}

export async function DELETE(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "IDS_REQUIRED" }, { status: 400 });
  }

  const deleted = await deleteCatalogCompaniesAdmin(ids);
  return NextResponse.json({ ok: true, deleted });
}
