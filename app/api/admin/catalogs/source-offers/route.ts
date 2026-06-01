import { NextResponse } from "next/server";
import {
  deletePublishedSourceOffers,
  listPublishedSourceOffers,
} from "../../../../lib/serverCatalogSourceOfferStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { offers } = await listPublishedSourceOffers({ limit: 500 });
  return NextResponse.json({ ok: true, offers });
}

export async function DELETE(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const ids = parseIds(body.ids);
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "IDS_REQUIRED" }, { status: 400 });
  }

  const deleted = await deletePublishedSourceOffers(ids);
  return NextResponse.json({ ok: true, deleted });
}
