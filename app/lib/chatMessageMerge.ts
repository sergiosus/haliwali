import type { MessageDeletionRow } from "./serverChatMessageStore";

export function mergeDeletionRowIntoMessage<M extends Record<string, unknown>>(msg: M, row: MessageDeletionRow): M {
  const next: Record<string, unknown> = { ...msg };
  if (Array.isArray(row.deletedForUserIds) && row.deletedForUserIds.length > 0) {
    const s = new Set<string>(Array.isArray(next.deletedForUserIds) ? (next.deletedForUserIds as string[]) : []);
    for (const u of row.deletedForUserIds) s.add(u);
    next.deletedForUserIds = [...s];
  }
  if (row.deletedForEveryone) {
    next.deletedForEveryone = true;
    next.deletedAt = row.deletedAt ?? Date.now();
    next.deletedByUserId = row.deletedByUserId ?? "";
    delete next.text;
    delete next.fileUrl;
    delete next.fileName;
  }
  return next as M;
}

export function mergeAllDeletions<M extends { id: string } & Record<string, unknown>>(
  messages: M[],
  rows: Record<string, MessageDeletionRow>,
): M[] {
  return messages.map((m) => {
    const r = rows[m.id];
    return r ? mergeDeletionRowIntoMessage(m, r) : m;
  });
}
