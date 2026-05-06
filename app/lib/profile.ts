"use client";

const KEY = "haliwali_profiles_by_user";
const EVT = "haliwali:profile-changed";

export type UserProfile = {
  name: string;
  phone: string;
  city: string;
  about: string;
  avatarData?: string;
  preferredContact: "messages" | "phone" | "email";
  registeredAt?: number;
};

type ProfileMap = Record<string, UserProfile>;

function readMap(): ProfileMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as ProfileMap;
  } catch {
    return {};
  }
}

function writeMap(next: ProfileMap) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
}

export function getProfile(userId: string): UserProfile {
  const m = readMap();
  const p = m[userId];
  return (
    p ?? {
      name: "",
      phone: "",
      city: "",
      about: "",
      avatarData: "",
      preferredContact: "messages",
    }
  );
}

export function saveProfile(userId: string, profile: UserProfile) {
  if (!userId) return;
  const m = readMap();
  const prev = m[userId];
  m[userId] = {
    ...profile,
    registeredAt: prev?.registeredAt ?? Date.now(),
  };
  writeMap(m);
}

export function removeProfile(userId: string) {
  if (!userId) return;
  const m = readMap();
  if (!m[userId]) return;
  delete m[userId];
  writeMap(m);
}

export function subscribeProfiles(onChange: () => void) {
  function onStorage(e: StorageEvent) {
    if (e.key === KEY) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVT, onChange);
  };
}

