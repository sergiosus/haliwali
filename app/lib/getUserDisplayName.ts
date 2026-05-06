import type { StoredUser } from "./serverUsersStore";

export type AdminReporterDisplayInput = {
  email?: string;
  phone?: string;
};

export function userDisplayInputFromStoredAuth(
  u: StoredUser | null | undefined,
): AdminReporterDisplayInput {
  if (!u) return {};
  const email = (u.email ?? "").trim();
  const phone = (u.phone ?? "").trim();
  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };
}

export function formatAdminReporterLabel(input: AdminReporterDisplayInput): string {
  const email = (input.email ?? "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  const phone = (input.phone ?? "").trim();
  if (phone) return phone;
  if (email) return email;
  return "—";
}

/** Display label derived from email local-part for API/public contexts; fallback when no email. */
export function getUserDisplayName(arg: null | { email?: string }): string {
  if (!arg) return "Пользователь";
  const email = (arg.email ?? "").trim();
  if (email.includes("@")) {
    return email.split("@")[0]?.trim() || "Пользователь";
  }
  return "Пользователь";
}
