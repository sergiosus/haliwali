import { NextResponse } from "next/server";
import { categoryCounts } from "../../../lib/serverListingsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out = await categoryCounts();
  const res = NextResponse.json(out);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
