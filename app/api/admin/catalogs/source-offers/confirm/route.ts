import { NextResponse } from "next/server";
import {
  listSourceOfferDrafts,
  publishSourceOfferDrafts,
  setSourceOfferDraftStatuses,
} from "../../../../../lib/serverCatalogSourceOfferStore";
import type { CatalogSourceOfferDraftStatus } from "../../../../../lib/catalogSourceOfferTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmAction = "save" | "approve" | "reject" | "publish";

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

  if (!["save", "approve", "reject", "publish"].includes(action)) {
    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "IDS_REQUIRED" }, { status: 400 });
  }

  if (action === "publish") {
    const published = await publishSourceOfferDrafts(ids);
    const rejected = published.filter((d) => d.status === "rejected");
    const ok = published.filter((d) => d.status === "published");
    return NextResponse.json({
      ok: true,
      published: ok,
      rejected,
      message:
        rejected.length > 0 ?
          `${ok.length} опубликовано, ${rejected.length} отклонено (не объявление)`
        : undefined,
    });
  }

  const statusMap: Record<Exclude<ConfirmAction, "publish">, CatalogSourceOfferDraftStatus> = {
    save: "saved",
    approve: "approved",
    reject: "rejected",
  };
  const updated = await setSourceOfferDraftStatuses(ids, statusMap[action]);
  const drafts = await listSourceOfferDrafts();
  return NextResponse.json({ ok: true, updated, drafts: drafts.filter((d) => ids.includes(d.id)) });
}
