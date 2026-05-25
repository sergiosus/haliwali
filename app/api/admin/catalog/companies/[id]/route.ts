import { NextResponse } from "next/server";
import { parseCatalogCompanyAdminPatch } from "../../../../../lib/catalogAdminCompanyValidate";
import { updateCatalogCompanyAdmin } from "../../../../../lib/serverCatalogStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = parseCatalogCompanyAdminPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.code, message: parsed.error }, { status: 400 });
  }

  const company = await updateCatalogCompanyAdmin(id, {
    name: parsed.data.name,
    city: parsed.data.city,
    description: parsed.data.description,
    website: parsed.data.websiteUrl,
    categorySlug: parsed.data.categorySlug,
    logoUrl: parsed.data.logoUrl,
  });

  if (!company) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, company });
}
