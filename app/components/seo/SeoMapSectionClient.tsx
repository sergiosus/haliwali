"use client";

import { useRouter } from "next/navigation";
import { SeoMapSection, type SeoMapMarker } from "./SeoMapSection";

export function SeoMapSectionClient({
  center,
  markers,
}: {
  center: { lat: number; lng: number };
  markers: SeoMapMarker[];
}) {
  const router = useRouter();
  return (
    <SeoMapSection
      center={center}
      markers={markers}
      onMarkerNavigate={(href) => router.push(href)}
    />
  );
}
