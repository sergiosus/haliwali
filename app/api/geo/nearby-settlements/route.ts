import { NextResponse } from "next/server";
import { getPool, usesPostgres } from "@/app/lib/pgPool";

export const runtime = "nodejs";

export type NearbySettlementJsonRow = {
  name: string;
  lat: number;
  lng: number;
  region: string;
  distanceKm: number;
};

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bbox(center: { lat: number; lng: number }, radiusKm: number) {
  const latDelta = radiusKm / 111; // ~km per degree latitude
  const lngDelta = radiusKm / (111 * Math.max(0.1, Math.cos(toRad(center.lat))));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "100");
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "bad_lat_lng", items: [] as NearbySettlementJsonRow[], nearest: null },
      { status: 400 },
    );
  }

  const rMax = Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : 100;
  const center = { lat, lng };

  if (!usesPostgres()) {
    return NextResponse.json({ error: "unavailable", items: [] as NearbySettlementJsonRow[], nearest: null }, { status: 503 });
  }

  const b = bbox(center, rMax);

  return (async () => {
    const { rows } = await getPool().query<{
      name: string;
      region: string;
      lat: number;
      lng: number;
    }>(
      `SELECT s.name, subj.name AS region, s.lat, s.lng
       FROM location_settlements s
       JOIN location_subjects subj ON subj.slug = s.subject_slug
       WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL
         AND s.lat BETWEEN $1 AND $2
         AND s.lng BETWEEN $3 AND $4`,
      [b.minLat, b.maxLat, b.minLng, b.maxLng],
    );

    const scored = rows
      .map((r) => {
        const la = Number(r.lat);
        const ln = Number(r.lng);
        if (!Number.isFinite(la + ln)) return null;
        const d = haversineKm(center, { lat: la, lng: ln });
        return {
          name: String(r.name ?? "").trim(),
          region: String(r.region ?? "").trim(),
          lat: la,
          lng: ln,
          distanceKm: d,
        };
      })
      .filter((x): x is NearbySettlementJsonRow => Boolean(x && x.name && x.region && Number.isFinite(x.distanceKm)))
      .filter((x) => x.distanceKm <= rMax + 1e-9);

    scored.sort((a, b2) => a.distanceKm - b2.distanceKm || a.name.localeCompare(b2.name, "ru"));
    const items = scored.slice(0, limit);
    const nearest = items[0]
      ? { name: items[0].name, lat: items[0].lat, lng: items[0].lng, region: items[0].region }
      : null;

    return NextResponse.json({ items, nearest });
  })().catch(() =>
    NextResponse.json({ error: "unavailable", items: [] as NearbySettlementJsonRow[], nearest: null }, { status: 503 }),
  );
}
