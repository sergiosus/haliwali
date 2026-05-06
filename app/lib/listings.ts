"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Listing, ListingStatus, ProductListing, ServiceListing, TaskListing } from "./listingModel";
import { dedupeListingsById, isListingPubliclyListed } from "./listingModel";
import { getCurrentUserId } from "./auth";
import { isDebugAuthClient } from "./debugAuth";

export * from "./listingModel";

type ApiErrorPayload = { error?: unknown; message?: unknown };

export class ListingsApiError extends Error {
  status: number;
  payload: ApiErrorPayload | null;
  constructor(message: string, status: number, payload: ApiErrorPayload | null) {
    super(message);
    this.name = "ListingsApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** Russian UI copy for `/api/listings` failures — used by posting flows. */
export function listingsSubmitUserMessage(error: unknown): string | null {
  if (!(error instanceof ListingsApiError)) return null;
  const pRaw = error.payload;
  const p = pRaw && typeof pRaw === "object" ? (pRaw as { error?: unknown; message?: unknown }) : null;
  if (
    error.message === "ACCOUNT_PENDING_DELETION" ||
    (typeof p?.error === "string" && p.error === "ACCOUNT_PENDING_DELETION")
  ) {
    return typeof p?.message === "string"
      ? p.message
      : "Аккаунт ожидает удаления. Для продолжения работы восстановите аккаунт.";
  }
  if (error.message === "UNAUTHORIZED") return "Войдите в аккаунт и попробуйте снова.";
  if (error.message === "BAD_REQUEST") return "Заполните обязательные поля.";
  if (error.message === "SERVER_ERROR") return "Не удалось сохранить объявление. Попробуйте позже.";
  return null;
}

function redactListingForLogs(listing: Listing) {
  const out = { ...listing } as Record<string, unknown>;
  // Never log phone in production.
  if (process.env.NODE_ENV === "production") delete out.phone;
  return out;
}

export function useListingsStore() {
  const [listings, setListings] = useState<Listing[]>([]);
  const listingsRef = useRef<Listing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/listings", { credentials: "include", cache: "no-store", signal });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { listings?: unknown };
      const arr = Array.isArray(data.listings) ? (data.listings as Listing[]) : [];
      if (signal?.aborted) return;
      setListings(dedupeListingsById(arr));
      setLoadError(null);
    } catch (e) {
      const aborted = signal?.aborted || (e as { name?: string })?.name === "AbortError";
      if (aborted) return;
      setLoadError("Не удалось загрузить объявления");
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    const ac = new AbortController();
    void refresh(ac.signal);
    return () => ac.abort();
  }, [refresh]);

  const applyListing = useCallback((item: Listing) => {
    setListings((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx < 0) return dedupeListingsById([item, ...prev]);
      const next = [...prev];
      next[idx] = item;
      return dedupeListingsById(next);
    });
  }, []);

  const hydrateListingById = useCallback(
    async (id: string) => {
      const clean = id.trim();
      if (!clean) return null;
      try {
        const r = await fetch(`/api/listings/${encodeURIComponent(clean)}`, { credentials: "include", cache: "no-store" });
        if (!r.ok) return null;
        const data = (await r.json()) as { listing?: Listing };
        const item = data.listing;
        if (!item || typeof item !== "object") return null;
        applyListing(item);
        return item;
      } catch {
        return null;
      }
    },
    [applyListing],
  );

  const addListing = useCallback(
    async (listing: Listing) => {
      const url = "/api/listings";
      const body = JSON.stringify(listing);

      if (isDebugAuthClient()) {
        const uid = getCurrentUserId();
        console.log("[listing] submit auth state", { hasUser: Boolean(uid), userId: uid ?? undefined });
      }

      if (isDebugAuthClient()) {
        console.log("LISTING SUBMIT", {
          url,
          uses: "JSON",
          photosCount: Array.isArray(listing.photos) ? listing.photos.length : 0,
          listing: redactListingForLogs(listing),
        });
      }

      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body,
      });
      const status = r.status;
      const rawText = await r.text().catch(() => "");
      let parsedBody: ApiErrorPayload & { ok?: boolean; id?: string } | null = null;
      try {
        parsedBody = rawText ? ((JSON.parse(rawText) as typeof parsedBody) ?? null) : null;
      } catch {
        parsedBody = null;
      }

      if (isDebugAuthClient()) {
        console.log("[listing] create response", { status, body: parsedBody ?? (rawText.trim() ? rawText : null) });
      }

      if (!r.ok) {
        const payload = parsedBody as ApiErrorPayload | null;
        let msg = "SAVE_FAILED";
        if (typeof payload?.error === "string") msg = payload.error;
        else if (typeof payload?.message === "string") msg = payload.message;
        throw new ListingsApiError(msg, status, payload);
      }

      await refresh();
    },
    [refresh],
  );

  const setStatus = useCallback(
    async (id: string, status: ListingStatus) => {
      const r = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("STATUS_FAILED");
      await refresh();
    },
    [refresh],
  );

  const deleteListing = useCallback(
    async (listingId: string) => {
      const id = listingId.trim();
      if (!id) return;
      const r = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error("DELETE_FAILED");
      await refresh();
    },
    [refresh],
  );

  const archiveListingFromTrash = useCallback(
    async (listingId: string) => {
      const id = listingId.trim();
      if (!id) return;
      const r = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archive_from_trash" }),
      });
      if (!r.ok) throw new Error("ARCHIVE_FAILED");
      await refresh();
    },
    [refresh],
  );

  const permanentDeleteListingFromTrash = useCallback(
    async (listingId: string) => {
      const id = listingId.trim();
      if (!id) return;
      const r = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "permanent_delete" }),
      });
      if (!r.ok) throw new Error("PERMANENT_DELETE_FAILED");
      await refresh();
    },
    [refresh],
  );

  const updateListing = useCallback(
    async (id: string, updater: (prev: Listing) => Listing) => {
      const prev = listingsRef.current.find((l) => l.id === id) ?? null;
      if (!prev) throw new Error("NOT_FOUND");
      const next = { ...updater(prev), updatedAt: Date.now() } as Listing;
      const r = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error("UPDATE_FAILED");
      await refresh();
    },
    [refresh],
  );

  const findByEditToken = useCallback(
    (token: string) => listings.find((l) => l.editToken === token) ?? null,
    [listings],
  );

  const findById = useCallback((listingId: string) => listings.find((l) => l.id === listingId) ?? null, [listings]);

  const publishedTasks = useMemo(
    () => listings.filter((l): l is TaskListing => l.type === "task" && isListingPubliclyListed(l)),
    [listings],
  );
  const publishedServices = useMemo(
    () => listings.filter((l): l is ServiceListing => l.type === "service" && isListingPubliclyListed(l)),
    [listings],
  );
  const publishedProducts = useMemo(
    () =>
      listings.filter(
        (l): l is ProductListing =>
          (l.type === "product_sell" || l.type === "product_buy") && isListingPubliclyListed(l),
      ),
    [listings],
  );

  return {
    loaded,
    loadError,
    listings,
    refreshListings: refresh,
    hydrateListingById,
    addListing,
    setStatus,
    deleteListing,
    archiveListingFromTrash,
    permanentDeleteListingFromTrash,
    updateListing,
    findByEditToken,
    findById,
    publishedTasks,
    publishedServices,
    publishedProducts,
  };
}
