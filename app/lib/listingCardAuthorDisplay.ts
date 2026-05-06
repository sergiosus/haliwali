"use client";

import { getSafePublicName } from "@/lib/utils/getSafePublicName";
import { isSyntheticListingAuthorLabel } from "./getAuthorDisplayName";
import { looksLikeTechnicalUserId } from "./getPublicUserName";
import type { Listing } from "./listingModel";
import type { UserDisplaySource } from "./userDisplayName";
import { USER_DISPLAY_FALLBACK } from "./userDisplayName";
import { getUserById } from "./users";

/** Подпись «Автор» когда не удалось вывести идентичность по владельцу. */
export const LISTING_AUTHOR_FALLBACK_LABEL = "Пользователь";

const HIDDEN = new Set(
  ["Пользователь", "Гость", USER_DISPLAY_FALLBACK, "без имени", "гость", "пользователь"].map((s) =>
    s.toLowerCase(),
  ),
);

function sanitizeAuthorToken(t: string): string {
  const s = t.trim();
  if (!s) return "";
  if (looksLikeTechnicalUserId(s)) return "";
  const low = s.toLowerCase();
  if (HIDDEN.has(low)) return "";
  if (isSyntheticListingAuthorLabel(s)) return "";
  return s;
}

/** Только кэш аккаунта (`getUserById` ← `/auth/me`), без локального черновика `getProfile`. */
function liveAuthorFromUserCache(ownerId: string): string {
  const id = ownerId.trim();
  if (!id) return "";

  const u = getUserById(id);
  if (!u) return "";

  const resolved = getSafePublicName({
    userId: (u.userId ?? id).trim() || id,
    name: `${u.serverProfileName ?? ""}`.trim() || undefined,
    displayName: `${u.serverChosenDisplay ?? ""}`.trim() || undefined,
  });

  return sanitizeAuthorToken(resolved);
}

/**
 * Карточка объявления: кэш владельца → `identityLabel|name` с `/api/users/…/public` → снимок в объявлении.
 */
export function formatListingCardAuthor(args: {
  ownerId?: string;
  publicApi?: {
    displayName?: string;
    name?: string;
    identityLabel?: string;
  } | null;
  storedAuthorName?: string;
  /** Только диагностика / лог: id объявления в dev. */
  debugListingMeta?: Pick<Listing, "id" | "ownerId" | "authorPublicName"> | null;
}): string {
  const ownerIdTrim = `${args.ownerId ?? ""}`.trim();
  const fromLive =
    ownerIdTrim ? sanitizeAuthorToken(liveAuthorFromUserCache(ownerIdTrim)).trim()
    : "";
  const fromApiIdentity =
    typeof args.publicApi?.identityLabel === "string"
      ? sanitizeAuthorToken(`${args.publicApi.identityLabel}`.trim())
      : "";
  const fromApiProfileName = sanitizeAuthorToken(
    (typeof args.publicApi?.name === "string" ? args.publicApi.name : "").trim(),
  );

  const fromSnap = sanitizeAuthorToken((`${args.storedAuthorName ?? ""}`).trim());

  const resolvedAuthor =
    fromLive.trim() ?
      fromLive.trim()
    : fromApiIdentity.trim() ?
      fromApiIdentity.trim()
    : fromApiProfileName.trim() ?
      fromApiProfileName.trim()
    : fromSnap.trim() ?
      fromSnap.trim()
    : LISTING_AUTHOR_FALLBACK_LABEL;

  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const meta = args.debugListingMeta ?? null;
    console.log("[LISTING AUTHOR RESOLVE]", {
      listingId: meta?.id,
      ownerId: ownerIdTrim || meta?.ownerId,
      listingAuthorSnapshot: `${meta?.authorPublicName ?? ""}`.trim() || `${args.storedAuthorName ?? ""}`.trim(),
      resolvedAuthor,
    });
  }

  return resolvedAuthor;
}

export function getListingAuthorDisplayName(
  listing: { id?: string; ownerId?: string; userId?: string; authorId?: string } & Partial<
    Pick<Listing, "authorPublicName">
  > & {
    /** Легаси */
    authorName?: unknown;
    authorEmail?: string;
  },
  usersById?: Map<string, UserDisplaySource>,
  currentUser?: UserDisplaySource | null,
): string {
  const ownerIdRaw =
    `${listing.ownerId ?? ""}`.trim() ||
    `${listing.userId ?? ""}`.trim() ||
    `${listing.authorId ?? ""}`.trim();

  const currentId = `${currentUser?.userId ?? currentUser?.id ?? ""}`.trim();

  const ownerSnap =
    `${listing.authorPublicName ?? ""}`.trim() ||
    (typeof listing.authorName === "string" ? listing.authorName.trim() : "") ||
    undefined;

  if (ownerIdRaw && usersById?.has(ownerIdRaw)) {
    const src = usersById.get(ownerIdRaw)!;
    const oid = `${src.userId ?? src.id ?? ownerIdRaw}`.trim() || ownerIdRaw;
    return getSafePublicName({
      userId: oid,
      name: src.name ?? src.fullName ?? null,
      displayName: src.displayName ?? src.username ?? null,
    });
  }

  if (ownerIdRaw && currentId && ownerIdRaw === currentId && currentUser) {
    const src = currentUser;
    const oid = `${src.userId ?? src.id ?? ownerIdRaw}`.trim() || ownerIdRaw;
    return getSafePublicName({
      userId: oid,
      name: src.name ?? src.fullName ?? null,
      displayName: src.displayName ?? src.username ?? null,
    });
  }

  return formatListingCardAuthor({
    ownerId: ownerIdRaw,
    publicApi: null,
    storedAuthorName: ownerSnap,
    debugListingMeta: listing.id ?
      {
        id: listing.id,
        ownerId: ownerIdRaw || listing.ownerId,
        authorPublicName: `${listing.authorPublicName ?? ownerSnap ?? ""}`,
      }
    : null,
  });
}
