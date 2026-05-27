"use client";

import dynamic from "next/dynamic";

const YandexMapPicker = dynamic(
  () => import("../maps/YandexMapPicker").then((m) => m.YandexMapPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl bg-black/[0.04]" /> },
);

export type SeoMapMarker = {
  id: string;
  lat: number;
  lng: number;
  previewTitle: string;
  previewType: string;
  previewCity: string;
  href: string;
};

export function SeoMapSection({
  center,
  markers,
  onMarkerNavigate,
}: {
  center: { lat: number; lng: number };
  markers: SeoMapMarker[];
  onMarkerNavigate?: (href: string) => void;
}) {
  if (markers.length === 0) return null;

  const listingMarkers = markers.map((m) => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    isSelected: false,
    previewTitle: m.previewTitle,
    previewType: m.previewType,
    previewCity: m.previewCity,
  }));

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-gray-900">На карте</h2>
      <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
        <YandexMapPicker
          center={center}
          zoom={12}
          className="h-64 w-full overflow-hidden sm:h-80"
          listingMarkers={listingMarkers}
          listingMarkerClickNavigatesOnly
          onListingMarkerClick={(id) => {
            const row = markers.find((m) => m.id === id);
            if (row?.href) onMarkerNavigate?.(row.href);
          }}
        />
      </div>
    </section>
  );
}
