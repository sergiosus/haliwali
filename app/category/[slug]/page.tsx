"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { isPublicStatus, useListingsStore } from "../../lib/listings";
import { allDirectoryItems, getDirectoryItemBySlug, normalizeQuery } from "../../lib/directory";
import { matchesListingQuery } from "../../lib/search";
import { CompactListingCard } from "../../components/CompactListingCard";
import { appendReturnUrlQuery } from "../../lib/returnNavigation";
import { listingPath } from "../../lib/seo";
import { isUserVerified } from "../../lib/users";
import { calculateDistanceKm, formatDistanceKm, isFiniteLatLng } from "@/lib/shared/geo";
import { useUserLocation } from "../../lib/useUserLocation";
import { LocationModal } from "../../components/modals/LocationModal";
import { cityNames } from "../../lib/cities";
import {
  readClientStoredCity,
  readClientStoredRadiusKm,
  setStoredSearchScope,
  useStoredCity,
  useSearchScope,
  useStoredCityRadiusKm,
} from "../../lib/useStoredCity";
import { DEFAULT_SEARCH_SCOPE, homepageLocationLabelFromScope, listingMatchesSearchScope } from "../../lib/searchScopeLocation";
import { useCompactListingEnrichment } from "../../lib/useCompactListingEnrichment";
export default function CategoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const item = useMemo(() => (slug ? getDirectoryItemBySlug(slug) : null), [slug]);
  const { loaded, listings } = useListingsStore();

  const storedCity = useStoredCity();
  const storedRadiusKm = useStoredCityRadiusKm();
  const searchScope = useSearchScope();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [city, setCity] = useState<string>(() => readClientStoredCity());
  const [radiusKm, setRadiusKm] = useState<number>(() => readClientStoredRadiusKm());

  const [q, setQ] = useState("");
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [condition, setCondition] = useState<"all" | "new" | "used">("all");
  const [sortBy, setSortBy] = useState<"new" | "old" | "cheap" | "expensive" | "distance">("new");
  const userLoc = useUserLocation();

  useEffect(() => {
    queueMicrotask(() => setCity(storedCity));
  }, [storedCity]);

  useEffect(() => {
    queueMicrotask(() => setRadiusKm(storedRadiusKm));
  }, [storedRadiusKm]);

  const filtered = useMemo(() => {
    if (!loaded) return [];
    const minPrice = Number(priceFrom);
    const maxPrice = Number(priceTo);

    if (!item) return [];

    const base = listings.filter((l) => isPublicStatus(l.status));
    const byType = base.filter((l) => item.listingTypes.includes(l.type));
    const byCategory = byType.filter((l) => l.categorySlug === slug);
    const selectedCityName = (city ?? "").trim();
    const byLocation = byCategory.filter((l) => listingMatchesSearchScope(l, searchScope));
    const byPhoto = onlyWithPhoto ? byLocation.filter((l) => (l.photos?.length ?? 0) > 0) : byLocation;
    const byToday = todayOnly
      ? byPhoto.filter((l) => isToday(l.createdAt))
      : byPhoto;
    const byPrice = byToday.filter((l) => {
      const priceValue = (l as unknown as { price?: unknown }).price;
      const price = typeof priceValue === "number" ? priceValue : null;
      if (price == null) return true;
      if (!Number.isNaN(minPrice) && priceFrom.trim() && price < minPrice) return false;
      if (!Number.isNaN(maxPrice) && priceTo.trim() && price > maxPrice) return false;
      return true;
    });
    const byCondition = byPrice.filter((l) => {
      if (condition === "all") return true;
      const haystack = `${l.title} ${l.description}`.toLowerCase();
      if (condition === "used") {
        return haystack.includes("б/у") || haystack.includes("бу") || haystack.includes("used");
      }
      return !haystack.includes("б/у") && !haystack.includes("бу") && !haystack.includes("used");
    });

    const searched =
      !normalizeQuery(q) ? byCondition : byCondition.filter((l) => matchesListingQuery(l, q));

    const userLat = userLoc?.lat;
    const userLng = userLoc?.lng;
    const haveUser = isFiniteLatLng(userLat, userLng);

    const refLat =
      searchScope.type === "point" &&
      typeof searchScope.lat === "number" &&
      typeof searchScope.lng === "number" &&
      Number.isFinite(searchScope.lat + searchScope.lng)
        ? searchScope.lat
        : userLat;
    const refLng =
      searchScope.type === "point" &&
      typeof searchScope.lat === "number" &&
      typeof searchScope.lng === "number" &&
      Number.isFinite(searchScope.lat + searchScope.lng)
        ? searchScope.lng
        : userLng;
    const haveRef = isFiniteLatLng(refLat, refLng);
    /** Дополнительное круговое ограничение только если не уже применена «точка на карте» в scope. */
    const effectiveRadiusKm = radiusKm;
    const radiusOn =
      searchScope.type !== "point" &&
      effectiveRadiusKm > 0 &&
      haveUser &&
      isFiniteLatLng(userLat, userLng);

    const withDistance = searched
      .map((l) => {
        const lat = (l as unknown as { latitude?: unknown }).latitude;
        const lng = (l as unknown as { longitude?: unknown }).longitude;
        const ok =
          isFiniteLatLng(lat as number | undefined, lng as number | undefined) && haveRef &&
          typeof refLat === "number" &&
          typeof refLng === "number";
        const dist = ok ? calculateDistanceKm(refLat, refLng, l.latitude!, l.longitude!) : null;
        return { l, dist };
      })
      .filter(({ l, dist }) => {
        if (!radiusOn) return true;
        if (dist != null) return dist <= effectiveRadiusKm;
        if (!selectedCityName) return false;
        return l.city === selectedCityName;
      });

    const sorted = [...withDistance].sort((a, b) => {
      if (sortBy === "distance") {
        if (a.dist == null && b.dist == null) {
          return (b.l.updatedAt ?? b.l.createdAt) - (a.l.updatedAt ?? a.l.createdAt);
        }
        if (a.dist == null) return 1;
        if (b.dist == null) return -1;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return (b.l.updatedAt ?? b.l.createdAt) - (a.l.updatedAt ?? a.l.createdAt);
      }
      if (sortBy === "old") {
        const av = isUserVerified(a.l.ownerId) ? 1 : 0;
        const bv = isUserVerified(b.l.ownerId) ? 1 : 0;
        if (av !== bv) return bv - av;
        return (a.l.updatedAt ?? a.l.createdAt) - (b.l.updatedAt ?? b.l.createdAt);
      }
      if (sortBy === "cheap") {
        const apValue = (a.l as unknown as { price?: unknown }).price;
        const bpValue = (b.l as unknown as { price?: unknown }).price;
        const ap = typeof apValue === "number" ? apValue : Number.MAX_SAFE_INTEGER;
        const bp = typeof bpValue === "number" ? bpValue : Number.MAX_SAFE_INTEGER;
        return ap - bp;
      }
      if (sortBy === "expensive") {
        const apValue = (a.l as unknown as { price?: unknown }).price;
        const bpValue = (b.l as unknown as { price?: unknown }).price;
        const ap = typeof apValue === "number" ? apValue : -1;
        const bp = typeof bpValue === "number" ? bpValue : -1;
        return bp - ap;
      }
      const av = isUserVerified(a.l.ownerId) ? 1 : 0;
      const bv = isUserVerified(b.l.ownerId) ? 1 : 0;
      if (av !== bv) return bv - av;
      return (b.l.updatedAt ?? b.l.createdAt) - (a.l.updatedAt ?? a.l.createdAt);
    });
    return sorted.map((x) => x.l);
  }, [
    loaded,
    listings,
    item,
    slug,
    city,
    q,
    onlyWithPhoto,
    todayOnly,
    priceFrom,
    priceTo,
    condition,
    sortBy,
    radiusKm,
    userLoc?.lat,
    userLoc?.lng,
    searchScope,
  ]);

  const { viewCounts, publicByUserId } = useCompactListingEnrichment(filtered);

  void setQ;

  const categoryTitle = item?.title ?? "Категория";
  const selectedCityName = (city ?? "").trim();
  const cityDisplayLabel = homepageLocationLabelFromScope(searchScope);
  function resetFilters({ keepCity }: { keepCity: boolean }) {
    setOnlyWithPhoto(false);
    setTodayOnly(false);
    setPriceFrom("");
    setPriceTo("");
    setCondition("all");
    setSortBy("new");
    setRadiusKm(0);
    if (!keepCity) {
      setStoredSearchScope(DEFAULT_SEARCH_SCOPE);
      setCity("");
    }
  }

  return (
    <div className="min-h-full bg-black/[0.03] text-black">
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-2 md:px-6 md:pt-3">
        <nav className="mb-3 text-xs leading-snug text-black/50 md:mb-4" aria-label="Навигация">
          <Link href="/" className="text-black/55 transition-colors hover:text-black/80 hover:underline">
            Главная
          </Link>
          <span className="text-black/30" aria-hidden>
            {" "}
            /{" "}
          </span>
          <span className="text-black/60">{categoryTitle}</span>
        </nav>

        <div className="mb-2 mt-1 flex items-center justify-between gap-3 md:hidden">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-5 text-sm font-semibold text-black/80 shadow-sm hover:bg-black/[0.02]"
          >
            Фильтры
          </button>
        </div>

        <div className="mt-3 grid gap-4 md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
          <aside className="hidden min-w-0 self-start md:sticky md:top-24 md:block">
            <div className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="text-sm font-semibold text-black/80">Фильтры</div>

                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-black/45">Город</div>
                  <button
                    type="button"
                    className="flex h-11 min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border border-black/10 bg-white px-4 text-sm text-black/80 hover:bg-black/[0.02]"
                    onClick={() => setLocationModalOpen(true)}
                    aria-label="Выбрать город"
                  >
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                      {searchScope.type !== "country" ? cityDisplayLabel : "Введите город"}
                    </span>
                    <span className="shrink-0 text-black/35">▾</span>
                  </button>
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-black/45">Цена</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={priceFrom}
                      onChange={(e) => setPriceFrom(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="От"
                      className="h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                      inputMode="numeric"
                    />
                    <input
                      value={priceTo}
                      onChange={(e) => setPriceTo(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="До"
                      className="h-11 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black/20 focus:ring-2 focus:ring-[rgba(255,122,0,0.18)]"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-black/45">Состояние</div>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as "all" | "new" | "used")}
                    className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black/80 outline-none focus:border-black/20"
                  >
                    <option value="all">Любое</option>
                    <option value="new">Новое</option>
                    <option value="used">Б/у</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={onlyWithPhoto}
                    onChange={(e) => setOnlyWithPhoto(e.target.checked)}
                    className="h-4 w-4 accent-black"
                  />
                  Только с фото
                </label>
                <label className="flex items-center gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={todayOnly}
                    onChange={(e) => setTodayOnly(e.target.checked)}
                    className="h-4 w-4 accent-black"
                  />
                  Размещено сегодня
                </label>

                <div className="grid gap-2 pt-1">
                  <button
                    type="button"
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-black px-5 text-sm font-semibold text-white shadow-sm hover:bg-black/90"
                    onClick={() => {
                      const el = document.getElementById("category-results-top");
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Показать объявления
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 w-full items-center justify-center rounded-2xl text-sm font-semibold text-black/55 hover:text-black"
                    onClick={() => resetFilters({ keepCity: true })}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-w-0" aria-label="Список объявлений">
            <div id="category-results-top" className="scroll-mt-28" />

            <div className="mb-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="shrink-0 text-sm font-medium text-black/75">Найдено объявлений: {filtered.length}</div>
                <Link
                  href="/map"
                  className="shrink-0 text-sm font-semibold text-black/60 hover:text-black hover:underline"
                >
                  На карте
                </Link>
              </div>

              <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
                {searchScope.type !== "country" ? (
                  <button
                    type="button"
                    className="inline-flex h-9 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-full border border-black/10 bg-black/[0.02] px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.04]"
                    onClick={() => resetFilters({ keepCity: false })}
                    aria-label="Убрать выбранный город"
                  >
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{cityDisplayLabel}</span>
                    <span className="shrink-0 text-black/40">×</span>
                  </button>
                ) : null}

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "new" | "old" | "cheap" | "expensive" | "distance")}
                  className="h-9 min-w-0 shrink-0 rounded-xl border border-black/10 bg-white px-3 text-sm text-black/75 outline-none focus:border-black/25"
                  aria-label="Сортировка"
                >
                  <option value="new">Сначала новые</option>
                  <option value="old">Сначала старые</option>
                  <option value="cheap">Сначала дешёвые</option>
                  <option value="expensive">Сначала дорогие</option>
                  <option value="distance">Сначала ближайшие</option>
                </select>
              </div>
            </div>

            <LocationModal
              open={locationModalOpen}
              cities={cityNames}
              value={{ scope: searchScope }}
              onClose={() => setLocationModalOpen(false)}
              onChange={(next) => {
                setStoredSearchScope(next.scope);
                const c = `${next.city}`.trim();
                setCity(c);
                setRadiusKm(next.radiusKm);
                setLocationModalOpen(false);
              }}
            />

            {loaded ? (
              filtered.length > 0 ? (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filtered.map((l) => {
                    const categorySlug = item?.slug ?? slug;
                    const href = appendReturnUrlQuery(
                      `${listingPath(l.id, l.title)}?cat=${encodeURIComponent(categorySlug)}`,
                      `/category/${encodeURIComponent(categorySlug)}`,
                    );
                    const uLat = userLoc?.lat;
                    const uLng = userLoc?.lng;
                    const distKm =
                      isFiniteLatLng(uLat, uLng) && isFiniteLatLng(l.latitude, l.longitude)
                        ? calculateDistanceKm(uLat!, uLng!, l.latitude!, l.longitude!)
                        : null;
                    const oid = (l.ownerId ?? "").trim();
                    return (
                      <li key={l.id} className="min-w-0">
                        <CompactListingCard
                          listing={l}
                          href={href}
                          viewCount={viewCounts[l.id] ?? 0}
                          publicAuthor={oid ? publicByUserId[oid] : null}
                          distanceLabel={
                            distKm != null ? `${formatDistanceKm(distKm)} от вас` : null
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-6">
                  <div className="mx-auto flex max-w-[640px] flex-col items-center rounded-[20px] border border-black/10 bg-white p-8 text-center shadow-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.04] text-black/45">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
                        <path
                          d="M10 4h4a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2Zm0 3h4V6h-4v1Z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
                    <div className="mt-4 text-lg font-semibold text-black">Пока нет объявлений</div>
                    <div className="mt-2 text-sm leading-6 text-black/60">
                      Попробуйте изменить фильтры или посмотреть объявления по всей России.
                    </div>
                    <button
                      type="button"
                      className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-6 text-sm font-semibold text-black/70 hover:bg-black/[0.02] sm:w-auto sm:min-w-[220px]"
                      onClick={() => resetFilters({ keepCity: false })}
                    >
                      Показать по всей России
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-black/60 shadow-sm">Загрузка…</div>
            )}
          </section>
        </div>

        {!item ? (
          <div className="mt-6 rounded-3xl border border-black/10 bg-white p-5">
            <div className="text-sm text-black/60">
              Категория не найдена. Выберите одну из доступных:
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {allDirectoryItems.slice(0, 12).map((i) => (
                <Link
                  key={i.slug}
                  href={`/category/${i.slug}`}
                  className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-black/70 hover:bg-black/5"
                >
                  {i.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      {filterOpen ? (
        <div
          className="fixed inset-0 z-[85] bg-black/45 md:hidden"
          onClick={() => setFilterOpen(false)}
          aria-label="Закрыть фильтры"
        >
          <div
            className="mobile-filter-sheet absolute inset-x-0 bottom-0 box-border max-h-[82dvh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold">Фильтры</div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="mobile-filter-inner flex min-w-0 flex-col gap-4">
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-black/45">Город</div>
                <button
                  type="button"
                  className="flex h-11 min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-2xl border border-black/10 bg-white px-4 text-sm text-black/80 hover:bg-black/[0.02]"
                  onClick={() => setLocationModalOpen(true)}
                  aria-label="Выбрать город"
                >
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                    {selectedCityName ? cityDisplayLabel : "Введите город"}
                  </span>
                  <span className="shrink-0 text-black/35">▾</span>
                </button>
              </div>
              <SidebarSection title="Цена">
                <div className="price-row filter-block">
                  <input
                    value={priceFrom}
                    onChange={(e) => setPriceFrom(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="От"
                  />
                  <input
                    value={priceTo}
                    onChange={(e) => setPriceTo(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="До"
                  />
                </div>
              </SidebarSection>
              <SidebarSection title="Состояние">
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as "all" | "new" | "used")}
                  className="filter-control w-full"
                >
                  <option value="all">Любое</option>
                  <option value="new">Новое</option>
                  <option value="used">Б/у</option>
                </select>
              </SidebarSection>
              <label className="flex min-w-0 items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={onlyWithPhoto}
                  onChange={(e) => setOnlyWithPhoto(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-black"
                />
                Только с фото
              </label>
              <label className="flex min-w-0 items-center gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={todayOnly}
                  onChange={(e) => setTodayOnly(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-black"
                />
                Размещено сегодня
              </label>

              <div className="grid gap-2 pt-1">
                <button
                  type="button"
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-black px-5 text-sm font-semibold text-white shadow-sm hover:bg-black/90"
                  onClick={() => setFilterOpen(false)}
                >
                  Показать объявления
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center rounded-2xl text-sm font-semibold text-black/55 hover:text-black"
                  onClick={() => resetFilters({ keepCity: true })}
                >
                  Сбросить фильтры
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-black/45">{title}</div>
      {children}
    </section>
  );
}

function isToday(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

