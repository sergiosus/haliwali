import { catalogCompanyOwnershipStatus } from "./catalogCompanyOrigin";
import type { CatalogCompanyAdminItem, CatalogCompanyClaimRequest } from "./catalogTypes";

export type AdminUserCatalogSummary = {
  companyCount: number;
  ownershipLabel: "" | "Подтверждённый владелец" | "Добавил компанию";
};

const EMPTY: AdminUserCatalogSummary = { companyCount: 0, ownershipLabel: "" };

export function buildAdminUserCatalogSummaryMap(
  companies: readonly CatalogCompanyAdminItem[],
  claims: readonly CatalogCompanyClaimRequest[],
): Map<string, AdminUserCatalogSummary> {
  const map = new Map<string, AdminUserCatalogSummary>();

  for (const co of companies) {
    const uid = (co.claimedByUserId ?? "").trim();
    if (!uid) continue;
    const prev = map.get(uid) ?? { ...EMPTY };
    const status = catalogCompanyOwnershipStatus({
      origin: co.origin,
      profileStatus: co.profileStatus,
    });
    let ownershipLabel = prev.ownershipLabel;
    if (status === "verified_owner") ownershipLabel = "Подтверждённый владелец";
    else if (status === "owner_submitted" && ownershipLabel !== "Подтверждённый владелец") {
      ownershipLabel = "Добавил компанию";
    }
    map.set(uid, {
      companyCount: prev.companyCount + 1,
      ownershipLabel,
    });
  }

  for (const claim of claims) {
    if (claim.status !== "approved") continue;
    const uid = claim.userId.trim();
    if (!uid) continue;
    const prev = map.get(uid) ?? { ...EMPTY };
    map.set(uid, {
      companyCount: Math.max(prev.companyCount, 1),
      ownershipLabel: "Подтверждённый владелец",
    });
  }

  return map;
}
