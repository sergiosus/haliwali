import path from "node:path";
import { NextResponse } from "next/server";
import {
  adminDisplayName,
  adminLoginOrEmail,
  adminReporterLabel,
  adminUserStatus,
} from "../../../lib/adminUserDto";
import {
  buildListingOwnerMap,
  countListingsForOwner,
  filterReportsWithExistingListingTargets,
  reportsCountForUser,
} from "../../../lib/adminUsersAggregate";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../lib/serverAdminSession";
import { listBootstrap } from "../../../lib/serverListingsStore";
import { readAllReports } from "../../../lib/serverTrustStore";
import { getAllModerationBlockedIds } from "../../../lib/serverModerationBlockedStore";
import { readUsersDb } from "../../../lib/serverUsersStore";
import type { StoredUser } from "../../../lib/serverUsersStore";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

function normalizeUsersList(db: Awaited<ReturnType<typeof readUsersDb>>): StoredUser[] {
  const raw = db.usersById;
  if (!raw || typeof raw !== "object") return [];
  const vals = Object.values(raw).filter(Boolean) as StoredUser[];
  return vals;
}

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const db = await readUsersDb(USERS_PATH);
  const usersList = normalizeUsersList(db);
  usersList.sort((a, b) => b.createdAt - a.createdAt);

  const listings = await listBootstrap(null, true);
  const reports = filterReportsWithExistingListingTargets(await readAllReports(5000), listings);
  const listingOwners = buildListingOwnerMap(listings);
  const blockedIds = await getAllModerationBlockedIds();

  const users = usersList.map((u) => {
    const uid = u.userId;
    const moderationBlocked = blockedIds.has(uid);
    const { total, active } = countListingsForOwner(listings, uid);
    const reportsCount = reportsCountForUser(uid, reports, listingOwners);

    const profileName = (u.name ?? "").trim();
    const chosenDisplayName = (u.displayName ?? "").trim();
    return {
      id: uid,
      loginOrEmail: adminLoginOrEmail(u),
      /** Precomputed для клиента; колонка «Имя» — только сохранённые profileName/chosenDisplayName. */
      displayName: adminDisplayName(u),
      profileName,
      chosenDisplayName,
      reporterLabel: adminReporterLabel(u),
      createdAt: u.createdAt,
      status: adminUserStatus(u, moderationBlocked),
      moderationBlocked,
      deletionStatus: (u.deletionStatus ?? "").trim() || "",
      ...(typeof u.deleteRequestedAt === "number" ? { deleteRequestedAt: u.deleteRequestedAt } : {}),
      ...(typeof u.deleteScheduledAt === "number" ? { deleteScheduledAt: u.deleteScheduledAt } : {}),
      listingsCount: total,
      activeListingsCount: active,
      reportsCount,
    };
  });

  return NextResponse.json({ users });
}
