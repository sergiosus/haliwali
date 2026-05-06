 "use client";

import Link from "next/link";
import { useEffect } from "react";

export function AuthRequiredModal({
  open,
  onClose,
  nextPath,
}: {
  open: boolean;
  onClose: () => void;
  nextPath: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const safeNext = nextPath.startsWith("/") ? nextPath : "/";
  const loginHref = `/login?next=${encodeURIComponent(safeNext)}`;
  const regHref = `/login?tab=register&next=${encodeURIComponent(safeNext)}`;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Войдите или зарегистрируйтесь"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-3xl border border-black/10 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-xl leading-none text-gray-600 hover:bg-gray-50"
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="text-lg font-semibold tracking-tight">Войдите или зарегистрируйтесь</div>
        <div className="mt-2 text-sm text-black/60">Чтобы написать продавцу или посмотреть телефон</div>

        <div className="mt-5 grid gap-2">
          <Link
            href={loginHref}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Войти
          </Link>
          <Link
            href={regHref}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5"
          >
            Регистрация
          </Link>
        </div>
      </div>
    </div>
  );
}
