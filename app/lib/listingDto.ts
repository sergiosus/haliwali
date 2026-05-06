import type { Listing } from "./listingModel";

type PrivateKeys =
  | "phone"
  | "contactPhone"
  | "email"
  | "ownerEmail"
  | "ownerPhone"
  | "passwordHash"
  | "internalNotes";

export type PublicListingDTO<T extends Listing = Listing> = Omit<T, PrivateKeys>;

export function toPublicListingDTO<T extends Listing>(listing: T): PublicListingDTO<T> {
  // Strip private/sensitive fields defensively, but preserve the original union typing of Listing.
  const obj = listing as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  delete out.phone;
  delete out.contactPhone;
  delete out.email;
  delete out.ownerEmail;
  delete out.ownerPhone;
  delete out.passwordHash;
  delete out.internalNotes;
  if (!listing.addressPublic) {
    delete out.address;
    delete out.latitude;
    delete out.longitude;
    delete out.location;
  }
  return out as PublicListingDTO<T>;
}

