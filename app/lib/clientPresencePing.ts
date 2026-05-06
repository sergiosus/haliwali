/** Light presence: avoid spamming /api/auth/presence (no per-second polling). */

let lastPingAt = 0;
const DEFAULT_MIN_MS = 90_000;

export async function pingPresenceThrottled(opts?: { force?: boolean; minIntervalMs?: number }) {
  if (typeof window === "undefined") return;
  const min = opts?.minIntervalMs ?? DEFAULT_MIN_MS;
  const now = Date.now();
  if (!opts?.force && now - lastPingAt < min) return;
  lastPingAt = now;
  try {
    await fetch("/api/auth/presence", { method: "POST" });
  } catch {
    // ignore
  }
}
