"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatSettlementPickerLine,
  fetchCitiesFromApi,
  type SettlementSearchRow,
} from "../../lib/settlementCitySearch";
import type { CatalogDiscoverLocation } from "../../lib/catalogDiscoverLocationStorage";
import { buildSearchVariants } from "../../lib/utils/keyboardLayout";

type Props = {
  value: CatalogDiscoverLocation | null;
  onChange: (next: CatalogDiscoverLocation | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
  /** Persist selection via catalogDiscoverLocationStorage when parent handles it */
  onPersist?: (next: CatalogDiscoverLocation) => void;
};

function rowToLocation(row: SettlementSearchRow): CatalogDiscoverLocation {
  return {
    city: row.name,
    region: row.region,
    displayName: formatSettlementPickerLine(row.name, row.region),
    latitude: row.lat,
    longitude: row.lng,
    source: "suggestion",
    settlementId: row.id,
  };
}

function rankRow(row: SettlementSearchRow, query: string): number {
  const variants = buildSearchVariants(query);
  const n = row.name.toLowerCase();
  const r = row.region.toLowerCase();
  let best = 9;
  for (const ql of variants) {
    if (!ql) continue;
    if (n === ql) best = Math.min(best, 0);
    else if (n.startsWith(ql)) best = Math.min(best, 1);
    else if (n.includes(ql)) best = Math.min(best, 2);
    else if (r.includes(ql)) best = Math.min(best, 3);
  }
  return best;
}

export function SettlementLocationField({
  value,
  onChange,
  disabled,
  label = "Город / регион",
  placeholder = "Начните вводить название…",
  required,
  onPersist,
}: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SettlementSearchRow[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayValue = value?.displayName?.trim() || (value ? formatSettlementPickerLine(value.city, value.region) : "");

  useEffect(() => {
    if (!open && value && !draft) {
      setDraft(displayValue);
    }
  }, [displayValue, open, value, draft]);

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(() => {
      void fetchCitiesFromApi(trimmed)
        .then((list) => {
          setRows(list);
          setLoading(false);
        })
        .catch(() => {
          setRows([]);
          setError("Города временно недоступны");
          setLoading(false);
        });
    }, 250);
  }, []);

  const suggestions = useMemo(() => {
    const q = draft.trim();
    if (q.length < 2) return [];
    return [...rows]
      .map((r) => ({ r, rank: rankRow(r, q) }))
      .filter((x) => x.rank < 999)
      .sort((a, b) => a.rank - b.rank || a.r.name.localeCompare(b.r.name, "ru"))
      .slice(0, 8)
      .map((x) => x.r);
  }, [rows, draft]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(row: SettlementSearchRow) {
    const loc = rowToLocation(row);
    onChange(loc);
    onPersist?.(loc);
    setDraft(loc.displayName);
    setOpen(false);
    setRows([]);
  }

  function clear() {
    onChange(null);
    setDraft("");
    setRows([]);
  }

  return (
    <label className="block text-sm">
      <span className="text-black/60">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <div ref={wrapRef} className="relative mt-1">
        <input
          type="search"
          value={open ? draft : displayValue || draft}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-sm outline-none placeholder:text-black/35 focus:border-black/25 focus:ring-2 focus:ring-black/[0.04] disabled:opacity-50"
          onFocus={() => {
            setOpen(true);
            setDraft(displayValue || draft);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            setOpen(true);
            if (!v.trim()) onChange(null);
            runSearch(v);
          }}
        />
        {value && !disabled ?
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs text-black/45 hover:bg-black/5 hover:text-black/70"
            onClick={clear}
            aria-label="Сбросить"
          >
            ×
          </button>
        : null}

        {open && draft.trim().length >= 2 ?
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-black/10 bg-white p-1 shadow-lg">
            {loading ?
              <div className="px-3 py-2 text-sm text-black/50">Поиск…</div>
            : error ?
              <div className="px-3 py-2 text-sm text-red-700">{error}</div>
            : suggestions.length === 0 ?
              <div className="px-3 py-2 text-sm text-black/50">Ничего не найдено</div>
            : suggestions.map((row) => (
              <button
                key={`${row.id ?? row.name}-${row.region}-${row.lat}`}
                type="button"
                className="flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-black/85 hover:bg-black/[0.04]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(row)}
              >
                {formatSettlementPickerLine(row.name, row.region)}
              </button>
            ))}
          </div>
        : null}
      </div>
      {value ?
        <p className="mt-1 text-xs text-black/45">Выбрано: {value.displayName}</p>
      : null}
    </label>
  );
}
