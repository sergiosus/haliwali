/** Jitsi room id: Haliwali-{chatId} or Haliwali-{chatId}-{callId} for a fresh room per call. */
export function jitsiRoomNameForChatId(chatId: string, callId?: string): string {
  const base = (chatId ?? "").trim() || "unknown";
  const safeChat = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  const safeCall = (callId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  if (safeCall) return `Haliwali-${safeChat}-${safeCall}`;
  return `Haliwali-${safeChat}`;
}
