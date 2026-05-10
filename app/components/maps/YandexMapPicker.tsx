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
import { loadYandexMaps, type YmapsNamespace } from "../../lib/maps/yandexLoader";
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
/** Minimum movement (m, approx) before emitting duplicate center. */
const CENTER_EMIT_MIN_MOVE_M = 35;

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
function ListingPopupThumb({ url }: { url?: string }) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  const [broken, setBroken] = useState(false);
  if (!trimmed || broken) {
    return (
      <div
        className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-black/15 bg-black/[0.04]"
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote listing photo URL from store
    <img
      src={trimmed}
      alt=""
      className="h-14 w-14 shrink-0 rounded-lg border border-black/10 object-cover"
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
  const [geoLoading, setGeoLoading] = useState(false);
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

  // React-controlled hover / click-pinned preview for listing markers (do not rely on Yandex balloons).
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  /** Screen position for the single preview card; keyed by hoveredListingId ?? activeListingId. */
  const [activeListingPreviewPos, setActiveListingPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const activePreviewMarkerRef = useRef<{
    id: string;
    lat: number;
    lng: number;
    previewTitle: string;
    previewType: string;
    previewCity: string;
    previewPrice?: string;
  } | null>(null);

  /** Step 1 / 7: delayed close after leaving marker and popup. */
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeListingIdRef = useRef<string | null>(null);
  activeListingIdRef.current = activeListingId;

  const markerHoveredRef = useRef(false);
  const popupHoveredRef = useRef(false);

  const displayListingId = hoveredListingId ?? activeListingId;

  const clearCloseTimer = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  /** Step 5 / map click: clear hover, pin, and preview. */
  const closePreviewImmediately = () => {
    clearCloseTimer();
    markerHoveredRef.current = false;
    popupHoveredRef.current = false;
    setHoveredListingId(null);
    setActiveListingId(null);
    setActiveListingPreviewPos(null);
    activePreviewMarkerRef.current = null;
  };

  /**
   * Step 2–3: after leaving marker or popup, hide unless pinned (activeListingId).
   * Re-entering marker or popup clears the timer (no flicker).
   */
  const schedulePreviewHide = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (markerHoveredRef.current || popupHoveredRef.current) return;
      if (!activeListingIdRef.current) {
        setHoveredListingId(null);
        setActiveListingPreviewPos(null);
        activePreviewMarkerRef.current = null;
        return;
      }
      setHoveredListingId(null);
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
      if (process.env.NODE_ENV === "development") {
        console.log("[map-listing-popup]", { markerId: cur.id, popupPos: { x, y } });
      }
    } catch {
      /* noop */
    }
  }, []);

  const displayListingMarker = useMemo(() => {
    if (!displayListingId) return null;
    return listingMarkers.find((m) => m.id === displayListingId) ?? null;
  }, [listingMarkers, displayListingId]);

  /** Keep preview geometry + copy in sync when hover ends but click-pinned id stays. */
  useLayoutEffect(() => {
    const lm = displayListingMarker;
    if (!lm) {
      return;
    }
    activePreviewMarkerRef.current = {
      id: lm.id,
      lat: lm.lat,
      lng: lm.lng,
      previewTitle: lm.previewTitle,
      previewType: lm.previewType,
      previewCity: lm.previewCity,
      previewPrice: lm.previewPrice,
    };
    if (mapReady) updateActivePreviewPosition();
  }, [displayListingMarker, mapReady, updateActivePreviewPosition]);

  /** Step 7: clear close timer on unmount. */
  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    let dead = false;
    let onResize: (() => void) | null = null;
    if (!holderRef.current || !Number.isFinite(effLat + effLng)) return undefined;

    void loadYandexMaps()
      .then((ym) => {
        if (dead || !holderRef.current) return;
        if (mapInstRef.current) return;

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const ymaps = ym as any;
        ymaps.ready(() => {
          if (dead || !holderRef.current || mapInstRef.current) return;

          const { lat: lat0, lng: lng0, zoom: z0 } = effRef.current;
          const center0 = [lat0, lng0] as [number, number];
          const map = new ymaps.Map(holderRef.current, {
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
              map.container?.fitToViewport?.();
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
                const c = map.getCenter() as number[] | undefined;
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
                const c = map.getCenter() as number[] | undefined;
                const b = map.getBounds?.() as number[][] | undefined;
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

          map.events.add("click", (e: { get: (k: string) => unknown }) => {
            closePreviewImmediatelyRef.current();
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
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */
      })
      .catch(() => setMapReady(false));

    return () => {
      dead = true;
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
  }, [updateActivePreviewPosition]);

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

  const listingMarkersJson = useMemo(() => JSON.stringify(listingMarkers), [listingMarkers]);

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

    for (const lm of listingMarkers) {
      if (!Number.isFinite(lm.lat + lm.lng)) continue;
      const pm = new ymaps.Placemark(
        [lm.lat, lm.lng],
        {},
        {
          preset: lm.isSelected
            ? "islands#redCircleDotIcon"
            : lm.isHovered
              ? "islands#orangeCircleDotIcon"
              : "islands#blueCircleDotIcon",
          zIndex: lm.isSelected ? 780 : lm.isHovered ? 750 : 720,
          hasBalloon: false,
          hasHint: false,
          openBalloonOnClick: false,
        },
      );

      // React-only preview (no native hint/balloon).
      pm.events.add("mouseenter", () => {
        markerHoveredRef.current = true;
        popupHoveredRef.current = false;
        clearCloseTimer();
        setHoveredListingId(lm.id);
      });
      pm.events.add("mouseleave", () => {
        markerHoveredRef.current = false;
        schedulePreviewHide();
      });

      pm.events.add("click", (e: unknown) => {
        try {
          (e as { stopPropagation?: () => void })?.stopPropagation?.();
        } catch {
          /* noop */
        }
        if (listingMarkerClickNavigatesOnlyRef.current) {
          onListingMarkerClickRef.current?.(lm.id);
          return;
        }
        clearCloseTimer();
        markerHoveredRef.current = true;
        popupHoveredRef.current = false;
        setActiveListingId(lm.id);
        setHoveredListingId(lm.id);
        onListingMarkerClickRef.current?.(lm.id);
      });
      try {
        map.geoObjects?.add?.(pm);
        listingPlacemarksRef.current.push(pm);
      } catch {
        /* noop */
      }
    }
  }, [mapReady, listingMarkersJson]);

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
      console.warn("Geolocation not available");
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
          console.warn(e);
        }
      },
      (err) => {
        setGeoLoading(false);
        console.error("Geolocation error", err);
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

      {mapReady && displayListingMarker && activeListingPreviewPos ? (
        <div
          className="pointer-events-auto absolute z-30 max-w-[240px]"
          style={{
            left: activeListingPreviewPos.x,
            top: activeListingPreviewPos.y,
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
          onMouseEnter={() => {
            popupHoveredRef.current = true;
            clearCloseTimer();
          }}
          onMouseLeave={() => {
            popupHoveredRef.current = false;
            schedulePreviewHide();
          }}
        >
          <div className="relative rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              aria-label="Закрыть"
              className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm text-black/70 shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:bg-white"
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
            <div
              role="button"
              tabIndex={0}
              className="cursor-pointer flex gap-2.5 p-2 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a00]/40"
              onClick={() => {
                const id = displayListingId;
                if (id) onListingMarkerClickRef.current?.(id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const id = displayListingId;
                  if (id) onListingMarkerClickRef.current?.(id);
                }
              }}
            >
              <ListingPopupThumb url={displayListingMarker.previewImage} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold leading-tight text-black/90">
                  {displayListingMarker.previewTitle.trim() || "Объявление"}
                </div>
                {displayListingMarker.previewPrice?.trim() ?
                  <div className="mt-0.5 truncate text-xs font-semibold tabular-nums text-black/85">
                    {displayListingMarker.previewPrice.trim()}
                  </div>
                : null}
                {displayListingMarker.previewType.trim() ?
                  <div className="mt-1 truncate text-xs leading-snug text-black/60">{displayListingMarker.previewType}</div>
                : null}
                {displayListingMarker.previewCity.trim() ?
                  <div className="mt-0.5 truncate text-xs leading-snug text-black/55">{displayListingMarker.previewCity}</div>
                : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
