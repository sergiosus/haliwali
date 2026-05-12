import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getPool, usesPostgres } from "./pgPool";
import { appendAdminAuditLog } from "./serverAdminAuditLog";
import { destroyAllSessionsForUser } from "./serverSession";
import {
  assertJsonUserStorageAllowedForPath,
  fetchStoredUserById,
  readUsersDb,
  type StoredUser,
  writeUsersDb,
} from "./serverUsersStore";
import {
  pgCountActivePrivilegedAdmins,
  pgPurgeSoftDeletedUser,
  pgRestoreSoftDeletedUser,
  pgSoftDeleteUser,
} from "./serverUsersPg";

export const USER_SOFT_DELETE_RETENTION_MS = 10 * 24 * 60 * 60 * 1000;
export const PURGED_PUBLIC_LABEL = "Пользователь удалён";

function tsFromDb(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function isUserSoftDeleted(user: StoredUser | null | undefined): boolean {
  if (!user) return false;
  return typeof user.softDeletedAt === "number" && user.purgedAt == null;
}

export function isUserPurgedOrRemoved(user: StoredUser | null | undefined): boolean {
  if (!user) return false;
  if (typeof user.purgedAt === "number") return true;
  return (user.deletionStatus ?? "").trim() === "deleted";
}

export function isUserLoginDenied(user: StoredUser | null | undefined): boolean {
  return isUserSoftDeleted(user) || isUserPurgedOrRemoved(user);
}

export function isUserPubliclyRemoved(user: StoredUser | null | undefined): boolean {
  return isUserLoginDenied(user);
}

async function unreachablePasswordHash(): Promise<string> {
  const salt = randomBytes(24).toString("hex");
  return bcrypt.hash(`invalid:${salt}`, 10);
}

async function mutateJsonUser(usersJsonPath: string, userId: string, updater: (u: StoredUser) => StoredUser) {
  assertJsonUserStorageAllowedForPath(usersJsonPath);
  const db = await readUsersDb(usersJsonPath);
  const prev = db.usersById[userId];
  if (!prev) throw new Error("NO_USER");
  db.usersById[userId] = updater({ ...prev });
  await writeUsersDb(usersJsonPath, db);
}

export async function countActivePrivilegedAdmins(): Promise<number> {
  if (usesPostgres()) return pgCountActivePrivilegedAdmins();
  return 0;
}

export async function softDeleteUserByAdmin(args: {
  usersPath: string;
  targetUserId: string;
  adminUserId: string;
  reason?: string;
}): Promise<"ok" | "not_found" | "self" | "last_admin" | "already_deleted"> {
  const targetUserId = (args.targetUserId ?? "").trim();
  const adminUserId = (args.adminUserId ?? "").trim();
  if (!targetUserId) return "not_found";
  if (adminUserId && targetUserId === adminUserId) return "self";

  const user = await fetchStoredUserById(args.usersPath, targetUserId);
  if (!user) return "not_found";
  if (isUserSoftDeleted(user) || isUserPurgedOrRemoved(user)) return "already_deleted";

  if (usesPostgres()) {
    const row = await getPool().query<{ is_admin: boolean; role: string }>(
      `SELECT COALESCE(is_admin, FALSE) AS is_admin, COALESCE(TRIM(role), '') AS role
       FROM users WHERE user_id = $1 LIMIT 1`,
      [targetUserId],
    );
    const isAdmin = row.rows[0]?.is_admin === true || row.rows[0]?.role === "admin";
    if (isAdmin) {
      const activeAdmins = await pgCountActivePrivilegedAdmins();
      if (activeAdmins <= 1) return "last_admin";
    }
    await pgSoftDeleteUser({
      userId: targetUserId,
      deletedByUserId: adminUserId || "admin",
      reason: args.reason,
    });
  } else {
    const now = Date.now();
    await mutateJsonUser(args.usersPath, targetUserId, (u) => ({
      ...u,
      softDeletedAt: now,
      purgeAfter: now + USER_SOFT_DELETE_RETENTION_MS,
      deletedByUserId: adminUserId || "admin",
      deleteReason: (args.reason ?? "").trim() || undefined,
      purgedAt: undefined,
    }));
  }

  await destroyAllSessionsForUser(targetUserId);
  await appendAdminAuditLog({
    adminUserId: adminUserId || "admin",
    targetUserId,
    action: "user_soft_deleted",
    reason: args.reason,
  });
  return "ok";
}

export async function restoreSoftDeletedUserByAdmin(args: {
  usersPath: string;
  targetUserId: string;
  adminUserId: string;
}): Promise<"ok" | "not_found" | "not_deleted"> {
  const targetUserId = (args.targetUserId ?? "").trim();
  if (!targetUserId) return "not_found";
  const user = await fetchStoredUserById(args.usersPath, targetUserId);
  if (!user) return "not_found";
  if (!isUserSoftDeleted(user)) return "not_deleted";

  if (usesPostgres()) {
    await pgRestoreSoftDeletedUser(targetUserId);
  } else {
    await mutateJsonUser(args.usersPath, targetUserId, (u) => {
      const next = { ...u };
      delete next.softDeletedAt;
      delete next.purgeAfter;
      delete next.purgedAt;
      delete next.deleteReason;
      delete next.deletedByUserId;
      return next;
    });
  }

  await appendAdminAuditLog({
    adminUserId: (args.adminUserId ?? "").trim() || "admin",
    targetUserId,
    action: "user_restored",
  });
  return "ok";
}

export async function purgeSoftDeletedUser(args: {
  usersPath: string;
  targetUserId: string;
  adminUserId?: string;
  reason?: string;
}): Promise<"ok" | "not_found" | "not_due"> {
  const targetUserId = (args.targetUserId ?? "").trim();
  if (!targetUserId) return "not_found";
  const user = await fetchStoredUserById(args.usersPath, targetUserId);
  if (!user) return "not_found";
  if (!isUserSoftDeleted(user) && !isUserPurgedOrRemoved(user)) return "not_due";
  if (typeof user.purgedAt === "number") return "ok";

  const pwd = await unreachablePasswordHash();
  const erasedAt = Date.now();
  if (usesPostgres()) {
    await pgPurgeSoftDeletedUser(targetUserId, pwd, erasedAt);
  } else {
    await mutateJsonUser(args.usersPath, targetUserId, (u) => ({
      ...u,
      email: "",
      phone: "",
      phoneVisible: false,
      passwordHash: pwd,
      deletionStatus: "deleted",
      deleteRequestedAt: erasedAt,
      deleteScheduledAt: undefined,
      lastSeenAt: undefined,
      purgedAt: erasedAt,
      displayName: PURGED_PUBLIC_LABEL,
      name: undefined,
    }));
  }

  await destroyAllSessionsForUser(targetUserId);
  await appendAdminAuditLog({
    adminUserId: (args.adminUserId ?? "").trim() || "system",
    targetUserId,
    action: "user_purged",
    reason: args.reason,
  });
  return "ok";
}

export async function listSoftDeletedUsersDueForPurge(): Promise<string[]> {
  if (!usesPostgres()) return [];
  const { rows } = await getPool().query<{ user_id: string }>(
    `SELECT user_id
     FROM users
     WHERE deleted_at IS NOT NULL
       AND purged_at IS NULL
       AND purge_after IS NOT NULL
       AND purge_after <= NOW()`,
  );
  return rows.map((r) => r.user_id).filter(Boolean);
}
