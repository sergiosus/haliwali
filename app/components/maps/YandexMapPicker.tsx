"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadYandexMaps, resetYandexMapsLoaderForRetry, type YmapsNamespace } from "../../lib/maps/yandexLoader";
import { calculateDistanceKm } from "@/lib/shared/geo";
import { GeolocationButton } from "../map/GeolocationButton";

export type MapCenter = { lat: number; lng: number };

export type MapSettlementMarker = {
  key: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  isSelected: boolean;
};

export type MapListingMarker = {
  id: string;
  lat: number;
  lng: number;
  hint?: string;
  isSelected?: boolean;
  isHovered?: boolean;
  /** React map preview (no Yandex balloon / hint). */
  previewTitle: string;
  previewType: string;
  previewCity: string;
  /** Optional first listing photo URL for popup thumbnail. */
  previewImage?: string;
  /** Optional price line (e.g. products). */
  previewPrice?: string;
};

export type MapViewportBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/** Interpret Yandex Map `getBounds()` as geographic lat/lng extremes (prefer [lat,lng] per corner like `getCenter`). */
export function normalizeYandexBoundsGeo(bounds: number[][]): MapViewportBounds | null {
  const p0 = bounds[0];
  const p1 = bounds[1];
  if (!p0?.length || !p1?.length || p0.length < 2 || p1.length < 2) return null;
  const asLatLng = (): MapViewportBounds => ({
    minLat: Math.min(p0[0], p1[0]),
    maxLat: Math.max(p0[0], p1[0]),
    minLng: Math.min(p0[1], p1[1]),
    maxLng: Math.max(p0[1], p1[1]),
  });
  const asLngLat = (): MapViewportBounds => ({
    minLat: Math.min(p0[1], p1[1]),
    maxLat: Math.max(p0[1], p1[1]),
    minLng: Math.min(p0[0], p1[0]),
    maxLng: Math.max(p0[0], p1[0]),
  });
  const a = asLatLng();
  const plausibleA =
    a.minLat >= 35 &&
    a.maxLat <= 85 &&
    a.minLng >= -10 &&
    a.maxLng <= 195 &&
    a.maxLat >= a.minLat &&
    a.maxLng >= a.minLng;
  if (plausibleA) return a;
  const b = asLngLat();
  if (
    b.minLat >= 35 &&
    b.maxLat <= 85 &&
    b.minLng >= -10 &&
    b.maxLng <= 195 &&
    b.maxLat >= b.minLat &&
    b.maxLng >= b.minLng
  ) {
    return b;
  }
  return a;
}

type Props = {
  /** Single source for map geographic center `[latitude, longitude]` (matches `map.getCenter()` order in this file). */
  center: MapCenter;
  zoom?: number;
  /** Extra classes on the outer map shell (height, etc.). */
  className?: string;
  /** After pan/zoom/movement ends; center from `map.getCenter()` as { lat, lng }. Debounced / de-spammed. */
  onCenterChange?: (center: MapCenter) => void;
  /** Map click; also updates center via onCenterChange if provided. */
  onMapClick?: (center: MapCenter) => void;
  /** Up to 50 nearby / selected settlements shown as placemarks (does not change map chrome). */
  settlementMarkers?: readonly MapSettlementMarker[];
  onSettlementMarkerClick?: (m: MapSettlementMarker) => void;
  /** Browser geolocation fix (modal open / parent); distinct from settlement dots. */
  userLocation?: MapCenter | null;
  /** Pick nearest settlement to this point (parent resolves). */
  onUserLocationMarkerClick?: (at: MapCenter) => void;
  /** After browser geolocation succeeds — parent can mirror `userLocation` for one marker source. */
  onGeolocationButtonSuccess?: (at: MapCenter) => void;
  /**
   * Craigslist-style fixed viewport overlay (DOM): dim/blur outside a centered circular window; map pans underneath.
   * Not geographic — does not use `ymaps.Circle`.
   */
  viewportSearchOverlay?: boolean;
  showGeolocationButton?: boolean;
  listingMarkers?: readonly MapListingMarker[];
  /**
   * Optional pre-grouped listing markers (e.g. server-side or page-level grouping).
   * When provided, the map renders exactly one placemark + one stacked popup per group.
   */
  listingMarkerGroups?: readonly { key: string; members: readonly MapListingMarker[] }[];
  onListingMarkerClick?: (id: string) => void;
  /**
   * When true: marker click invokes `onListingMarkerClick` but does not “pin” the preview via click
   * (homepage hover-led Craigslist-style UX).
   */
  listingMarkerClickNavigatesOnly?: boolean;
  /** Debounced map pan/zoom end — viewport center + geographic bounds for “search in area”. */
  onViewportStable?: (args: { center: MapCenter; bounds: MapViewportBounds }) => void;
  /**
   * Increment from parent to animate map back to {@link recenterTarget} (keeps zoom). Starts at 0.
   * Parent should sync {@link recenterTick} with `center` changes (see internal reset) to avoid replays.
   */
  recenterTick?: number;
  /** Geographic target for the latest recenter request; falls back to {@link center} if missing. */
  recenterTarget?: MapCenter | null;
};

const CENTER_EMIT_DEBOUNCE_MS = 140;
const VIEWPORT_STABLE_DEBOUNCE_MS = 420;
/** Delay before hiding listing hover popup after pointer leaves marker/card (no flicker). */
const LISTING_POPUP_LEAVE_DELAY_MS = 1600;
/** After pan/zoom gesture ends, ignore one map `click` close on touch-like UIs (avoids stray close). */
const MAP_CLICK_CLOSE_GUARD_MS = 180;
/** Embedded / slow networks: avoid indefinite blank map when Yandex never becomes interactive. */
const YANDEX_MAP_LOAD_TIMEOUT_MS = 35_000;

const MAP_FALLBACK_MESSAGE =
  "Карта не загрузилась. Откройте сайт в браузере или попробуйте позже.";
const MAP_FALLBACK_IN_APP_HINT = "Встроенный браузер может ограничивать карты.";

function detectLikelyInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  return /telegram|vk\.com|vkontakte|instagram|fbav|fban|micromessenger|webview|line\//i.test(ua);
}

/**
 * True when hover is unreliable (phones) or the primary pointer is coarse (touch).
 * Used only to switch listing popup from hover-driven to tap / outside-tap lifecycle.
 */
function getPreferTapListingPopup(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hoverNone = window.matchMedia("(hover: none)");
    const coarse = window.matchMedia("(pointer: coarse)");
    return Boolean(hoverNone.matches || coarse.matches);
  } catch {
    return false;
  }
}
/** Minimum movement (m, approx) before emitting duplicate center. */
const CENTER_EMIT_MIN_MOVE_M = 35;
/**
 * Listings within this distance share one map placemark + one stacked popup (avoids hover flipping
 * between overlapping dot icons).
 */
const LISTING_MARKER_GROUP_RADIUS_M = 30;

function listingMarkerGroupKey(members: readonly MapListingMarker[]): string {
  return members
    .map((m) => m.id)
    .slice()
    .sort()
    .join("|");
}

/** Union-find on indices: merge any pair within {@link LISTING_MARKER_GROUP_RADIUS_M} meters (transitive). */
function groupListingMarkersByProximity(markers: readonly MapListingMarker[]): MapListingMarker[][] {
  if (markers.length === 0) return [];
  const n = markers.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    return parent[i] === i ? i : (parent[i] = find(parent[i]));
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  for (let i = 0; i < n; i++) {
    const a = markers[i]!;
    if (!Number.isFinite(a.lat + a.lng)) continue;
    for (let j = i + 1; j < n; j++) {
      const b = markers[j]!;
      if (!Number.isFinite(b.lat + b.lng)) continue;
      const dM = calculateDistanceKm(a.lat, a.lng, b.lat, b.lng) * 1000;
      if (dM <= LISTING_MARKER_GROUP_RADIUS_M) union(i, j);
    }
  }
  const buckets = new Map<number, MapListingMarker[]>();
  for (let i = 0; i < n; i++) {
    const m = markers[i]!;
    const r = find(i);
    const arr = buckets.get(r);
    if (arr) arr.push(m);
    else buckets.set(r, [m]);
  }
  return Array.from(buckets.values()).map((g) => g.slice().sort((x, y) => x.id.localeCompare(y.id)));
}

function groupRepresentativeLatLng(group: readonly MapListingMarker[]): { lat: number; lng: number } | null {
  const ok = group.filter((m) => Number.isFinite(m.lat + m.lng));
  if (ok.length === 0) return null;
  const lat = ok.reduce((s, m) => s + m.lat, 0) / ok.length;
  const lng = ok.reduce((s, m) => s + m.lng, 0) / ok.length;
  return { lat, lng };
}

/** Nearby settlements: tiny filled raster dot (avoids `*CircleDotIcon` / preset ring blobs). */
const SETTLEMENT_MAP_DOT_PX = 6;

function settlementMapDotHref(fill: string): string {
  const d = SETTLEMENT_MAP_DOT_PX;
  const c = d / 2;
  const r = Math.max(0.8, c - 0.55);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${c}" cy="${c}" r="${r}" fill="${fill}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function centerMovedEnough(a: MapCenter, b: MapCenter): boolean {
  const dKm = calculateDistanceKm(a.lat, a.lng, b.lat, b.lng);
  return dKm * 1000 >= CENTER_EMIT_MIN_MOVE_M;
}

/** Thumbnail for map listing popup: image or neutral placeholder if missing / broken. */
function ListingPopupThumb({ url, compact }: { url?: string; compact?: boolean }) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  const [broken, setBroken] = useState(false);
  const box = compact ? "h-10 w-10" : "h-14 w-14";
  if (!trimmed || broken) {
    return (
      <div
        className={`${box} shrink-0 rounded-lg border border-dashed border-black/15 bg-black/[0.04]`}
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote listing photo URL from store
    <img
      src={trimmed}
      alt=""
      className={`${box} shrink-0 rounded-lg border border-black/10 object-cover`}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Interactive map. Optional Craigslist viewport overlay via {@link viewportSearchOverlay} (fixed screen ring, map moves under it).
 */
export function YandexMapPicker({
  center,
  zoom = 11,
  className = "",
  onCenterChange,
  onMapClick,
  settlementMarkers = [],
  onSettlementMarkerClick,
  userLocation = null,
  onUserLocationMarkerClick,
  onGeolocationButtonSuccess,
  viewportSearchOverlay = false,
  showGeolocationButton = true,
  listingMarkers = [],
  listingMarkerGroups,
  onListingMarkerClick,
  onViewportStable,
  listingMarkerClickNavigatesOnly = false,
  recenterTick = 0,
  recenterTarget = null,
}: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const effLat = center.lat;
  const effLng = center.lng;

  const effRef = useRef({ lat: effLat, lng: effLng, zoom });
  effRef.current = { lat: effLat, lng: effLng, zoom };

  const mapInstRef = useRef<{ map: YmapsNamespace } | null>(null);
  /** Loaded `ymaps` namespace (for Placemark after geolocation). */
  const ymapsApiRef = useRef<unknown>(null);
  const [mapReady, setMapReady] = useState(false);
  /** Script/timeout/init failure — show fallback instead of blank map. */
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  /** Bump to re-run map init (retry). */
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const [geoLoading, setGeoLoading] = useState(false);
  const likelyInAppBrowser = useMemo(() => detectLikelyInAppBrowser(), []);
  const onCenterChangeRef = useRef(onCenterChange);
  const onMapClickRef = useRef(onMapClick);
  const onSettlementMarkerClickRef = useRef(onSettlementMarkerClick);
  const onUserLocationMarkerClickRef = useRef(onUserLocationMarkerClick);
  const onGeolocationButtonSuccessRef = useRef(onGeolocationButtonSuccess);
  const onListingMarkerClickRef = useRef(onListingMarkerClick);
  const listingMarkerClickNavigatesOnlyRef = useRef(listingMarkerClickNavigatesOnly);
  const onViewportStableRef = useRef(onViewportStable);
  onCenterChangeRef.current = onCenterChange;
  onMapClickRef.current = onMapClick;
  onSettlementMarkerClickRef.current = onSettlementMarkerClick;
  onUserLocationMarkerClickRef.current = onUserLocationMarkerClick;
  onGeolocationButtonSuccessRef.current = onGeolocationButtonSuccess;
  onListingMarkerClickRef.current = onListingMarkerClick;
  listingMarkerClickNavigatesOnlyRef.current = listingMarkerClickNavigatesOnly;
  onViewportStableRef.current = onViewportStable;

  const lastEmittedRef = useRef<MapCenter | null>(null);
  const lastRecenterTickAppliedRef = useRef(0);
  const prevEffForRecenterResetRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevRecenterTickRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportStableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settlementPlacemarksRef = useRef<unknown[]>([]);
  const listingPlacemarksRef = useRef<unknown[]>([]);
  const userLocationPlacemarkRef = useRef<unknown>(null);

  // React-controlled hover / click-pinned preview for listing marker **groups** (one popup per co-located cluster).
  const [hoveredListingGroupKey, setHoveredListingGroupKey] = useState<string | null>(null);
  const [activeListingGroupKey, setActiveListingGroupKey] = useState<string | null>(null);
  /** Screen position for the preview stack; anchored to the group's representative lat/lng. */
  const [activeListingPreviewPos, setActiveListingPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const activePreviewMarkerRef = useRef<{
    groupKey: string;
    lat: number;
    lng: number;
  } | null>(null);

  /** Step 1 / 7: delayed close after leaving marker and popup. */
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeListingGroupKeyRef = useRef<string | null>(null);
  activeListingGroupKeyRef.current = activeListingGroupKey;

  const markerHoveredRef = useRef(false);
  const popupHoveredRef = useRef(false);

  /** Touch / coarse-pointer: listing previews use tap + outside tap, not hover. */
  const [preferTapListingPopup, setPreferTapListingPopup] = useState(false);
  const preferTapListingPopupRef = useRef(false);
  preferTapListingPopupRef.current = preferTapListingPopup;

  /** After a map pan/zoom gesture, suppress tap-outside close briefly (touch-like UIs). */
  const mapGestureCloseGuardUntilRef = useRef(0);
  /** Listing placemark `click` is often followed by a map `click`; avoid clearing the popup in the same gesture. */
  const listingPlacemarkClickSuppressMapCloseUntilRef = useRef(0);

  const displayGroupKey = hoveredListingGroupKey ?? activeListingGroupKey;

  const listingGroups = useMemo(() => {
    if (listingMarkerGroups && listingMarkerGroups.length > 0) {
      return listingMarkerGroups
        .map((g) => (Array.isArray(g.members) ? g.members.slice() : []))
        .filter((g) => g.length > 0) as MapListingMarker[][];
    }
    return groupListingMarkersByProximity(listingMarkers);
  }, [listingMarkers, listingMarkerGroups]);

  const displayListingGroup = useMemo(() => {
    if (!displayGroupKey) return null;
    for (const g of listingGroups) {
      if (listingMarkerGroupKey(g) === displayGroupKey) return g;
    }
    return null;
  }, [listingGroups, displayGroupKey]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  /** Step 5 / map click: clear hover, pin, and preview. */
  const closePreviewImmediately = () => {
    clearCloseTimer();
    markerHoveredRef.current = false;
    popupHoveredRef.current = false;
    setHoveredListingGroupKey(null);
    setActiveListingGroupKey(null);
    setActiveListingPreviewPos(null);
    activePreviewMarkerRef.current = null;
  };

  /**
   * Step 2–3: after leaving marker or popup, hide unless pinned (activeListingGroupKey).
   * Re-entering marker or popup clears the timer (no flicker).
   */
  const schedulePreviewHide = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (markerHoveredRef.current || popupHoveredRef.current) return;
      if (!activeListingGroupKeyRef.current) {
        setHoveredListingGroupKey(null);
        setActiveListingPreviewPos(null);
        activePreviewMarkerRef.current = null;
        return;
      }
      setHoveredListingGroupKey(null);
    }, LISTING_POPUP_LEAVE_DELAY_MS);
  };

  /** Map init registers `click` once — always call latest close via ref (Step 5). */
  const closePreviewImmediatelyRef = useRef<() => void>(() => {});
  closePreviewImmediatelyRef.current = closePreviewImmediately;

  const updateActivePreviewPosition = useCallback(() => {
    const inst = mapInstRef.current?.map as any;
    const holder = holderRef.current;
    const cur = activePreviewMarkerRef.current;
    if (!inst?.converter?.globalToPage || !inst.options?.get || !holder || !cur) return;
    try {
      const projection = inst.options.get("projection") as { toGlobalPixels?: (geo: number[], z: number) => number[] } | null;
      const zoom = typeof inst.getZoom === "function" ? Number(inst.getZoom()) : NaN;
      if (!projection?.toGlobalPixels || !Number.isFinite(zoom)) return;
      const globalPixels = projection.toGlobalPixels([cur.lat, cur.lng], zoom);
      if (!globalPixels || globalPixels.length < 2) return;
      const pagePt = inst.converter.globalToPage(globalPixels) as number[] | undefined;
      if (!pagePt || pagePt.length < 2) return;
      const rect = holder.getBoundingClientRect();
      let x = pagePt[0]! - rect.left;
      let y = pagePt[1]! - rect.top;
      // Clamp inside map container a bit to avoid disappearing off-screen.
      x = Math.max(14, Math.min(rect.width - 14, x));
      y = Math.max(14, Math.min(rect.height - 14, y));
      setActiveListingPreviewPos({ x, y });
    } catch {
      /* noop */
    }
  }, []);

  /** Keep preview anchored to the active marker group's representative coordinates. */
  useLayoutEffect(() => {
    const group = displayListingGroup;
    if (!group?.length) return;
    const rep = groupRepresentativeLatLng(group);
    if (!rep) return;
    activePreviewMarkerRef.current = {
      groupKey: listingMarkerGroupKey(group),
      lat: rep.lat,
      lng: rep.lng,
    };
    if (mapReady) updateActivePreviewPosition();
  }, [displayListingGroup, mapReady, updateActivePreviewPosition]);

  /** Step 7: clear close timer on unmount. */
  useEffect(() => () => clearCloseTimer(), []);

  useLayoutEffect(() => {
    const sync = () => setPreferTapListingPopup(getPreferTapListingPopup());
    sync();
    let mqlHover: MediaQueryList | null = null;
    let mqlPointer: MediaQueryList | null = null;
    try {
      mqlHover = window.matchMedia("(hover: none)");
      mqlPointer = window.matchMedia("(pointer: coarse)");
      const onChange = () => sync();
      mqlHover.addEventListener("change", onChange);
      mqlPointer.addEventListener("change", onChange);
      return () => {
        mqlHover?.removeEventListener("change", onChange);
        mqlPointer?.removeEventListener("change", onChange);
      };
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    let dead = false;
    let onResize: (() => void) | null = null;
    let loadTimeoutId: number | undefined;
    if (!holderRef.current || !Number.isFinite(effLat + effLng)) return undefined;

    setMapLoadFailed(false);

    const loadTimeoutPromise = new Promise<never>((_, reject) => {
      loadTimeoutId = window.setTimeout(() => reject(new Error("YANDEX_MAP_LOAD_TIMEOUT")), YANDEX_MAP_LOAD_TIMEOUT_MS);
    });

    void Promise.race([loadYandexMaps(), loadTimeoutPromise])
      .then((ym) => {
        if (loadTimeoutId !== undefined) {
          window.clearTimeout(loadTimeoutId);
          loadTimeoutId = undefined;
        }
        if (dead || !holderRef.current) return;
        if (mapInstRef.current) return;

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const ymaps = ym as any;
        ymaps.ready(() => {
          if (dead || !holderRef.current || mapInstRef.current) return;

          let map: YmapsNamespace | null = null;
          try {
            const { lat: lat0, lng: lng0, zoom: z0 } = effRef.current;
            const center0 = [lat0, lng0] as [number, number];
            map = new ymaps.Map(holderRef.current, {
              center: center0,
              zoom: z0 ?? 11,
              controls: ["zoomControl"],
            });

            try {
              map.container?.fitToViewport?.();
            } catch {
              /* noop */
            }

            // Keep map fitted on viewport resize (prevents internal scrollbars / clipped tiles).
            onResize = () => {
              try {
                map?.container?.fitToViewport?.();
              } catch {
                /* noop */
              }
            };
            try {
              window.addEventListener("resize", onResize);
            } catch {
              /* noop */
            }

            const emitIfMoved = (next: MapCenter) => {
              const last = lastEmittedRef.current;
              if (last && !centerMovedEnough(last, next)) return;
              lastEmittedRef.current = next;
              onCenterChangeRef.current?.(next);
            };

            const scheduleEmitFromMap = () => {
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                try {
                  const c = map!.getCenter() as number[] | undefined;
                  if (!c || c.length < 2) return;
                  emitIfMoved({ lat: c[0]!, lng: c[1]! });
                } catch {
                  /* noop */
                }
              }, CENTER_EMIT_DEBOUNCE_MS);
            };

            map.events.add("actionend", scheduleEmitFromMap);
            map.events.add("boundschange", scheduleEmitFromMap);

            const scheduleViewportStable = () => {
              if (!onViewportStableRef.current) return;
              if (viewportStableTimerRef.current) clearTimeout(viewportStableTimerRef.current);
              viewportStableTimerRef.current = setTimeout(() => {
                viewportStableTimerRef.current = null;
                try {
                  const c = map!.getCenter() as number[] | undefined;
                  const b = map!.getBounds?.() as number[][] | undefined;
                  if (!c || c.length < 2 || !b || !Array.isArray(b) || b.length < 2) return;
                  const centerMap: MapCenter = { lat: c[0]!, lng: c[1]! };
                  const box = normalizeYandexBoundsGeo(b);
                  if (!box) return;
                  onViewportStableRef.current?.({ center: centerMap, bounds: box });
                } catch {
                  /* noop */
                }
              }, VIEWPORT_STABLE_DEBOUNCE_MS);
            };

            map.events.add("actionend", scheduleViewportStable);
            map.events.add("boundschange", scheduleViewportStable);

            // Keep React hover preview positioned on pan/zoom.
            const onMove = () => {
              try {
                updateActivePreviewPosition();
              } catch {
                /* noop */
              }
            };
            map.events.add("actionend", onMove);
            map.events.add("boundschange", onMove);

            // Touch-like UIs: brief guard after pan/zoom so a stray map click does not dismiss the listing popup.
            map.events.add("actionstart", () => {
              try {
                if (!preferTapListingPopupRef.current) return;
                const until = Date.now() + MAP_CLICK_CLOSE_GUARD_MS;
                if (until > mapGestureCloseGuardUntilRef.current) mapGestureCloseGuardUntilRef.current = until;
              } catch {
                /* noop */
              }
            });
            map.events.add("actionend", () => {
              try {
                if (!preferTapListingPopupRef.current) return;
                const until = Date.now() + MAP_CLICK_CLOSE_GUARD_MS;
                if (until > mapGestureCloseGuardUntilRef.current) mapGestureCloseGuardUntilRef.current = until;
              } catch {
                /* noop */
              }
            });

            map.events.add("click", (e: { get: (k: string) => unknown }) => {
              const tapUx = preferTapListingPopupRef.current;
              const skipCloseFromRecentGesture = tapUx && Date.now() < mapGestureCloseGuardUntilRef.current;
              const skipCloseFromListingPlacemark =
                Date.now() < listingPlacemarkClickSuppressMapCloseUntilRef.current;
              if (!skipCloseFromRecentGesture && !skipCloseFromListingPlacemark) {
                closePreviewImmediatelyRef.current();
              }
              const coords = e.get("coords") as [number, number] | undefined;
              if (!coords || coords.length < 2) return;
              const mapCenter: MapCenter = { lat: coords[0]!, lng: coords[1]! };
              onMapClickRef.current?.(mapCenter);
              lastEmittedRef.current = mapCenter;
              onCenterChangeRef.current?.(mapCenter);
            });

            ymapsApiRef.current = ymaps;
            mapInstRef.current = { map };
            setMapReady(true);
            setMapLoadFailed(false);
          } catch {
            resetYandexMapsLoaderForRetry();
            try {
              map?.destroy?.();
            } catch {
              /* noop */
            }
            mapInstRef.current = null;
            ymapsApiRef.current = null;
            if (!dead) {
              setMapReady(false);
              setMapLoadFailed(true);
            }
          }
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */
      })
      .catch(() => {
        if (loadTimeoutId !== undefined) {
          window.clearTimeout(loadTimeoutId);
          loadTimeoutId = undefined;
        }
        resetYandexMapsLoaderForRetry();
        if (!dead) {
          setMapReady(false);
          setMapLoadFailed(true);
        }
      });

    return () => {
      dead = true;
      if (loadTimeoutId !== undefined) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = undefined;
      }
      try {
        if (onResize) window.removeEventListener("resize", onResize);
      } catch {
        /* noop */
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (viewportStableTimerRef.current) clearTimeout(viewportStableTimerRef.current);
      clearCloseTimer();
      try {
        const m = mapInstRef.current?.map as { geoObjects?: { remove?: (x: unknown) => void } } | undefined;
        const mk = userLocationPlacemarkRef.current;
        if (m?.geoObjects?.remove && mk) m.geoObjects.remove(mk);
        for (const pm of listingPlacemarksRef.current) {
          try {
            m?.geoObjects?.remove?.(pm);
          } catch {
            /* noop */
          }
        }
        listingPlacemarksRef.current = [];
      } catch {
        /* noop */
      }
      userLocationPlacemarkRef.current = null;
      ymapsApiRef.current = null;
      try {
        mapInstRef.current?.map?.destroy?.();
      } catch {
        /* noop */
      }
      mapInstRef.current = null;
      setMapReady(false);
    };
  }, [updateActivePreviewPosition, mapLoadAttempt]);

  /** Sync prop center → map without changing zoom (avoids snap-back after user zooms out). */
  useLayoutEffect(() => {
    const inst = mapInstRef.current;
    if (!inst?.map || !mapReady || !Number.isFinite(effLat + effLng)) return;

    const centerArr = [effLat, effLng] as [number, number];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const m = inst.map as any;
    try {
      const cur = m.getCenter?.() as number[] | undefined;
      if (cur && cur.length >= 2 && Number.isFinite(cur[0] + cur[1])) {
        const dKm = calculateDistanceKm(cur[0]!, cur[1]!, effLat, effLng);
        if (dKm * 1000 < 1) return;
      }
    } catch {
      /* noop */
    }
    try {
      m.setCenter?.(centerArr);
    } catch {
      /* noop */
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    lastEmittedRef.current = { lat: effLat, lng: effLng };
  }, [effLat, effLng, mapReady]);

  /** When the controlled `center` prop moves to a new place (new city etc.), align recenter bookkeeping so stale ticks don't fire. */
  useLayoutEffect(() => {
    const prev = prevEffForRecenterResetRef.current;
    if (!prev || prev.lat !== effLat || prev.lng !== effLng) {
      prevEffForRecenterResetRef.current = { lat: effLat, lng: effLng };
      lastRecenterTickAppliedRef.current = recenterTick;
    }
  }, [effLat, effLng, recenterTick]);

  /** Parent may reset {@link recenterTick} to 0 when the anchor NP changes — allow the next bump to animate again. */
  useLayoutEffect(() => {
    const prev = prevRecenterTickRef.current;
    prevRecenterTickRef.current = recenterTick;
    if (prev !== 0 && recenterTick === 0) {
      lastRecenterTickAppliedRef.current = 0;
    }
  }, [recenterTick]);

  /** Parent-driven «вернуться к НП»: pan map to {@link recenterTarget} without remounting. */
  useLayoutEffect(() => {
    const inst = mapInstRef.current;
    if (!inst?.map || !mapReady) return;
    const tick = recenterTick;
    if (tick === 0 || tick === lastRecenterTickAppliedRef.current) return;

    lastRecenterTickAppliedRef.current = tick;

    const t =
      recenterTarget && Number.isFinite(recenterTarget.lat + recenterTarget.lng) ?
        recenterTarget
      : { lat: effLat, lng: effLng };

    try {
      const m = inst.map as {
        getZoom?: () => number;
        setCenter?: (c: number[], z?: number, opts?: { duration?: number }) => void;
      };
      const zoomNow = typeof m.getZoom === "function" ? Number(m.getZoom()) : Number(zoom ?? 11);
      const zUse = Number.isFinite(zoomNow) ? zoomNow : Number(zoom ?? 11);
      m.setCenter?.([t.lat, t.lng], zUse, { duration: 300 });
    } catch {
      /* noop */
    }

    lastEmittedRef.current = t;
    try {
      onCenterChangeRef.current?.(t);
    } catch {
      /* noop */
    }
  }, [recenterTick, recenterTarget?.lat, recenterTarget?.lng, mapReady, effLat, effLng, zoom]);

  /** Apply parent `zoom` when it changes (map is created once; initial zoom only reflected on first paint). Never fits bounds to the search circle — center sync stays separate above. */
  useLayoutEffect(() => {
    const inst = mapInstRef.current;
    if (!inst?.map || !mapReady) return;
    const z = zoom ?? 11;
    if (!Number.isFinite(z)) return;

    try {
      const m = inst.map as { getZoom?: () => number; setZoom?: (zoom: number, opts?: { duration?: number }) => void };
      const cur = typeof m.getZoom === "function" ? Number(m.getZoom()) : NaN;
      if (Number.isFinite(cur) && Math.abs(cur - z) < 0.05) return;
      m.setZoom?.(z, { duration: 250 });
    } catch {
      /* noop */
    }
  }, [zoom, mapReady]);

  const settlementMarkersJson = useMemo(
    () => JSON.stringify(settlementMarkers),
    [settlementMarkers],
  );

  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    const map = mapInstRef.current.map as {
      geoObjects?: { remove?: (x: unknown) => void; add?: (x: unknown) => void };
    };
    const ymaps = ymapsApiRef.current as {
      Placemark?: new (
        geometry: number[],
        properties: Record<string, string>,
        options: Record<string, string | number | boolean | number[]>,
      ) => {
        events: { add: (ev: string, fn: (e: unknown) => void) => void };
      };
    };

    for (const pm of settlementPlacemarksRef.current) {
      try {
        map.geoObjects?.remove?.(pm);
      } catch {
        /* noop */
      }
    }
    settlementPlacemarksRef.current = [];

    if (!ymaps?.Placemark || !map.geoObjects?.add || settlementMarkers.length === 0) return;

    for (const sm of settlementMarkers) {
      if (!Number.isFinite(sm.lat + sm.lng)) continue;
      const pm = new ymaps.Placemark(
        [sm.lat, sm.lng],
        {
          hintContent: sm.region ? `${sm.name}, ${sm.region}` : sm.name,
          iconCaption: sm.name.length > 24 ? `${sm.name.slice(0, 22)}…` : sm.name,
        },
        {
          iconLayout: "default#image",
          iconImageHref: settlementMapDotHref(sm.isSelected ? "#b91c1c" : "#1d4ed8"),
          iconImageSize: [SETTLEMENT_MAP_DOT_PX, SETTLEMENT_MAP_DOT_PX],
          iconImageOffset: [-SETTLEMENT_MAP_DOT_PX / 2, -SETTLEMENT_MAP_DOT_PX / 2],
          hasBalloon: false,
          hasHint: true,
          openBalloonOnClick: false,
          zIndex: sm.isSelected ? 1300 : 440,
          cursor: "pointer",
        },
      );
      pm.events.add("click", (e: unknown) => {
        try {
          (e as { stopPropagation?: () => void })?.stopPropagation?.();
        } catch {
          /* noop */
        }
        onSettlementMarkerClickRef.current?.(sm);
      });
      try {
        map.geoObjects?.add?.(pm);
        settlementPlacemarksRef.current.push(pm);
      } catch {
        /* noop */
      }
    }
  }, [mapReady, settlementMarkersJson]);

  const listingMarkersJson = useMemo(
    () => JSON.stringify({ listingMarkers, listingMarkerGroups: listingMarkerGroups ?? null }),
    [listingMarkers, listingMarkerGroups],
  );

  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    const map = mapInstRef.current.map as {
      geoObjects?: { remove?: (x: unknown) => void; add?: (x: unknown) => void };
    };
    const ymaps = ymapsApiRef.current as {
      Placemark?: new (
        geometry: number[],
        properties: Record<string, unknown>,
        options: Record<string, string | number | boolean>,
      ) => {
        events: { add: (ev: string, fn: (e: unknown) => void) => void };
      };
    };

    for (const pm of listingPlacemarksRef.current) {
      try {
        map.geoObjects?.remove?.(pm);
      } catch {
        /* noop */
      }
    }
    listingPlacemarksRef.current = [];

    if (!ymaps?.Placemark || !map.geoObjects?.add || listingMarkers.length === 0) return;

    // If we changed markers, close any existing preview (prevents "stuck" popup).
    closePreviewImmediately();

    const groups = listingGroups;

    for (const group of groups) {
      const rep = groupRepresentativeLatLng(group);
      if (!rep) continue;
      const groupKey = listingMarkerGroupKey(group);
      const anySelected = group.some((m) => m.isSelected);
      const anyHovered = group.some((m) => m.isHovered);
      const pm = new ymaps.Placemark(
        [rep.lat, rep.lng],
        {},
        {
          preset: anySelected
            ? "islands#redCircleDotIcon"
            : anyHovered
              ? "islands#orangeCircleDotIcon"
              : "islands#blueCircleDotIcon",
          zIndex: anySelected ? 780 : anyHovered ? 750 : 720,
          hasBalloon: false,
          hasHint: false,
          openBalloonOnClick: false,
        },
      );

      if (!preferTapListingPopup) {
        pm.events.add("mouseenter", () => {
          markerHoveredRef.current = true;
          popupHoveredRef.current = false;
          clearCloseTimer();
          setHoveredListingGroupKey(groupKey);
        });
        pm.events.add("mouseleave", () => {
          markerHoveredRef.current = false;
          schedulePreviewHide();
        });
      }

      pm.events.add("click", (e: unknown) => {
        try {
          (e as { stopPropagation?: () => void })?.stopPropagation?.();
        } catch {
          /* noop */
        }
        listingPlacemarkClickSuppressMapCloseUntilRef.current = Date.now() + 450;
        if (listingMarkerClickNavigatesOnlyRef.current) {
          const first = group[0];
          if (first) onListingMarkerClickRef.current?.(first.id);
          return;
        }
        clearCloseTimer();
        markerHoveredRef.current = true;
        popupHoveredRef.current = false;
        setActiveListingGroupKey(groupKey);
        setHoveredListingGroupKey(groupKey);
        if (group.length === 1) {
          const only = group[0];
          if (only) onListingMarkerClickRef.current?.(only.id);
        }
      });
      try {
        map.geoObjects?.add?.(pm);
        listingPlacemarksRef.current.push(pm);
      } catch {
        /* noop */
      }
    }
  }, [mapReady, listingMarkersJson, preferTapListingPopup]);

  const userLocationKey = useMemo(
    () =>
      userLocation && Number.isFinite(userLocation.lat + userLocation.lng) ?
        `${userLocation.lat},${userLocation.lng}`
      : "",
    [userLocation?.lat, userLocation?.lng],
  );

  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    const map = mapInstRef.current.map as {
      geoObjects?: { remove?: (x: unknown) => void; add?: (x: unknown) => void };
    };
    const ymaps = ymapsApiRef.current as {
      Placemark?: new (
        geometry: number[],
        properties: Record<string, string>,
        options: Record<string, unknown>,
      ) => {
        events: { add: (ev: string, fn: (e: unknown) => void) => void };
      };
    };

    try {
      const mk = userLocationPlacemarkRef.current;
      if (mk) map.geoObjects?.remove?.(mk);
    } catch {
      /* noop */
    }
    userLocationPlacemarkRef.current = null;

    if (
      !userLocation ||
      !Number.isFinite(userLocation.lat + userLocation.lng) ||
      !ymaps?.Placemark ||
      !map.geoObjects?.add
    ) {
      return;
    }

    const at: MapCenter = { lat: userLocation.lat, lng: userLocation.lng };
    const pm = new ymaps.Placemark(
      [at.lat, at.lng],
      {
        hintContent: "Ваше местоположение — нажмите, чтобы выбрать ближайший населённый пункт",
      },
      {
        preset: "islands#geolocationIcon",
        zIndex: 650,
      },
    );
    pm.events.add("click", (e: unknown) => {
      try {
        (e as { stopPropagation?: () => void })?.stopPropagation?.();
      } catch {
        /* noop */
      }
      onUserLocationMarkerClickRef.current?.(at);
    });
    try {
      map.geoObjects?.add?.(pm);
      userLocationPlacemarkRef.current = pm;
    } catch {
      /* noop */
    }
  }, [mapReady, userLocationKey]);

  const handleMyLocation = useCallback(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const map = mapInstRef.current?.map as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (!map?.setCenter || typeof navigator === "undefined" || !navigator.geolocation) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Geolocation not available");
      }
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!Number.isFinite(lat + lng)) return;

        try {
          map.setCenter([lat, lng], 12, { duration: 300 });
          const nextCenter: MapCenter = { lat, lng };
          lastEmittedRef.current = nextCenter;
          onCenterChangeRef.current?.(nextCenter);
          onGeolocationButtonSuccessRef.current?.(nextCenter);
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(e);
          }
        }
      },
      (err) => {
        setGeoLoading(false);
        if (process.env.NODE_ENV !== "production") {
          console.error("Geolocation error", err);
        }
        const code = (err as { code?: unknown })?.code;
        if (code === 1) {
          try {
            window.alert("Разрешите доступ к геолокации");
          } catch {
            /* noop */
          }
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60000,
      },
    );
  }, []);

  const shell =
    "relative isolate w-full overflow-hidden rounded-2xl border border-black/10 bg-black/[0.04]" +
    (className.trim() ? ` ${className.trim()}` : " min-h-[280px] h-[min(420px,52vh)] sm:h-[420px]");

  /** Inner hole radius for mask ≈ half of ring (diameter {@link SEARCH_OVERLAY_DIAMETER_CQMIN}). */
  const SEARCH_OVERLAY_DIAMETER_CQMIN = 94;
  const SEARCH_OVERLAY_INNER_RADIUS_CQMIN = SEARCH_OVERLAY_DIAMETER_CQMIN / 2;

  /** Fixed viewport overlay: cqmin ties circle to map container smallest side ({@link SEARCH_OVERLAY_DIAMETER_CQMIN}% thereof ≈ 0.94 × min(side)). */
  const viewportMaskStyle: CSSProperties = {
    WebkitMaskImage: `radial-gradient(circle at 50% 50%, transparent 0, transparent calc(${SEARCH_OVERLAY_INNER_RADIUS_CQMIN}cqmin - 6px), #000 calc(${SEARCH_OVERLAY_INNER_RADIUS_CQMIN}cqmin + 14px))`,
    maskImage: `radial-gradient(circle at 50% 50%, transparent 0, transparent calc(${SEARCH_OVERLAY_INNER_RADIUS_CQMIN}cqmin - 6px), #000 calc(${SEARCH_OVERLAY_INNER_RADIUS_CQMIN}cqmin + 14px))`,
  };

  const shellContainerStyle: CSSProperties = { containerType: "size" };

  return (
    <div className={shell} style={shellContainerStyle}>
      <div ref={holderRef} className="absolute inset-0 z-0" />
      {mapLoadFailed ?
        <div
          className="absolute inset-0 z-[8] flex flex-col items-center justify-center gap-3 bg-black/[0.06] p-4 text-center"
          role="alert"
        >
          <p className="max-w-sm text-sm font-medium leading-snug text-black/85">{MAP_FALLBACK_MESSAGE}</p>
          {likelyInAppBrowser ?
            <p className="max-w-sm text-xs leading-snug text-black/55">{MAP_FALLBACK_IN_APP_HINT}</p>
          : null}
          <button
            type="button"
            onClick={() => setMapLoadAttempt((n) => n + 1)}
            className="inline-flex h-11 min-w-[140px] items-center justify-center rounded-2xl border border-black/12 bg-white px-5 text-sm font-semibold text-black/90 hover:bg-black/[0.03]"
          >
            Повторить
          </button>
        </div>
      : null}
      {viewportSearchOverlay ?
        <div className="pointer-events-none absolute inset-0 z-[12] overflow-hidden rounded-2xl" aria-hidden>
          <div
            className="absolute inset-0 bg-slate-950/48 backdrop-blur-[3px]"
            style={viewportMaskStyle}
          />
          <div
            className="absolute left-1/2 top-1/2 aspect-square max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(37,99,235,0.55)]"
            style={{
              width: `${SEARCH_OVERLAY_DIAMETER_CQMIN}cqmin`,
              height: `${SEARCH_OVERLAY_DIAMETER_CQMIN}cqmin`,
            }}
          />
        </div>
      : null}
      {mapReady && showGeolocationButton ?
        <GeolocationButton loading={geoLoading} onClick={handleMyLocation} />
      : null}

      {mapReady && displayListingGroup && displayListingGroup.length > 0 && activeListingPreviewPos ? (
        <div
          className="pointer-events-auto absolute z-30 max-w-[min(92vw,280px)]"
          style={{
            left: activeListingPreviewPos.x,
            top: activeListingPreviewPos.y,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
          {...(preferTapListingPopup ?
            {}
          : {
              onMouseEnter: () => {
                popupHoveredRef.current = true;
                clearCloseTimer();
              },
              onMouseLeave: () => {
                popupHoveredRef.current = false;
                schedulePreviewHide();
              },
            })}
        >
          <div className="relative max-h-[min(50vh,320px)] overflow-y-auto rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              aria-label="Закрыть"
              className="sticky top-0 z-10 ml-auto mr-1.5 mt-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-sm text-black/70 shadow-[0_2px_8px_rgba(0,0,0,0.12)] ring-1 ring-black/10 hover:bg-white"
              onClick={(ev) => {
                try {
                  ev.preventDefault();
                  ev.stopPropagation();
                } catch {
                  /* noop */
                }
                closePreviewImmediately();
              }}
            >
              ×
            </button>
            <div className="-mt-8 flex flex-col divide-y divide-black/10 px-1 pb-2 pt-1">
              {displayListingGroup.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="flex w-full cursor-pointer gap-2.5 px-2 py-2.5 text-left outline-none first:pt-7 hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff7a00]/35"
                  onClick={() => {
                    onListingMarkerClickRef.current?.(m.id);
                  }}
                >
                  <ListingPopupThumb url={m.previewImage} compact />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold leading-tight text-black/90">
                      {m.previewTitle.trim() || "Объявление"}
                    </div>
                    {m.previewPrice?.trim() ?
                      <div className="mt-0.5 truncate text-xs font-semibold tabular-nums text-black/85">{m.previewPrice.trim()}</div>
                    : null}
                    {m.previewType.trim() ?
                      <div className="mt-1 truncate text-xs leading-snug text-black/60">{m.previewType}</div>
                    : null}
                    {m.previewCity.trim() ?
                      <div className="mt-0.5 truncate text-xs leading-snug text-black/55">{m.previewCity}</div>
                    : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
