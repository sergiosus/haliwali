"use client";

import { useEffect, useId, useRef, useState } from "react";

export function OfferSearchQueryAutocomplete({
  value,
  onChange,
  onSubmit,
  history,
  onRemoveHistoryItem,
  onClearHistory,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  history: string[];
  onRemoveHistoryItem: (q: string) => void;
  onClearHistory: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const filtered =
    value.trim().length >= 1 ?
      history.filter((h) => h.toLowerCase().includes(value.trim().toLowerCase()))
    : history;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input
        type="search"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onSubmit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
      />
      {open && filtered.length > 0 ?
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((item) => (
            <li
              key={item}
              className="flex items-center gap-1 px-2 py-0.5 hover:bg-black/[0.04]"
              role="option"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-black"
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
              <button
                type="button"
                title="Удалить из истории"
                className="shrink-0 rounded px-2 py-1 text-xs text-black/40 hover:bg-black/10 hover:text-black"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveHistoryItem(item);
                }}
              >
                ×
              </button>
            </li>
          ))}
          {history.length > 0 ?
            <li className="border-t border-black/8 px-2 py-1">
              <button
                type="button"
                className="w-full rounded-lg py-1.5 text-xs text-black/50 hover:bg-black/[0.04]"
                onClick={() => {
                  onClearHistory();
                  setOpen(false);
                }}
              >
                Очистить историю поиска
              </button>
            </li>
          : null}
        </ul>
      : null}
      <datalist id={listId}>
        {history.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
    </div>
  );
}
