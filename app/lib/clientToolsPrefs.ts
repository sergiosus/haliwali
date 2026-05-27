"use client";

const ENABLED_KEY = "haliwali_client_tools_enabled";
const DISMISSED_KEY = "haliwali_client_tools_suggestion_dismissed";
const EVT = "haliwali:client-tools-changed";

function enabledKey(userId: string): string {
  return `${ENABLED_KEY}:${userId.trim()}`;
}

function dismissedKey(userId: string): string {
  return `${DISMISSED_KEY}:${userId.trim()}`;
}

export function getClientToolsEnabled(userId: string): boolean {
  if (typeof window === "undefined" || !userId.trim()) return false;
  try {
    return localStorage.getItem(enabledKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function setClientToolsEnabled(userId: string, enabled: boolean): void {
  if (typeof window === "undefined" || !userId.trim()) return;
  try {
    localStorage.setItem(enabledKey(userId), enabled ? "1" : "0");
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore */
  }
}

export function getClientToolsSuggestionDismissed(userId: string): boolean {
  if (typeof window === "undefined" || !userId.trim()) return false;
  try {
    return localStorage.getItem(dismissedKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function dismissClientToolsSuggestion(userId: string): void {
  if (typeof window === "undefined" || !userId.trim()) return;
  try {
    localStorage.setItem(dismissedKey(userId), "1");
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore */
  }
}

export function subscribeClientToolsPrefs(onChange: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key?.startsWith(ENABLED_KEY) || e.key?.startsWith(DISMISSED_KEY)) onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVT, onChange);
  };
}
