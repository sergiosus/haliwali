"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthRequiredModal } from "../AuthRequiredModal";
import { ListingFavoriteButton } from "../ListingFavoriteButton";
import { normalizeListingId } from "../../lib/listingId";
import { formatListingCardAuthor } from "../../lib/listingCardAuthorDisplay";
import {
  extractListingPhotos,
  listingCardLocationLine,
  listingDealStatusBadgeRu,
  listingPriceSnippet,
} from "../../lib/listingCardMeta";
import type { Listing } from "../../lib/listings";
import { appendReturnUrlQuery } from "../../lib/returnNavigation";
import { listingPath } from "../../lib/seo";
import { isLoggedIn as isLoggedInAuth } from "../../lib/auth";
import type { PublicAuthorHint } from "../../lib/useCompactListingEnrichment";

function typeSectionRu(t: Listing["type"]) {
  if (t === "task") return "Задача";
  if (t === "service") return "Услуга";
  if (t === "product_sell") return "Товар · продам";
  return "Товар · куплю";
}

function formatListedDayRu(ts: number) {
  try {
    return new Date(ts).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Do not pass email into author resolution (privacy). */
function stripEmailFromPublicApi(h: PublicAuthorHint | null | undefined): {
  displayName?: string;
  name?: string;
  identityLabel?: string;
} | null {
  if (!h) return null;
  return {
    ...(typeof h.displayName === "string" && h.displayName.trim() ? { displayName: h.displayName } : {}),
    ...(typeof h.name === "string" && h.name.trim() ? { name: h.name.trim() } : {}),
    ...(typeof h.identityLabel === "string" && h.identityLabel.trim() ? { identityLabel: h.identityLabel.trim() } : {}),
  };
}

type SellerPublic = {
  userId: string;
  displayName: string;
  name?: string;
  identityLabel?: string;
};

export function MapListingPreviewModal({
  open,
  listing,
  onClose,
  publicAuthor,
  viewCount,
  mapReturnPath,
}: {
  open: boolean;
  listing: Listing | null;
  onClose: () => void;
  publicAuthor: PublicAuthorHint | null | undefined;
  viewCount: number;
  /** e.g. `/map` for «Открыть полностью» return URL. */
  mapReturnPath: string;
}) {
  const router = useRouter();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [sellerPublic, setSellerPublic] = useState<SellerPublic | null>(null);

  const ownerId = (listing?.ownerId ?? "").trim();
  const images = useMemo(() => (listing ? extractListingPhotos(listing) : []), [listing]);
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    setPhotoIdx(0);
  }, [listing?.id]);

  useEffect(() => {
    if (!open || !ownerId || !ownerId.startsWith("user-")) {
      queueMicrotask(() => setSellerPublic(null));
      return;
    }
    let cancelled = false;
    void fetch(`/api/users/${encodeURIComponent(ownerId)}/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        setSellerPublic(d as SellerPublic);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, ownerId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !listing) return null;

  const storedAuthorPublic =
    typeof listing.authorPublicName === "string" ? listing.authorPublicName.trim() : "";
  const legacyAuthor = (listing as unknown as { authorName?: string }).authorName;
  const storedSnap =
    storedAuthorPublic ||
    (typeof legacyAuthor === "string" && legacyAuthor.trim() ? legacyAuthor.trim() : undefined);

  const authorDisplayName = formatListingCardAuthor({
    ownerId,
    publicApi: stripEmailFromPublicApi(
      sellerPublic
        ? {
            identityLabel: (sellerPublic.identityLabel ?? "").trim() || undefined,
            name: (sellerPublic.name ?? "").trim() || undefined,
            displayName: (sellerPublic.displayName ?? "").trim() || undefined,
          }
        : stripEmailFromPublicApi(publicAuthor ?? null),
    ),
    storedAuthorName: storedSnap,
    debugListingMeta: {
      id: listing.id,
      ownerId: listing.ownerId,
      authorPublicName: listing.authorPublicName,
    },
  });

  const title = (listing.title ?? "").trim() || "Объявление";
  const fullHref = appendReturnUrlQuery(listingPath(listing.id, listing.title), mapReturnPath);
  const metaPrice = listingPriceSnippet(listing);
  const locationLine = listingCardLocationLine(listing);
  const cat = (listing.categoryName ?? "").trim();
  const ts = listing.updatedAt ?? listing.createdAt;
  const chatReturn = mapReturnPath;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center px-0 pb-[env(safe-area-inset-bottom)] pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center sm:p-4 sm:pb-4 sm:pt-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Закрыть"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal
        aria-labelledby="map-listing-preview-title"
        className="relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-black/10 bg-white shadow-2xl sm:max-h-[min(92vh,880px)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
          <div className="min-w-0 text-sm font-semibold text-black/50">Объявление</div>
          <div className="flex shrink-0 items-center gap-2">
            <ListingFavoriteButton listingId={listing.id} />
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-medium text-black/55 hover:bg-black/[0.04]"
              onClick={onClose}
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] pt-4 sm:pb-4">
          {images.length > 0 ?
            <div className="mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[Math.min(photoIdx, images.length - 1)]}
                alt=""
                className="h-auto max-h-64 w-full rounded-xl object-cover"
              />
              {images.length > 1 ?
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {images.map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      onClick={() => setPhotoIdx(i)}
                      className={[
                        "h-14 w-14 overflow-hidden rounded-lg border bg-white",
                        i === photoIdx ? "border-[#ff7a00] opacity-100" : "border-black/10 opacity-70 hover:opacity-100",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              : null}
            </div>
          : <div className="mb-4 grid h-40 place-items-center rounded-xl border border-dashed border-black/15 bg-black/[0.03] text-sm text-black/45">
              Нет фото
            </div>
          }

          <h2 id="map-listing-preview-title" className="text-lg font-semibold leading-snug text-black">
            {title}
          </h2>
          <div className="mt-2 text-sm text-black/65">
            <span>{typeSectionRu(listing.type)}</span>
            {cat ?
              <>
                {" "}
                · <span>{cat}</span>
              </>
            : null}
            {metaPrice ?
              <>
                {" "}
                · <span className="font-semibold text-black/90">{metaPrice}</span>
              </>
            : null}
          </div>
          <div className="mt-1 text-sm text-black/55">
            {locationLine} · {formatListedDayRu(ts)}
            {viewCount > 0 ? ` · ${viewCount} просмотров` : null}
          </div>
          <div className="mt-1 text-xs text-black/45">{listingDealStatusBadgeRu(listing)}</div>

          {authorDisplayName.trim() ?
            <div className="mt-3 text-sm text-black/70">
              Автор: <span className="font-semibold text-black">{authorDisplayName}</span>
            </div>
          : null}

          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-black/80">{listing.description}</div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
              onClick={() => {
                if (!isLoggedInAuth()) {
                  setAuthModalOpen(true);
                  return;
                }
                const cleanId = normalizeListingId(listing.id);
                router.push(appendReturnUrlQuery(`/chat?listingId=${encodeURIComponent(cleanId)}`, chatReturn));
              }}
            >
              Написать
            </button>
            <Link
              href={fullHref}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black/85 hover:bg-black/[0.03]"
            >
              Открыть полностью
            </Link>
          </div>
          <p className="mt-2 text-xs text-black/45">Связь через чат внутри сервиса</p>
        </div>
      </div>

      <AuthRequiredModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        nextPath={typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/map"}
      />
    </div>
  );
}
