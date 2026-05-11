"use client";

import Link from "next/link";
import { formatListingCardAuthor } from "../lib/listingCardAuthorDisplay";
import type { Listing } from "../lib/listings";
import { publicUserProfilePath } from "../lib/userPublicProfile";

export function ListingAuthorLine({
  ownerId,
  currentUserId,
  publicApi,
  storedAuthorName,
  debugListingMeta,
  nameClassName = "font-medium text-black/78",
  linkClassName = "font-medium text-orange-600 hover:text-orange-700 hover:underline",
}: {
  ownerId?: string | null;
  currentUserId?: string | null;
  publicApi?: {
    displayName?: string;
    name?: string;
    identityLabel?: string;
  } | null;
  storedAuthorName?: string;
  debugListingMeta?: Pick<Listing, "id" | "ownerId" | "authorPublicName"> | null;
  nameClassName?: string;
  linkClassName?: string;
}) {
  const oid = (ownerId ?? "").trim();
  const cid = (currentUserId ?? "").trim();
  const isSelf = Boolean(oid && cid && oid === cid);
  const displayName = isSelf
    ? "Вы"
    : formatListingCardAuthor({
        ownerId: oid || undefined,
        publicApi: publicApi ?? null,
        storedAuthorName,
        debugListingMeta: debugListingMeta ?? null,
      });

  return (
    <span>
      Автор:{" "}
      {isSelf ? (
        <Link href="/account" className={linkClassName}>
          Вы
        </Link>
      ) : oid ? (
        <Link href={publicUserProfilePath(oid)} className={linkClassName}>
          {displayName}
        </Link>
      ) : (
        <span className={nameClassName}>{displayName}</span>
      )}
    </span>
  );
}
