import { getSafePublicName } from "@/lib/utils/getSafePublicName";
import type { StoredListingChatMessage } from "./serverListingChatsStore";
import type { StoredUser } from "./serverUsersStore";

/** API responses to chat participants: strip email-shaped `senderName`; never derive from email. */
export function publicChatMessageSenderLabel(senderId: string, rawSenderName?: string): string {
  const sid = senderId.trim();
  if (!sid) return getSafePublicName({ userId: "0000" });
  const raw = (rawSenderName ?? "").trim();
  if (!raw) return getSafePublicName({ userId: sid });
  if (raw.includes("@")) return getSafePublicName({ userId: sid });
  return raw.length > 200 ? raw.slice(0, 200) : raw;
}

const GARBAGE_SENDER_LOWER = new Set(
  ["автор", "автор объявления", "пользователь", "собеседник", "гость"].map((s) => s.toLowerCase()),
);

/** Stored `senderName` from chat — strip placeholders and legacy email-shaped labels (do not derive from email). */
export function sanitizedStoredChatSenderLabel(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (GARBAGE_SENDER_LOWER.has(t.toLowerCase())) return "";
  if (t.includes("@")) return "";
  return t;
}

/**
 * Public-safe label for cabinet/chat lists (server routes): never uses email or phone.
 */
export function publicCabinetLabelForStoredUser(u: StoredUser | null | undefined): string {
  if (!u?.userId?.trim()) return "";
  if ((u.deletionStatus ?? "") === "deleted") return "Удалённый пользователь";
  return getSafePublicName({ userId: u.userId.trim(), name: u.name, displayName: u.displayName });
}

export function lastMessageSenderCabinetLabel(
  viewerId: string,
  msg: StoredListingChatMessage | null,
  usersById: Record<string, StoredUser>,
): string {
  if (!msg) return "";
  const sid = msg.senderId.trim();
  const vu = viewerId.trim();
  if (sid === vu) return "Вы";

  const su = usersById[sid];
  if (su) return publicCabinetLabelForStoredUser(su);

  const fromStored = sanitizedStoredChatSenderLabel(msg.senderName);
  return fromStored.trim() ? fromStored.trim() : getSafePublicName({ userId: sid });
}
