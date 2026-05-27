import type {
  CatalogCompanyOrigin,
  CatalogCompanyOwnershipStatus,
  CatalogCompanyProfileStatus,
} from "./catalogTypes";

export type CatalogCompanyOriginView =
  | CatalogCompanyOrigin
  | "verified_owner";

export function normalizeCatalogCompanyOrigin(value: unknown): CatalogCompanyOrigin {
  return value === "imported_by_admin" ||
    value === "owner_submitted" ||
    value === "user_submitted" ?
      value
    : "imported_public";
}

export function catalogCompanyOriginFromDraftPayload(payload: Record<string, unknown> | null | undefined): CatalogCompanyOrigin {
  const sourceType = String(payload?.sourceType ?? "");
  const origin = String(payload?.origin ?? "");
  const submissionStatus = String(payload?.submissionStatus ?? "");
  const submissionType = String(payload?.submissionType ?? "");

  if (
    sourceType === "owner_submitted" ||
    origin === "owner_submitted"
  ) {
    return "owner_submitted";
  }
  if (
    sourceType === "user_submitted" ||
    origin === "user_submitted" ||
    submissionStatus === "user_submitted" ||
    submissionType === "public_company_form"
  ) {
    return "user_submitted";
  }
  if (sourceType === "admin_import" || origin === "imported_by_admin") {
    return "imported_by_admin";
  }
  return "imported_public";
}

export function catalogCompanyOriginView(input: {
  origin?: CatalogCompanyOrigin | null;
  profileStatus?: CatalogCompanyProfileStatus | null;
}): CatalogCompanyOriginView {
  if (input.profileStatus === "verified") return "verified_owner";
  return normalizeCatalogCompanyOrigin(input.origin);
}

export function catalogCompanyOwnershipStatus(input: {
  origin?: CatalogCompanyOrigin | null;
  profileStatus?: CatalogCompanyProfileStatus | null;
  hasPendingClaim?: boolean;
}): CatalogCompanyOwnershipStatus {
  if (input.profileStatus === "verified") return "verified_owner";
  if (input.hasPendingClaim) return "claim_pending";
  const origin = normalizeCatalogCompanyOrigin(input.origin);
  if (origin === "owner_submitted" || origin === "user_submitted") return "owner_submitted";
  return "imported_public";
}

export function catalogCompanyOwnershipStatusLabel(status: CatalogCompanyOwnershipStatus): string {
  if (status === "verified_owner") return "Подтверждённая компания";
  if (status === "claim_pending") return "Заявка на подтверждение";
  if (status === "owner_submitted") return "Добавлено владельцем";
  return "Публичный каталог";
}

export function catalogCompanyOriginLabel(view: CatalogCompanyOriginView): string {
  if (view === "verified_owner") return "Подтверждённая компания";
  if (view === "owner_submitted" || view === "user_submitted") return "Добавлено владельцем";
  return "Публичный каталог";
}

/** Admin panel: short ownership labels (no CRM wording). */
export function adminCatalogOwnershipBadgeLabel(input: {
  origin?: CatalogCompanyOrigin | null;
  profileStatus?: CatalogCompanyProfileStatus | null;
  hasPendingClaim?: boolean;
}): string {
  const status = catalogCompanyOwnershipStatus(input);
  if (status === "verified_owner") return "Подтверждённый владелец";
  if (status === "owner_submitted") return "Добавил компанию";
  if (status === "claim_pending") return "Заявка на подтверждение";
  return "";
}

export function catalogCompanyOriginBadgeClass(view: CatalogCompanyOriginView): string {
  if (view === "verified_owner") return "bg-emerald-50 text-emerald-800";
  if (view === "owner_submitted" || view === "user_submitted") return "bg-sky-50 text-sky-800";
  return "bg-black/[0.035] text-black/45";
}

