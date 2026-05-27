/**
 * Postgres schema detection and safe diagnostics for chat_ai_summaries.
 * Does not log message text, prompts, or secrets.
 */

import type { Pool } from "pg";

export type ChatAiSummariesPgSchema = "legacy_user" | "canonical_chat";

export type ChatAiPgErrorDiag = {
  pgCode: string;
  constraint: string;
  column: string;
  message: string;
  detail: string;
  schema: string;
  table: string;
  where: string;
  routine: string;
  severity: string;
  operation: string;
};

let pgSchemaPromise: Promise<ChatAiSummariesPgSchema> | null = null;

export function resetChatAiSummariesPgSchemaCache(): void {
  pgSchemaPromise = null;
}

export function logChatAiPgError(
  operation: string,
  table: string,
  err: unknown,
  extra?: Record<string, string | number | boolean>,
): ChatAiPgErrorDiag {
  const e = err as {
    code?: string;
    constraint?: string;
    column?: string;
    message?: string;
    detail?: string;
    schema?: string;
    where?: string;
    routine?: string;
    severity?: string;
  };
  const diag: ChatAiPgErrorDiag = {
    operation,
    table,
    pgCode: typeof e?.code === "string" ? e.code : "unknown",
    constraint: typeof e?.constraint === "string" ? e.constraint : "",
    column: typeof e?.column === "string" ? e.column : "",
    message: typeof e?.message === "string" ? e.message.slice(0, 500) : "unknown",
    detail: typeof e?.detail === "string" ? e.detail.slice(0, 500) : "",
    schema: typeof e?.schema === "string" ? e.schema : "",
    where: typeof e?.where === "string" ? e.where.slice(0, 500) : "",
    routine: typeof e?.routine === "string" ? e.routine : "",
    severity: typeof e?.severity === "string" ? e.severity : "",
  };
  console.error("[CHAT_AI_ERROR]", operation, {
    table: diag.table,
    pgCode: diag.pgCode,
    constraint: diag.constraint,
    column: diag.column,
    message: diag.message,
    detail: diag.detail,
    schema: diag.schema,
    where: diag.where,
    routine: diag.routine,
    severity: diag.severity,
    ...extra,
  });
  return diag;
}

export async function resolveChatAiSummariesPgSchema(pool: Pool): Promise<ChatAiSummariesPgSchema> {
  if (!pgSchemaPromise) {
    pgSchemaPromise = (async () => {
      try {
        const { rows } = await pool.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'chat_ai_summaries'`,
        );
        const cols = new Set(rows.map((r) => r.column_name));
        if (cols.has("chat_id") && cols.has("summary_json") && !cols.has("user_id")) {
          console.error("[CHAT_AI]", "pg_schema", { schema: "canonical_chat", columnCount: cols.size });
          return "canonical_chat";
        }
        if (cols.has("user_id") && cols.has("summary_text")) {
          console.error("[CHAT_AI]", "pg_schema", { schema: "legacy_user", columnCount: cols.size });
          return "legacy_user";
        }
        if (cols.has("chat_id") && cols.has("summary_json")) {
          console.error("[CHAT_AI]", "pg_schema", { schema: "canonical_chat", columnCount: cols.size });
          return "canonical_chat";
        }
        console.error("[CHAT_AI]", "pg_schema", { schema: "legacy_user", columnCount: cols.size, fallback: true });
        return "legacy_user";
      } catch (err) {
        logChatAiPgError("schema_detect_failed", "chat_ai_summaries", err);
        return "legacy_user";
      }
    })();
  }
  return pgSchemaPromise;
}
