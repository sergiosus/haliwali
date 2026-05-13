"use client";

/**
 * Lightweight install hint for Chromium “Add to Home screen”.
 *
 * PWA / installability safety (no custom service worker in this project):
 * - Do NOT register a service worker that caches HTML, /api/*, /chat, /account, /admin,
 *   authenticated pages, or private uploads — stale or leaked responses are a serious risk.
 * - Installability on modern Chrome Android uses the web app manifest + icons + HTTPS;
 *   we intentionally skip offline caching and aggressive SW strategies so normal browsing,
 *   auth, chat, and listings always hit the network and stay fresh after deploy.
 */
import { useCallback, useEffect, useState } from "react";

const DISMISS_SESSION_KEY = "haliwali_pwa_install_prompt_dismissed";

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function isBeforeInstallPromptEvent(e: Event): e is BeforeInstallPromptEventLike {
  return typeof (e as BeforeInstallPromptEventLike).prompt === "function";
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEventLike | null>(null);
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
    } catch {
      // ignore quota / private mode
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onBeforeInstallPrompt(e: Event) {
      // Required so the browser does not auto-show its mini-banner; we show our own control instead.
      e.preventDefault();
      if (isDesktopViewport()) return;
      try {
        if (sessionStorage.getItem(DISMISS_SESSION_KEY) === "1") return;
      } catch {
        // ignore
      }
      if (!isBeforeInstallPromptEvent(e)) return;
      setDeferred(e);
      setOpen(true);
    }

    function onAppInstalled() {
      setDeferred(null);
      setOpen(false);
    }

    function onResize() {
      if (isDesktopViewport()) setOpen(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const onInstallClick = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice.catch(() => {});
    } catch {
      // user dismissed native sheet or prompt failed
    }
    setDeferred(null);
    setOpen(false);
  }, [deferred]);

  if (!open || !deferred) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[42] flex max-w-[min(100vw-1.5rem,20rem)] flex-col items-end gap-1.5 p-0 lg:hidden"
      role="region"
      aria-label="Установка приложения"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white/95 px-2 py-1.5 text-xs text-black/80 shadow-md backdrop-blur-sm">
        <button
          type="button"
          className="rounded-xl bg-orange-500 px-2.5 py-1.5 font-semibold text-white shadow-sm hover:bg-orange-600"
          onClick={() => void onInstallClick()}
        >
          Установить Haliwali
        </button>
        <button
          type="button"
          className="rounded-xl px-2 py-1.5 font-medium text-black/55 hover:bg-black/[0.04]"
          onClick={dismiss}
          aria-label="Скрыть"
        >
          ×
        </button>
      </div>
    </div>
  );
}
