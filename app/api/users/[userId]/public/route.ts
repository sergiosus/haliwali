import { NextResponse } from "next/server";
import path from "node:path";
import { readUsersDb } from "../../../../lib/serverUsersStore";
import { readReplyStats, fastReplyEligible } from "../../../../lib/serverTrustStore";
import { countSellerActiveListings } from "../../../../lib/serverListingsStore";
import { isUserPhoneVerified } from "../../../../lib/serverPhoneVerified";
import { isUserPubliclyRemoved, PURGED_PUBLIC_LABEL } from "../../../../lib/serverUserSoftDelete";
import { getSafePublicName } from "@/lib/utils/getSafePublicName";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const db = await readUsersDb(USERS_PATH);
  const u = db.usersById[id];
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const removed = isUserPubliclyRemoved(u);

  /** Profile «полное имя» (PostgreSQL full_name); для подписей на карточках объявлений — отдельно от ника. */
  const name = removed ? undefined : `${u.name ?? ""}`.trim() || undefined;

  const displayName = removed
    ? PURGED_PUBLIC_LABEL
    : getSafePublicName({ userId: id, name: u.name, displayName: u.displayName });

  /** Карточки / сторонние клиенты: только безопасное имя, без email-префиксов. */
  const identityLabel = removed ? PURGED_PUBLIC_LABEL : displayName;

  const stats = await readReplyStats();
  const fastReply = fastReplyEligible(stats[id]);

  const activeListingCount = await countSellerActiveListings(id);

  const phoneVerified = await isUserPhoneVerified(id);

  return NextResponse.json({
    userId: id,
    ...(name ? { name } : {}),
    ...(identityLabel ? { identityLabel } : {}),
    displayName,
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt ?? null,
    phoneVerified,
    fastReply,
    activeListingCount,
  });
}
