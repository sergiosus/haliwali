import { NextResponse } from "next/server";
import { getListingViewCounts } from "../../../lib/serverTrustStore";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("ids") ?? "";
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ counts: {} });
  try {
    const counts = await getListingViewCounts(ids);
    return NextResponse.json({ counts });
  } catch {
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    return NextResponse.json({ counts });
  }
}
