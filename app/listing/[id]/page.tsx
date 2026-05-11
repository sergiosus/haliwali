"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "../../lib/listings";
import { isPublicStatus, useListingsStore } from "../../lib/listings";
import { normalizeListingId } from "../../lib/listingId";
import { truncateMetaDescription } from "../../lib/seo";
import { isLoggedIn as isLoggedInAuth, useAuth } from "../../lib/auth";
import { ListingFavoriteButton } from "../../components/ListingFavoriteButton";
import { ReturnLink } from "../../components/ReturnLink";
import { isUserVerified } from "../../lib/users";
import { AuthRequiredModal } from "../../components/AuthRequiredModal";
import { toPublicListingDTO, type PublicListingDTO } from "../../lib/listingDto";
import { getProfile } from "../../lib/profile";
import { FAST_REPLY_BADGE_LABEL, formatLastSeenRu } from "../../lib/trustUi";
import { ReportModal } from "../../components/ReportModal";
import { pingPresenceThrottled } from "../../lib/clientPresencePing";
import { fastReplyEligibleFromLocalChats } from "../../lib/chatFastReply";
import { appendReturnUrlQuery, pathnameWithSearchSansReturn } from "../../lib/returnNavigation";
import { formatListingCardAuthor } from "../../lib/listingCardAuthorDisplay";
import { extractListingPhotos, formatViewCountRu } from "../../lib/listingCardMeta";
import { listingPath } from "../../lib/seo";

export default function ListingPage() {
  const params = useParams<{ id: string }>();
  const slugOrId = params?.id ?? "";
  const sp = useSearchParams();
  const pathname = usePathname();
  const cat = sp.get("cat");
  const auth = useAuth();

  const { loaded, findById, listings, hydrateListingById } = useListingsStore();

  const listing = useMemo(() => {
    if (!slugOrId) return null;
    // First try exact id match.
    const direct = findById(slugOrId);
    if (direct) return direct;
    // Otherwise, the route param may be "id-title-slug". Our ids can contain hyphens,
    // so we resolve by matching any known listing.id prefix.
    for (const l of listings) {
      if (slugOrId === l.id) return l;
      if (slugOrId.startsWith(`${l.id}-`)) return l;
      if (slugOrId.startsWith(`${l.id}--`)) return l;
    }
    return null;
  }, [findById, listings, slugOrId]);

  useEffect(() => {
    if (!loaded || !slugOrId) return;
    if (listing) return;
    void hydrateListingById(normalizeListingId(slugOrId));
  }, [loaded, slugOrId, listing, hydrateListingById]);

  const listingOwnerId = (listing?.ownerId ?? "").trim();
  const needsAuthForAccess = Boolean(listing && !isPublicStatus(listing.status));
  const viewerId = auth.status === "ready" ? (auth.userId ?? "").trim() : "";
  const viewerIsOwner = Boolean(viewerId && listingOwnerId && viewerId === listingOwnerId);

  const backHref = cat ? `/category/${encodeURIComponent(cat)}` : listing ? `/category/${listing.categorySlug}` : "/";
  const listingChatReturnHref = useMemo(() => pathnameWithSearchSansReturn(pathname, sp), [pathname, sp]);

  if (!loaded) {
    return (
      <div className="min-h-full bg-black/[0.03] text-black">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-10 text-sm text-black/60">
          Загрузка…
        </div>
      </div>
    );
  }

  if (needsAuthForAccess && auth.status !== "ready") {
    return (
      <div className="min-h-full bg-black/[0.03] text-black">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-10 text-sm text-black/60">
          Загрузка…
        </div>
      </div>
    );
  }

  if (!listing || (!isPublicStatus(listing.status) && !viewerIsOwner)) {
    return (
      <div className="min-h-full bg-black/[0.03] text-black">
        <div className="mx-auto w-full max-w-[1000px] px-4 py-10">
          <ReturnLink fallback="/" className="text-sm text-black/60 hover:text-black" />
          <div className="mt-4 rounded-3xl border border-black/10 bg-white p-6">
            <div className="text-lg font-semibold tracking-tight">Объявление не найдено</div>
            <div className="mt-2 text-sm text-black/60">
              Возможно, оно ещё не опубликовано или ссылка неверна.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ListingDetail
      key={listing.id}
      listing={toPublicListingDTO(listing)}
      backHref={backHref}
      listingChatReturnHref={listingChatReturnHref}
    />
  );
}

type SellerPublic = {
  userId: string;
  displayName: string;
  /** Профильное полное имя (сервер `StoredUser.name`); для строки «Автор» приоритетнее `displayName`. */
  name?: string;
  /** Единое вычисленное имя с API (имя → email-префикс → ник). */
  identityLabel?: string;
  createdAt: number;
  lastSeenAt: number | null;
  phoneVerified: boolean;
  fastReply: boolean;
  activeListingCount: number;
};

function ListingDetail({
  listing,
  backHref,
  listingChatReturnHref,
}: {
  listing: PublicListingDTO;
  backHref: string;
  listingChatReturnHref: string;
}) {
  const images = extractListingPhotos(listing).slice(0, 10);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const router = useRouter();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [serverDealStatus, setServerDealStatus] = useState<string | null>(null);
  const [sellerPublic, setSellerPublic] = useState<SellerPublic | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Phone system removed: communication is chat + audio call inside the service.
  const isUrgent = `${listing.title} ${listing.description}`.toLowerCase().includes("срочно");
  const nextPath = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/";

  const ownerId = listing.ownerId?.trim() ?? "";
  const dealStatus = (serverDealStatus ?? listing.dealStatus ?? "active") as "active" | "in_progress" | "completed";
  const storedAuthorPublic =
    typeof (listing as unknown as { authorPublicName?: string }).authorPublicName === "string"
      ? ((listing as unknown as { authorPublicName?: string }).authorPublicName ?? "").trim()
      : "";
  const authorDisplayName = formatListingCardAuthor({
    ownerId,
    publicApi: sellerPublic
      ? {
          identityLabel: (sellerPublic.identityLabel ?? "").trim() || undefined,
          name: (sellerPublic.name ?? "").trim() || undefined,
        }
      : null,
    storedAuthorName: storedAuthorPublic || undefined,
    debugListingMeta: {
      id: listing.id,
      ownerId: listing.ownerId,
      authorPublicName: storedAuthorPublic,
    },
  });
  const sellerAvatar = ownerId ? getProfile(ownerId).avatarData?.trim() ?? "" : "";
  const authorAvatarLetter =
    (
      authorDisplayName.trim().charAt(0) ||
      listing.title.trim().charAt(0)
    ).toLocaleUpperCase("ru-RU") || "?";

  const verified = Boolean(sellerPublic?.phoneVerified) || isUserVerified(listing.ownerId);

  const sellerFastReplyEligible = useMemo(
    () => (ownerId ? fastReplyEligibleFromLocalChats(ownerId) : false),
    [ownerId],
  );

  const safeIdx = Math.min(selectedPhotoIndex, Math.max(0, images.length - 1));
  const main = images[safeIdx];

  useEffect(() => {
    void pingPresenceThrottled({ force: true });
  }, [listing.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/listings/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: listing.id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d || typeof (d as { count?: unknown }).count !== "number") return;
        setViewCount((d as { count: number }).count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/ads/${encodeURIComponent(listing.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d !== "object") return;
        const ds = (d as { dealStatus?: string }).dealStatus;
        if (typeof ds === "string" && ["active", "in_progress", "completed"].includes(ds)) setServerDealStatus(ds);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  useEffect(() => {
    if (!ownerId || !ownerId.startsWith("user-")) {
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
  }, [ownerId]);

  // Client-side SEO for MVP (listings live in localStorage).
  useEffect(() => {
    const priceValue = (listing as unknown as { price?: unknown }).price;
    const price = typeof priceValue === "number" ? priceValue : null;
    const title = `${listing.title} в ${listing.city}${price != null ? ` — ${Intl.NumberFormat("ru-RU").format(price)} ₽` : ""} | Haliwali`;
    const description = truncateMetaDescription(listing.description);

    document.title = title;

    function upsertMeta(name: string, content: string) {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    }

    function upsertOg(property: string, content: string) {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    }

    upsertMeta("description", description);
    upsertOg("og:title", listing.title);
    upsertOg("og:description", listing.description);
    upsertOg("og:type", "website");

    // JSON-LD (basic)
    const jsonLdId = "haliwali-jsonld";
    const existing = document.getElementById(jsonLdId);
    if (existing) existing.remove();

    const type = listing.type === "service" || listing.type === "task" ? "Service" : "Product";
    const payload: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": type,
      name: listing.title,
      description: listing.description,
    };
    if ("price" in listing) {
      payload.offers = {
        "@type": "Offer",
        price: listing.price,
        priceCurrency: "RUB",
        availability: "https://schema.org/InStock",
      };
    }
    const script = document.createElement("script");
    script.id = jsonLdId;
    script.type = "application/ld+json";
    script.text = JSON.stringify(payload);
    document.head.appendChild(script);

    return () => {
      const s = document.getElementById(jsonLdId);
      if (s) s.remove();
    };
  }, [listing]);

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <div className="mx-auto w-full max-w-[1000px] px-4 sm:px-6">
        <header className="py-4">
          <ReturnLink fallback={backHref} className="text-sm text-black/60 hover:text-black" />
        </header>

        <main className="pb-16">
          <div
            className={[
              "cursor-default rounded-3xl border border-black/10 bg-white p-4",
              dealStatus === "completed" ? "opacity-[0.72]" : "",
            ].join(" ")}
          >
            <div className="mb-3 flex flex-col gap-2 border-b border-black/10 pb-3 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-black/40">Объявление</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-xs font-medium text-black/70">
                    {dealStatusLabel(dealStatus)}
                  </span>
                  {isUrgent ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600">СРОЧНО</span>
                  ) : null}
                </div>
                <h1 className="mt-1.5 text-lg font-semibold tracking-tight">
                  <Link
                    href={appendReturnUrlQuery(listingPath(listing.id, listing.title), listingChatReturnHref)}
                    className="cursor-pointer text-inherit hover:underline"
                  >
                    {listing.title}
                  </Link>
                </h1>

                <div className="mt-1.5 text-sm text-black/60">
                  {listing.city} • {sectionLabelFromListingType(listing.type)} / {listing.categoryName}
                  {typeof (listing as unknown as { price?: unknown }).price === "number" ? (
                    <>
                      {" "}
                      •{" "}
                      <span className="font-medium text-black">
                        {Intl.NumberFormat("ru-RU").format((listing as unknown as { price: number }).price)} ₽
                      </span>
                    </>
                  ) : null}
                </div>
              </div>

              {ownerId ? (
                <div className="flex w-full shrink-0 flex-col gap-1.5 border-t border-black/10 pt-2.5 sm:ml-auto sm:w-auto sm:border-t-0 sm:pt-0 sm:items-end sm:text-right">
                  <div className="flex items-start gap-2 sm:flex-row-reverse sm:gap-2">
                    <div className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-black/10 bg-black/[0.04] text-xs font-semibold text-black/70">
                      {sellerAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sellerAvatar} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        authorAvatarLetter
                      )}
                    </div>
                    <div className="min-w-0 text-left text-sm leading-snug text-gray-600 sm:text-right">
                      <span className="inline whitespace-normal leading-snug">
                        <time dateTime={new Date(listing.createdAt).toISOString()}>{formatListedDayRu(listing.createdAt)}</time>
                        <span className="mx-1.5 text-gray-400" aria-hidden>
                          •
                        </span>
                        {authorDisplayName.trim() ? (
                          <>
                            Автор: <span className="font-semibold text-neutral-900">{authorDisplayName}</span>
                          </>
                        ) : (
                          formatLastSeenRu(sellerPublic?.lastSeenAt ?? null)
                        )}
                      </span>
                      {sellerFastReplyEligible || verified ? (
                        <div className="mt-1.5 inline-flex flex-wrap gap-1">
                          {sellerFastReplyEligible ? (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                              {FAST_REPLY_BADGE_LABEL}
                            </span>
                          ) : null}
                          {verified ? (
                            <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                              ✓ Подтверждён
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-2xl border border-black/15 bg-white px-3 text-sm font-medium text-black/70 hover:bg-black/5 sm:ml-auto sm:w-auto sm:justify-center"
                    onClick={() => setReportOpen(true)}
                  >
                    Пожаловаться
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px] md:items-start md:gap-5">
              <div className="min-w-0 h-auto">
                <div className="text-sm leading-snug text-black/80 whitespace-pre-wrap">
                  {listing.description}
                </div>
              </div>

              <div className="flex min-w-0 flex-col items-end">
                {images.length > 0 ? (
                  <div className="w-full rounded-2xl border border-black/10 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={main}
                      alt=""
                      className="h-[240px] w-full rounded-xl bg-black/[0.03] object-contain"
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewerOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setViewerOpen(true);
                      }}
                    />
                    {images.length > 1 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {images.map((src, i) => {
                          const active = i === safeIdx;
                          return (
                            <button
                              key={`${src}-${i}`}
                              type="button"
                              onClick={() => setSelectedPhotoIndex(i)}
                              className={[
                                "h-[72px] w-[72px] overflow-hidden rounded-[12px] border bg-white transition",
                                active
                                  ? "border-[color:#ff6a00] shadow-md opacity-100"
                                  : "border-black/10 opacity-65 hover:opacity-100 hover:border-black/30",
                              ].join(" ")}
                              aria-label={active ? "Выбрано" : "Выбрать фото"}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt="" className="h-full w-full bg-black/[0.03] object-contain" />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid h-[240px] w-full place-items-center rounded-2xl border border-dashed border-black/15 bg-white text-sm text-black/50">
                    Нет фото
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3 border-t border-black/10 pt-3">
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
                  onClick={() => {
                    if (!isLoggedInAuth()) {
                      setAuthModalOpen(true);
                      return;
                    }
                    const cleanListingId = normalizeListingId(listing.id);
                    router.push(
                      appendReturnUrlQuery(`/chat?listingId=${encodeURIComponent(cleanListingId)}`, listingChatReturnHref),
                    );
                  }}
                >
                  Написать
                </button>
                <ListingFavoriteButton listingId={listing.id} />
              </div>
              <div className="min-w-0 flex-1 text-right text-sm leading-tight text-black/50">
                <div className="break-all">ID: {listing.id}</div>
                <div>{formatViewCountRu(viewCount ?? 0)}</div>
                <div>{formatListedDayRu(listing.createdAt)}</div>
                {listing.updatedAt ? <div>Обновлено: {formatListedDayRu(listing.updatedAt)}</div> : null}
              </div>
            </div>

            <div className="mt-2 text-sm text-black/55">Связь через чат внутри сервиса</div>
          </div>
        </main>
      </div>

      <FullscreenImageViewer
        open={viewerOpen}
        images={images}
        startIndex={safeIdx}
        onClose={() => setViewerOpen(false)}
      />
      <AuthRequiredModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        nextPath={nextPath}
      />
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="listing"
        targetId={listing.id}
      />
    </div>
  );
}

function dealStatusLabel(ds: string) {
  if (ds === "in_progress") return "В процессе";
  if (ds === "completed") return "Завершено";
  return "Активно";
}

/** День публикации (DD.MM.YYYY) для строки рядом с автором */
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

function sectionLabelFromListingType(type: Listing["type"]) {
  if (type === "task") return "Задачи";
  if (type === "service") return "Услуги";
  return "Товары";
}

function FullscreenImageViewer({
  open,
  images,
  startIndex,
  onClose,
}: {
  open: boolean;
  images: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef<number>(0);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, images.length]);

  function goPrev() {
    if (images.length <= 1) return;
    setIdx((p) => (p - 1 + images.length) % images.length);
  }

  function goNext() {
    if (images.length <= 1) return;
    setIdx((p) => (p + 1) % images.length);
  }

  if (!open) return null;
  const src = images[idx];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 transition-opacity duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        touchDeltaX.current = 0;
      }}
      onTouchMove={(e) => {
        if (touchStartX.current === null) return;
        const x = e.touches[0]?.clientX ?? 0;
        touchDeltaX.current = x - touchStartX.current;
      }}
      onTouchEnd={() => {
        const dx = touchDeltaX.current;
        touchStartX.current = null;
        touchDeltaX.current = 0;
        if (Math.abs(dx) < 40) return;
        if (dx < 0) goNext();
        else goPrev();
      }}
    >
      <div className="relative w-full max-w-5xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white hover:bg-white/15"
          aria-label="Закрыть"
        >
          ×
        </button>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white hover:bg-white/15"
              aria-label="Предыдущее фото"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white hover:bg-white/15"
              aria-label="Следующее фото"
            >
              →
            </button>
          </>
        ) : null}

        <div className="mx-auto mt-12 grid place-items-center">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            />
          ) : (
            <div className="grid h-64 w-full place-items-center rounded-2xl bg-white/5 text-sm text-white/60">
              Нет фото
            </div>
          )}
        </div>

        {images.length > 1 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {images.map((t, i) => (
              <button
                key={`${t}-${i}`}
                type="button"
                onClick={() => setIdx(i)}
                className={[
                  "h-14 w-14 overflow-hidden rounded-2xl border",
                  i === idx ? "border-white/70" : "border-white/15 hover:border-white/40",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

