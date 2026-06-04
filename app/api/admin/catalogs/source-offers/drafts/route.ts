import { NextResponse } from "next/server";
import {
  listCandidateSourceOfferDrafts,
  listSourceOfferDrafts,
  patchSourceOfferDraftTitle,
} from "../../../../../lib/serverCatalogSourceOfferStore";
import type { CatalogSourceOfferDraftStatus } from "../../../../../lib/catalogSourceOfferTypes";
import { normalizeSourceOfferDraftStatus } from "../../../../../lib/catalogSourceOfferTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const statusRaw = new URL(req.url).searchParams.get("status");
  if (statusRaw === "candidates") {
    const drafts = await listCandidateSourceOfferDrafts();
    return NextResponse.json({ ok: true, drafts });
  }

  const status =
    statusRaw ? normalizeSourceOfferDraftStatus(statusRaw) : undefined;
  const drafts = await listSourceOfferDrafts(status as CatalogSourceOfferDraftStatus | undefined);
  return NextResponse.json({ ok: true, drafts });
}

export async function PATCH(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const id = Number(body.id);
  const title = String(body.title ?? "").trim();
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });
  }
  if (title.length <= 8) {
    return NextResponse.json(
      { ok: false, error: "TITLE_TOO_SHORT", message: "Название должно быть длиннее 8 символов" },
      { status: 400 },
    );
  }

  const draft = await patchSourceOfferDraftTitle(id, title);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "UPDATE_FAILED", message: "Не удалось сохранить название" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, draft });
}
