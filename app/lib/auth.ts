"use client";

import { useSyncExternalStore } from "react";
import { isDebugAuthClient } from "./debugAuth";
import { upsertCachedUserIdentityFromPrivateUser } from "./users";

const CONTACT_KEY = "haliwali_account_contact";
/** Legacy UI hint only — never used to authorize. Cleared on logout / 401. */
const USER_ID_KEY_LEGACY = "haliwali_user_id";
const ANON_ID_KEY = "haliwali_anon_id";

export type AuthSnapshot = {
  /** `idle` before first client sync; `loading` during fetch; `ready` after first `/api/auth/me` completes. */
  status: "idle" | "loading" | "ready";
  userId: string | null;
};

let snapshot: AuthSnapshot = { status: "idle", userId: null };

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

function setSnapshot(next: AuthSnapshot) {
  snapshot = next;
  emit();
}

/**
 * Apply JSON body from `GET /api/auth/me` (or equivalent) to in-memory auth.
 * Returns whether a logged-in user id was resolved.
 */
export type AuthMePayload = {
  ok?: boolean;
  user?: { userId?: string; email?: string; phone?: string; name?: string; displayName?: string };
};

let authMeInflight: Promise<{ status: number; data: AuthMePayload }> | null = null;
let authMeCached: { status: number; data: AuthMePayload; at: number } | null = null;
const AUTH_ME_CACHE_MS = 2000;

export function invalidateAuthMeDedupeCache() {
  authMeCached = null;
}

/** One in-flight fetch + short TTL cache — coalesces AuthBootstrap + `/account` hydration. */
export async function loadAuthMeFromServer(options?: { bypassCache?: boolean }): Promise<{
  status: number;
  data: AuthMePayload;
}> {
  if (typeof window === "undefined") return { status: 401, data: {} };

  if (options?.bypassCache && authMeInflight) {
    try {
      await authMeInflight;
    } catch {
      /* stale in-flight */
    }
    invalidateAuthMeDedupeCache();
    authMeInflight = null;
  } else if (options?.bypassCache) {
    invalidateAuthMeDedupeCache();
  }

  const now = Date.now();
  if (authMeCached && now - authMeCached.at < AUTH_ME_CACHE_MS) {
    return { status: authMeCached.status, data: authMeCached.data };
  }

  if (!authMeInflight) {
    authMeInflight = (async () => {
      const r = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      const data = (await r.json().catch(() => ({}))) as AuthMePayload;
      const snap = { status: r.status, data, at: Date.now() };
      authMeCached = snap;
      return { status: snap.status, data: snap.data };
    })().finally(() => {
      authMeInflight = null;
    });
  }

  return authMeInflight;
}

export function applyAuthFromMeResponse(status: number, body: unknown): boolean {
  const data = body as AuthMePayload;
  if (status === 401 || !data?.ok || typeof data.user?.userId !== "string" || !data.user.userId.trim()) {
    invalidateAuthMeDedupeCache();
    setSnapshot({ status: "ready", userId: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem(USER_ID_KEY_LEGACY);
      localStorage.removeItem(CONTACT_KEY);
    }
    return false;
  }
  const uid = data.user.userId.trim();
  const contact = `${data.user.email ?? ""}`.trim() || `${data.user.phone ?? ""}`.trim();
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_ID_KEY_LEGACY, uid);
    if (contact) localStorage.setItem(CONTACT_KEY, contact);
    upsertCachedUserIdentityFromPrivateUser({
      userId: uid,
      email: `${data.user.email ?? ""}`.trim() || undefined,
      phone: `${data.user.phone ?? ""}`.trim() || undefined,
      ...(typeof data.user.name === "string" ? { name: data.user.name } : {}),
      ...(typeof data.user.displayName === "string" ? { chosenDisplay: data.user.displayName } : {}),
    });
  }
  setSnapshot({ status: "ready", userId: uid });
  return true;
}

/** SSR: always logged out — must be one stable reference (no `return { ... }` per call). */
const SERVER_AUTH_SNAPSHOT: AuthSnapshot = { status: "ready", userId: null };

function getServerAuthSnapshot(): AuthSnapshot {
  return SERVER_AUTH_SNAPSHOT;
}

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
}

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  if (snapshot.status !== "ready") return null;
  return snapshot.userId;
}

export function isLoggedIn(): boolean {
  return Boolean(getCurrentUserId());
}

/** UI cache only — does not grant server access. Prefer `setSession` after login. */
export function setClientUserId(userId: string) {
  if (typeof window === "undefined") return;
  const id = (userId ?? "").trim();
  if (!id) return;
  localStorage.setItem(USER_ID_KEY_LEGACY, id);
}

function makeId(prefix = "user") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Anonymous device id for non-auth features (e.g. legacy keys). Never treated as a logged-in session.
 */
export function ensureUserId(): string {
  if (typeof window === "undefined") return "";
  const existing = (localStorage.getItem(ANON_ID_KEY) ?? "").trim();
  if (existing) return existing;
  const id = makeId("anon");
  localStorage.setItem(ANON_ID_KEY, id);
  return id;
}

export function setSession(userId: string, contact: string) {
  if (typeof window === "undefined") return;
  const id = (userId ?? "").trim();
  const c = (contact ?? "").trim();
  if (!id) return;
  invalidateAuthMeDedupeCache();
  if (c) localStorage.setItem(CONTACT_KEY, c);
  localStorage.setItem(USER_ID_KEY_LEGACY, id);
  setSnapshot({ status: "ready", userId: id });
  if (isDebugAuthClient() && process.env.NODE_ENV !== "production") {
    console.log("[auth] setSession (client)", { hasUser: true, isAdmin: false });
  }
}

/**
 * Validates HttpOnly session with `/api/auth/me` — same source as server APIs.
 * On 401 clears client hints so UI matches cookie-backed authentication.
 */
export async function refreshAuthFromServer(options?: { bypassCache?: boolean }): Promise<boolean> {
  if (typeof window === "undefined") return false;
  setSnapshot({ status: "loading", userId: snapshot.userId });
  try {
    const { status, data } = await loadAuthMeFromServer({ bypassCache: options?.bypassCache });
    if (isDebugAuthClient() && process.env.NODE_ENV !== "production") {
      console.log("[auth] /api/auth/me result", {
        status,
        hasUser: Boolean(status === 200 && data.ok && data.user?.userId),
        isAdmin: false,
      });
    }
    return applyAuthFromMeResponse(status, data);
  } catch (e: unknown) {
    if (isDebugAuthClient() && process.env.NODE_ENV !== "production") {
      console.warn("[auth] /api/auth/me failed", e);
    }
    setSnapshot({ status: "ready", userId: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem(USER_ID_KEY_LEGACY);
      localStorage.removeItem(CONTACT_KEY);
    }
    return false;
  }
}

export async function logout(): Promise<void> {
  if (typeof window === "undefined") return;
  invalidateAuthMeDedupeCache();
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
  } catch {
    /* still clear client state */
  }
  localStorage.removeItem(CONTACT_KEY);
  localStorage.removeItem(USER_ID_KEY_LEGACY);
  localStorage.removeItem("ownerId");
  localStorage.removeItem("haliwali_user_id");
  document.cookie = "ownerId=; Path=/; Max-Age=0; SameSite=Lax";
  setSnapshot({ status: "ready", userId: null });
}
