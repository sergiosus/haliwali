"use client";

import type React from "react";
import {
  forwardRef,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Listing, ProductListing, ServiceListing, TaskListing } from "./lib/listings";
import { dedupeListingsById, generateEditToken, isPublicStatus, useListingsStore } from "./lib/listings";
import { listingDealStatusBadgeRu } from "./lib/listingCardMeta";
import { moderateListing } from "./lib/moderation";
import {
  getDirectoryItemBySlug,
  homeCategoryGridSections,
  normalizeQuery,
  russianCities,
} from "./lib/directory";
import { computeHomeCategoryCounts, resolveHomeGridCategorySlug } from "./lib/homeCategoryCounts";
import { haystackNormalizedMatchesListingSearch, matchesListingQuery } from "./lib/search";
import { categoryToSlug, productCategories, serviceCategories, taskCategories } from "./lib/categories";
import { CityCombobox } from "./components/CityCombobox";
import { ListingLocationSection } from "./components/ListingLocationSection";
import { CompactListingCard } from "./components/CompactListingCard";
import { appendReturnUrlQuery } from "./lib/returnNavigation";
import { listingPath } from "./lib/seo";
import { uploadFiles } from "./lib/uploadClient";
import { isValidPhone, PHONE_VALIDATION_MESSAGE } from "./lib/identity";
import { isUserVerified } from "./lib/users";
import { useCompactListingEnrichment } from "./lib/useCompactListingEnrichment";
import { LocationModal } from "./components/modals/LocationModal";
import { resolveRussiaCityRegionDisplay } from "./lib/locationDisplay";
import {
  homeLocationV2FieldLabel,
  homeLocationV2FromModalPayload,
  incomingFieldsFromHomeLocationV2,
  listingMatchesHomeLocationV2,
  useHomeLocationV2,
} from "./lib/homeLocationV2";
import {
  LOCATION_MESSAGES,
  type SelectedLocation,
  type SelectedLocationSource,
} from "./lib/selectedLocation";

/** Extra fields Home dialogs pass through to `addTask`/`addOffer`/`addProduct` for `location{}`. */
type HomeListingPublishExtras = {
  region?: string;
  displayName?: string;
  source?: SelectedLocationSource;
};
import { resolveRussiaCityFromName } from "./lib/resolveRussiaCityFromStatic";
import { getCurrentUserId, refreshAuthFromServer } from "./lib/auth";
import { AuthContinueModal } from "./components/AuthContinueModal";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-black/[0.03] text-black">
          <div className="mx-auto max-w-[900px] px-4 py-10 text-sm text-black/50">Загрузка…</div>
        </div>
      }
    >
      <HaliwaliLanding />
    </Suspense>
  );
}

type OfferListing = ServiceListing;
type ProductKind = "Продам" | "Куплю";

const EMPTY_SEARCH_RESULTS: Listing[] = [];

function HaliwaliLanding() {
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [lastEditPath, setLastEditPath] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [homeAuthOpen, setHomeAuthOpen] = useState(false);
  const pendingHomeSubmitRef = useRef<null | (() => void)>(null);

  const { location: homeLocV2, setLocation: setHomeLocV2 } = useHomeLocationV2();
  const searchParams = useSearchParams();
  const directorySearch = searchParams.get("q") ?? "";
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const locationFieldLabel = useMemo(() => homeLocationV2FieldLabel(homeLocV2), [homeLocV2]);

  const { addListing, loaded, listings } = useListingsStore();

  const uniqueListings = useMemo(() => dedupeListingsById(listings), [listings]);

  // city is persisted by setStoredCity when user changes it

  const homeCategoryGridFiltered = useMemo(() => {
    return homeCategoryGridSections
      .map((section) => ({
        heading: section.heading,
        links: section.links.filter((link) => {
          if (!getDirectoryItemBySlug(link.slug)) return false;
          const row = getDirectoryItemBySlug(link.slug);
          const haystack = normalizeQuery(`${link.label} ${row?.title ?? ""}`);
          return haystackNormalizedMatchesListingSearch(haystack, directorySearch);
        }),
      }))
      .filter((s) => s.links.length > 0);
  }, [directorySearch]);

  const categoryCounts = useMemo(() => {
    const { counts } = computeHomeCategoryCounts(uniqueListings, {
      listingLocationFilter: (l) => listingMatchesHomeLocationV2(l, homeLocV2),
    });
    return counts;
  }, [uniqueListings, homeLocV2]);
  const categoryCountsLoading = false;

  const publishedSearchResults = useMemo(() => {
    if (!normalizeQuery(directorySearch)) return EMPTY_SEARCH_RESULTS;
    if (!loaded) return [];
    return uniqueListings
      .filter((l) => isPublicStatus(l.status))
      .filter((l) => listingMatchesHomeLocationV2(l, homeLocV2))
      .filter((l) => matchesListingQuery(l, directorySearch))
      .sort((a, b) => {
        const av = isUserVerified(a.ownerId) ? 1 : 0;
        const bv = isUserVerified(b.ownerId) ? 1 : 0;
        if (av !== bv) return bv - av;
        return b.createdAt - a.createdAt;
      })
      .slice(0, 30);
  }, [directorySearch, uniqueListings, loaded, homeLocV2]);

  const { viewCounts, publicByUserId } = useCompactListingEnrichment(publishedSearchResults);

  const taskTitleRef = useRef<HTMLInputElement | null>(null);
  const offerTitleRef = useRef<HTMLInputElement | null>(null);
  const productTitleRef = useRef<HTMLInputElement | null>(null);

  async function addTask(
    form: Omit<
      TaskListing,
      "id" | "type" | "status" | "createdAt" | "moderationReason" | "editToken" | "ownerId"
    > &
      HomeListingPublishExtras,
  ) {
    const run = async () => {
      const userId = getCurrentUserId();
      if (!userId) return;

      const moderation = moderateListing({
        title: form.title,
        description: form.description,
        phone: form.phone,
        city: form.city,
        categoryName: form.categoryName,
      });
      const editToken = generateEditToken();
      const geo = form as {
        address?: string;
        latitude?: number;
        longitude?: number;
        region?: string;
        displayName?: string;
        source?: SelectedLocationSource;
      };
      const hasGeo =
        typeof geo.latitude === "number" &&
        typeof geo.longitude === "number" &&
        Number.isFinite(geo.latitude + geo.longitude);
      const locNorm = resolveRussiaCityRegionDisplay(form.city ?? "", geo.region ?? "");
      const displayLocation =
        (geo.displayName ?? geo.address ?? "").trim() || locNorm.displayName;

      const listing: Listing = {
        id: `task-${Date.now()}`,
        editToken,
        ownerId: userId,
        type: "task",
        status: moderation.status,
        moderationReason: moderation.moderationReason ?? "",
        createdAt: Date.now(),
        photos: form.photos ?? [],
        title: form.title,
        description: form.description,
        categoryName: form.categoryName,
        categorySlug: form.categorySlug,
        city: locNorm.city,
        address: displayLocation,
        latitude: hasGeo ? geo.latitude : undefined,
        longitude: hasGeo ? geo.longitude : undefined,
        phone: form.phone,
        location: form.city
          ? {
              city: locNorm.city,
              region: locNorm.region || undefined,
              displayName: displayLocation,
              address: geo.address?.trim() || undefined,
              lat: hasGeo ? geo.latitude : undefined,
              lng: hasGeo ? geo.longitude : undefined,
              source: geo.source,
            }
          : undefined,
      };
      await addListing(listing as TaskListing);
      setLastEditPath(`/edit/${editToken}`);
      setSuccessModalOpen(true);
      setTaskFormOpen(false);
    };

    if (!(await refreshAuthFromServer({ bypassCache: true }))) {
      pendingHomeSubmitRef.current = () => void run();
      setHomeAuthOpen(true);
      return;
    }
    await run();
  }

  async function addOffer(
    form: Omit<
      OfferListing,
      "id" | "type" | "status" | "createdAt" | "moderationReason" | "editToken" | "ownerId"
    > &
      HomeListingPublishExtras,
  ) {
    const run = async () => {
      const userId = getCurrentUserId();
      if (!userId) return;

      const moderation = moderateListing({
        title: form.title,
        description: form.description,
        phone: form.phone,
        city: form.city,
        categoryName: form.categoryName,
      });
      const editToken = generateEditToken();
      const geo = form as {
        address?: string;
        latitude?: number;
        longitude?: number;
        region?: string;
        displayName?: string;
        source?: SelectedLocationSource;
      };
      const hasGeo =
        typeof geo.latitude === "number" &&
        typeof geo.longitude === "number" &&
        Number.isFinite(geo.latitude + geo.longitude);
      const locNorm = resolveRussiaCityRegionDisplay(form.city ?? "", geo.region ?? "");
      const displayLocation =
        (geo.displayName ?? geo.address ?? "").trim() || locNorm.displayName;

      const listing: Listing = {
        id: `service-${Date.now()}`,
        editToken,
        ownerId: userId,
        type: "service",
        status: moderation.status,
        moderationReason: moderation.moderationReason ?? "",
        createdAt: Date.now(),
        photos: form.photos ?? [],
        title: form.title,
        specialization: form.specialization,
        description: form.description,
        categoryName: form.categoryName,
        categorySlug: form.categorySlug,
        city: locNorm.city,
        address: displayLocation,
        latitude: hasGeo ? geo.latitude : undefined,
        longitude: hasGeo ? geo.longitude : undefined,
        phone: form.phone,
        location: form.city
          ? {
              city: locNorm.city,
              region: locNorm.region || undefined,
              displayName: displayLocation,
              address: geo.address?.trim() || undefined,
              lat: hasGeo ? geo.latitude : undefined,
              lng: hasGeo ? geo.longitude : undefined,
              source: geo.source,
            }
          : undefined,
      };
      await addListing(listing as OfferListing);
      setLastEditPath(`/edit/${editToken}`);
      setSuccessModalOpen(true);
      setOfferFormOpen(false);
    };

    if (!(await refreshAuthFromServer({ bypassCache: true }))) {
      pendingHomeSubmitRef.current = () => void run();
      setHomeAuthOpen(true);
      return;
    }
    await run();
  }

  async function addProduct(
    form: {
      kind: ProductKind;
      title: string;
      description: string;
      categoryName: string;
      categorySlug: string;
      price: number;
      city: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      phone: string;
      photos: string[];
    } & HomeListingPublishExtras,
  ) {
    const run = async () => {
      const userId = getCurrentUserId();
      if (!userId) return;

      const moderation = moderateListing({
        title: form.title,
        description: form.description,
        phone: form.phone,
        city: form.city,
        categoryName: form.categoryName,
      });
      const editToken = generateEditToken();
      const hasGeo =
        typeof form.latitude === "number" &&
        typeof form.longitude === "number" &&
        Number.isFinite(form.latitude + form.longitude);
      const locNorm = resolveRussiaCityRegionDisplay(form.city ?? "", form.region ?? "");
      const displayLocation =
        (form.displayName ?? form.address ?? "").trim() || locNorm.displayName;

      const listing: ProductListing = {
        id: `product-${Date.now()}`,
        editToken,
        ownerId: userId,
        type: form.kind === "Продам" ? "product_sell" : "product_buy",
        status: moderation.status,
        moderationReason: moderation.moderationReason ?? "",
        createdAt: Date.now(),
        photos: form.photos ?? [],
        title: form.title,
        description: form.description,
        categoryName: form.categoryName,
        categorySlug: form.categorySlug,
        city: locNorm.city,
        address: displayLocation,
        latitude: hasGeo ? form.latitude : undefined,
        longitude: hasGeo ? form.longitude : undefined,
        phone: form.phone,
        price: form.price,
        location: form.city
          ? {
              city: locNorm.city,
              region: locNorm.region || undefined,
              displayName: displayLocation,
              address: form.address?.trim() || undefined,
              lat: hasGeo ? form.latitude : undefined,
              lng: hasGeo ? form.longitude : undefined,
              source: form.source,
            }
          : undefined,
      };
      await addListing(listing);
      setLastEditPath(`/edit/${editToken}`);
      setSuccessModalOpen(true);
      setProductFormOpen(false);
    };

    if (!(await refreshAuthFromServer({ bypassCache: true }))) {
      pendingHomeSubmitRef.current = () => void run();
      setHomeAuthOpen(true);
      return;
    }
    await run();
  }

  return (
    <div className="min-h-full min-w-0 max-w-full bg-black/[0.03] text-black">
      <header className="min-w-0 max-w-full w-full px-3 py-4 sm:px-6">
        <div className="flex min-w-0 max-w-full w-full flex-col space-y-3">
          <div className="mt-6 flex w-full justify-center">
            <div className="w-full min-w-0 max-w-full px-1 text-center sm:px-4">
              <p className="text-lg font-semibold leading-tight break-words text-gray-800 md:text-xl">
                Размещайте задачи, продавайте товары и находите клиентов по всей России без посредников
              </p>
              <p className="mt-1 text-sm leading-tight text-gray-500">
                Выберите категорию, чтобы посмотреть объявления или создать своё
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-full max-w-[1200px] px-4 pb-16 sm:px-6">
          {normalizeQuery(directorySearch) ? (
            <section className="mb-4">
              <div className="rounded-3xl border border-black/10 bg-white p-5">
                <div className="text-sm text-black/60">Результаты поиска</div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {loaded ? (
                    publishedSearchResults.length > 0 ? (
                      publishedSearchResults.map((l) => {
                        const oid = (l.ownerId ?? "").trim();
                        return (
                          <CompactListingCard
                            key={l.id}
                            listing={l}
                            href={appendReturnUrlQuery(listingPath(l.id, l.title), "/")}
                            viewCount={viewCounts[l.id] ?? 0}
                            publicAuthor={oid ? publicByUserId[oid] : null}
                          />
                        );
                      })
                    ) : (
                      <div className="rounded-3xl border border-dashed border-black/15 bg-white p-6 md:col-span-2">
                        <div className="text-sm text-black/70">Ничего не найдено</div>
                      </div>
                    )
                  ) : (
                    <div className="text-sm text-black/60">Загрузка…</div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="min-w-0 w-full flex-1 sm:flex-initial sm:min-w-0">
              <button
                type="button"
                className="flex h-10 min-h-10 min-w-0 max-w-full w-full cursor-pointer items-center gap-2 overflow-hidden rounded-2xl border border-black/10 bg-white px-4 text-left text-sm outline-none hover:bg-black/[0.02] focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                onClick={() => setLocationModalOpen(true)}
                aria-label="Выбрать локацию"
              >
                <span className="shrink-0 text-[16px] leading-none text-black/45" aria-hidden>
                  📍
                </span>
                <span
                  className={
                    homeLocV2.kind !== "country"
                      ? "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-black/85"
                      : "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-black/70"
                  }
                >
                  {locationFieldLabel}
                </span>
              </button>
            </div>
            <Link
              href="/map"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-white px-4 text-xs font-medium text-gray-800 hover:bg-black/[0.03]"
            >
              На карте
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {homeCategoryGridFiltered.map((section) => (
              <HomeCategorySectionCard
                key={section.heading}
                heading={section.heading}
                links={section.links}
                counts={categoryCounts}
                countsLoading={categoryCountsLoading}
              />
            ))}
          </div>
        </main>

      <TaskDialog
        open={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
        titleRef={taskTitleRef}
        onSubmit={addTask}
      />
      <OfferDialog
        open={offerFormOpen}
        onClose={() => setOfferFormOpen(false)}
        titleRef={offerTitleRef}
        onSubmit={addOffer}
      />
      <ProductDialog
        open={productFormOpen}
        onClose={() => setProductFormOpen(false)}
        titleRef={productTitleRef}
        onSubmit={addProduct}
      />
      <ListingDetailsModal
        key={selectedListing?.id ?? "no-listing"}
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />
      <EditLinkSuccessModal
        key={lastEditPath ?? "no-edit-link"}
        open={successModalOpen}
        editPath={lastEditPath}
        onClose={() => setSuccessModalOpen(false)}
      />
      <AuthContinueModal
        open={homeAuthOpen}
        onClose={() => setHomeAuthOpen(false)}
        onSuccess={() => {
          setHomeAuthOpen(false);
          pendingHomeSubmitRef.current?.();
          pendingHomeSubmitRef.current = null;
        }}
      />
      {locationModalOpen ?
        <LocationModal
          open
          cities={russianCities}
          onClose={() => setLocationModalOpen(false)}
          value={incomingFieldsFromHomeLocationV2(homeLocV2)}
          onChange={(next) => {
            setHomeLocV2(homeLocationV2FromModalPayload(next));
            setLocationModalOpen(false);
          }}
        />
      : null}
    </div>
  );
}

function HomeCategorySectionCard({
  heading,
  links,
  counts,
  countsLoading,
}: {
  heading: string;
  links: { label: string; slug: string }[];
  counts: Record<string, number> | null;
  countsLoading: boolean;
}) {
  const headingHref =
    heading === "Задачи" ? "/tasks"
    : heading === "Услуги" ? "/services"
    : heading === "Товары" ? "/products"
    : null;

  const headingHelper =
    heading === "Задачи" ? "Найдите исполнителя для разовых поручений"
    : heading === "Услуги" ? "Предлагайте услуги и получайте заказы"
    : heading === "Товары" ? "Покупайте и продавайте новые и б/у вещи"
    : "";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-black/10 bg-white px-5 py-[18px]">
      <div className="border-b border-black/10 pb-2.5">
        {headingHref ?
          <Link
            href={headingHref}
            className="inline-block cursor-pointer text-[20px] font-semibold tracking-tight text-gray-900 hover:underline hover:decoration-black/30"
          >
            {heading}
          </Link>
        : <div className="text-[20px] font-semibold tracking-tight text-gray-900">{heading}</div>}
        {headingHelper ?
          <div className="mt-0.5 text-[13px] leading-tight text-gray-500">{headingHelper}</div>
        : null}
      </div>
      <nav className="mt-3 flex flex-col gap-1.5" aria-label={heading}>
        {links.map((link, idx) => (
          <Link
            key={`${heading}-${link.slug}-${idx}`}
            href={`/category/${link.slug}`}
            className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-[15px] font-medium leading-[1.25] text-gray-800 transition-colors hover:bg-gray-50"
          >
            <span className="min-w-0">
              <span className={((counts?.[link.slug] ?? 0) === 0 ? "text-gray-700/80" : "text-gray-800").trim()}>
                {link.label}
              </span>{" "}
              <span className="text-[13px] text-gray-400">
                ({countsLoading || !counts ? "..." : String(counts[link.slug] ?? 0)})
              </span>
            </span>
            <span className="shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function EditLinkSuccessModal({
  open,
  editPath,
  onClose,
}: {
  open: boolean;
  editPath: string | null;
  onClose: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !editPath) return null;

  const fullUrl = `${window.location.origin}${editPath}`;
  const shortenedPath = shortenEditPath(editPath);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Успешная отправка"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[500px] rounded-3xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-2xl border border-black/10 bg-white text-black hover:bg-black/5"
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-black/5 text-black">
            ✔
          </div>
          <div className="mt-3 text-lg font-semibold tracking-tight">
            Объявление отправлено на проверку
          </div>
          <div className="mt-3 text-sm text-black/70">Сохраните ссылку для редактирования</div>

          <div className="mt-4 rounded-2xl border border-black/10 bg-black/5 p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <a
                href={fullUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 px-2 py-2 text-left text-sm text-black hover:underline"
                title={fullUrl}
              >
                <span aria-hidden="true">🔗</span>
                <span className="min-w-0 truncate font-mono">{shortenedPath}</span>
              </a>
              <button
                type="button"
                onClick={copy}
                className={[
                  "h-10 rounded-2xl border bg-white px-4 text-sm font-semibold text-black transition-colors",
                  copyState === "copied"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-black/20 hover:bg-black/5",
                ].join(" ")}
              >
                {copyState === "copied" ? "Скопировано" : "Скопировать"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => window.open(fullUrl, "_blank")}
              className="h-11 w-full rounded-2xl px-5 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
              style={{ backgroundColor: "#ff7a00" }}
            >
              Перейти к редактированию
            </button>
          </div>

          {copyState === "error" ? (
            <div className="mt-3 text-sm text-red-600">
              Не удалось скопировать — скопируйте вручную
            </div>
          ) : null}

          <div className="mt-4 text-sm text-black/60">
            Если вы потеряете ссылку, вы не сможете редактировать объявление
          </div>
        </div>
      </div>
    </div>
  );
}

function shortenEditPath(editPath: string) {
  // Expected: /edit/{token}
  const token = editPath.split("/").filter(Boolean).pop() ?? editPath;
  if (token.length <= 12) return `/edit/${token}`;
  return `/edit/${token.slice(0, 6)}...${token.slice(-6)}`;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-black/70">
      {children}
    </span>
  );
}

function ListingDetailsModal({
  listing,
  onClose,
}: {
  listing: Listing | null;
  onClose: () => void;
}) {
  const open = Boolean(listing);
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!listing) return null;

  const images = (listing.photos ?? []).slice(0, 10);
  const safeIdx = Math.min(activeIdx, Math.max(0, images.length - 1));
  const main = images[safeIdx];

  return (
    <div
      className={[
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center",
        open ? "opacity-100" : "opacity-0 pointer-events-none",
        "transition-opacity duration-150",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Детали объявления"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={[
          "relative w-full max-w-xl rounded-3xl bg-white p-5 pb-6 shadow-xl sm:p-6 sm:pb-8",
          "max-h-[90vh] overflow-y-auto",
          "transition-transform duration-150",
          open ? "scale-100" : "scale-95",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-2xl border border-black/10 bg-white text-black hover:bg-black/5"
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-black/70">
              {listingDealStatusBadgeRu(listing)}
            </span>
            <div className="text-xl font-semibold tracking-tight">{listing.title}</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-black/60">
            <Badge>{listing.categoryName}</Badge>
            <span>•</span>
            <span>{listing.city}</span>
            {"price" in listing ? (
              <>
                <span>•</span>
                <span className="font-medium text-black">
                  {Intl.NumberFormat("ru-RU").format(listing.price)} ₽
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="rounded-3xl border border-black/10 bg-white p-3">
            {main ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={main}
                alt=""
                className="aspect-[4/3] w-full rounded-2xl object-cover"
                role="button"
                tabIndex={0}
                onClick={() => setViewerOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setViewerOpen(true);
                }}
              />
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-black/5 text-sm text-black/50">
                Нет фото
              </div>
            )}

            {images.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {images.map((src, idx) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className={[
                      "h-16 w-16 overflow-hidden rounded-2xl border bg-white",
                      idx === safeIdx
                        ? "border-black/40"
                        : "border-black/10 hover:border-black/30",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="text-sm leading-6 text-black/70 whitespace-pre-wrap">
            {listing.description}
          </div>
        </div>
      </div>

      <FullscreenImageViewer
        open={viewerOpen}
        images={images}
        startIndex={safeIdx}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
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
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl transition-transform duration-150"
              style={{ transform: "scale(1)" }}
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

function DialogShell({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 pb-6 shadow-xl sm:p-6 sm:pb-8">
        <div className="flex items-start justify-between gap-4 pr-12">
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight">{title}</div>
            <div className="mt-1 text-sm text-black/60">{description}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-2xl border border-black/10 bg-white text-black hover:bg-black/5"
          aria-label="Закрыть"
        >
          ×
        </button>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  labelAsGroup,
}: {
  label: string;
  children: React.ReactNode;
  labelAsGroup?: boolean;
}) {
  const headingId = useId();
  if (labelAsGroup) {
    return (
      <div className="flex min-w-0 flex-col gap-0" role="group" aria-labelledby={headingId}>
        <span
          id={headingId}
          className="mb-2 block text-sm font-medium leading-normal text-black/80"
        >
          {label}
        </span>
        {children}
      </div>
    );
  }
  return (
    <label className="flex min-w-0 flex-col gap-0">
      <span className="mb-2 block text-sm font-medium leading-normal text-black/80">{label}</span>
      {children}
    </label>
  );
}

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        {...props}
        ref={ref}
        className={[
          "h-10 w-full rounded-2xl border border-black/15 bg-white px-4 text-sm outline-none",
          "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
          className ?? "",
        ].join(" ")}
      />
    );
  },
);

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-[180px] w-full resize-y rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "h-10 w-full rounded-2xl border border-black/15 bg-white px-4 text-sm outline-none",
        "focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function TaskDialog({
  open,
  onClose,
  titleRef,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (
    form: Omit<
      TaskListing,
      "id" | "type" | "status" | "createdAt" | "moderationReason" | "editToken" | "ownerId"
    > &
      HomeListingPublishExtras,
  ) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState<(typeof taskCategories)[number]>(
    taskCategories[0],
  );
  const [taskCity, setTaskCity] = useState<string>("");
  const [locAddress, setLocAddress] = useState("");
  const [taskSelectedLocation, setTaskSelectedLocation] = useState<SelectedLocation | null>(null);
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);

  const taskWholeRussia = !taskCity.trim() && !taskSelectedLocation;

  const handleTaskSelectedLocation = useCallback((next: SelectedLocation | null) => {
    setTaskSelectedLocation(next);
    if (next?.city?.trim()) setTaskCity(next.city.trim());
  }, []);

  function reset() {
    setTitle("");
    setDescription("");
    setCategoryName(taskCategories[0]);
    setTaskCity("");
    setLocAddress("");
    setTaskSelectedLocation(null);
    setPhone("");
    clearPhotos(setPhotos);
    setPhotoError(null);
    setConsent(false);
    setConsentError(null);
    setPhoneError(null);
    setCityError(null);
    setLocationMsg(null);
  }

  return (
    <DialogShell
      open={open}
      title="Разместить задачу"
      description="Коротко опишите, что нужно сделать, и оставьте номер телефона."
      onClose={() => {
        onClose();
        reset();
      }}
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPhoneError(null);
          setCityError(null);
          setLocationMsg(null);
          if (!taskWholeRussia && !taskSelectedLocation) {
            setCityError(LOCATION_MESSAGES.pickRequired);
            return;
          }
          if (!consent) {
            setConsentError("Нужно подтвердить согласие");
            return;
          }
          if (!phone.trim()) {
            setPhoneError("Обязательное поле");
            return;
          }
          if (!isValidPhone(phone)) {
            setPhoneError(PHONE_VALIDATION_MESSAGE);
            return;
          }
          const urls = await uploadFiles(photos.map((p) => p.file));
          try {
            const wrTask = taskWholeRussia;
            await onSubmit({
              title: title.trim(),
              description: description.trim(),
              categoryName,
              categorySlug: categoryToSlug(categoryName, "task"),
              city: taskSelectedLocation?.city ?? "",
              address: wrTask ? undefined : taskSelectedLocation?.displayName ?? undefined,
              region: wrTask ? "Вся Россия" : taskSelectedLocation?.region ?? "",
              displayName: wrTask ? "Вся Россия" : taskSelectedLocation?.displayName ?? undefined,
              latitude: taskSelectedLocation?.latitude,
              longitude: taskSelectedLocation?.longitude,
              phone: phone.trim(),
              photos: urls,
              source: taskSelectedLocation?.source ?? "suggestion",
            });
            reset();
          } catch (err) {
            console.error(err);
          }
        }}
      >
        <Field label="Название задачи">
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Повесить полку"
            required
            maxLength={80}
          />
        </Field>

        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
          <Field label="Категория">
            <Select
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value as (typeof taskCategories)[number])}
              className="box-border h-[52px] w-full rounded-xl px-4 text-sm leading-normal"
            >
              {taskCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">{"\u00A0"}</div>
          </Field>
          <Field label="Регион (список, необязательно)">
            <CityCombobox
              value={taskCity}
              onChange={(v) => {
                setTaskCity(v);
                setCityError(null);
                setLocationMsg(null);
                void (async () => {
                  if (!v.trim()) {
                    handleTaskSelectedLocation(null);
                    setLocAddress("");
                    return;
                  }
                  const loc = await resolveRussiaCityFromName(v);
                  if (loc) {
                    handleTaskSelectedLocation(loc);
                    setLocAddress(loc.displayName);
                  } else {
                    handleTaskSelectedLocation(null);
                    setLocAddress("");
                    setLocationMsg("Не удалось найти город в России по выбранному пункту.");
                  }
                })();
              }}
              options={russianCities}
              allowCustomCity
              placeholder="Например: Москва или Вся Россия"
              className={[
                "h-[52px] w-full rounded-xl border px-4 text-sm leading-normal outline-none focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
                cityError ? "border-red-300 focus:ring-red-200" : "border-black/15",
              ].join(" ")}
            />
            <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">
              {cityError ? (
                <span className="text-red-700">{cityError}</span>
              ) : (
                "Можно не выбирать: поле «Местоположение» открывает выбор города или «Вся Россия»."
              )}
            </div>
          </Field>
        </div>

        <div>
          <ListingLocationSection
            draftText={locAddress}
            onDraftTextChange={(v) => {
              setLocAddress(v);
              setLocationMsg(null);
            }}
            selectedLocation={taskSelectedLocation}
            onSelectedLocationChange={handleTaskSelectedLocation}
            wholeRussia={taskWholeRussia}
            cities={russianCities}
            onWholeRussiaPicked={() => {
              setTaskCity("");
              setLocAddress("");
            }}
            onLocationMessage={setLocationMsg}
          />
          {locationMsg ? <div className="mt-2 text-sm text-red-700">{locationMsg}</div> : null}
        </div>

        <Field label="Описание">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что нужно сделать? Укажите детали, сроки, примерный бюджет."
            required
            maxLength={400}
          />
        </Field>

        <Field label="Телефон">
          <Input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError) setPhoneError(null);
            }}
            placeholder="Например: +44 20 7946 0958"
            required
            maxLength={40}
            inputMode="tel"
            className={phoneError ? "border-red-300" : undefined}
          />
          {phoneError ? <div className="mt-1 text-sm text-red-700">{phoneError}</div> : null}
        </Field>

        <Field label="Фото" labelAsGroup>
          <PhotoPicker
            photos={photos}
            setPhotos={setPhotos}
            error={photoError}
            setError={setPhotoError}
          />
        </Field>

        <div className="grid gap-2">
          <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-3 text-sm text-black/70">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setConsentError(null);
              }}
              className="mt-0.5 h-4 w-4 accent-black"
            />
            <span>
              Я согласен с правилами сайта и даю согласие на обработку персональных данных
            </span>
          </label>
          {consentError ? <div className="text-sm text-red-600">{consentError}</div> : null}
        </div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <div className="text-xs text-black/50 sm:mr-auto sm:max-w-md">
            Запрещено публиковать мошеннические, незаконные и чужие персональные данные.
            <div className="mt-2">
              Объявление проходит автоматическую и ручную проверку перед публикацией
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              reset();
            }}
            className="h-11 rounded-2xl border border-black/15 bg-white px-5 text-sm font-medium text-black hover:bg-black/5"
          >
            Отмена
          </button>
          <button
            type="submit"
            className="h-11 rounded-2xl bg-black px-5 text-sm font-medium text-white hover:bg-black/90"
          >
            Опубликовать задачу
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function OfferDialog({
  open,
  onClose,
  titleRef,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (
    form: Omit<
      OfferListing,
      "id" | "type" | "status" | "createdAt" | "moderationReason" | "editToken" | "ownerId"
    > &
      HomeListingPublishExtras,
  ) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState<(typeof serviceCategories)[number]>(
    serviceCategories[0],
  );
  const [serviceCity, setServiceCity] = useState<string>("");
  const [locAddress, setLocAddress] = useState("");
  const [serviceSelectedLocation, setServiceSelectedLocation] = useState<SelectedLocation | null>(null);
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);

  const serviceWholeRussia = !serviceCity.trim() && !serviceSelectedLocation;

  const handleServiceSelectedLocation = useCallback((next: SelectedLocation | null) => {
    setServiceSelectedLocation(next);
    if (next?.city?.trim()) setServiceCity(next.city.trim());
  }, []);

  function reset() {
    setTitle("");
    setDescription("");
    setCategoryName(serviceCategories[0]);
    setServiceCity("");
    setLocAddress("");
    setServiceSelectedLocation(null);
    setPhone("");
    clearPhotos(setPhotos);
    setPhotoError(null);
    setConsent(false);
    setConsentError(null);
    setPhoneError(null);
    setCityError(null);
    setLocationMsg(null);
  }

  return (
    <DialogShell
      open={open}
      title="Предложить услугу"
      description="Опишите услугу и оставьте номер телефона для связи."
      onClose={() => {
        onClose();
        reset();
      }}
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPhoneError(null);
          setCityError(null);
          setLocationMsg(null);
          if (!serviceWholeRussia && !serviceSelectedLocation) {
            setCityError(LOCATION_MESSAGES.pickRequired);
            return;
          }
          if (!consent) {
            setConsentError("Нужно подтвердить согласие");
            return;
          }
          if (!phone.trim()) {
            setPhoneError("Обязательное поле");
            return;
          }
          if (!isValidPhone(phone)) {
            setPhoneError(PHONE_VALIDATION_MESSAGE);
            return;
          }
          const urls = await uploadFiles(photos.map((p) => p.file));
          try {
            const wrSvc = serviceWholeRussia;
            await onSubmit({
              title: title.trim(),
              specialization: categoryName,
              description: description.trim(),
              categoryName,
              categorySlug: categoryToSlug(categoryName, "service"),
              city: serviceSelectedLocation?.city ?? "",
              address: wrSvc ? undefined : serviceSelectedLocation?.displayName ?? undefined,
              region: wrSvc ? "Вся Россия" : serviceSelectedLocation?.region ?? "",
              displayName: wrSvc ? "Вся Россия" : serviceSelectedLocation?.displayName ?? undefined,
              latitude: serviceSelectedLocation?.latitude,
              longitude: serviceSelectedLocation?.longitude,
              phone: phone.trim(),
              photos: urls,
              source: serviceSelectedLocation?.source ?? "suggestion",
            });
            reset();
          } catch (err) {
            console.error(err);
          }
        }}
      >
        <Field label="Название услуги">
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Сантехника и мелкий ремонт"
            required
            maxLength={80}
          />
        </Field>

        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
          <Field label="Категория">
            <Select
              value={categoryName}
              onChange={(e) =>
                setCategoryName(e.target.value as (typeof serviceCategories)[number])
              }
              className="box-border h-[52px] w-full rounded-xl px-4 text-sm leading-normal"
            >
              {serviceCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">{"\u00A0"}</div>
          </Field>
          <Field label="Регион (список, необязательно)">
            <CityCombobox
              value={serviceCity}
              onChange={(v) => {
                setServiceCity(v);
                setCityError(null);
                setLocationMsg(null);
                void (async () => {
                  if (!v.trim()) {
                    handleServiceSelectedLocation(null);
                    setLocAddress("");
                    return;
                  }
                  const loc = await resolveRussiaCityFromName(v);
                  if (loc) {
                    handleServiceSelectedLocation(loc);
                    setLocAddress(loc.displayName);
                  } else {
                    handleServiceSelectedLocation(null);
                    setLocAddress("");
                    setLocationMsg("Не удалось найти город в России по выбранному пункту.");
                  }
                })();
              }}
              options={russianCities}
              allowCustomCity
              placeholder="Например: Москва или Вся Россия"
              className={[
                "h-[52px] w-full rounded-xl border px-4 text-sm leading-normal outline-none focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
                cityError ? "border-red-300 focus:ring-red-200" : "border-black/15",
              ].join(" ")}
            />
            <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">
              {cityError ? (
                <span className="text-red-700">{cityError}</span>
              ) : (
                "Можно не выбирать: поле «Местоположение» открывает выбор города или «Вся Россия»."
              )}
            </div>
          </Field>
        </div>

        <div>
          <ListingLocationSection
            draftText={locAddress}
            onDraftTextChange={(v) => {
              setLocAddress(v);
              setLocationMsg(null);
            }}
            selectedLocation={serviceSelectedLocation}
            onSelectedLocationChange={handleServiceSelectedLocation}
            wholeRussia={serviceWholeRussia}
            cities={russianCities}
            onWholeRussiaPicked={() => {
              setServiceCity("");
              setLocAddress("");
            }}
            onLocationMessage={setLocationMsg}
          />
          {locationMsg ? <div className="mt-2 text-sm text-red-700">{locationMsg}</div> : null}
        </div>

        <Field label="Описание">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что вы делаете? Опыт, цены, когда можете приехать."
            required
            maxLength={400}
          />
        </Field>

        <Field label="Телефон">
          <Input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError) setPhoneError(null);
            }}
            placeholder="Например: +1 202 555 0123"
            required
            maxLength={40}
            inputMode="tel"
            className={phoneError ? "border-red-300" : undefined}
          />
          {phoneError ? <div className="mt-1 text-sm text-red-700">{phoneError}</div> : null}
        </Field>

        <Field label="Фото" labelAsGroup>
          <PhotoPicker
            photos={photos}
            setPhotos={setPhotos}
            error={photoError}
            setError={setPhotoError}
          />
        </Field>

        <div className="grid gap-2">
          <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-3 text-sm text-black/70">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setConsentError(null);
              }}
              className="mt-0.5 h-4 w-4 accent-black"
            />
            <span>
              Я согласен с правилами сайта и даю согласие на обработку персональных данных
            </span>
          </label>
          {consentError ? <div className="text-sm text-red-600">{consentError}</div> : null}
        </div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <div className="text-xs text-black/50 sm:mr-auto sm:max-w-md">
            Запрещено публиковать мошеннические, незаконные и чужие персональные данные.
            <div className="mt-2">
              Объявление проходит автоматическую и ручную проверку перед публикацией
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              reset();
            }}
            className="h-11 rounded-2xl border border-black/15 bg-white px-5 text-sm font-medium text-black hover:bg-black/5"
          >
            Отмена
          </button>
          <button
            type="submit"
            className="h-11 rounded-2xl bg-black px-5 text-sm font-medium text-white hover:bg-black/90"
          >
            Опубликовать услугу
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ProductDialog({
  open,
  onClose,
  titleRef,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (
    form: {
      kind: ProductKind;
      title: string;
      description: string;
      categoryName: string;
      categorySlug: string;
      price: number;
      city: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      phone: string;
      photos: string[];
    } & HomeListingPublishExtras,
  ) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<ProductKind>("Продам");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryName, setCategoryName] = useState<(typeof productCategories)[number]>(
    productCategories[0],
  );
  const [price, setPrice] = useState<string>("");
  const [productCity, setProductCity] = useState<string>("");
  const [locAddress, setLocAddress] = useState("");
  const [productSelectedLocation, setProductSelectedLocation] = useState<SelectedLocation | null>(null);
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);

  const productWholeRussia = !productCity.trim() && !productSelectedLocation;

  const handleProductSelectedLocation = useCallback((next: SelectedLocation | null) => {
    setProductSelectedLocation(next);
    if (next?.city?.trim()) setProductCity(next.city.trim());
  }, []);

  function reset() {
    setKind("Продам");
    setTitle("");
    setDescription("");
    setCategoryName(productCategories[0]);
    setPrice("");
    setProductCity("");
    setLocAddress("");
    setProductSelectedLocation(null);
    setPhone("");
    clearPhotos(setPhotos);
    setPhotoError(null);
    setConsent(false);
    setConsentError(null);
    setPhoneError(null);
    setCityError(null);
    setLocationMsg(null);
  }

  return (
    <DialogShell
      open={open}
      title="Разместить товар"
      description="Продайте или купите вещь — объявление сначала попадёт на проверку."
      onClose={() => {
        onClose();
        reset();
      }}
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPhoneError(null);
          setCityError(null);
          setLocationMsg(null);
          if (!productWholeRussia && !productSelectedLocation) {
            setCityError(LOCATION_MESSAGES.pickRequired);
            return;
          }
          if (!consent) {
            setConsentError("Нужно подтвердить согласие");
            return;
          }
          if (!phone.trim()) {
            setPhoneError("Обязательное поле");
            return;
          }
          if (!isValidPhone(phone)) {
            setPhoneError(PHONE_VALIDATION_MESSAGE);
            return;
          }
          const numericPrice = Math.max(0, Number(price.replace(/\s/g, "")));
          const urls = await uploadFiles(photos.map((p) => p.file));

          try {
            const wrProd = productWholeRussia;
            await onSubmit({
              kind,
              title: title.trim(),
              description: description.trim(),
              categoryName,
              categorySlug: categoryToSlug(categoryName, kind === "Продам" ? "product_sell" : "product_buy"),
              price: numericPrice,
              city: productSelectedLocation?.city ?? "",
              address: wrProd ? undefined : productSelectedLocation?.displayName ?? undefined,
              region: wrProd ? "Вся Россия" : productSelectedLocation?.region ?? "",
              displayName: wrProd ? "Вся Россия" : productSelectedLocation?.displayName ?? undefined,
              latitude: productSelectedLocation?.latitude,
              longitude: productSelectedLocation?.longitude,
              phone: phone.trim(),
              photos: urls,
              source: productSelectedLocation?.source ?? "suggestion",
            });
            reset();
          } catch (err) {
            console.error(err);
          }
        }}
      >
        <div className="grid gap-4 pb-6">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
            <Field label="Тип объявления">
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as ProductKind)}
                className="box-border h-[52px] w-full rounded-xl px-4 text-sm leading-normal"
              >
                <option value="Продам">Продам</option>
                <option value="Куплю">Куплю</option>
              </Select>
              <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">{"\u00A0"}</div>
            </Field>
            <Field label="Категория">
              <Select
                value={categoryName}
                onChange={(e) =>
                  setCategoryName(e.target.value as (typeof productCategories)[number])
                }
                className="box-border h-[52px] w-full rounded-xl px-4 text-sm leading-normal"
              >
                {productCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">{"\u00A0"}</div>
            </Field>
          </div>

          <Field label="Название товара">
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: iPhone 13, 128 ГБ"
              required
              maxLength={80}
            />
          </Field>

          <Field label="Описание">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Состояние, комплект, нюансы, где и когда удобно встретиться."
              required
              maxLength={600}
              className="min-h-[110px]"
            />
          </Field>

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-0">
            <Field label="Цена, ₽">
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Например: 15000"
                required
                inputMode="numeric"
                className="box-border h-[52px] w-full rounded-xl px-4 leading-normal"
              />
              <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">{"\u00A0"}</div>
            </Field>
            <Field label="Регион (список, необязательно)">
              <CityCombobox
                value={productCity}
                onChange={(v) => {
                  setProductCity(v);
                  setCityError(null);
                  setLocationMsg(null);
                  void (async () => {
                    if (!v.trim()) {
                      handleProductSelectedLocation(null);
                      setLocAddress("");
                      return;
                    }
                    const loc = await resolveRussiaCityFromName(v);
                    if (loc) {
                      handleProductSelectedLocation(loc);
                      setLocAddress(loc.displayName);
                    } else {
                      handleProductSelectedLocation(null);
                      setLocAddress("");
                      setLocationMsg("Не удалось найти город в России по выбранному пункту.");
                    }
                  })();
                }}
                options={russianCities}
                allowCustomCity
                placeholder="Например: Москва или Вся Россия"
                className={[
                  "h-[52px] w-full rounded-xl border px-4 text-sm leading-normal outline-none focus:border-black/30 focus:ring-2 focus:ring-[rgba(255,122,0,0.25)]",
                  cityError ? "border-red-300 focus:ring-red-200" : "border-black/15",
                ].join(" ")}
              />
              <div className="mt-1 min-h-[18px] text-xs leading-normal text-black/50">
                {cityError ? (
                  <span className="text-red-700">{cityError}</span>
                ) : (
                  "Можно не выбирать: поле «Местоположение» открывает выбор города или «Вся Россия»."
                )}
              </div>
            </Field>
          </div>

          <div>
            <ListingLocationSection
              draftText={locAddress}
              onDraftTextChange={(v) => {
                setLocAddress(v);
                setLocationMsg(null);
              }}
              selectedLocation={productSelectedLocation}
              onSelectedLocationChange={handleProductSelectedLocation}
              wholeRussia={productWholeRussia}
              cities={russianCities}
              onWholeRussiaPicked={() => {
                setProductCity("");
                setLocAddress("");
              }}
              onLocationMessage={setLocationMsg}
            />
            {locationMsg ? <div className="mt-2 text-sm text-red-700">{locationMsg}</div> : null}
          </div>

          <Field label="Телефон">
            <Input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              placeholder="Например: 8 922 688-03-55 или +90 555…"
              required
              maxLength={40}
              inputMode="tel"
              className={phoneError ? "border-red-300" : undefined}
            />
            {phoneError ? <div className="mt-1 text-sm text-red-700">{phoneError}</div> : null}
          </Field>

          <Field label="Фото" labelAsGroup>
            <PhotoPicker
              photos={photos}
              setPhotos={setPhotos}
              error={photoError}
              setError={setPhotoError}
            />
          </Field>

          <div className="grid gap-2">
            <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-3 text-sm text-black/70">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (e.target.checked) setConsentError(null);
                }}
                className="mt-0.5 h-4 w-4 accent-black"
              />
              <span>
                Я согласен с правилами сайта и даю согласие на обработку персональных данных
              </span>
            </label>
            {consentError ? <div className="text-sm text-red-600">{consentError}</div> : null}
          </div>
        </div>

        <div className="sticky bottom-0 -mx-5 bg-white pt-4 sm:-mx-6">
          <div className="px-5 pb-2 sm:px-6">
            <div className="text-xs text-black/50">
              Запрещено публиковать мошеннические, незаконные и чужие персональные данные.
              <div className="mt-2">
                Объявление проходит автоматическую и ручную проверку перед публикацией
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => {
                onClose();
                reset();
              }}
              className="h-11 rounded-2xl border border-black/15 bg-white px-5 text-sm font-medium text-black hover:bg-black/5"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="h-11 rounded-2xl px-5 text-sm font-semibold text-black shadow-sm transition-colors hover:brightness-95"
              style={{ backgroundColor: "#ff7a00" }}
            >
              Отправить на проверку
            </button>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}

type LocalPhoto = {
  file: File;
  previewUrl: string;
};

function clearPhotos(setPhotos: React.Dispatch<React.SetStateAction<LocalPhoto[]>>) {
  setPhotos((prev) => {
    for (const p of prev) URL.revokeObjectURL(p.previewUrl);
    return [];
  });
  setPhotos([]);
}

function PhotoPicker({
  photos,
  setPhotos,
  error,
  setError,
}: {
  photos: LocalPhoto[];
  setPhotos: React.Dispatch<React.SetStateAction<LocalPhoto[]>>;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;

          setError(null);
          const remaining = Math.max(0, 10 - photos.length);
          const nextFiles = files.slice(0, remaining);
          if (files.length > remaining) setError("Максимум 10 фото");

          try {
            setPhotos((prev) => [
              ...prev,
              ...nextFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
            ]);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            setError(msg || "Неподдерживаемый формат изображения");
          }

          e.currentTarget.value = "";
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 w-fit items-center justify-center rounded-2xl border border-black/15 bg-white px-5 text-sm font-semibold text-black shadow-sm hover:bg-black/[0.03]"
        >
          Выбрать фото
        </button>
        <div className="grid gap-0.5 text-sm text-black/55">
          <span>Можно добавить до 10 фото</span>
          <span className="text-xs text-black/50">{photos.length} из 10 фото</span>
        </div>
      </div>

      {photos.length === 0 ? <p className="text-sm text-black/45">Фото не выбраны</p> : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {photos.map((p, idx) => (
            <div
              key={p.previewUrl}
              className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-black/10 bg-black/[0.04]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt=""
                className="h-full w-full object-cover transition duration-150 ease-out group-hover:brightness-[0.88]"
              />
              <button
                type="button"
                aria-label="Удалить это фото"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setError(null);
                  setPhotos((prev) => {
                    const target = prev[idx];
                    if (target) URL.revokeObjectURL(target.previewUrl);
                    return prev.filter((_, i) => i !== idx);
                  });
                }}
                className="absolute right-1 top-1 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-white/95 text-[18px] leading-none text-black shadow-md ring-1 ring-black/10 transition-opacity duration-150 hover:bg-white sm:opacity-85 sm:group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Images are uploaded to /api/upload on submit; we only keep File + preview locally.

