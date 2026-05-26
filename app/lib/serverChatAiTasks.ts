import { callOpenAiChatCompletion } from "./serverChatAiOpenAi";
import type { ChatAiTaskDraft } from "./serverChatAiTasksStore";
import { normalizeAiTaskDraft } from "./serverChatAiTasksStore";

export type ChatAiTaskExtractionResult =
  | { ok: true; tasks: ChatAiTaskDraft[] }
  | { ok: false; code: "UNCONFIGURED" | "UPSTREAM"; message: string };

export type ChatTaskExtractionMessage = {
  id: string;
  senderLabel: string;
  createdAt: number;
  text: string;
};

export type ChatTaskExtractionTranscript = {
  messageId: string;
  text: string;
};

const SYSTEM_PROMPT = `Ты извлекаешь задачи из переписки Haliwali.
Используй только факты из текста. Не выдумывай сроки, ответственных, адреса, цены или договорённости.
Если срок не указан явно, deadlineText должен быть ровно "без срока".
Если ответственный неясен, assigneeText должен быть пустой строкой.
Если задач нет, верни {"tasks":[]}.

Ответ строго JSON:
{"tasks":[{"title":"...","deadlineText":"без срока","assigneeText":"","sourceType":"message|transcript","sourceRef":"message id if known"}]}`;

function buildUserContent(input: {
  messages: ChatTaskExtractionMessage[];
  transcripts: ChatTaskExtractionTranscript[];
}): string {
  const lines: string[] = [];
  const transcripts = input.transcripts.slice(-12);
  if (transcripts.length > 0) {
    lines.push("Расшифровки голосовых сообщений:");
    for (const t of transcripts) {
      lines.push(`[transcript:${t.messageId}] ${t.text.slice(0, 2500)}`);
    }
    lines.push("");
  }

  const messages = input.messages.slice(-40);
  if (messages.length > 0) {
    lines.push("Последние сообщения:");
    for (const m of messages) {
      const when = new Date(m.createdAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`[message:${m.id}] ${when} ${m.senderLabel}: ${m.text.slice(0, 1200)}`);
    }
  }
  return lines.join("\n").trim();
}

function parseTasks(raw: string): ChatAiTaskDraft[] {
  try {
    const parsed = JSON.parse(raw) as { tasks?: unknown };
    if (!Array.isArray(parsed.tasks)) return [];
    return parsed.tasks
      .map(normalizeAiTaskDraft)
      .filter((x): x is ChatAiTaskDraft => Boolean(x))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export async function extractChatAiTasks(input: {
  messages: ChatTaskExtractionMessage[];
  transcripts: ChatTaskExtractionTranscript[];
}): Promise<ChatAiTaskExtractionResult> {
  const user = buildUserContent(input);
  if (!user) return { ok: true, tasks: [] };

  const ai = await callOpenAiChatCompletion({
    feature: "tasks",
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 900,
    temperature: 0.1,
    jsonObject: true,
  });
  if (!ai.ok) return { ok: false, code: ai.code, message: ai.message };
  return { ok: true, tasks: parseTasks(ai.content) };
}
