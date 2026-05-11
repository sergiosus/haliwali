import { NextResponse } from "next/server";
import { listPublicListingsByOwner } from "../../../../lib/serverListingsStore";
import { readUsersDb } from "../../../../lib/serverUsersStore";
import path from "node:path";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const db = await readUsersDb(USERS_PATH);
  const u = db.usersById[id];
  if (!u || (u.deletionStatus ?? "") === "deleted") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const listings = await listPublicListingsByOwner(id);
  return NextResponse.json({ listings });
}
