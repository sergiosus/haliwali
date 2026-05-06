/**
 * Safe, non‑PII public display labels for marketplace surfaces (listings, chat, APIs to other users).
 * Never derives from email or phone.
 */

export type SafePublicNameInput = {
  userId: string;
  /** Profile full / legal-style name saved by the user */
  name?: string | null;
  /** Visible handle / nickname */
  displayName?: string | null;
};

function clampDisplay(s: string, maxLen: number): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

/** First 8 alphanumeric chars of `userId`, uppercased; pads with `0` if fewer than 8. */
function safePublicSuffix8(userIdRaw: string): string {
  const userId = userIdRaw.trim().replace(/^user-/i, "");
  let acc = "";
  for (const ch of userId) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      acc += ch.toUpperCase();
      if (acc.length >= 8) return acc.slice(0, 8);
    }
  }
  while (acc.length < 8) acc += "0";
  return acc.slice(0, 8);
}

export function getSafePublicName(user: SafePublicNameInput | null | undefined): string {
  const uidRaw = (user?.userId ?? "").trim();
  const uid = uidRaw || "00000000";

  const displayName = clampDisplay(user?.displayName ?? "", 120);
  if (displayName) return displayName;

  const name = clampDisplay(user?.name ?? "", 120);
  if (name) return name;

  return `Пользователь #${safePublicSuffix8(uid)}`;
}
