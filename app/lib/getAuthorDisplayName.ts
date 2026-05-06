import { PUBLIC_DISPLAY_NAME_FALLBACK } from "./getPublicUserName";
import { getUserDisplayName } from "./userDisplayName";

export function isSyntheticListingAuthorLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t === PUBLIC_DISPLAY_NAME_FALLBACK) return true;
  if (/^Удалённый/i.test(t)) return true;
  if (/^Объявление/i.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return true;
  return false;
}

export function authorLabelFromPublicApi(d: {
  displayName?: string | null;
  email?: string | null;
  name?: string | null;
}): string {
  return getUserDisplayName({ name: d.name, displayName: d.displayName }, undefined, {
    allowEmailFallback: false,
  });
}

/** @deprecated Prefer getPublicUserName / {@link getUserDisplayName} */
export function getAuthorDisplayName(opts: { email?: string }): string {
  return getUserDisplayName({ email: opts.email }, undefined, { allowEmailFallback: false });
}
