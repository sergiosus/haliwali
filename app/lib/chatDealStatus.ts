export const CHAT_DEAL_STATUSES = ["new", "agreed", "in_progress", "completed", "cancelled"] as const;
export type ChatDealStatus = (typeof CHAT_DEAL_STATUSES)[number];

export const CHAT_DEAL_STATUS_LABELS: Record<ChatDealStatus, string> = {
  new: "Новый",
  agreed: "Договорились",
  in_progress: "В работе",
  completed: "Завершено",
  cancelled: "Отменено",
};

export function normalizeChatDealStatus(raw: unknown): ChatDealStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if ((CHAT_DEAL_STATUSES as readonly string[]).includes(s)) return s as ChatDealStatus;
  return "new";
}
