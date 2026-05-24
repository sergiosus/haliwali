"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CatalogCompanyListItem } from "../../lib/catalogTypes";
import type { MapListingMarker } from "../maps/YandexMapPicker";

const YandexMapPicker = dynamic(
  () => import("../maps/YandexMapPicker").then((m) => m.YandexMapPicker),
  { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-black/[0.04]" /> },
);

export function CatalogCompanyMap({ companies }: { companies: readonly CatalogCompanyListItem[] }) {
  const mappable = useMemo(
    () =>
      companies.filter(
        (c) => c.latitude != null && c.longitude != null && Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
      ),
    [companies],
  );

  const markers: MapListingMarker[] = useMemo(
    () =>
      mappable.map((c) => ({
        id: c.slug,
        lat: c.latitude!,
        lng: c.longitude!,
        previewTitle: c.name,
        previewType: c.categoryTitle,
        previewCity: c.city,
        previewImage: c.logoUrl ?? undefined,
      })),
    [mappable],
  );

  const [selected, setSelected] = useState<CatalogCompanyListItem | null>(null);

  const center = useMemo(() => {
    if (mappable.length === 0) return { lat: 55.751244, lng: 37.618423 };
    const first = mappable[0]!;
    return { lat: first.latitude!, lng: first.longitude! };
  }, [mappable]);

  if (mappable.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-12 text-center text-sm text-black/50">
        Нет компаний с координатами для карты
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
      <div className="h-[min(70vh,480px)] w-full">
        <YandexMapPicker
          center={center}
          zoom={mappable.length === 1 ? 14 : 10}
          listingMarkers={markers}
          onListingMarkerClick={(id) => {
            const co = mappable.find((c) => c.slug === id) ?? null;
            setSelected(co);
          }}
          className="h-full w-full"
        />
      </div>
      {selected ?
        <div className="absolute bottom-3 left-3 right-3 z-10 rounded-xl border border-black/[0.08] bg-white/95 p-3 shadow-lg backdrop-blur-sm sm:left-auto sm:right-3 sm:w-[320px]">
          <p className="font-semibold text-black">{selected.name}</p>
          <p className="mt-0.5 text-xs text-black/50">{selected.city}</p>
          <p className="mt-1 line-clamp-2 text-xs text-black/45">{selected.description}</p>
          <Link
            href={`/catalogs/company/${selected.slug}`}
            className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#ff7a00] text-sm font-semibold text-white hover:bg-[#f07000]"
          >
            Открыть профиль
          </Link>
        </div>
      : null}
    </div>
  );
}
