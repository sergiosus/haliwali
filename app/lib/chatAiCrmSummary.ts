/**
 * Structured CRM intelligence from AI chat summaries.
 */

export const CHAT_AI_DEAL_STAGES = [
  "new",
  "discussion",
  "agreed",
  "completed",
  "canceled",
] as const;

export type ChatAiDealStage = (typeof CHAT_AI_DEAL_STAGES)[number];

export const CHAT_AI_DEAL_STAGE_LABELS: Record<ChatAiDealStage, string> = {
  new: "Новый",
  discussion: "Обсуждение",
  agreed: "Договорились",
  completed: "Завершено",
  canceled: "Отменено",
};

export type ChatAiCrmSummaryJson = {
  clientGoal: string;
  problem: string;
  budget: string;
  urgency: string;
  agreement: string;
  nextStep: string;
  dealStage: string;
  tags: string[];
};

export const EMPTY_CHAT_AI_CRM_SUMMARY: ChatAiCrmSummaryJson = {
  clientGoal: "",
  problem: "",
  budget: "",
  urgency: "",
  agreement: "",
  nextStep: "",
  dealStage: "new",
  tags: [],
};

const DEAL_STAGE_ALIASES: Record<string, ChatAiDealStage> = {
  new: "new",
  новый: "new",
  discussion: "discussion",
  discuss: "discussion",
  обсуждение: "discussion",
  in_progress: "discussion",
  "в работе": "discussion",
  waiting: "discussion",
  agreed: "agreed",
  agree: "agreed",
  договорились: "agreed",
  completed: "completed",
  complete: "completed",
  done: "completed",
  завершено: "completed",
  canceled: "canceled",
  cancelled: "canceled",
  cancel: "canceled",
  отменено: "canceled",
  отменён: "canceled",
};

export function normalizeChatAiDealStage(raw: unknown): ChatAiDealStage {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!key) return "new";
  if ((CHAT_AI_DEAL_STAGES as readonly string[]).includes(key)) return key as ChatAiDealStage;
  return DEAL_STAGE_ALIASES[key] ?? "new";
}

function cleanField(raw: unknown, maxLen: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, maxLen) : "";
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = cleanField(item, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

export function normalizeChatAiCrmSummaryJson(raw: unknown): ChatAiCrmSummaryJson {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    clientGoal: cleanField(obj.clientGoal, 2000),
    problem: cleanField(obj.problem, 2000),
    budget: cleanField(obj.budget, 500),
    urgency: cleanField(obj.urgency, 500),
    agreement: cleanField(obj.agreement, 2000),
    nextStep: cleanField(obj.nextStep, 1000),
    dealStage: normalizeChatAiDealStage(obj.dealStage),
    tags: normalizeTags(obj.tags),
  };
}

export function formatChatAiCrmSummaryForDisplay(data: ChatAiCrmSummaryJson): string {
  const stageLabel = CHAT_AI_DEAL_STAGE_LABELS[normalizeChatAiDealStage(data.dealStage)];
  const lines: string[] = [];
  const push = (title: string, value: string) => {
    const v = value.trim();
    lines.push(`${title}:\n${v || "—"}`);
  };
  push("Цель клиента", data.clientGoal);
  push("Проблема / запрос", data.problem);
  push("Бюджет", data.budget);
  push("Срочность", data.urgency);
  push("О чём договорились", data.agreement);
  push("Следующий шаг", data.nextStep);
  push("Стадия сделки", stageLabel);
  if (data.tags.length > 0) {
    lines.push(`Теги:\n${data.tags.join(", ")}`);
  }
  return lines.join("\n\n");
}

export function hasChatAiCrmSummaryContent(data: ChatAiCrmSummaryJson): boolean {
  return Boolean(
    data.clientGoal.trim() ||
      data.problem.trim() ||
      data.budget.trim() ||
      data.urgency.trim() ||
      data.agreement.trim() ||
      data.nextStep.trim() ||
      data.tags.length > 0 ||
      normalizeChatAiDealStage(data.dealStage) !== "new",
  );
}
