"use client";

import { useState } from "react";
import { AdminCatalogOfferCsvImportSection } from "./AdminCatalogOfferCsvImportSection";
import { AdminCatalogOfferLinksImportSection } from "./AdminCatalogOfferLinksImportSection";
import { AdminCatalogOfferSearchImportSection } from "./AdminCatalogOfferSearchImportSection";
import { AdminCatalogOfferTextImportSection } from "./AdminCatalogOfferTextImportSection";

type OfferImportMode = "links" | "search" | "text" | "csv";

/** Offer-only import forms — writes to catalog_source_offer_import_drafts via parse API. */
export function AdminCatalogOfferImportClient({
  onChanged,
  onGoToCandidates,
}: {
  onChanged?: () => void;
  onGoToCandidates?: () => void;
}) {
  const [mode, setMode] = useState<OfferImportMode>("links");

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
        <h3 className="text-base font-semibold">Импорт предложений</h3>
        <p className="mt-1 text-sm text-black/55">
          Парсер объявлений с внешних площадок. Кандидаты сохраняются только в очередь предложений, не в каталог
          компаний.
        </p>
      </div>

      <div className="sticky top-[6.5rem] z-30 -mx-1 flex min-w-0 flex-wrap gap-2 border-b border-black/5 bg-white/95 px-1 pb-3 pt-1 backdrop-blur-sm">
        {modeBtn("links", "По ссылкам")}
        {modeBtn("search", "По поисковому запросу")}
        {modeBtn("text", "Из текста / VK")}
        {modeBtn("csv", "CSV")}
      </div>

      <div className="w-full min-w-0 overflow-visible rounded-3xl border border-black/10 bg-white p-4 sm:p-5">
        {mode === "links" ?
          <AdminCatalogOfferLinksImportSection onChanged={onChanged} onGoToDrafts={onGoToCandidates} />
        : null}

        {mode === "search" ?
          <AdminCatalogOfferSearchImportSection onChanged={onChanged} onGoToDrafts={onGoToCandidates} />
        : null}

        {mode === "text" ?
          <AdminCatalogOfferTextImportSection onChanged={onChanged} onGoToDrafts={onGoToCandidates} />
        : null}

        {mode === "csv" ?
          <AdminCatalogOfferCsvImportSection onChanged={onChanged} onGoToDrafts={onGoToCandidates} />
        : null}
      </div>
    </div>
  );
}
