"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CompactListingCard } from "../components/CompactListingCard";
import { MapListingPreviewModal } from "../components/map/MapListingPreviewModal";
import { MapRegionSettlementSelectors } from "../components/map/MapRegionSettlementSelectors";
import { YandexMapPicker, type MapCenter } from "../components/maps/YandexMapPicker";
import { allDirectoryItems, normalizeQuery } from "../lib/directory";
import { mapCenterZoomForCity, mapCenterZoomForFederalDistrict, mapCenterZoomForRussiaRegion, mapCenterZoomForRussiaWide } from "../lib/mapBrowseFocus";
import { extractListingPhotos, listingCardLocationLine } from "../lib/listingCardMeta";
import {
  DEFAULT_SEARCH_SCOPE,
  homepageLocationLabelFromScope,
  listingCoordinatesForMap,
  listingMatchesSearchScope,
  normalizeSearchScope,
  type SearchScopeLocation,
} from "../lib/searchScopeLocation";
import { appendReturnUrlQuery } from "../lib/returnNavigation";
import { matchesListingQuery } from "../lib/search";
import { listingPath } from "../lib/seo";
import { useCompactListingEnrichment } from "../lib/useCompactListingEnrichment";
import type { Listing } from "../lib/listings";
import { dedupeListingsById, isListingPubliclyListed, useListingsStore } from "../lib/listings";

type KindFilter = "all" | "task" | "service" | "product";

function matchesKindFilter(l: Listing, k: KindFilter): boolean {
  if (k === "all") return true;
  if (k === "task") return l.type === "task";
  if (k === "service") return l.type === "service";
  return l.type === "product_sell" || l.type === "product_buy";
}

function productPriceOrNull(l: Listing): number | null {
  if (l.type === "product_sell" || l.type === "product_buy") return l.price;
  return null;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function listingMatchesDatePreset(l: Listing, preset: "all" | "today" | "week"): boolean {
  if (preset === "all") return true;
  const t = l.createdAt;
  if (preset === "today") return t >= startOfTodayMs();
  return Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
}

/** Товары: б/у / новое — только по тексту объявления (как в каталоге). */
function matchesProductCondition(l: Listing, cond: "all" | "new" | "used"): boolean {
  if (l.type !== "product_sell" && l.type !== "product_buy") return true;
  if (cond === "all") return true;
  const h = `${l.title} ${l.description}`.toLowerCase();
  const used = h.includes("б/у") || h.includes("бу") || /\bused\b/i.test(h);
  return cond === "used" ? used : !used;
}

function categoryLooksDelivery(l: Listing): boolean {
  const c = (l.categoryName ?? "").toLowerCase();
  return c.includes("доставк") || c.includes("перевозк");
}

const REMOTE_HINT = /удалённ|удаленн|онлайн|online|remote|удалён|удален/i;

function listingLooksRemote(l: Listing): boolean {
  return REMOTE_HINT.test(`${l.title} ${l.description}`);
}

function listingLooksUrgent(l: Listing): boolean {
  return `${l.title} ${l.description}`.toLowerCase().includes("срочно");
}

function sortListings(rows: Listing[], mode: "new" | "cheap" | "expensive"): Listing[] {
  const copy = [...rows];
  if (mode === "new") {
    copy.sort((a, b) => b.createdAt - a.createdAt);
    return copy;
  }
  if (mode === "cheap") {
    copy.sort((a, b) => {
      const pa = productPriceOrNull(a);
      const pb = productPriceOrNull(b);
      if (pa != null || pb != null) {
        if (pa == null) return 1;
        if (pb == null) return -1;
        if (pa !== pb) return pa - pb;
      }
      return b.createdAt - a.createdAt;
    });
    return copy;
  }
  copy.sort((a, b) => {
    const pa = productPriceOrNull(a);
    const pb = productPriceOrNull(b);
    if (pa != null || pb != null) {
      if (pa == null) return 1;
      if (pb == null) return -1;
      if (pa !== pb) return pb - pa;
    }
    return b.createdAt - a.createdAt;
  });
  return copy;
}

function typeFilterRu(t: Listing["type"]): string {
  if (t === "task") return "Задача";
  if (t === "service") return "Услуга";
  if (t === "product_sell") return "Продам";
  return "Куплю";
}

function mapKeyFromScope(scope: SearchScopeLocation): string {
  const s = normalizeSearchScope(scope);
  if (s.type === "country") return "ru";
  if (s.type === "region" || s.type === "federal_district") {
    return `reg:${(s.region ?? s.label ?? "").trim()}`;
  }
  if (s.type === "city" || s.type === "settlement") {
    return `set:${(s.label ?? "").trim()}:${(s.region ?? s.parentName ?? "").trim()}`;
  }
  return `other:${(s.label ?? "").trim()}`;
}

function mapViewFromScope(scope: SearchScopeLocation): { center: MapCenter; zoom: number } {
  const s = normalizeSearchScope(scope);
  if (s.type === "country") return mapCenterZoomForRussiaWide();
  if (s.type === "region" || s.type === "federal_district") {
    const lab = (s.region ?? s.label ?? "").trim();
    if (!lab) return mapCenterZoomForRussiaWide();
    return s.type === "federal_district" ? mapCenterZoomForFederalDistrict(lab) : mapCenterZoomForRussiaRegion(lab);
  }
  if ((s.type === "city" || s.type === "settlement") && typeof s.lat === "number" && typeof s.lng === "number") {
    return mapCenterZoomForCity(s.lat, s.lng);
  }
  return mapCenterZoomForRussiaWide();
}

export default function MapBrowsePage() {
  const { loaded, listings } = useListingsStore();
  const [mapScope, setMapScope] = useState<SearchScopeLocation>({ ...DEFAULT_SEARCH_SCOPE });

  const [listingKind, setListingKind] = useState<KindFilter>("all");
  const [categorySlug, setCategorySlug] = useState<string>("all");
  const [q, setQ] = useState("");
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(false);
  const [onlyWithPrice, setOnlyWithPrice] = useState(false);
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "week">("all");
  const [sortMode, setSortMode] = useState<"new" | "cheap" | "expensive">("new");

  const [productCondition, setProductCondition] = useState<"all" | "new" | "used">("all");
  const [productDeliveryCategory, setProductDeliveryCategory] = useState(false);
  const [serviceRemoteOnly, setServiceRemoteOnly] = useState(false);
  const [taskUrgentOnly, setTaskUrgentOnly] = useState(false);
  const [taskRemoteOnly, setTaskRemoteOnly] = useState(false);

  const mapView = useMemo(() => mapViewFromScope(mapScope), [mapScope]);
  const mapInstanceKey = mapKeyFromScope(mapScope);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const categoryOptions = useMemo(() => {
    return allDirectoryItems.filter((item) => {
      if (listingKind === "all") return true;
      if (listingKind === "task") return item.tab === "tasks";
      if (listingKind === "service") return item.tab === "services";
      return item.tab === "products";
    });
  }, [listingKind]);

  useEffect(() => {
    if (categorySlug === "all") return;
    const ok = categoryOptions.some((i) => i.slug === categorySlug);
    if (!ok) setCategorySlug("all");
  }, [categorySlug, categoryOptions]);

  const baseFiltered = useMemo(() => {
    if (!loaded) return [];
    const minPrice = Number(priceFrom);
    const maxPrice = Number(priceTo);

    let rows = dedupeListingsById(listings).filter((l) => isListingPubliclyListed(l));
    rows = rows.filter((l) => listingMatchesSearchScope(l, mapScope));
    rows = rows.filter((l) => matchesKindFilter(l, listingKind));
    if (categorySlug !== "all") rows = rows.filter((l) => l.categorySlug === categorySlug);
    if (onlyWithPhoto) rows = rows.filter((l) => (l.photos?.length ?? 0) > 0);
    if (onlyWithPrice) rows = rows.filter((l) => productPriceOrNull(l) != null);
    rows = rows.filter((l) => listingMatchesDatePreset(l, datePreset));

    rows = rows.filter((l) => {
      const priceValue = productPriceOrNull(l);
      if (priceValue == null) return true;
      if (!Number.isNaN(minPrice) && priceFrom.trim() && priceValue < minPrice) return false;
      if (!Number.isNaN(maxPrice) && priceTo.trim() && priceValue > maxPrice) return false;
      return true;
    });

    rows = rows.filter((l) => {
      if (l.type !== "product_sell" && l.type !== "product_buy") return true;
      return matchesProductCondition(l, productCondition);
    });
    if (productDeliveryCategory) {
      rows = rows.filter((l) => {
        if (l.type !== "product_sell" && l.type !== "product_buy") return true;
        return categoryLooksDelivery(l);
      });
    }

    if (serviceRemoteOnly) {
      rows = rows.filter((l) => l.type !== "service" || listingLooksRemote(l));
    }

    if (taskUrgentOnly) {
      rows = rows.filter((l) => l.type !== "task" || listingLooksUrgent(l));
    }
    if (taskRemoteOnly) {
      rows = rows.filter((l) => l.type !== "task" || listingLooksRemote(l));
    }

    if (normalizeQuery(q)) rows = rows.filter((l) => matchesListingQuery(l, q));
    rows = sortListings(rows, sortMode);
    return rows;
  }, [
    loaded,
    listings,
    mapScope,
    listingKind,
    categorySlug,
    onlyWithPhoto,
    onlyWithPrice,
    priceFrom,
    priceTo,
    datePreset,
    q,
    sortMode,
    productCondition,
    productDeliveryCategory,
    serviceRemoteOnly,
    taskUrgentOnly,
    taskRemoteOnly,
  ]);

  useEffect(() => {
    if (listingKind !== "product" && listingKind !== "all") {
      setProductCondition("all");
      setProductDeliveryCategory(false);
    }
    if (listingKind !== "service" && listingKind !== "all") setServiceRemoteOnly(false);
    if (listingKind !== "task" && listingKind !== "all") {
      setTaskUrgentOnly(false);
      setTaskRemoteOnly(false);
    }
  }, [listingKind]);

  const visibleListings = baseFiltered;

  const { viewCounts, publicByUserId } = useCompactListingEnrichment(visibleListings);

  const previewListing = useMemo(() => {
    if (!previewId) return null;
    return visibleListings.find((l) => l.id === previewId) ?? null;
  }, [previewId, visibleListings]);

  const listingMarkers = useMemo(() => {
    const out: {
      id: string;
      lat: number;
      lng: number;
      isSelected: boolean;
      previewTitle: string;
      previewType: string;
      previewCity: string;
      previewImage?: string;
    }[] = [];
    for (const l of baseFiltered) {
      const c = listingCoordinatesForMap(l);
      if (!c) continue;
      const firstPhoto = extractListingPhotos(l)[0]?.trim();
      out.push({
        id: l.id,
        lat: c.lat,
        lng: c.lng,
        isSelected: selectedId === l.id,
        previewTitle: ((l.title ?? "").trim() || "Объявление").slice(0, 120),
        previewType: typeFilterRu(l.type),
        previewCity: listingCardLocationLine(l),
        ...(firstPhoto ? { previewImage: firstPhoto } : {}),
      });
    }
    return out;
  }, [baseFiltered, selectedId]);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = document.getElementById(`map-row-${selectedId}`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const scopeLabel = homepageLocationLabelFromScope(mapScope);

  return (
    <div className="flex h-[calc(100dvh-57px)] max-h-[calc(100dvh-57px)] min-h-0 w-full max-w-full min-w-0 flex-col overflow-hidden bg-black/[0.03] text-black md:flex-row">
      <aside className="order-2 flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden border-black/10 md:order-1 md:h-full md:w-[360px] md:min-w-[320px] md:max-w-[360px] md:flex-none md:shrink-0 md:border-r">
        <div
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
        >
          <div className="space-y-3 border-b border-black/10 bg-white p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h1 className="min-w-0 flex-1 text-base font-semibold text-black/90 break-words">Объявления на карте</h1>
              <Link href="/" className="shrink-0 text-xs font-semibold text-black/50 hover:text-black hover:underline">
                На главную
              </Link>
            </div>

            <MapRegionSettlementSelectors scope={mapScope} onScopeChange={(s) => setMapScope(normalizeSearchScope(s))} />

            <div className="grid gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Тип</div>
              <select
                value={listingKind}
                onChange={(e) => {
                  setListingKind(e.target.value as KindFilter);
                  setCategorySlug("all");
                }}
                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
              >
                <option value="all">Все</option>
                <option value="task">Задачи</option>
                <option value="service">Услуги</option>
                <option value="product">Товары</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Категория</div>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
              >
                <option value="all">Все категории</option>
                {categoryOptions.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>

            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Поиск по тексту</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Заголовок, описание…"
                className="h-10 min-w-0 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-black/20"
              />
            </label>

            {(listingKind === "all" || listingKind === "product") && (
              <div className="grid gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Товары</div>
                <div className="grid gap-1.5">
                  <span className="text-xs text-black/60">Состояние</span>
                  <select
                    value={productCondition}
                    onChange={(e) => setProductCondition(e.target.value as typeof productCondition)}
                    className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm outline-none"
                  >
                    <option value="all">Любое</option>
                    <option value="new">Новое</option>
                    <option value="used">Б/у</option>
                  </select>
                </div>
                <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={productDeliveryCategory}
                    onChange={(e) => setProductDeliveryCategory(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                  />
                  <span className="min-w-0 flex-1 break-words">Категория про доставку / перевозки</span>
                </label>
              </div>
            )}

            {(listingKind === "all" || listingKind === "service") && (
              <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-black/80">
                <input
                  type="checkbox"
                  checked={serviceRemoteOnly}
                  onChange={(e) => setServiceRemoteOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                />
                <span className="min-w-0 flex-1 break-words">Услуги: удалённо / онлайн (по тексту)</span>
              </label>
            )}

            {(listingKind === "all" || listingKind === "task") && (
              <div className="grid gap-2 rounded-xl border border-black/10 bg-black/[0.02] p-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Задачи</div>
                <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={taskUrgentOnly}
                    onChange={(e) => setTaskUrgentOnly(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                  />
                  <span className="min-w-0 flex-1 break-words">Срочные (по слову в тексте)</span>
                </label>
                <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-black/80">
                  <input
                    type="checkbox"
                    checked={taskRemoteOnly}
                    onChange={(e) => setTaskRemoteOnly(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                  />
                  <span className="min-w-0 flex-1 break-words">Удалённая задача (по тексту)</span>
                </label>
              </div>
            )}

            {(listingKind === "all" || listingKind === "product") && (
              <div className="grid grid-cols-2 items-end gap-2">
                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Цена от</span>
                  <input
                    value={priceFrom}
                    onChange={(e) => setPriceFrom(e.target.value.replace(/[^\d]/g, ""))}
                    className="h-9 w-full rounded-xl border border-black/10 px-3 text-sm"
                    inputMode="numeric"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-black/45">до</span>
                  <input
                    value={priceTo}
                    onChange={(e) => setPriceTo(e.target.value.replace(/[^\d]/g, ""))}
                    className="h-9 w-full rounded-xl border border-black/10 px-3 text-sm"
                    inputMode="numeric"
                  />
                </label>
              </div>
            )}

            <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-black/80">
              <input
                type="checkbox"
                checked={onlyWithPhoto}
                onChange={(e) => setOnlyWithPhoto(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-black"
              />
              <span className="min-w-0 flex-1 break-words">Только с фото</span>
            </label>

            <label className="flex min-w-0 flex-wrap items-start gap-2 text-sm text-black/80">
              <input
                type="checkbox"
                checked={onlyWithPrice}
                onChange={(e) => setOnlyWithPrice(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-black"
              />
              <span className="min-w-0 flex-1 break-words">Только с ценой</span>
            </label>

            <div className="grid gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Дата публикации</div>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}
                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
              >
                <option value="all">Все</option>
                <option value="today">Сегодня</option>
                <option value="week">7 дней</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Сортировка</div>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
              >
                <option value="new">Новые</option>
                <option value="cheap">Дешевле</option>
                <option value="expensive">Дороже</option>
              </select>
            </div>

            <div className="min-w-0 break-words text-xs text-black/50">
              Локация: {scopeLabel}. Без координат объявление только в списке, не на карте.
            </div>
          </div>

          <div className="min-h-0 flex-1 bg-black/[0.02] px-2 pt-2 pb-3">
            {!loaded ?
              <p className="p-4 text-sm text-black/55">Загрузка объявлений…</p>
            : visibleListings.length === 0 ?
              <p className="p-4 text-sm text-black/55">Ничего не найдено по фильтрам.</p>
            : <ul className="flex flex-col gap-2 pb-4">
                {visibleListings.map((l) => {
                  const href = appendReturnUrlQuery(listingPath(l.id, l.title), "/map");
                  const oid = (l.ownerId ?? "").trim();
                  const rowClass =
                    selectedId === l.id ? "rounded-2xl ring-2 ring-[#ff7a00] ring-offset-1" : "";

                  const metaExtras = (
                    <div className="mt-0.5 text-xs text-black/50">
                      {typeFilterRu(l.type)}
                      {listingCoordinatesForMap(l) ? null : (
                        <span className="ml-1 rounded bg-black/[0.06] px-1 text-[11px]">нет точки на карте</span>
                      )}
                    </div>
                  );

                  return (
                    <li key={l.id} id={`map-row-${l.id}`} className={rowClass}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="w-full rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]"
                        onClick={() => {
                          setSelectedId(l.id);
                          setPreviewId(l.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(l.id);
                            setPreviewId(l.id);
                          }
                        }}
                      >
                        <CompactListingCard
                          listing={l}
                          href={href}
                          variant="plain"
                          viewCount={viewCounts[l.id] ?? 0}
                          publicAuthor={oid ? publicByUserId[oid] ?? null : null}
                        />
                        {metaExtras}
                      </div>
                    </li>
                  );
                })}
              </ul>
            }
          </div>
        </div>
      </aside>

      <div className="relative order-1 min-h-0 w-full min-w-0 flex-1 overflow-hidden md:order-2 md:h-full md:flex-1">
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 bg-gradient-to-b from-white/95 to-transparent px-3 py-2 md:px-4">
          <span className="text-xs text-black/50">
            {listingMarkers.length} на карте · {visibleListings.length} в списке
          </span>
        </div>

        <div className="absolute inset-0">
          <YandexMapPicker
            key={mapInstanceKey}
            center={mapView.center}
            zoom={mapView.zoom}
            className="h-full w-full overflow-hidden rounded-none border-0"
            showViewportCircle={false}
            showGeolocationButton
            settlementMarkers={[]}
            listingMarkers={listingMarkers}
            onListingMarkerClick={(id) => {
              setSelectedId(id);
              setPreviewId(id);
            }}
          />
        </div>
      </div>

      <MapListingPreviewModal
        open={previewListing != null}
        listing={previewListing}
        onClose={() => setPreviewId(null)}
        publicAuthor={
          previewListing ? publicByUserId[(previewListing.ownerId ?? "").trim()] ?? null : null
        }
        viewCount={previewListing ? viewCounts[previewListing.id] ?? 0 : 0}
        mapReturnPath="/map"
      />
    </div>
  );
}
