"use client";

import { getSafePublicName } from "@/lib/utils/getSafePublicName";
import { getProfile } from "./profile";
import { getUserById } from "./users";
import {
  isPublicDisplayNameFallback,
  type PublicNameInput,
  PUBLIC_DISPLAY_NAME_FALLBACK,
} from "./getPublicUserName";
import { getUserDisplayName, USER_DISPLAY_FALLBACK } from "./userDisplayName";

export const LEGACY_CHAT_SENDER_PLACEHOLDERS = new Set<string>([
  "Автор",
  "Автор объявления",
  PUBLIC_DISPLAY_NAME_FALLBACK,
  "Пользователь",
  "Собеседник",
]);

/**
 * Builds a display-only preview from cached user + local profile draft (names only; no email / phone).
 */
export function mergeClientStoresToPublicUser(userId: string): PublicNameInput | null {
  if (typeof window === "undefined") return null;
  const id = userId.trim();
  if (!id) return null;

  const p = getProfile(id);
  const u = getUserById(id);

  const serverNm = typeof u?.serverProfileName === "string" ? u.serverProfileName.trim() : "";
  const serverDn = typeof u?.serverChosenDisplay === "string" ? u.serverChosenDisplay.trim() : "";

  const profileNm = ((p?.name ?? "") as string).trim();

  const userPart: PublicNameInput = {
    ...(serverNm ? { name: serverNm } : {}),
    ...(serverDn ? { displayName: serverDn } : {}),
  };

  const profilePart = profileNm ? { name: profileNm } : {};

  const resolved = getUserDisplayName(userPart, profilePart, { allowEmailFallback: false });

  if (resolved === USER_DISPLAY_FALLBACK) return null;

  return { name: resolved };
}

type PublicSenderOpts = {
  userId: string;
  emptyLabel: string;
  senderNameFromMessage?: string;
  displayHint?: string;
};

export function getPublicSenderName(opts: PublicSenderOpts): string {
  const id = (opts.userId ?? "").trim();
  if (!id) return opts.emptyLabel;

  const merged = mergeClientStoresToPublicUser(id);
  if (merged?.name?.trim()) {
    const fromMerged = getSafePublicName({ userId: id, displayName: merged.name.trim() });
    if (!isPublicDisplayNameFallback(fromMerged)) return fromMerged;
  }

  const sid = (opts.senderNameFromMessage ?? "").trim();
  if (sid && !isPublicDisplayNameFallback(sid) && !LEGACY_CHAT_SENDER_PLACEHOLDERS.has(sid)) {
    if (sid.includes("@")) return getSafePublicName({ userId: id });
    return getSafePublicName({ userId: id, displayName: sid });
  }

  const hint = (opts.displayHint ?? "").trim();
  if (hint && !isPublicDisplayNameFallback(hint) && !LEGACY_CHAT_SENDER_PLACEHOLDERS.has(hint)) {
    return getSafePublicName({ userId: id, displayName: hint });
  }

  if (merged?.name?.trim()) return getSafePublicName({ userId: id, displayName: merged.name.trim() });
  return getSafePublicName({ userId: id }) || opts.emptyLabel;
}
