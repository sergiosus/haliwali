"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "cookieAccepted";
/** Earlier builds used this key; still read it so users are not prompted again. */
const LEGACY_STORAGE_KEY = "cookie_consent";

function readConsentAccepted(): boolean {
  try {
    return (
      localStorage.getItem(STORAGE_KEY) === "true" || localStorage.getItem(LEGACY_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function CookieConsentBanner() {
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setShow(!readConsentAccepted());
    });
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* quota / private mode */
    }
    setShow(false);
  };

  if (show !== true) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] px-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0"
      role="dialog"
      aria-modal="false"
      aria-label="Уведомление об использовании cookie"
    >
      <div
        className={[
          "mx-auto flex max-w-[960px] flex-col gap-3 rounded-t-[12px] border border-b-0 border-black/[0.07] bg-[#fafafa] px-4 py-2.5 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] sm:px-5 sm:py-3 md:flex-row md:items-center md:gap-4",
        ].join(" ")}
      >
        <p className="min-w-0 flex-1 text-sm leading-snug text-black/70">
          Мы используем cookie-файлы для работы сайта и улучшения сервиса. Продолжая пользоваться сайтом, вы
          соглашаетесь с их использованием.{" "}
          <Link
            href="/privacy"
            className="font-medium text-black/80 underline decoration-black/20 underline-offset-2 transition-colors hover:text-black hover:decoration-black/40 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9900]/35"
          >
            Политика конфиденциальности
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2 md:self-auto">
          <button
            type="button"
            onClick={accept}
            className="h-9 min-w-[7.5rem] shrink-0 rounded-lg bg-[#ff9900] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e68a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9900]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]"
          >
            Понятно
          </button>
          <button
            type="button"
            onClick={accept}
            aria-label="Закрыть уведомление"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-lg leading-none text-black/55 transition-colors hover:border-black/15 hover:bg-black/[0.03] hover:text-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9900]/30"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
