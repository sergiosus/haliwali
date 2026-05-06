import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reverse-geocode stub: coordinates → city lookups were removed (no external geocoder in runtime). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat") ?? "");
  const lng = Number(url.searchParams.get("lng") ?? "");
  if (!Number.isFinite(lat + lng)) return NextResponse.json({ city: "" }, { status: 400 });

  const res = NextResponse.json({
    city: "",
    region: "",
    country: "",
    formatted: "",
    disabled: true,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

