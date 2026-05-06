import type { Listing } from "./listingModel";
import { isListingPubliclyListed } from "./listingModel";
import { normalizeListingId } from "./listingId";
import type { ReportRecord } from "./serverTrustStore";

export function buildListingOwnerMap(listings: Listing[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of listings) {
    const oid = (l.ownerId ?? "").trim();
    if (!oid) continue;
    m.set(normalizeListingId(l.id), oid);
  }
  return m;
}

/** Matches JSON seller-active semantics (public + deal active). */
function isSellerActiveRow(l: Listing): boolean {
  return isListingPubliclyListed(l);
}

export function countListingsForOwner(listings: Listing[], ownerId: string): { total: number; active: number } {
  const oid = ownerId.trim();
  let total = 0;
  let active = 0;
  for (const l of listings) {
    if ((l.ownerId ?? "").trim() !== oid) continue;
    total++;
    if (isSellerActiveRow(l)) active++;
  }
  return { total, active };
}

/** Excludes listing-target reports when the listing row is gone (deleted). */
export function filterReportsWithExistingListingTargets(
  reports: readonly ReportRecord[],
  listings: readonly Listing[],
): ReportRecord[] {
  const validIds = new Set(listings.map((l) => normalizeListingId(l.id)));
  return reports.filter((r) => {
    if (r.targetType !== "listing") return true;
    return validIds.has(normalizeListingId(r.targetId));
  });
}

export function reportsCountForUser(
  uid: string,
  reports: ReportRecord[],
  listingOwnerById: Map<string, string>,
): number {
  let n = 0;
  for (const r of reports) {
    const dismissed = (r as ReportRecord & { dismissed?: boolean }).dismissed;
    if (dismissed) continue;
    if (r.reporterId === uid) {
      n++;
      continue;
    }
    if (r.targetType === "user" && r.targetId.trim() === uid) {
      n++;
      continue;
    }
    if (r.targetType === "listing") {
      const lid = normalizeListingId(r.targetId);
      if (listingOwnerById.get(lid) === uid) n++;
    }
  }
  return n;
}
