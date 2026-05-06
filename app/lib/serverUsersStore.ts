import { readFile, writeFile } from "node:fs/promises";
import { normalizeEmail, normalizePhone } from "./identity";
import { assertProductionDatabaseUrl, usesPostgres } from "./pgPool";
import {
  isPgUniqueViolation,
  pgFetchUserById,
  pgHasEmailOrPhone,
  pgInsertUser,
  pgLoadUsersDb,
  pgUpdateLastSeen,
  pgUpdatePasswordHash,
  pgUpdateUserFullName,
} from "./serverUsersPg";

const VERIFIED_USERS_BASENAME = "verified-users.json";
let devJsonUserWarned = false;

function pathTargetsVerifiedUsersJson(p: string): boolean {
  const n = p.replace(/\\/g, "/");
  return n.endsWith(`/${VERIFIED_USERS_BASENAME}`) || n.endsWith(VERIFIED_USERS_BASENAME);
}

export function assertJsonUserStorageAllowedForPath(usersJsonPath: string): void {
  if (!pathTargetsVerifiedUsersJson(usersJsonPath)) return;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JSON user storage is not allowed in production. Configure PostgreSQL user storage.");
  }
  if (!devJsonUserWarned) {
    devJsonUserWarned = true;
    console.warn(
      "[haliwali] Using JSON user store (.data/verified-users.json). Not suitable for production — migrate to PostgreSQL.",
    );
  }
}

export type AccountDeletionStatus = "" | "pending_deletion" | "deleted";

export type StoredUser = {
  userId: string;
  email: string;
  phone: string;
  /** Primary full/chosen profile name for admin/UI (optional; JSON + PG when present). */
  name?: string;
  /** Shorter/chosen display name when distinct from legal name (optional). */
  displayName?: string;
  /** Phone is private by default; public exposure must be opt-in. */
  phoneVisible?: boolean;
  passwordHash: string;
  createdAt: number;
  /** Last client-visible activity (login, chat open, message send). */
  lastSeenAt?: number;
  /** PG + JSON persisted: '' | pending_deletion | deleted */
  deletionStatus?: AccountDeletionStatus;
  deleteRequestedAt?: number;
  deleteScheduledAt?: number;
};

type UsersDb = {
  usersById: Record<string, StoredUser>;
  emailIndex: Record<string, string>;
  phoneIndex: Record<string, string>;
};

export class UniqueConstraintError extends Error {
  constructor() {
    super("UNIQUE_CONSTRAINT");
  }
}

/** Resolve one user by id (PostgreSQL row or JSON entry). */
export async function fetchStoredUserById(usersJsonPath: string, userId: string): Promise<StoredUser | null> {
  assertProductionDatabaseUrl();
  const id = (userId ?? "").trim();
  if (!id) return null;
  if (usesPostgres()) {
    return pgFetchUserById(id);
  }
  assertJsonUserStorageAllowedForPath(usersJsonPath);
  const db = await readUsersDb(usersJsonPath);
  return db.usersById[id] ?? null;
}

export async function readUsersDb(path: string): Promise<UsersDb> {
  assertProductionDatabaseUrl();
  if (usesPostgres()) {
    return pgLoadUsersDb();
  }
  assertJsonUserStorageAllowedForPath(path);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return migrateUsersDb(parsed);
  } catch {
    return { usersById: {}, emailIndex: {}, phoneIndex: {} };
  }
}

export async function writeUsersDb(path: string, db: UsersDb) {
  assertProductionDatabaseUrl();
  if (usesPostgres()) {
    throw new Error("writeUsersDb is not supported with PostgreSQL; use insertUserPersist / granular updates.");
  }
  assertJsonUserStorageAllowedForPath(path);
  await writeFile(path, JSON.stringify(db, null, 2), "utf8");
}

/** Create or update last-seen for a user (PostgreSQL or JSON file). */
export async function updateUserPasswordHashPersist(usersPath: string, userId: string, passwordHash: string): Promise<void> {
  assertProductionDatabaseUrl();
  const id = (userId ?? "").trim();
  const hash = (passwordHash ?? "").trim();
  if (!id || !hash) throw new Error("BAD_INPUT");
  if (usesPostgres()) {
    await pgUpdatePasswordHash(id, hash);
    return;
  }
  assertJsonUserStorageAllowedForPath(usersPath);
  const db = await readUsersDb(usersPath);
  const u = db.usersById[id];
  if (!u) throw new Error("NOT_FOUND");
  u.passwordHash = hash;
  db.usersById[id] = u;
  await writeUsersDb(usersPath, db);
}

export async function touchUserLastSeen(usersPath: string, userId: string): Promise<void> {
  assertProductionDatabaseUrl();
  const id = (userId ?? "").trim();
  if (!id) return;
  const ts = Date.now();
  if (usesPostgres()) {
    await pgUpdateLastSeen(id, ts);
    return;
  }
  const db = await readUsersDb(usersPath);
  const u = db.usersById[id];
  if (!u) return;
  u.lastSeenAt = ts;
  db.usersById[id] = u;
  await writeUsersDb(usersPath, db);
}

export function hasEmailOrPhone(db: UsersDb, email: string, phone: string): boolean {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  if (e && db.emailIndex[e]) return true;
  if (p && db.phoneIndex[p]) return true;
  return false;
}

export async function userEmailOrPhoneTaken(_usersJsonPath: string, email: string, phone: string): Promise<boolean> {
  assertProductionDatabaseUrl();
  if (usesPostgres()) {
    return pgHasEmailOrPhone(email, phone);
  }
  const db = await readUsersDb(_usersJsonPath);
  return hasEmailOrPhone(db, email, phone);
}

export async function insertUserPersist(usersJsonPath: string, user: StoredUser): Promise<void> {
  assertProductionDatabaseUrl();
  if (usesPostgres()) {
    try {
      await pgInsertUser(user);
    } catch (e) {
      if (isPgUniqueViolation(e)) throw new UniqueConstraintError();
      throw e;
    }
    return;
  }
  assertJsonUserStorageAllowedForPath(usersJsonPath);
  const db = await readUsersDb(usersJsonPath);
  insertUserOrThrow(db, user);
  await writeUsersDb(usersJsonPath, db);
}

/** Persist `StoredUser.name` (maps to PostgreSQL `full_name`). Empty string clears. */
export async function updateUserProfileFullName(usersJsonPath: string, userId: string, fullName: string): Promise<void> {
  assertProductionDatabaseUrl();
  const id = (userId ?? "").trim();
  if (!id) throw new Error("BAD_INPUT");
  const nm = (fullName ?? "").trim();
  if (usesPostgres()) {
    await pgUpdateUserFullName(id, nm);
    return;
  }
  assertJsonUserStorageAllowedForPath(usersJsonPath);
  const db = await readUsersDb(usersJsonPath);
  const u = db.usersById[id];
  if (!u) throw new Error("NOT_FOUND");
  const next: StoredUser = { ...u };
  if (nm) next.name = nm;
  else delete next.name;
  db.usersById[id] = next;
  await writeUsersDb(usersJsonPath, db);
}

export function insertUserOrThrow(db: UsersDb, user: StoredUser) {
  const email = normalizeEmail(user.email);
  const phone = normalizePhone(user.phone);
  if ((email && db.emailIndex[email]) || (phone && db.phoneIndex[phone])) {
    throw new UniqueConstraintError();
  }
  const next: StoredUser = { ...user, email, phone, phoneVisible: Boolean(user.phoneVisible) };
  db.usersById[next.userId] = next;
  if (email) db.emailIndex[email] = next.userId;
  if (phone) db.phoneIndex[phone] = next.userId;
}

function migrateUsersDb(parsed: unknown): UsersDb {
  if (Array.isArray(parsed)) {
    const db: UsersDb = { usersById: {}, emailIndex: {}, phoneIndex: {} };
    for (const row of parsed as StoredUser[]) {
      if (!row?.userId) continue;
      const email = normalizeEmail(row.email ?? "");
      const phone = normalizePhone(row.phone ?? "");
      const phoneVisibleValue = (row as { phoneVisible?: unknown }).phoneVisible;
      const raw = row as unknown as Record<string, unknown>;
      const dsRaw =
        typeof raw.deletionStatus === "string"
          ? raw.deletionStatus
          : typeof raw.deletion_status === "string"
            ? raw.deletion_status
            : "";
      const delSt: AccountDeletionStatus =
        dsRaw === "pending_deletion" || dsRaw === "deleted" ? (dsRaw as AccountDeletionStatus) : "";
      const dq = (row as { deleteRequestedAt?: unknown }).deleteRequestedAt;
      const dsch = (row as { deleteScheduledAt?: unknown }).deleteScheduledAt;
      const normalized: StoredUser = {
        ...row,
        email,
        phone,
        phoneVisible: Boolean(phoneVisibleValue),
        ...(delSt ? { deletionStatus: delSt } : {}),
        ...(typeof dq === "number" ? { deleteRequestedAt: dq } : {}),
        ...(typeof dsch === "number" ? { deleteScheduledAt: dsch } : {}),
      };
      db.usersById[row.userId] = normalized;
      if (email && !db.emailIndex[email]) db.emailIndex[email] = row.userId;
      if (phone && !db.phoneIndex[phone]) db.phoneIndex[phone] = row.userId;
    }
    return db;
  }
  if (!parsed || typeof parsed !== "object") {
    return { usersById: {}, emailIndex: {}, phoneIndex: {} };
  }
  const obj = parsed as Partial<UsersDb>;
  return {
    usersById: obj.usersById ?? {},
    emailIndex: obj.emailIndex ?? {},
    phoneIndex: obj.phoneIndex ?? {},
  };
}
