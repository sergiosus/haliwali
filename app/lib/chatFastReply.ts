/** Derive fast-reply eligibility from local chat history (same storage as chat page). */

const STORAGE_KEY = "haliwali_chats";

type RawMsg = {
  senderId?: string;
  createdAt?: number;
  ts?: number;
  deletedForEveryone?: boolean;
  deletedForUserIds?: string[];
};

function readChatStore(): Record<string, RawMsg[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, RawMsg[]>;
  } catch {
    return {};
  }
}

function messageVisibleForStats(m: RawMsg, userId: string): boolean {
  if (m.deletedForEveryone) return false;
  const hid = m.deletedForUserIds;
  if (Array.isArray(hid) && hid.includes(userId)) return false;
  return true;
}

/**
 * For `userId`, compute reply times: time from last other-party message to this user's message.
 * Requires ≥3 samples and average ≤15 minutes.
 */
export function fastReplyEligibleFromLocalChats(userId: string): boolean {
  const uid = (userId ?? "").trim();
  if (!uid) return false;
  const store = readChatStore();
  const samples: number[] = [];

  for (const thread of Object.values(store)) {
    if (!Array.isArray(thread)) continue;
    const arr = thread
      .filter((m) => m && typeof m === "object")
      .map((m) => {
        const createdAt =
          typeof m.createdAt === "number"
            ? m.createdAt
            : typeof m.ts === "number"
              ? m.ts
              : NaN;
        const senderId = typeof m.senderId === "string" ? m.senderId : "";
        return { senderId, createdAt, raw: m as RawMsg };
      })
      .filter((m) => Number.isFinite(m.createdAt) && m.senderId)
      .sort((a, b) => a.createdAt - b.createdAt);

    let lastOtherAt: number | null = null;
    for (const m of arr) {
      if (!messageVisibleForStats(m.raw, uid)) {
        continue;
      }
      if (m.senderId === uid) {
        if (lastOtherAt != null) {
          const delta = m.createdAt - lastOtherAt;
          if (delta >= 0 && delta < 48 * 60 * 60 * 1000) {
            samples.push(delta);
          }
        }
      } else {
        lastOtherAt = m.createdAt;
      }
    }
  }

  if (samples.length < 3) return false;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return avg <= 15 * 60 * 1000;
}
