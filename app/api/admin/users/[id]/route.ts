import path from "node:path";
import { NextResponse } from "next/server";
import {
  adminDisplayName,
  adminLoginOrEmail,
  adminReporterLabel,
  adminUserStatus,
} from "../../../../lib/adminUserDto";
import {
  buildListingOwnerMap,
  countListingsForOwner,
  filterReportsWithExistingListingTargets,
  reportsCountForUser,
} from "../../../../lib/adminUsersAggregate";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";
import { listBootstrap } from "../../../../lib/serverListingsStore";
import { isUserModerationBlocked, moderationBlockedAt } from "../../../../lib/serverModerationBlockedStore";
import { readAllReports } from "../../../../lib/serverTrustStore";
import { readUsersDb } from "../../../../lib/serverUsersStore";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const db = await readUsersDb(USERS_PATH);
  const u = db.usersById[id];
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const listings = await listBootstrap(null, true);
  const reports = filterReportsWithExistingListingTargets(await readAllReports(5000), listings);
  const listingOwners = buildListingOwnerMap(listings);
  const moderationBlocked = await isUserModerationBlocked(id);
  const blockedAt = moderationBlocked ? await moderationBlockedAt(id) : undefined;
  const { total, active } = countListingsForOwner(listings, id);
  const reportsCount = reportsCountForUser(id, reports, listingOwners);

  const userListings = listings
    .filter((l) => (l.ownerId ?? "").trim() === id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((l) => ({
      id: l.id,
      title: l.title,
      status: l.status,
      dealStatus: (l.dealStatus ?? "active") as string,
      city: l.city,
      createdAt: l.createdAt,
    }));

  const profileName = (u.name ?? "").trim();
  const chosenDisplayName = (u.displayName ?? "").trim();
  return NextResponse.json({
    user: {
      id: u.userId,
      loginOrEmail: adminLoginOrEmail(u),
      displayName: adminDisplayName(u),
      profileName,
      chosenDisplayName,
      reporterLabel: adminReporterLabel(u),
      createdAt: u.createdAt,
      lastSeenAt: typeof u.lastSeenAt === "number" ? u.lastSeenAt : undefined,
      phoneVisible: Boolean(u.phoneVisible),
      deletionStatus: (u.deletionStatus ?? "").trim() || "",
      ...(typeof u.deleteRequestedAt === "number" ? { deleteRequestedAt: u.deleteRequestedAt } : {}),
      ...(typeof u.deleteScheduledAt === "number" ? { deleteScheduledAt: u.deleteScheduledAt } : {}),
      status: adminUserStatus(u, moderationBlocked),
      moderationBlocked,
      ...(typeof blockedAt === "number" ? { moderationBlockedAt: blockedAt } : {}),
      listingsCount: total,
      activeListingsCount: active,
      reportsCount,
      listings: userListings,
    },
  });
}
