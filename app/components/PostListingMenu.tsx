"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const POST_OPTIONS = [
  { href: "/post/task", label: "Создать задачу" },
  { href: "/post/service", label: "Предложить услугу" },
  { href: "/post/product", label: "Продать товар" },
] as const;

const triggerClassName =
  "inline-flex w-full max-w-full items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 md:w-auto";

export function PostListingMenu() {
  const [open, setOpen] = useState(false);
  const [useHover, setUseHover] = useState(false);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    function sync() {
      const touchLike =
        Number(navigator.maxTouchPoints) > 0 || (mqCoarse.matches && !mq.matches);
      setUseHover(!touchLike && mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    mqCoarse.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      mqCoarse.removeEventListener("change", sync);
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  function clearHoverCloseTimer() {
    if (hoverCloseTimerRef.current != null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      close();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, close]);

  return (
    <div
      ref={rootRef}
      className="relative w-full min-w-0 max-w-full md:w-auto"
      onMouseEnter={() => {
        if (!useHover) return;
        clearHoverCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (!useHover) return;
        clearHoverCloseTimer();
        hoverCloseTimerRef.current = window.setTimeout(() => {
          setOpen(false);
          hoverCloseTimerRef.current = null;
        }, 200);
      }}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        Разместить объявление
      </button>

      {open ?
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 right-0 top-full z-[80] pt-2 md:left-auto md:right-0 md:min-w-[220px]"
        >
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg">
            {POST_OPTIONS.map((opt) => (
              <Link
                key={opt.href}
                href={opt.href}
                role="menuitem"
                className="block px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-orange-50 hover:text-orange-700"
                onClick={close}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      : null}
    </div>
  );
}
