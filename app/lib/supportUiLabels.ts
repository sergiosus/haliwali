import type { StoredSupportTicket, SupportSenderType } from "./serverSupportStore";

export type { SupportSenderType } from "./serverSupportStore";

/** Совместимость со старыми тикетами без senderType — только по `role`. */
export function inferredSupportSenderType(m: { role: string; senderType?: string }): SupportSenderType {
  const raw = typeof m.senderType === "string" ? m.senderType.trim() : "";
  if (raw === "user" || raw === "support" || raw === "admin") return raw;
  const r = typeof m.role === "string" ? m.role.trim() : "";
  if (r === "staff") return "support";
  return "user";
}

/** Кабинет пользователя: свои сообщения — «Вы», ответ поддержки — «Поддержка». */
export function supportMessageLabelUserCabinet(sender: SupportSenderType): string {
  return sender === "user" ? "Вы" : "Поддержка";
}

/** Панель администратора: сообщения пользователя — их имя; ответ линии — «Поддержка» / «Админ». */
export function supportMessageLabelAdminPanel(sender: SupportSenderType): { staff: boolean; label: string } {
  if (sender === "user") return { staff: false, label: "" };
  if (sender === "admin") return { staff: true, label: "Админ" };
  return { staff: true, label: "Поддержка" };
}

/** Shared RU labels for support (user + admin). */
export const SUPPORT_CATEGORY_LABEL_RU: Record<string, string> = {
  listing_problem: "Проблема с объявлением",
  user_report: "Жалоба на пользователя",
  question: "Вопрос",
  other: "Другое",
  feedback: "Обратная связь",
};

export function supportCategoryLabelRu(category: string): string {
  return SUPPORT_CATEGORY_LABEL_RU[category] ?? category;
}

/** Открыто: open или in_progress. */
export function supportAppealClosedForUser(status: string): boolean {
  return status === "closed";
}

export function deriveSupportSubject(ticket: StoredSupportTicket): string {
  const s = (ticket.subject ?? "").trim();
  if (s) return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  const raw = ticket.messages[0]?.text ?? "";
  const m = raw.match(/^Тема:\s*([^\n]+)/);
  if (m?.[1]) {
    const t = m[1].trim();
    return t.length > 120 ? `${t.slice(0, 117)}…` : t;
  }
  const line = raw.split(/\n/)[0]?.trim() ?? "";
  if (line) return line.length > 120 ? `${line.slice(0, 117)}…` : line;
  return supportCategoryLabelRu(ticket.category);
}
