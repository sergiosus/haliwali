import { getPool, usesPostgres } from "./pgPool";

export type ChatAiTaskDraft = {
  title: string;
  deadlineText: string;
  assigneeText: string;
  sourceType: string;
  sourceRef?: string;
};

export type ChatAiTaskRecord = ChatAiTaskDraft & {
  id: number;
  conversationId: string;
  userId: string;
  status: string;
  createdAt: number;
};

function requirePostgres(): void {
  if (!usesPostgres()) throw new Error("AI_TASKS_REQUIRE_POSTGRES");
}

function cleanText(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export function normalizeAiTaskDraft(raw: unknown): ChatAiTaskDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = cleanText(o.title, 240);
  if (!title) return null;
  const deadline = cleanText(o.deadlineText ?? o.deadline_text, 120) || "без срока";
  return {
    title,
    deadlineText: deadline,
    assigneeText: cleanText(o.assigneeText ?? o.assignee_text, 120),
    sourceType: cleanText(o.sourceType ?? o.source_type, 80) || "chat",
    sourceRef: cleanText(o.sourceRef ?? o.source_ref, 120) || undefined,
  };
}

function rowToTask(row: {
  id: string | number;
  conversation_id: string;
  user_id: string;
  title: string;
  deadline_text: string;
  assignee_text: string;
  status: string;
  source_type: string;
  created_at: string | number;
}): ChatAiTaskRecord {
  return {
    id: Number(row.id),
    conversationId: row.conversation_id,
    userId: row.user_id,
    title: row.title,
    deadlineText: row.deadline_text || "без срока",
    assigneeText: row.assignee_text || "",
    status: row.status || "open",
    sourceType: row.source_type || "chat",
    createdAt: Number(row.created_at) || 0,
  };
}

export async function listUserOpenChatAiTasks(userIdRaw: string, limit = 40): Promise<ChatAiTaskRecord[]> {
  if (!usesPostgres()) return [];
  const userId = userIdRaw.trim();
  if (!userId) return [];
  const cap = Math.min(Math.max(limit, 1), 80);
  const { rows } = await getPool().query<Parameters<typeof rowToTask>[0]>(
    `SELECT id, conversation_id, user_id, title, deadline_text, assignee_text, status, source_type, created_at
     FROM ai_tasks
     WHERE user_id = $1 AND status = 'open'
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [userId, cap],
  );
  return rows.map(rowToTask);
}

export async function listChatAiTasks(conversationIdRaw: string, userIdRaw: string): Promise<ChatAiTaskRecord[]> {
  requirePostgres();
  const conversationId = conversationIdRaw.trim();
  const userId = userIdRaw.trim();
  if (!conversationId || !userId) return [];

  const { rows } = await getPool().query<Parameters<typeof rowToTask>[0]>(
    `SELECT id, conversation_id, user_id, title, deadline_text, assignee_text, status, source_type, created_at
     FROM ai_tasks
     WHERE conversation_id = $1 AND user_id = $2
     ORDER BY created_at DESC, id DESC`,
    [conversationId, userId],
  );
  return rows.map(rowToTask);
}

export async function saveChatAiTasks(input: {
  conversationId: string;
  userId: string;
  tasks: ChatAiTaskDraft[];
}): Promise<ChatAiTaskRecord[]> {
  requirePostgres();
  const conversationId = input.conversationId.trim();
  const userId = input.userId.trim();
  const tasks = input.tasks.map(normalizeAiTaskDraft).filter((x): x is ChatAiTaskDraft => Boolean(x)).slice(0, 20);
  if (!conversationId || !userId || tasks.length === 0) return [];

  const pool = getPool();
  const createdAt = Date.now();
  const saved: ChatAiTaskRecord[] = [];
  for (const task of tasks) {
    const { rows } = await pool.query<Parameters<typeof rowToTask>[0]>(
      `INSERT INTO ai_tasks (
         conversation_id, user_id, title, deadline_text, assignee_text, status, source_type, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
       RETURNING id, conversation_id, user_id, title, deadline_text, assignee_text, status, source_type, created_at`,
      [
        conversationId,
        userId,
        task.title,
        task.deadlineText || "без срока",
        task.assigneeText,
        task.sourceRef
          ? `${task.sourceType || "chat"}:${task.sourceRef}`.slice(0, 80)
          : task.sourceType || "chat",
        createdAt,
      ],
    );
    saved.push(rowToTask(rows[0]!));
  }
  return saved;
}
