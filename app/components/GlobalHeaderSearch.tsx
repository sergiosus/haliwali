"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { globalSearchScopeToQueryParams } from "../lib/globalSearchScopeParams";
import type { GlobalSearchSuggestItem } from "../lib/globalSearchTypes";
import { searchDebugLog } from "../lib/searchMatch";
import { useSearchScope } from "../lib/useStoredCity";

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

function listingTypeShort(listingType: GlobalSearchSuggestItem["listingType"]): string | null {
  if (listingType === "task") return "Задача";
  if (listingType === "service") return "Услуга";
  if (listingType === "product") return "Товар";
  return null;
}

export function GlobalHeaderSearch({
  className = "",
  inputClassName,
  iconLeftClassName = "left-3.5 md:left-5",
}: {
  className?: string;
  inputClassName?: string;
  iconLeftClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const searchScope = useSearchScope();
  const listId = useId();

  const isHome = pathname === "/";
  const isSearchPage = pathname === "/search";

  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<GlobalSearchSuggestItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestSeqRef = useRef(0);

  const qFromUrl = sp.get("q") ?? "";
  useEffect(() => {
    if (isHome || isSearchPage) {
      queueMicrotask(() => setQ(qFromUrl));
    } else {
      queueMicrotask(() => setQ(""));
    }
  }, [isHome, isSearchPage, qFromUrl]);

  const replaceHomeQ = useCallback(
    (raw: string) => {
      if (!isHome) return;
      const next = new URLSearchParams();
      for (const [k, v] of sp.entries()) {
        if (k === "q") continue;
        next.set(k, v);
      }
      const t = raw.trim();
      if (t) next.set("q", t);
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : "/");
    },
    [isHome, router, sp],
  );

  const replaceSearchPageQ = useCallback(
    (raw: string) => {
      if (!isSearchPage) return;
      const next = new URLSearchParams();
      for (const [k, v] of sp.entries()) {
        if (k === "q") continue;
        next.set(k, v);
      }
      const t = raw.trim();
      if (t) next.set("q", t);
      const qs = next.toString();
      router.replace(qs ? `/search?${qs}` : "/search");
    },
    [isSearchPage, router, sp],
  );

  const goSearch = useCallback(
    (raw: string) => {
      const t = raw.trim();
      if (!t) return;
      setSuggestOpen(false);
      const p = new URLSearchParams({ q: t });
      const scopeP = globalSearchScopeToQueryParams(searchScope);
      for (const [k, v] of scopeP.entries()) p.set(k, v);
      router.push(`/search?${p.toString()}`);
    },
    [router, searchScope],
  );

  const fetchSuggestions = useCallback(
    async (raw: string) => {
      const t = raw.trim();
      if (t.length < 2) {
        suggestAbortRef.current?.abort();
        suggestAbortRef.current = null;
        setSuggestions([]);
        setSuggestLoading(false);
        return;
      }

      const seq = ++suggestSeqRef.current;
      suggestAbortRef.current?.abort();
      const ac = new AbortController();
      suggestAbortRef.current = ac;

      if (seq === suggestSeqRef.current) setSuggestions([]);
      setSuggestLoading(true);

      try {
        const p = new URLSearchParams({ q: t });
        const scopeP = globalSearchScopeToQueryParams(searchScope);
        for (const [k, v] of scopeP.entries()) p.set(k, v);
        const r = await fetch(`/api/search/suggest?${p.toString()}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (seq !== suggestSeqRef.current || ac.signal.aborted) return;
        const d = (await r.json()) as { ok?: boolean; suggestions?: GlobalSearchSuggestItem[] };
        if (seq !== suggestSeqRef.current || ac.signal.aborted) return;
        const raw = r.ok && d.ok && Array.isArray(d.suggestions) ? d.suggestions : [];
        const listingOnly = raw.filter((s) => s.kind === "listing").slice(0, 5);
        setSuggestions(listingOnly);
        if (listingOnly.length === 0) setSuggestOpen(false);
        searchDebugLog("suggest-header", {
          raw: t,
          listingCount: listingOnly.length,
        });
      } catch (e) {
        if (seq !== suggestSeqRef.current || ac.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSuggestions([]);
        setSuggestOpen(false);
      } finally {
        if (seq === suggestSeqRef.current) setSuggestLoading(false);
      }
    },
    [searchScope],
  );

  function onInputChange(value: string) {
    setQ(value);
    setActiveIdx(-1);
    setSuggestions([]);
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    suggestSeqRef.current += 1;
    if (isHome) replaceHomeQ(value);
    if (isSearchPage) replaceSearchPageQ(value);
    if (value.trim().length >= 2) {
      setSuggestOpen(true);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void fetchSuggestions(value);
        debounceRef.current = null;
      }, 180);
    } else {
      setSuggestOpen(false);
      setSuggestions([]);
      setSuggestLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setSuggestOpen(true);
      setActiveIdx((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      setSuggestOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      goSearch(suggestions[activeIdx]!.query);
      return;
    }
    goSearch(q);
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      suggestAbortRef.current?.abort();
    };
  }, []);

  const inputCls =
    inputClassName ??
    "h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm text-black outline-none placeholder:text-black/40 focus:border-gray-300 focus:ring-2 focus:ring-[rgba(255,122,0,0.2)]";

  const showSuggestPanel =
    suggestOpen && q.trim().length >= 2 && (suggestLoading || suggestions.length > 0);

  return (
    <div ref={wrapRef} className={`relative w-full ${className}`}>
      <SearchIcon
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 ${iconLeftClassName}`}
      />
      <input
        type="search"
        value={q}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (q.trim().length >= 2) {
            setSuggestOpen(true);
            if (suggestions.length === 0) void fetchSuggestions(q);
          }
        }}
        placeholder="Поиск по объявлениям"
        className={inputCls}
        role="combobox"
        aria-expanded={showSuggestPanel}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {showSuggestPanel ?
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[200] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          {suggestLoading && suggestions.length === 0 ?
            <div className="px-3 py-2 text-sm text-black/50">Ищем…</div>
          : suggestions.length > 0 ?
            <ul className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((s, idx) => {
                const typeLine = listingTypeShort(s.listingType);
                return (
                  <li key={`${s.query}-${idx}`} role="option" aria-selected={idx === activeIdx}>
                    <button
                      type="button"
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-orange-50 ${
                        idx === activeIdx ? "bg-orange-50" : ""
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goSearch(s.query)}
                    >
                      <span className="line-clamp-2 text-black/90">{s.label}</span>
                      {typeLine ?
                        <span className="text-[11px] font-medium text-black/45">{typeLine}</span>
                      : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          : null}
        </div>
      : null}
    </div>
  );
}
