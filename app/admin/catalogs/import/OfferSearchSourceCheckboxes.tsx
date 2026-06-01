"use client";

import type { CatalogSourceName, OfferListingSourceId } from "../../../lib/catalogSourceOfferTypes";
import {
  activeSearchMarketplaceIds,
  defaultAdminSearchSourceIds,
  getCatalogSourceRegistryEntry,
  listCatalogSourceRegistry,
  type CatalogSourceRegistryEntry,
} from "../../../lib/catalogSourceRegistry";

export type OfferSearchSourceSelectionState = {
  sources: OfferListingSourceId[];
  allActive: boolean;
};

export function defaultOfferSearchSourceSelection(): OfferSearchSourceSelectionState {
  return { sources: defaultAdminSearchSourceIds(), allActive: false };
}

function marketplaceEntries(): CatalogSourceRegistryEntry[] {
  return listCatalogSourceRegistry().filter(
    (e) =>
      e.id !== "all_active" &&
      e.id !== "all_sources_future" &&
      e.id !== "company_site" &&
      e.id !== "other",
  );
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
  const entries = marketplaceEntries();
  const futureEntry = getCatalogSourceRegistryEntry("all_sources_future");

  const toggle = (id: OfferListingSourceId, checked: boolean) => {
    if (disabled) return;
    const entry = getCatalogSourceRegistryEntry(id);
    if (!entry || entry.status === "disabled" || entry.status === "future") return;
    if (!entry.supportsSearch && entry.status !== "experimental") return;

    let next = new Set(value.sources);
    if (checked) next.add(id);
    else next.delete(id);
    onChange({ sources: [...next], allActive: false });
  };

  const selectAllActive = () => {
    if (disabled) return;
    onChange({ sources: activeSearchMarketplaceIds(), allActive: true });
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm text-black/60">Источники поиска</legend>
      <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-3">
        {entries.map((entry) => {
          const id = entry.id as OfferListingSourceId;
          const isDisabled = entry.status === "disabled" || entry.status === "future";
          const isExperimental = entry.status === "experimental";
          const canToggle =
            !isDisabled && (entry.supportsSearch || isExperimental);
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
                disabled={!canToggle || disabled}
                onChange={(e) => toggle(id, e.target.checked)}
              />
              <span>
                <span className="font-medium text-black">{entry.label}</span>
                {isExperimental ?
                  <span className="ml-1 text-xs text-amber-800">(эксп.)</span>
                : null}
                {isDisabled && entry.disabledReason === "captcha" ?
                  <span className="ml-1 text-xs text-black/45">— captcha</span>
                : null}
                {isDisabled && entry.disabledReason === "parser_not_implemented" ?
                  <span className="ml-1 text-xs text-black/45">— parser not implemented</span>
                : null}
              </span>
            </label>
          );
        })}

        <label className="flex cursor-pointer items-start gap-2 border-t border-black/10 pt-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value.allActive}
            disabled={disabled}
            onChange={() => selectAllActive()}
          />
          <span className="font-medium text-black">Все активные источники</span>
        </label>

        {futureEntry ?
          <label
            className="flex cursor-not-allowed items-start gap-2 text-sm opacity-50"
            title={futureEntry.note}
          >
            <input type="checkbox" className="mt-0.5" disabled checked={false} />
            <span>
              <span className="font-medium text-black">{futureEntry.label}</span>
              <span className="mt-0.5 block text-xs text-black/45">{futureEntry.note}</span>
            </span>
          </label>
        : null}
      </div>
    </fieldset>
  );
}
