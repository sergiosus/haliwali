"use client";

import { useCallback, useRef, useState } from "react";
import { AdminCatalogImportCandidatesSection } from "../AdminCatalogImportCandidatesSection";
import { AdminCatalogDirectImportSection } from "./AdminCatalogDirectImportSection";
import { AdminCatalogDraftsPanel } from "./AdminCatalogDraftsPanel";

/** Single-page company import: search → extract → review drafts. */
export function AdminCatalogCompanyImportClient({ onChanged }: { onChanged?: () => void }) {
  const draftsAnchorRef = useRef<HTMLDivElement>(null);
  const [draftRefresh, setDraftRefresh] = useState(0);

  const bump = useCallback(() => {
    onChanged?.();
    setDraftRefresh((n) => n + 1);
  }, [onChanged]);

  const scrollToDrafts = useCallback(() => {
    draftsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="space-y-8">
      <section className="w-full min-w-0 overflow-visible rounded-3xl border border-black/10 bg-white p-4 sm:p-5">
        <header>
          <h2 className="text-lg font-semibold">Поиск источников</h2>
          <p className="mt-1 text-sm text-black/55">
            Веб-поиск, прямой импорт URL/CSV/текста → кандидаты компаний на этой же странице.
          </p>
        </header>

        <div className="mt-4">
          <AdminCatalogImportCandidatesSection
            compact
            hideShell
            onChanged={bump}
            onScrollToCompanyDrafts={scrollToDrafts}
          />
        </div>

        <AdminCatalogDirectImportSection hideShell onChanged={bump} onSuccess={scrollToDrafts} />
      </section>

      <div ref={draftsAnchorRef} id="company-import-drafts">
        <AdminCatalogDraftsPanel onChanged={bump} refreshSignal={draftRefresh} />
      </div>
    </div>
  );
}
