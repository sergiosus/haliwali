"use client";

import { normalizeEmail, normalizePhone, isValidPhone } from "./identity";

type UserRecord = {
  userId: string;
  contact: string;
  email?: string;
  phone?: string;
  normalizedPhone?: string;
  /** Mirrored from `GET /api/auth/me` (StoredUser.name). */
  serverProfileName?: string;
  /** Mirrored from `GET /api/auth/me` (StoredUser.displayName). */
  serverChosenDisplay?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  verifiedAt?: number;
  createdAt: number;
};

type UsersDb = Record<string, UserRecord>;

const STORAGE_KEY = "haliwali_users_cache_v2";

function readDb(): UsersDb {
  if (typeof window === "undefined") return {};
  try {
    // One-time cleanup of legacy plaintext-password DB.
    if (localStorage.getItem("haliwali_users")) localStorage.removeItem("haliwali_users");
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as UsersDb;
  } catch {
    return {};
  }
}

function writeDb(next: UsersDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Lookup key for duplicate checks and login: normalized international / national form. */
export function userNormalizedPhone(u: UserRecord): string {
  if (u.normalizedPhone) return normalizePhone(u.normalizedPhone);
  if (u.phone) return normalizePhone(u.phone);
  if (!u.contact.includes("@")) return normalizePhone(u.contact);
  return "";
}

function uniqueUsers(db: UsersDb): UserRecord[] {
  const byId = new Map<string, UserRecord>();
  for (const u of Object.values(db)) {
    if (!u || !u.userId) continue;
    if (!byId.has(u.userId)) byId.set(u.userId, u);
  }
  return [...byId.values()];
}

export function findUserByContact(raw: string): UserRecord | null {
  if (typeof window === "undefined") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const list = uniqueUsers(readDb());
  const isEmail = trimmed.includes("@");
  const key = isEmail ? normalizeEmail(trimmed) : normalizePhone(trimmed);
  if (!key) return null;

  return (
    list.find((u) => {
      if (isEmail) {
        const ue = u.email ? normalizeEmail(u.email) : "";
        return (ue && ue === key) || normalizeEmail(u.contact) === key;
      }
      return userNormalizedPhone(u) === key;
    }) ?? null
  );
}

export function findUserByEmail(email: string): UserRecord | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const list = uniqueUsers(readDb());
  return list.find((u) => (u.email ? normalizeEmail(u.email) === key : normalizeEmail(u.contact) === key)) ?? null;
}

export function findUserByPhone(phone: string): UserRecord | null {
  const key = normalizePhone(phone);
  if (!key) return null;
  const list = uniqueUsers(readDb());
  return list.find((u) => userNormalizedPhone(u) === key) ?? null;
}

export function registerUser(contact: string, password: string) {
  void contact;
  void password;
  return { ok: false as const, error: "DEPRECATED" as const };
}

export function loginUser(contact: string, password: string) {
  void contact;
  void password;
  return { ok: false as const, error: "DEPRECATED" as const };
}

export function createVerifiedUser(payload: {
  userId: string;
  email?: string;
  phone?: string;
  createdAt?: number;
}) {
  if (typeof window === "undefined") return { ok: false as const, error: "UNAVAILABLE" as const };
  const email = payload.email ? normalizeEmail(payload.email) : "";
  const rawPhone = (payload.phone ?? "").trim();
  const phoneNorm = rawPhone ? normalizePhone(rawPhone) : "";
  if (!email && !phoneNorm) return { ok: false as const, error: "BAD_CONTACT" as const };
  if (email && findUserByEmail(email)) return { ok: false as const, error: "EMAIL_EXISTS" as const };
  if (phoneNorm && findUserByPhone(phoneNorm)) return { ok: false as const, error: "PHONE_EXISTS" as const };

  const db = readDb();
  const stableKey = email || phoneNorm;
  const user: UserRecord = {
    userId: payload.userId,
    contact: email || rawPhone || phoneNorm,
    email: email || undefined,
    phone: phoneNorm ? rawPhone : undefined,
    normalizedPhone: phoneNorm || undefined,
    emailVerified: Boolean(email),
    phoneVerified: false,
    createdAt: payload.createdAt ?? Date.now(),
  };
  db[stableKey] = user;
  writeDb(db);
  return { ok: true as const, user };
}

export function getUserById(userId: string): UserRecord | null {
  if (!userId) return null;
  const list = uniqueUsers(readDb());
  return list.find((u) => u.userId === userId) ?? null;
}

/** Keeps listings/chat author resolution aligned with persisted profile after `/api/auth/me` updates. */
export function upsertCachedUserIdentityFromPrivateUser(user: {
  userId: string;
  email?: string;
  phone?: string;
  name?: string;
  chosenDisplay?: string;
}): void {
  if (typeof window === "undefined") return;
  const id = user.userId.trim();
  if (!id) return;
  const emailNorm = user.email ? normalizeEmail(user.email) : "";
  const phoneNorm = user.phone ? normalizePhone(user.phone) : "";
  const db = readDb();
  let touched = false;

  for (const k of Object.keys(db)) {
    if (db[k].userId !== id) continue;
    const next: UserRecord = { ...db[k] };
    if (user.email?.trim().includes("@")) {
      next.email = normalizeEmail(user.email);
      next.contact = user.email!.trim();
    }
    if (typeof user.phone === "string" && user.phone.trim()) {
      next.phone = user.phone.trim();
      next.normalizedPhone = normalizePhone(user.phone);
      if (!next.contact.includes("@")) next.contact = next.phone;
    }
    if (typeof user.name === "string") next.serverProfileName = user.name.trim();
    if (typeof user.chosenDisplay === "string") next.serverChosenDisplay = user.chosenDisplay.trim();
    db[k] = next;
    touched = true;
  }

  if (!touched && (emailNorm || phoneNorm)) {
    const stableKey = emailNorm || phoneNorm;
    db[stableKey] = {
      userId: id,
      contact: user.email?.trim().includes("@") ? user.email!.trim() : (user.phone ?? "").trim(),
      ...(user.email?.trim().includes("@") ? { email: normalizeEmail(user.email) } : {}),
      ...(phoneNorm ? { phone: user.phone!.trim(), normalizedPhone: phoneNorm } : {}),
      emailVerified: Boolean(emailNorm),
      phoneVerified: false,
      createdAt: Date.now(),
      ...(typeof user.name === "string" ? { serverProfileName: user.name.trim() } : {}),
      ...(typeof user.chosenDisplay === "string" ? { serverChosenDisplay: user.chosenDisplay.trim() } : {}),
    };
    touched = true;
  }

  if (touched) writeDb(db);
}

export function setUserPhoneVerified(userId: string, phoneRaw: string) {
  if (typeof window === "undefined") return { ok: false as const, error: "UNAVAILABLE" as const };
  const display = phoneRaw.trim();
  const normalized = normalizePhone(display);
  if (!normalized || !isValidPhone(normalized)) return { ok: false as const, error: "BAD_PHONE" as const };
  const existing = findUserByPhone(normalized);
  if (existing && existing.userId !== userId) return { ok: false as const, error: "PHONE_EXISTS" as const };

  const now = Date.now();
  const db = readDb();
  let updated: UserRecord | null = null;
  for (const k of Object.keys(db)) {
    const u = db[k];
    if (u.userId !== userId) continue;
    const next: UserRecord = {
      ...u,
      phone: display,
      normalizedPhone: normalized,
      phoneVerified: true,
      verifiedAt: now,
    };
    db[k] = next;
    if (!next.contact.includes("@")) db[k].contact = display;
    updated = next;
  }
  if (!updated) return { ok: false as const, error: "NOT_FOUND" as const };
  writeDb(db);
  return { ok: true as const, user: updated };
}

/**
 * Persist profile telephone and normalized form; resets verification when normalized number changes.
 */
export function syncProfilePhoneFromAccount(userId: string, phoneDisplayRaw: string) {
  if (typeof window === "undefined") return { ok: false as const, error: "UNAVAILABLE" as const } as const;
  const trimmed = phoneDisplayRaw.trim();
  const user = getUserById(userId);
  if (!user) return { ok: false as const, error: "NOT_FOUND" as const } as const;
  if (!trimmed) return { ok: true as const };

  const normalized = normalizePhone(trimmed);
  if (!isValidPhone(normalized)) return { ok: false as const, error: "INVALID_PHONE" as const } as const;

  const clash = findUserByPhone(normalized);
  if (clash && clash.userId !== userId) return { ok: false as const, error: "PHONE_EXISTS" as const } as const;

  const prevNorm = userNormalizedPhone(user);
  const verified = user.phoneVerified && prevNorm !== "" && prevNorm === normalized;

  const db = readDb();
  let touched = false;
  for (const k of Object.keys(db)) {
    if (db[k].userId !== userId) continue;
    touched = true;
    const next: UserRecord = {
      ...db[k],
      phone: trimmed,
      normalizedPhone: normalized,
      phoneVerified: verified,
    };
    db[k] = next;
    if (!next.contact.includes("@")) db[k].contact = trimmed;
  }
  if (!touched) return { ok: false as const, error: "NOT_FOUND" as const } as const;
  writeDb(db);
  return { ok: true as const };
}

export function isUserVerified(userId: string | undefined): boolean {
  if (!userId) return false;
  const u = getUserById(userId);
  return Boolean(u?.phoneVerified);
}
