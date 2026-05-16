/** Chat header presence labels (compact Russian). */

export function formatChatPeerPresenceRu(lastSeenAt: number | undefined | null, nowMs = Date.now()): string {
  if (!lastSeenAt || !Number.isFinite(lastSeenAt)) return "давно не заходил";
  const delta = Math.max(0, nowMs - lastSeenAt);
  const twoMin = 2 * 60 * 1000;
  const tenMin = 10 * 60 * 1000;
  if (delta <= twoMin) return "онлайн";
  if (delta <= tenMin) return "был недавно";
  return "давно не заходил";
}

export const CHAT_FAST_REPLY_HINT = "обычно отвечает быстро";
