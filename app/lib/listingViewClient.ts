"use client";

import { readListingViewLocationPayload } from "./listingViewLocation";

const recordedListingIds = new Set<string>();

export async function recordListingViewOnce(listingId: string, opts?: { skip?: boolean }): Promise<number | null> {
  const id = listingId.trim();
  if (!id || opts?.skip) return null;
  if (recordedListingIds.has(id)) return null;
  recordedListingIds.add(id);

  try {
    const location = readListingViewLocationPayload();
    const r = await fetch(`/api/listings/${encodeURIComponent(id)}/view`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location }),
    });
    const data = (await r.json().catch(() => null)) as { count?: unknown } | null;
    if (!data || typeof data.count !== "number") return null;
    return data.count;
  } catch {
    return null;
  }
}
