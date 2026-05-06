"use client";

import { useEffect, useState } from "react";
import type { Listing } from "./listings";

export type PublicAuthorHint = {
  displayName?: string;
  email?: string;
  name?: string;
  identityLabel?: string;
};

/**
 * Batches existing `/api/listings/views` + `/api/users/[id]/public` calls for compact cards (no API changes).
 */
export function useCompactListingEnrichment(listings: readonly Listing[]) {
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [publicByUserId, setPublicByUserId] = useState<Record<string, PublicAuthorHint>>({});

  useEffect(() => {
    if (listings.length === 0) {
      setViewCounts({});
      return;
    }
    const ids = listings.map((l) => l.id).filter(Boolean);
    const qs = ids.map((id) => encodeURIComponent(id)).join(",");
    let cancelled = false;
    void fetch(`/api/listings/views?ids=${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const c = (d as { counts?: unknown }).counts;
        if (c && typeof c === "object") setViewCounts(c as Record<string, number>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listings]);

  useEffect(() => {
    const ownerIds = [...new Set(listings.map((l) => (l.ownerId ?? "").trim()).filter(Boolean))];
    if (ownerIds.length === 0) {
      setPublicByUserId({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      ownerIds.map(async (uid) => {
        try {
          const r = await fetch(`/api/users/${encodeURIComponent(uid)}/public`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!r.ok) return [uid, null] as const;
          const d = (await r.json()) as {
            displayName?: unknown;
            email?: unknown;
            name?: unknown;
            identityLabel?: unknown;
          };
          const displayName = typeof d.displayName === "string" ? d.displayName : undefined;
          const email = typeof d.email === "string" ? d.email : undefined;
          const name = typeof d.name === "string" ? d.name.trim() : undefined;
          const identityLabel =
            typeof d.identityLabel === "string" ? `${d.identityLabel}`.trim() : undefined;
          if (!displayName && !email && !name && !identityLabel) return [uid, null] as const;
          return [
            uid,
            {
              displayName,
              email,
              ...(name ? { name } : {}),
              ...(identityLabel ? { identityLabel } : {}),
            } as PublicAuthorHint,
          ] as const;
        } catch {
          return [uid, null] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, PublicAuthorHint> = {};
      for (const [uid, hint] of pairs) {
        if (hint) next[uid] = hint;
      }
      setPublicByUserId(next);
    });
    return () => {
      cancelled = true;
    };
  }, [listings]);

  return { viewCounts, publicByUserId };
}
