"use client";

import { useState } from "react";
import type { OfferListingSourceId } from "../../../lib/catalogSourceOfferTypes";
import {
  defaultAdminSearchSourceIds,
  getCatalogSourceRegistryEntry,
  type CatalogSourceRegistryEntry,
} from "../../../lib/catalogSourceRegistry";

export type OfferSearchSourceSelectionState = {
  sources: OfferListingSourceId[];
  allActive: boolean;
};

export function defaultOfferSearchSourceSelection(): OfferSearchSourceSelectionState {
  return { sources: defaultAdminSearchSourceIds(), allActive: false };
}

const ACTIVE_IDS = new Set<OfferListingSourceId>(["avito", "drom"]);
const LATER_IDS = new Set<OfferListingSourceId>(["auto_ru", "youla", "vk"]);

function marketplaceEntry(id: OfferListingSourceId): CatalogSourceRegistryEntry | undefined {
  return getCatalogSourceRegistryEntry(id);
}

export function OfferSearchSourceCheckboxes({
  value,
  onChange,
  disabled,
}: {
  value: OfferSearchSourceSelectionState;
  onChange: (next: OfferSearchSourceSelectionState) => void;
  disabled?: boolean;
}) {
  const [laterOpen, setLaterOpen] = useState(false);

  const toggle = (id: OfferListingSourceId, checked: boolean) => {
    if (disabled) return;
    const entry = marketplaceEntry(id);
    if (!entry || entry.status === "disabled" || entry.status === "future") return;
    if (!entry.supportsSearch) return;

    let next = new Set(value.sources);
    if (checked) next.add(id);
    else next.delete(id);
    if (next.size === 0) next.add("avito");
    onChange({ sources: [...next], allActive: false });
  };

  const activeEntries = (["avito", "drom"] as const)
    .map((id) => marketplaceEntry(id))
    .filter((e): e is CatalogSourceRegistryEntry => Boolean(e));

  const laterEntries = (["auto_ru", "youla", "vk"] as const)
    .map((id) => marketplaceEntry(id))
    .filter((e): e is CatalogSourceRegistryEntry => Boolean(e));

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm text-black/60">Источники поиска</legend>
      <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-3">
        {activeEntries.map((entry) => {
          const id = entry.id as OfferListingSourceId;
          if (!ACTIVE_IDS.has(id)) return null;
          const isDisabled = entry.status === "disabled" || entry.status === "future";
          const checked = value.sources.includes(id);

          return (
            <label
              key={entry.id}
              className={[
                "flex cursor-pointer items-start gap-2 text-sm",
                isDisabled ? "cursor-not-allowed opacity-55" : "",
              ].join(" ")}
              title={entry.note}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                disabled={isDisabled || disabled}
                onChange={(e) => toggle(id, e.target.checked)}
              />
              <span>
                <span className="font-medium text-black">{entry.label}</span>
                {id === "drom" ?
                  <span className="ml-1 text-xs text-amber-800">(эксп.)</span>
                : null}
                {entry.note ?
                  <span className="mt-0.5 block text-xs text-black/45">{entry.note}</span>
                : null}
              </span>
            </label>
          );
        })}

        <div className="border-t border-black/10 pt-2">
          <button
            type="button"
            className="text-xs font-medium text-black/55 underline"
            onClick={() => setLaterOpen((v) => !v)}
          >
            {laterOpen ? "Скрыть" : "Площадки позже"}
          </button>
          {laterOpen ?
            <div className="mt-2 flex flex-col gap-2">
              {laterEntries.map((entry) => {
                const id = entry.id as OfferListingSourceId;
                if (!LATER_IDS.has(id)) return null;
                return (
                  <label
                    key={entry.id}
                    className="flex cursor-not-allowed items-start gap-2 text-sm opacity-55"
                    title={entry.note}
                  >
                    <input type="checkbox" className="mt-0.5" disabled checked={false} />
                    <span>
                      <span className="font-medium text-black">{entry.label}</span>
                      {entry.note ?
                        <span className="mt-0.5 block text-xs text-black/45">{entry.note}</span>
                      : null}
                    </span>
                  </label>
                );
              })}
            </div>
          : null}
        </div>
      </div>
    </fieldset>
  );
}
