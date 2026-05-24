import { NextResponse } from "next/server";
import { logCatalogPublish } from "../../../../../lib/catalogCatalogLog";
import { mergeDraftIntoCompany } from "../../../../../lib/serverCatalogImportPipeline";
import {
  deleteCatalogImportDrafts,
  publishCatalogImportDrafts,
  saveCatalogImportDraft,
  setCatalogImportDraftStatuses,
  updateCatalogImportDraft,
} from "../../../../../lib/serverCatalogImportDraftStore";
import type { CatalogImportDraftInput, CatalogImportDraftStatus } from "../../../../../lib/catalogImportTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmAction = "save" | "approve" | "reject" | "publish" | "update" | "merge" | "delete";

function parseIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

const FIELD_KEYS: (keyof CatalogImportDraftInput)[] = [
  "name",
  "categorySlug",
  "city",
  "address",
  "phone",
  "email",
  "website",
  "description",
  "sourceUrl",
  "imageUrl",
  "confidenceScore",
  "latitude",
  "longitude",
];

function pickDraftPatch(raw: Record<string, unknown>): Partial<CatalogImportDraftInput> {
  const patch: Partial<CatalogImportDraftInput> = {};
  for (const key of FIELD_KEYS) {
    if (raw[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = raw[key];
    }
  }
  return patch;
}

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const action = String(body.action ?? "") as ConfirmAction;
  const ids = parseIds(body.ids);

  if (!action || !["save", "approve", "reject", "publish", "update", "merge", "delete"].includes(action)) {
    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  }

  if (action === "save" && ids.length > 0 && !Number.isFinite(Number(body.id))) {
    const updated = await setCatalogImportDraftStatuses(ids, "saved");
    return NextResponse.json({ ok: true, updated });
  }

  if (action === "save" || action === "update") {
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });
    }
    const patch = pickDraftPatch((body.patch ?? {}) as Record<string, unknown>);
    const draft =
      action === "save" ?
        await saveCatalogImportDraft(id, patch)
      : await updateCatalogImportDraft(id, patch);
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

  if (action === "delete") {
    const deleted = await deleteCatalogImportDrafts(ids);
    return NextResponse.json({ ok: true, deleted });
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

  const status: CatalogImportDraftStatus = action === "approve" ? "saved" : "rejected";
  const updated = await setCatalogImportDraftStatuses(ids, status);
  return NextResponse.json({ ok: true, updated });
}
