import { getUserDisplayName, USER_DISPLAY_FALLBACK } from "./userDisplayName";

/** @deprecated Используйте {@link getUserDisplayName} / {@link USER_DISPLAY_FALLBACK}. */
export const UNIFIED_USER_FALLBACK = USER_DISPLAY_FALLBACK;

function pick(s?: string | null): string {
  if (typeof s !== "string") return "";
  return s.trim();
}

/** @deprecated Предпочтительно {@link getUserDisplayName}. */
export function unifiedUserDisplayLabel(
  o: {
    name?: string | null;
    username?: string | null;
    displayName?: string | null;
    email?: string | null;
    loginOrEmail?: string | null;
  },
  fallback: string,
): string {
  void fallback;
  return getUserDisplayName(
    {
      name: o.name,
      displayName: o.displayName,
      username: o.username,
      email: o.email ?? undefined,
      loginOrEmail: o.loginOrEmail ?? undefined,
    },
    undefined,
  );
}
