"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketplaceProviderId } from "../lib/externalMarketplaceProviders";
import {
  MARKETPLACE_DEFAULT_EXPANDED_GROUP_IDS,
  MARKETPLACE_REGION_GROUPS,
  sanitizeSelectedProviderIds,
} from "../lib/marketplaceProviderGateway";
import {
  readExpandedGroupIds,
  writeExpandedGroupIds,
} from "../lib/marketplaceSelectionStorage";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-black/40 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketplaceProviderFilters({
  selectedIds,
  onSelectedChange,
}: {
  selectedIds: readonly MarketplaceProviderId[];
  onSelectedChange: (ids: MarketplaceProviderId[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(MARKETPLACE_DEFAULT_EXPANDED_GROUP_IDS));

  useEffect(() => {
    setExpanded(new Set(readExpandedGroupIds(MARKETPLACE_DEFAULT_EXPANDED_GROUP_IDS)));
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const persistExpanded = useCallback((next: Set<string>) => {
    setExpanded(next);
    writeExpandedGroupIds([...next]);
  }, []);

  const toggleGroupExpanded = (groupId: string) => {
    const next = new Set(expanded);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    persistExpanded(next);
  };

  const setGroupSelection = (groupId: string, selectAll: boolean) => {
    const group = MARKETPLACE_REGION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const ids = group.providers.map((p) => p.id);
    const next = new Set(selectedSet);
    for (const id of ids) {
      if (selectAll) next.add(id);
      else next.delete(id);
    }
    onSelectedChange(sanitizeSelectedProviderIds([...next]));
  };

  const toggleProvider = (id: MarketplaceProviderId) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(sanitizeSelectedProviderIds([...next]));
  };

  const totalSelected = selectedSet.size;
  const totalProviders = MARKETPLACE_REGION_GROUPS.reduce((n, g) => n + g.providers.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
        <p className="text-sm font-semibold text-black">Площадки</p>
        <span className="text-xs font-medium text-black/45">
          {totalSelected}/{totalProviders}
        </span>
      </div>

      {MARKETPLACE_REGION_GROUPS.map((group) => {
        const groupIds = group.providers.map((p) => p.id);
        const selectedInGroup = groupIds.filter((id) => selectedSet.has(id)).length;
        const allSelected = selectedInGroup === groupIds.length;
        const someSelected = selectedInGroup > 0 && !allSelected;
        const isOpen = expanded.has(group.id);

        return (
          <div
            key={group.id}
            className="overflow-hidden rounded-xl border border-black/[0.06] bg-white"
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleGroupExpanded(group.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={isOpen}
              >
                <ChevronIcon open={isOpen} />
                <span className="text-sm font-semibold text-black">{group.title}</span>
                <span className="text-[11px] font-medium text-black/40">
                  {selectedInGroup}/{groupIds.length}
                </span>
              </button>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-black/50">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-black/20 text-orange-600 focus:ring-orange-200"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => setGroupSelection(group.id, !allSelected)}
                />
                <span className="whitespace-nowrap">Все</span>
              </label>
            </div>

            {isOpen ?
              <ul className="border-t border-black/[0.04] px-2 py-2">
                {group.providers.map((provider) => (
                  <li key={provider.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-black/[0.02]">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-black/20 text-orange-600 focus:ring-orange-200"
                        checked={selectedSet.has(provider.id)}
                        onChange={() => toggleProvider(provider.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                            style={{ backgroundColor: provider.brandColor }}
                            aria-hidden="true"
                          >
                            {provider.abbr}
                          </span>
                          <span className="text-sm font-medium text-black/85">{provider.name}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-black/45">
                          {provider.deliveryNote}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            : null}
          </div>
        );
      })}
    </div>
  );
}
