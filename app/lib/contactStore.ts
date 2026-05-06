"use client";

import type { ContactMessage } from "./contactMessages";

const STORAGE_KEY = "haliwali_contact_messages";

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

function readAll(): ContactMessage[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

function writeAll(next: ContactMessage[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function getContactMessages(): ContactMessage[] {
  return readAll();
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function createContactMessage(
  data: Omit<ContactMessage, "id" | "createdAt" | "status">,
): ContactMessage {
  const next: ContactMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: Date.now(),
    status: "new",
    name: data.name,
    contact: data.contact,
    subject: data.subject,
    message: data.message,
  };
  writeAll([next, ...readAll()]);
  return next;
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function markContactMessageRead(id: string) {
  const next = readAll().map((m) => (m.id === id ? ({ ...m, status: "read" } satisfies ContactMessage) : m));
  writeAll(next);
}

// TODO: Replace localStorage implementation with API/database when server is connected.
export function deleteContactMessage(id: string) {
  const next = readAll().filter((m) => m.id !== id);
  writeAll(next);
}

