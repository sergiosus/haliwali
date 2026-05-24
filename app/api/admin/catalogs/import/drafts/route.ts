import { NextResponse } from "next/server";
import { listCatalogImportDrafts } from "../../../../../lib/serverCatalogImportDraftStore";
import type { CatalogImportDraftStatus } from "../../../../../lib/catalogImportTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS = new Set<CatalogImportDraftStatus>(["new", "saved", "published", "rejected"]);

export async function GET(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && VALID_STATUS.has(statusParam as CatalogImportDraftStatus) ?
      (statusParam as CatalogImportDraftStatus)
    : undefined;
  const drafts = await listCatalogImportDrafts(status ? { status } : undefined);
  return NextResponse.json({ ok: true, drafts });
}
