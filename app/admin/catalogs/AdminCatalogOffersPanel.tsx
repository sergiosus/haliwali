"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCatalogPublishedOffersPanel } from "./AdminCatalogPublishedOffersPanel";
import { AdminCatalogOfferImportClient } from "./import/AdminCatalogOfferImportClient";
import { AdminCatalogSourceOfferDraftsPanel } from "./import/AdminCatalogSourceOfferDraftsPanel";

export type OfferSubTab = "published" | "import" | "candidates" | "rejected" | "duplicates";

export function AdminCatalogOffersPanel({
  initialSubTab,
  onChanged,
}: {
  initialSubTab?: OfferSubTab;
  onChanged?: () => void;
}) {
  const [subTab, setSubTab] = useState<OfferSubTab>(initialSubTab ?? "published");
  const [publishedCount, setPublishedCount] = useState(0);
  const [candidatesCount, setCandidatesCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [draftRefresh, setDraftRefresh] = useState(0);

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  const loadCounts = useCallback(() => {
    void fetch("/api/admin/catalogs/source-offers/status", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: {
          publishedCount?: number;
          candidatesCount?: number;
          importCount?: number;
          rejectedCount?: number;
          duplicateCount?: number;
        }) => {
          setPublishedCount(d.publishedCount ?? 0);
          setCandidatesCount(d.candidatesCount ?? d.importCount ?? 0);
          setRejectedCount(d.rejectedCount ?? 0);
          setDuplicateCount(d.duplicateCount ?? 0);
        },
      )
      .catch(() => {
        setPublishedCount(0);
        setCandidatesCount(0);
        setRejectedCount(0);
        setDuplicateCount(0);
      });
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, draftRefresh]);

  const refresh = useCallback(() => {
    loadCounts();
    setDraftRefresh((n) => n + 1);
    onChanged?.();
  }, [loadCounts, onChanged]);

  const subTabs: { key: OfferSubTab; label: string; count: number }[] = [
    { key: "published", label: "Опубликованные", count: publishedCount },
    { key: "import", label: "Импорт предложений", count: 0 },
    { key: "candidates", label: "Кандидаты предложений", count: candidatesCount },
    { key: "rejected", label: "Отклонённые", count: rejectedCount },
    { key: "duplicates", label: "Дубликаты", count: duplicateCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={[
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              subTab === t.key ?
                "border-black/15 bg-black/[0.06] text-black"
              : "border-black/10 bg-white text-black/55 hover:text-black/75",
            ].join(" ")}
          >
            {t.label}
            <span className="text-black/45"> ({t.count})</span>
          </button>
        ))}
      </div>

      {subTab === "published" ?
        <AdminCatalogPublishedOffersPanel onChanged={refresh} />
      : null}

      {subTab === "import" ?
        <AdminCatalogOfferImportClient onChanged={refresh} onGoToCandidates={() => setSubTab("candidates")} />
      : null}

      {subTab === "candidates" ?
        <AdminCatalogSourceOfferDraftsPanel
          embedded
          queueMode="candidates"
          onChanged={refresh}
          refreshSignal={draftRefresh}
        />
      : null}

      {subTab === "rejected" ?
        <AdminCatalogSourceOfferDraftsPanel
          embedded
          queueMode="rejected"
          onChanged={refresh}
          refreshSignal={draftRefresh}
        />
      : null}

      {subTab === "duplicates" ?
        <AdminCatalogSourceOfferDraftsPanel
          embedded
          queueMode="duplicate"
          onChanged={refresh}
          refreshSignal={draftRefresh}
        />
      : null}
    </div>
  );
}
