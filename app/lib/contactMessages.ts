"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type ContactMessageStatus = "new" | "read";

export type ContactMessage = {
  id: string;
  name: string;
  contact: string;
  subject: string;
  message: string;
  createdAt: number;
  status: ContactMessageStatus;
};

const STORAGE_KEY = "haliwali_contact_messages";
const EMPTY_MESSAGES: ContactMessage[] = [];

function safeParse(raw: string | null): ContactMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).map((x) => migrate(x)).filter(Boolean) as ContactMessage[];
  } catch {
    return [];
  }
}

function migrate(x: unknown): ContactMessage | null {
  if (!x || typeof x !== "object") return null;
  const obj = x as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id ? obj.id : `msg-${Date.now()}`;
  const createdAt = typeof obj.createdAt === "number" ? obj.createdAt : Date.now();
  const status = obj.status === "read" ? "read" : "new";

  return {
    id,
    name: typeof obj.name === "string" ? obj.name : "",
    contact: typeof obj.contact === "string" ? obj.contact : "",
    subject: typeof obj.subject === "string" ? obj.subject : "",
    message: typeof obj.message === "string" ? obj.message : "",
    createdAt,
    status,
  };
}

function write(next: ContactMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (typeof window === "undefined") return () => listeners.delete(cb);

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

let cachedRaw: string | null = null;
let cachedMessages: ContactMessage[] = EMPTY_MESSAGES;
function getSnapshot() {
  if (typeof window === "undefined") return EMPTY_MESSAGES;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedMessages;
  cachedRaw = raw;
  const parsed = safeParse(raw);
  cachedMessages = parsed.length > 0 ? parsed : EMPTY_MESSAGES;
  return cachedMessages;
}

function getServerSnapshot() {
  return EMPTY_MESSAGES;
}

function persist(next: ContactMessage[]) {
  write(next);
  emit();
}

export function useContactMessagesStore() {
  const messages = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Ensure key exists only when writing; keep read-only otherwise.
  }, []);

  const addMessage = useCallback((msg: Omit<ContactMessage, "id" | "createdAt" | "status">) => {
    const next: ContactMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      status: "new",
      name: msg.name,
      contact: msg.contact,
      subject: msg.subject,
      message: msg.message,
    };
    persist([next, ...(getSnapshot() as ContactMessage[])]);
    return next;
  }, []);

  const markRead = useCallback((id: string) => {
    const next = (getSnapshot() as ContactMessage[]).map((m) =>
      m.id === id ? ({ ...m, status: "read" as const } satisfies ContactMessage) : m,
    );
    persist(next);
  }, []);

  const deleteMessage = useCallback((id: string) => {
    const next = (getSnapshot() as ContactMessage[]).filter((m) => m.id !== id);
    persist(next);
  }, []);

  const counts = useMemo(() => {
    let total = 0;
    let unread = 0;
    for (const m of messages) {
      total += 1;
      if (m.status === "new") unread += 1;
    }
    return { total, unread };
  }, [messages]);

  return { messages, addMessage, markRead, deleteMessage, counts };
}

