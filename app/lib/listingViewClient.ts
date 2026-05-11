"use client";

import { readListingViewLocationPayload } from "./listingViewLocation";

const inFlightByListingId = new Map<string, Promise<number | null>>();

type ViewPostResponse = {
  count?: unknown;
  incremented?: unknown;
  skipped?: unknown;
  error?: unknown;
};

function logListingViewClient(payload: { listingId: string; ok: boolean; incremented?: boolean; skipped?: boolean }) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[LISTING_VIEW]", payload);
}

export async function recordListingViewOnce(listingId: string, opts?: { skip?: boolean }): Promise<number | null> {
  const id = listingId.trim();
  if (!id || opts?.skip) return null;

  const existing = inFlightByListingId.get(id);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const location = readListingViewLocationPayload();
      const r = await fetch(`/api/listings/${encodeURIComponent(id)}/view`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location }),
      });
      const data = (await r.json().catch(() => null)) as ViewPostResponse | null;
      if (!r.ok || !data || typeof data.count !== "number") {
        logListingViewClient({ listingId: id, ok: false });
        return null;
      }
      logListingViewClient({
        listingId: id,
        ok: true,
        incremented: data.incremented === true,
        skipped: data.skipped === true,
      });
      return data.count;
    } catch {
      logListingViewClient({ listingId: id, ok: false });
      return null;
    } finally {
      inFlightByListingId.delete(id);
    }
  })();

  inFlightByListingId.set(id, pending);
  return pending;
}
