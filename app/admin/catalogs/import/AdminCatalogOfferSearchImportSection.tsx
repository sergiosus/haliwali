"use client";

import { useState } from "react";
import { AdminCatalogImportCandidatesSection } from "../AdminCatalogImportCandidatesSection";
import { OFFER_SOURCE_OPTIONS, type OfferSourceFilter } from "./offerImportUi";

/** Search-based offer discovery — offer fields and labels only. */
export function AdminCatalogOfferSearchImportSection({
  onChanged,
  onGoToDrafts,
}: {
  onChanged?: () => void;
  onGoToDrafts?: () => void;
}) {
  const [sourceFilter, setSourceFilter] = useState<OfferSourceFilter>("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">По поисковому запросу</h3>
        <p className="mt-1 text-sm text-black/55">
          Поиск объявлений на внешних площадках. Выберите найденные ссылки и создайте кандидатов предложений.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-black/60">Источник</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as OfferSourceFilter)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          >
            {OFFER_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Цена от, ₽</span>
          <input
            type="number"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-black/60">Цена до, ₽</span>
          <input
            type="number"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="100000"
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          />
        </label>
      </div>

      <AdminCatalogImportCandidatesSection
        compact
        hideShell
        offerOnly
        offerSourceFilter={sourceFilter}
        offerPriceMin={priceMin.trim() ? Number(priceMin) : undefined}
        offerPriceMax={priceMax.trim() ? Number(priceMax) : undefined}
        onChanged={onChanged}
        onGoToDrafts={onGoToDrafts}
      />
    </div>
  );
}
