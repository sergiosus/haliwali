/** Client-safe helpers for presence / fast reply UI (no server-only imports). */

export const FAST_REPLY_BADGE_LABEL = "⚡️ Быстро отвечает";

export function formatLastSeenRu(lastSeenAt: number | undefined | null, nowMs = Date.now()): string {
  if (!lastSeenAt || !Number.isFinite(lastSeenAt)) return "Был(а) давно";
  const delta = Math.max(0, nowMs - lastSeenAt);
  const twoMin = 2 * 60 * 1000;
  const tenMin = 10 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  if (delta <= twoMin) return "В сети";
  if (delta <= tenMin) return "Был(а) недавно";
  if (delta <= hour) {
    const mins = Math.max(1, Math.floor(delta / (60 * 1000)));
    return `Был(а) ${mins} мин назад`;
  }
  return "Был(а) давно";
}

export function fastReplyFromStats(stats: { count: number; sumMs: number } | undefined | null): boolean {
  if (!stats || stats.count < 3) return false;
  const avg = stats.sumMs / stats.count;
  return avg <= 15 * 60 * 1000;
}
