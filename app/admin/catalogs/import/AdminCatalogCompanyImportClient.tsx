"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogImportDraft } from "../../../lib/catalogImportTypes";
import { AdminCatalogImportCandidatesSection } from "../AdminCatalogImportCandidatesSection";
import { AdminCatalogDirectImportSection } from "./AdminCatalogDirectImportSection";
import { AdminCatalogDraftsPanel } from "./AdminCatalogDraftsPanel";

type ImportMode = "find" | "create" | "drafts";

function countActiveDrafts(drafts: CatalogImportDraft[]): number {
  return drafts.filter((d) => {
    const status = String(d.status ?? "").trim().toLowerCase();
    return status !== "published" && status !== "rejected";
  }).length;
}

/** Company import: one visible mode at a time (search / create / review). */
export function AdminCatalogCompanyImportClient({ onChanged }: { onChanged?: () => void }) {
  const [mode, setMode] = useState<ImportMode>("find");
  const [draftRefresh, setDraftRefresh] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  const loadDraftCount = useCallback(() => {
    void fetch("/api/admin/catalogs/import/drafts", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { drafts?: CatalogImportDraft[] }) => setDraftCount(countActiveDrafts(d.drafts ?? [])))
      .catch(() => setDraftCount(0));
  }, []);

  useEffect(() => {
    loadDraftCount();
  }, [loadDraftCount, draftRefresh]);

  const bump = useCallback(() => {
    onChanged?.();
    setDraftRefresh((n) => n + 1);
  }, [onChanged]);

  const goToDrafts = useCallback(() => {
    setMode("drafts");
  }, []);

  const modeBtn = (id: ImportMode, label: string) => {
    const active = mode === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setMode(id)}
        className={[
          "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
          active ?
            "border-black/20 bg-black text-white shadow-sm"
          : "border-black/15 bg-white text-black/70 hover:border-black/25 hover:bg-black/[0.03]",
        ].join(" ")}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap gap-2">
        {modeBtn("find", "Найти компании")}
        {modeBtn("create", "Создать кандидатов")}
        {modeBtn("drafts", `Кандидаты компаний (${draftCount})`)}
      </div>

      <div className="w-full min-w-0 overflow-visible rounded-3xl border border-black/10 bg-white p-4 sm:p-5">
        {mode === "find" ?
          <AdminCatalogImportCandidatesSection
            compact
            hideShell
            onChanged={bump}
            onScrollToCompanyDrafts={goToDrafts}
          />
        : null}

        {mode === "create" ?
          <AdminCatalogDirectImportSection hideShell onChanged={bump} onSuccess={goToDrafts} />
        : null}

        {mode === "drafts" ?
          <AdminCatalogDraftsPanel onChanged={bump} refreshSignal={draftRefresh} />
        : null}
      </div>
    </div>
  );
}
