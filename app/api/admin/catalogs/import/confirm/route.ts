import { NextResponse } from "next/server";
import { logCatalogPublish } from "../../../../../lib/catalogCatalogLog";
import { mergeDraftIntoCompany } from "../../../../../lib/serverCatalogImportPipeline";
import {
  publishCatalogImportDrafts,
  setCatalogImportDraftStatuses,
  updateCatalogImportDraft,
} from "../../../../../lib/serverCatalogImportDraftStore";
import type { CatalogImportDraftInput, CatalogImportDraftStatus } from "../../../../../lib/catalogImportTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmAction = "approve" | "reject" | "publish" | "update" | "merge";

function parseIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const action = String(body.action ?? "") as ConfirmAction;
  const ids = parseIds(body.ids);

  if (!action || !["approve", "reject", "publish", "update", "merge"].includes(action)) {
    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  }

  if (action === "update") {
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });
    }
    const patch = (body.patch ?? {}) as Partial<CatalogImportDraftInput> & {
      status?: CatalogImportDraftStatus;
    };
    const draft = await updateCatalogImportDraft(id, patch);
    if (!draft) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, draft });
  }

  if (action === "merge") {
    const draftId = Number(body.draftId ?? body.id);
    const companyId = Number(body.companyId);
    if (!Number.isFinite(draftId) || !Number.isFinite(companyId)) {
      return NextResponse.json({ ok: false, error: "IDS_REQUIRED" }, { status: 400 });
    }
    const draft = await mergeDraftIntoCompany(draftId, companyId);
    if (!draft) return NextResponse.json({ ok: false, error: "MERGE_FAILED" }, { status: 400 });
    return NextResponse.json({ ok: true, draft });
  }

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "IDS_REQUIRED" }, { status: 400 });
  }

  if (action === "publish") {
    logCatalogPublish("publish_start", { draftCount: ids.length });
    const result = await publishCatalogImportDrafts(ids);
    logCatalogPublish("publish_done", {
      published: result.published,
      skipped: result.skipped,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const status: CatalogImportDraftStatus = action === "approve" ? "approved" : "rejected";
  const updated = await setCatalogImportDraftStatuses(ids, status);
  return NextResponse.json({ ok: true, updated });
}
