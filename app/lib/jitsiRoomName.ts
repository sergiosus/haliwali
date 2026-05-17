/** Self-hosted Jitsi host (domain only — no protocol). */
export const JITSI_DOMAIN = "meet.haliwali.ru";

/**
 * Jitsi room id: `Haliwali-{sanitizedChatId}` — ASCII only, no user ids in the name.
 */
export function jitsiRoomNameForChatId(chatId: string): string {
  const safe =
    (chatId ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 96) || "unknown";
  return `Haliwali-${safe}`;
}
