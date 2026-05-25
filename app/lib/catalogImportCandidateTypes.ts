import type { RankedSearchCandidate } from "./catalogDiscoverRanking";

export type ImportCandidateState = "found" | "selected" | "imported" | "rejected" | "removed";

export type PersistedImportCandidate = RankedSearchCandidate & {
  state: ImportCandidateState;
  draftId?: number | null;
};

export type CatalogImportCandidateSession = {
  id: number;
  query: string;
  city: string;
  categorySlug: string;
  queriesUsed: string[];
  candidates: PersistedImportCandidate[];
  createdAt: string;
  updatedAt: string;
};

export type CatalogImportCandidateHistoryItem = {
  id: number;
  query: string;
  city: string;
  categorySlug: string;
  candidateCount: number;
  createdAt: string;
};

export const IMPORT_CANDIDATE_STATE_LABEL: Record<ImportCandidateState, string> = {
  found: "Найдено",
  selected: "Выбрано",
  imported: "Импортировано",
  rejected: "Отклонено",
  removed: "Удалено",
};

export function candidateKey(c: { url: string }): string {
  return c.url.trim();
}

export function toPersistedCandidates(
  visible: RankedSearchCandidate[],
  hidden: RankedSearchCandidate[],
): PersistedImportCandidate[] {
  const out: PersistedImportCandidate[] = [];
  for (const c of visible) out.push({ ...c, state: "found" });
  for (const c of hidden) out.push({ ...c, state: "found" });
  return out;
}

export function syncSelectedStates(
  candidates: PersistedImportCandidate[],
  selectedUrls: Set<string>,
): PersistedImportCandidate[] {
  return candidates.map((c) => {
    if (c.state === "imported" || c.state === "rejected" || c.state === "removed") return c;
    const sel = selectedUrls.has(c.url.trim());
    return { ...c, state: sel ? "selected" : "found" };
  });
}
