import type { StoredUser } from "./serverUsersStore";
import { getPublicUserName } from "./getPublicUserName";
import { USER_DISPLAY_FALLBACK } from "./userDisplayName";

/** Login label for tables (same source as auth / verified-users). */
export function adminLoginOrEmail(u: StoredUser): string {
  const em = (u.email ?? "").trim();
  if (em) return em;
  const ph = (u.phone ?? "").trim();
  return ph || u.userId;
}

/**
 * Email local-part, or excerpt of phone (admin-only contexts).
 * Does not expose full email; omit final «Пользователь» so callers can chain fallbacks.
 */
export function adminUsernameOrShortLogin(u: StoredUser): string {
  const em = (u.email ?? "").trim();
  if (em.includes("@")) {
    const local = em.split("@")[0]?.trim();
    if (local) return local;
  }
  const ph = (u.phone ?? "").trim();
  if (ph) return ph.length > 32 ? `${ph.slice(0, 32)}…` : ph;
  return "";
}

/**
 * Resolved «Имя» column — same priority as {@link getPublicUserName}.
 */
export function adminResolvedProfileName(u: StoredUser): string {
  return getPublicUserName({ name: u.name, displayName: u.displayName, email: u.email });
}

/** Alias: admin API `displayName` field is this resolved profile label. */
export function adminDisplayName(u: StoredUser): string {
  return adminResolvedProfileName(u);
}

/** Longer label for tooltips / «Пользователь» column — full email · phone where present. */
export function adminReporterLabel(u: StoredUser): string {
  const em = (u.email ?? "").trim();
  const ph = (u.phone ?? "").trim();
  const parts: string[] = [];
  if (em) parts.push(em);
  if (ph) parts.push(ph);
  return parts.length ? parts.join(" · ") : adminUsernameOrShortLogin(u) || USER_DISPLAY_FALLBACK;
}

export function adminUserStatus(u: StoredUser, moderationBlocked: boolean): string {
  if (moderationBlocked) return "blocked";
  const ds = (u.deletionStatus ?? "").trim();
  if (ds === "deleted") return "deleted";
  if (ds === "pending_deletion") return "pending_deletion";
  return "active";
}
