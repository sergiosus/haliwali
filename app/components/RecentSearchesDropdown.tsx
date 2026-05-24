"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearRecentSearches,
  readRecentSearches,
  RECENT_SEARCHES_CHANGED_EVENT,
} from "../lib/recentSearches";

function RecentSearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}

export function useRecentSearches() {
  const [queries, setQueries] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setQueries(readRecentSearches());
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(RECENT_SEARCHES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RECENT_SEARCHES_CHANGED_EVENT, onChange);
  }, [refresh]);

  return { queries, refresh, clear: clearRecentSearches };
}

type RecentSearchesDropdownProps = {
  open: boolean;
  onPick: (query: string) => void;
  className?: string;
  listClassName?: string;
};

/** Recent searches list — mount only when `open` and input is empty (caller gates visibility). */
export function RecentSearchesDropdown({
  open,
  onPick,
  className = "",
  listClassName = "",
}: RecentSearchesDropdownProps) {
  const { queries, refresh, clear } = useRecentSearches();

  if (!open || queries.length === 0) return null;

  return (
    <div
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 ${className}`}
      role="group"
      aria-label="Недавние поиски"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
          Недавние поиски
        </div>
        <button
          type="button"
          onClick={() => {
            clear();
            refresh();
          }}
          className="shrink-0 text-[11px] font-medium text-black/45 underline-offset-2 transition-colors hover:text-black/70 hover:underline"
        >
          Очистить
        </button>
      </div>
      <ul className={`max-h-[min(50vh,16rem)] overflow-y-auto ${listClassName}`}>
        {queries.map((query) => (
          <li key={query}>
            <button
              type="button"
              className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-sm text-black/85 transition-colors hover:bg-orange-50"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                onPick(query);
              }}
            >
              <RecentSearchIcon className="h-4 w-4 shrink-0 text-black/35" />
              <span className="min-w-0 truncate font-medium">{query}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
