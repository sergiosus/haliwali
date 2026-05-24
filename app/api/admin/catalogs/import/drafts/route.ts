import { NextResponse } from "next/server";
import { listCatalogImportDrafts } from "../../../../../lib/serverCatalogImportDraftStore";
import type { CatalogImportDraftStatus } from "../../../../../lib/catalogImportTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as CatalogImportDraftStatus | null;
  const drafts = await listCatalogImportDrafts(
    status && ["draft", "approved", "rejected"].includes(status) ? { status } : undefined,
  );
  return NextResponse.json({ ok: true, drafts });
}
