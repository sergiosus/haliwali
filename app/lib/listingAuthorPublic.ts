import type { StoredUser } from "./serverUsersStore";
import type { Listing } from "./listingModel";
import { getSafePublicName } from "@/lib/utils/getSafePublicName";

/**
 * Stored listing author snapshot for **public** listing payloads: visible handle / profile name,
 * otherwise {@link getSafePublicName}. Never derived from email or phone.
 */
export function authorPublicNameForNewListing(owner: StoredUser | null | undefined): string {
  if (!owner?.userId?.trim()) return getSafePublicName({ userId: "__" });

  return getSafePublicName({
    userId: owner.userId.trim(),
    name: owner.name,
    displayName: owner.displayName,
  });
}

export function persistAuthorPublicNameOnListingUpdate(
  _prev: Listing | null | undefined,
  next: Listing,
  owner: StoredUser | null | undefined,
): Listing {
  return { ...next, authorPublicName: authorPublicNameForNewListing(owner) };
}
