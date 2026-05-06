import path from "node:path";
import { NextResponse } from "next/server";
import { formatAdminReporterLabel, userDisplayInputFromStoredAuth } from "../../../lib/getUserDisplayName";
import { normalizeListingId } from "../../../lib/listingId";
import {
  LISTING_COMPLAINT_PREVIEW_WINDOW_MS,
  normalizeListingLifecycle,
  type Listing,
} from "../../../lib/listingModel";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../lib/serverAdminSession";
import { listBootstrap } from "../../../lib/serverListingsStore";
import { purgeListingReportsNotInValidIdSet, readAllReports } from "../../../lib/serverTrustStore";
import { readUsersDb } from "../../../lib/serverUsersStore";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const db = await readUsersDb(USERS_PATH);
  const listings = await listBootstrap(null, true);
  const listingTitleById = new Map<string, string>();
  const listingOwnerById = new Map<string, string>();
  const listingRowById = new Map<string, Listing>();
  const validListingIdSet = new Set<string>();
  for (const l of listings) {
    const nid = normalizeListingId(l.id);
    validListingIdSet.add(nid);
    listingRowById.set(nid, l);
    const title = (l.title ?? "").trim();
    listingTitleById.set(nid, title || "Объявление");
    const oid = (l.ownerId ?? "").trim();
    if (oid) listingOwnerById.set(nid, oid);
  }

  await purgeListingReportsNotInValidIdSet(validListingIdSet);

  const reports = (await readAllReports(800)).filter((r) => !r.dismissed);
  const visibleReports = reports.filter((r) => {
    if (r.targetType !== "listing") return true;
    return validListingIdSet.has(normalizeListingId(r.targetId));
  });

  const enriched = visibleReports.map((r) => {
    const rep = db.usersById[r.reporterId.trim()];
    const reporterDisplay = formatAdminReporterLabel(userDisplayInputFromStoredAuth(rep));

    const listingId = r.targetType === "listing" ? normalizeListingId(r.targetId) : "";
    const listingPresent = Boolean(listingId && listingTitleById.has(listingId));
    const listingTitle = listingId ? (listingTitleById.get(listingId) ?? "Объявление") : undefined;

    const targetUserId =
      r.targetType === "user"
        ? r.targetId.trim()
        : listingPresent
          ? (listingOwnerById.get(listingId) ?? "").trim()
          : "";

    const listingRow = listingId ? listingRowById.get(listingId) : undefined;
    const listingSoftDeleted = Boolean(listingRow && normalizeListingLifecycle(listingRow.listingLifecycle) === "deleted");
    const deletedAtMs = typeof listingRow?.deletedAt === "number" ? listingRow.deletedAt : 0;
    const withinDeletedPreviewWindow =
      listingSoftDeleted &&
      deletedAtMs > 0 &&
      Date.now() - deletedAtMs < LISTING_COMPLAINT_PREVIEW_WINDOW_MS;
    const snap = listingRow?.deletedSnapshot;

    let targetDisplay = "";
    if (r.targetType === "listing") {
      targetDisplay = listingPresent ? `Объявление: ${listingTitle ?? "Объявление"}` : "Объявление";
    } else if (r.targetType === "user") {
      const tu = db.usersById[r.targetId.trim()];
      targetDisplay = `Пользователь: ${formatAdminReporterLabel(userDisplayInputFromStoredAuth(tu))}`;
    } else {
      targetDisplay = "Цель";
    }

    return {
      ...r,
      reporterDisplay,
      targetDisplay,
      listingPresent,
      ...(listingSoftDeleted ? { listingSoftDeleted: true } : {}),
      ...(listingPresent && listingId ? { listingId, listingTitle: listingTitle ?? "Объявление" } : {}),
      ...(targetUserId ? { targetUserId } : {}),
      ...(listingSoftDeleted && withinDeletedPreviewWindow && snap
        ? {
            complaintDeletedPreview: {
              deletedAt: deletedAtMs,
              title: snap.title,
              category: snap.category,
              type: snap.type,
              city: snap.city,
              preview: snap.preview,
            },
          }
        : {}),
    };
  });

  return NextResponse.json({ ok: true, reports: enriched });
}
