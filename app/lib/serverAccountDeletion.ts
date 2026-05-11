import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeEmail, normalizePhone } from "./identity";
import { getPool, usesPostgres } from "./pgPool";
import { destroyAllSessionsForUser } from "./serverSession";
import { deleteListingsByOwner } from "./serverListingsStore";
import {
  assertJsonUserStorageAllowedForPath,
  readUsersDb,
  type StoredUser,
  writeUsersDb,
} from "./serverUsersStore";
import { pgAnonymizeUser, pgClearDeletionSchedule, pgSetPendingDeletion } from "./serverUsersPg";

const DATA_DIR = path.join(process.cwd(), ".data");
const OWNERS_PATH = path.join(DATA_DIR, "profile-phone-owners.json");

export const ACCOUNT_DELETION_GRACE_MS = 10 * 24 * 60 * 60 * 1000;

type OwnerMap = Record<string, string>;

async function readOwners(): Promise<OwnerMap> {
  if (process.env.NODE_ENV === "production") {
    return {};
  }
  try {
    const raw = await readFile(OWNERS_PATH, "utf8");
    return JSON.parse(raw) as OwnerMap;
  } catch {
    return {};
  }
}

async function writeOwners(next: OwnerMap): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OWNERS_PATH, JSON.stringify(next, null, 2), "utf8");
}

export async function unlinkPhoneOwnersForUserId(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id) return;
  if (usesPostgres()) {
    await getPool().query(`DELETE FROM phone_owners WHERE user_id = $1`, [id]);
    return;
  }
  const m = await readOwners();
  let changed = false;
  for (const [phone, uid] of Object.entries(m)) {
    if (uid === id) {
      delete m[phone];
      changed = true;
    }
  }
  if (changed) await writeOwners(m);
}

async function unreachablePasswordHash(): Promise<string> {
  const salt = randomBytes(24).toString("hex");
  return bcrypt.hash(`invalid:${salt}`, 10);
}

/** True if user cannot create or replace listings. */
export function isListingCreationBlocked(user: StoredUser | undefined | null): boolean {
  return (user?.deletionStatus ?? "") === "pending_deletion";
}

async function mutateJsonUser(usersJsonPath: string, userId: string, updater: (u: StoredUser) => StoredUser) {
  assertJsonUserStorageAllowedForPath(usersJsonPath);
  const db = await readUsersDb(usersJsonPath);
  const prev = db.usersById[userId];
  if (!prev) throw new Error("NO_USER");
  const oe = normalizeEmail(prev.email);
  const op = normalizePhone(prev.phone);
  if (oe && db.emailIndex[oe] === userId) delete db.emailIndex[oe];
  if (op && db.phoneIndex[op] === userId) delete db.phoneIndex[op];
  const next = updater({ ...prev });
  db.usersById[userId] = next;
  const ne = normalizeEmail(next.email);
  const np = normalizePhone(next.phone);
  if (ne) db.emailIndex[ne] = userId;
  if (np) db.phoneIndex[np] = userId;
  await writeUsersDb(usersJsonPath, db);
}

async function finalizeAnonymizeUser(usersPath: string, userId: string): Promise<void> {
  await destroyAllSessionsForUser(userId);
  await deleteListingsByOwner(userId);
  await unlinkPhoneOwnersForUserId(userId);
  const erasedAt = Date.now();
  const pwd = await unreachablePasswordHash();
  if (usesPostgres()) {
    await pgAnonymizeUser(userId, pwd, erasedAt);
    return;
  }
  await mutateJsonUser(usersPath, userId, (u) => {
    const cleaned: StoredUser = {
      ...u,
      email: "",
      phone: "",
      phoneVisible: false,
      passwordHash: pwd,
      deletionStatus: "deleted",
      deleteRequestedAt: erasedAt,
      deleteScheduledAt: undefined,
      lastSeenAt: undefined,
    };
    delete (cleaned as { name?: unknown }).name;
    delete (cleaned as { displayName?: unknown }).displayName;
    return cleaned;
  });
}

/** If grace period elapsed, finalize deletion and revoke all sessions (caller should clear cookie). */
export async function finalizePendingDeletionIfDue(usersPath: string, userId: string): Promise<boolean> {
  const db = await readUsersDb(usersPath);
  const u = db.usersById[userId];
  if (!u) return false;
  if ((u.deletionStatus ?? "") !== "pending_deletion") return false;
  const sched = typeof u.deleteScheduledAt === "number" ? u.deleteScheduledAt : 0;
  if (!sched || Date.now() < sched) return false;
  await finalizeAnonymizeUser(usersPath, userId);
  return true;
}

export async function scheduleAccountDeletion(usersPath: string, userId: string): Promise<void> {
  const now = Date.now();
  const scheduled = now + ACCOUNT_DELETION_GRACE_MS;
  if (usesPostgres()) {
    await pgSetPendingDeletion({ userId, requestedAt: now, scheduledAt: scheduled });
    return;
  }
  await mutateJsonUser(usersPath, userId, (u) => ({
    ...u,
    deletionStatus: "pending_deletion",
    deleteRequestedAt: now,
    deleteScheduledAt: scheduled,
  }));
}

export async function restoreScheduledDeletion(usersPath: string, userId: string): Promise<void> {
  if (usesPostgres()) {
    await pgClearDeletionSchedule(userId);
    return;
  }
  await mutateJsonUser(usersPath, userId, (u) => ({
    ...u,
    deletionStatus: "",
    deleteRequestedAt: undefined,
    deleteScheduledAt: undefined,
  }));
}

export async function immediateAccountDeletion(usersPath: string, userId: string): Promise<void> {
  await finalizeAnonymizeUser(usersPath, userId);
}
