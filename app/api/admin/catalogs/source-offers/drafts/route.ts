import { NextResponse } from "next/server";
import { listSourceOfferDrafts } from "../../../../../lib/serverCatalogSourceOfferStore";
import type { CatalogSourceOfferDraftStatus } from "../../../../../lib/catalogSourceOfferTypes";
import { normalizeSourceOfferDraftStatus } from "../../../../../lib/catalogSourceOfferTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const statusRaw = new URL(req.url).searchParams.get("status");
  const status =
    statusRaw ? normalizeSourceOfferDraftStatus(statusRaw) : undefined;
  const drafts = await listSourceOfferDrafts(status as CatalogSourceOfferDraftStatus | undefined);
  return NextResponse.json({ ok: true, drafts });
}
