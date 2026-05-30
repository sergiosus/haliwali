"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogSourceOfferDraftStatus } from "../../../lib/catalogSourceOfferTypes";
import { AdminCatalogImportCandidatesSection } from "../AdminCatalogImportCandidatesSection";
import { AdminCatalogDirectImportSection } from "./AdminCatalogDirectImportSection";
import { AdminCatalogSourceOfferDraftsPanel } from "./AdminCatalogSourceOfferDraftsPanel";

type OfferImportMode = "find" | "create" | "drafts";

const ACTIONABLE_STATUSES: CatalogSourceOfferDraftStatus[] = [
  "draft",
  "saved",
  "approved",
  "duplicate",
];

function countActiveOfferDrafts(drafts: { status?: string }[]): number {
  return drafts.filter((d) => {
    const status = String(d.status ?? "").trim().toLowerCase();
    return (
      status === "draft" ||
      status === "new" ||
      status === "saved" ||
      status === "approved" ||
      status === "duplicate"
    );
  }).length;
}

/** Offer import: search / parse URLs / review drafts — separate from company import. */
export function AdminCatalogOfferImportClient({ onChanged }: { onChanged?: () => void }) {
  const [mode, setMode] = useState<OfferImportMode>("find");
  const [draftRefresh, setDraftRefresh] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  const loadDraftCount = useCallback(() => {
    void Promise.all(
      ACTIONABLE_STATUSES.map((status) =>
        fetch(`/api/admin/catalogs/source-offers/drafts?status=${status}`, {
          credentials: "include",
          cache: "no-store",
        }).then((r) => r.json()),
      ),
    )
      .then((results) => {
        const all = results.flatMap((d: { drafts?: { status?: string }[] }) => d.drafts ?? []);
        setDraftCount(countActiveOfferDrafts(all));
      })
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

  const modeBtn = (id: OfferImportMode, label: string) => {
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
      <div>
        <h2 className="text-lg font-semibold">Импорт предложений</h2>
        <p className="mt-1 text-sm text-black/55">
          Avito, Drom, VK и сайты компаний. Объявления попадают в кандидаты, затем в «Предложения» на сайте.
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap gap-2">
        {modeBtn("find", "Найти предложения")}
        {modeBtn("create", "Создать кандидатов")}
        {modeBtn("drafts", `Кандидаты предложений (${draftCount})`)}
      </div>

      <div className="w-full min-w-0 overflow-visible rounded-3xl border border-black/10 bg-white p-4 sm:p-5">
        {mode === "find" ?
          <AdminCatalogImportCandidatesSection
            compact
            hideShell
            offerOnly
            onChanged={bump}
            onGoToDrafts={goToDrafts}
          />
        : null}

        {mode === "create" ?
          <AdminCatalogDirectImportSection
            hideShell
            offerOnly
            onChanged={bump}
            onSuccess={goToDrafts}
          />
        : null}

        {mode === "drafts" ?
          <AdminCatalogSourceOfferDraftsPanel embedded onChanged={bump} refreshSignal={draftRefresh} />
        : null}
      </div>
    </div>
  );
}
