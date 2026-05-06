"use client";

import { useMemo, useRef, useState } from "react";

export function CityCombobox({
  value,
  onChange,
  options,
  placeholder = "Поиск города",
  disabled = false,
  inputClassName,
  className,
  allowCustomCity = false,
  showChevron = true,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
  className?: string;
  /** Если из списка нет совпадения — можно зафиксировать ввод (Enter или кнопка) */
  allowCustomCity?: boolean;
  /** Стрелка только внутри триггера — можно отключить для минималистичного вида */
  showChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = draft.trim().toLowerCase();
  const selectedLabel = value ? value : "Вся Россия";

  const uniqueOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of options) {
      const t = String(o ?? "").trim();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out.sort((a, b) => a.localeCompare(b, "ru"));
  }, [options]);

  const matches = useMemo(() => {
    // Never show the currently selected value in the dropdown list.
    const base = uniqueOptions.filter((c) => c !== value);
    if (!normalizedQuery) return base;
    const starts: string[] = [];
    const contains: string[] = [];
    for (const c of base) {
      const lc = c.toLowerCase();
      if (lc.startsWith(normalizedQuery)) starts.push(c);
      else if (lc.includes(normalizedQuery)) contains.push(c);
    }
    return [...starts, ...contains];
  }, [normalizedQuery, uniqueOptions, value]);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setDraft("");
  }

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden"
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Escape") {
          setOpen(false);
          setDraft("");
        }
      }}
      onBlur={(e) => {
        if (!rootRef.current) return;
        if (rootRef.current.contains(e.relatedTarget as Node | null)) return;
        setOpen(false);
        setDraft("");
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={
          inputClassName ??
          [
            "flex h-11 min-h-11 min-w-0 max-w-full w-full overflow-hidden rounded-[10px] border border-black/10 bg-white px-3 text-sm outline-none",
            "text-left hover:bg-black/[0.02]",
            disabled ? "cursor-not-allowed bg-gray-50 text-gray-500" : "cursor-pointer",
            className ?? "",
          ].join(" ")
        }
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 w-full items-center justify-between gap-2">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className={value ? "text-black/85" : "text-black/70"}>{selectedLabel}</span>
          </span>
          {showChevron ? <span className="shrink-0 text-black/35">▾</span> : null}
        </span>
      </button>

      {open ? (
        <div className="mt-2 w-full rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="p-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-black/25"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-black/[0.04]"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => commit("")}
            >
              <span className="text-black/80">Вся Россия</span>
              {!value ? <span className="text-black/30">✓</span> : null}
            </button>

            {matches.length === 0 ? (
              <div className="px-3 py-2 text-sm text-black/50">Город не найден</div>
            ) : (
              matches.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-black/[0.04]"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => commit(c)}
                >
                  <span className="text-black/85">{c}</span>
                  {c === value ? <span className="text-black/30">✓</span> : null}
                </button>
              ))
            )}

            {allowCustomCity && normalizedQuery && matches.length === 0 ? (
              <button
                type="button"
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-orange-700 hover:bg-orange-50"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => commit(draft.trim())}
              >
                Использовать «{draft.trim()}»
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

