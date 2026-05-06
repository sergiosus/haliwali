"use client";

/**
 * Legacy helpers: `getOrCreateOwnerId` for anonymous flows.
 * Authoritative listing data is stored in PostgreSQL / `.data/listings.json` via `/api/listings`.
 */
import type { Listing, ListingStatus } from "./listings";
import { isPublicStatus, parseListings } from "./listings";

const STORAGE_KEY = "haliwali_listings";
const OWNER_KEY = "haliwali_owner_id";

function readAll(): Listing[] {
  if (typeof window === "undefined") return [];
  return parseListings(localStorage.getItem(STORAGE_KEY));
}

function writeAll(next: Listing[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function makeId(prefix = "owner") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateOwnerId() {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(OWNER_KEY);
  if (existing) return existing;
  const id = makeId("owner");
  localStorage.setItem(OWNER_KEY, id);
  return id;
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function getListings(): Listing[] {
  return readAll();
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function getListingById(id: string): Listing | null {
  return readAll().find((l) => l.id === id) ?? null;
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function getListingsByOwner(ownerId: string): Listing[] {
  if (!ownerId) return [];
  return readAll().filter((l) => l.ownerId === ownerId);
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function getPublicListings(): Listing[] {
  // Backward compat: treat missing status as public.
  return readAll().filter((l) => !("status" in l) || isPublicStatus((l as Listing).status));
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function createListing(listing: Listing): Listing {
  const next = [listing, ...readAll()];
  writeAll(next);
  return listing;
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function updateListing(id: string, patch: Partial<Listing>): Listing | null {
  let updated: Listing | null = null;
  const next = readAll().map((l) => {
    if (l.id !== id) return l;
    updated = { ...l, ...patch, updatedAt: Date.now() } as Listing;
    return updated;
  });
  writeAll(next);
  return updated;
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function deleteListing(id: string) {
  const next = readAll().filter((l) => l.id !== id);
  writeAll(next);
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function setListingStatus(id: string, status: ListingStatus) {
  return updateListing(id, { status });
}

