"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PasswordChangeModal } from "../components/PasswordChangeModal";

export default function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;

    function onDocClick(e: MouseEvent) {
      const target = e.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string };
      window.location.href = typeof data.redirect === "string" ? data.redirect : "/admin";
    } catch {
      window.location.href = "/admin";
    }
  }

  return (
    <>
      <div ref={menuRef} className="relative max-w-full">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          className="max-w-[min(18rem,calc(100vw-2rem))] cursor-pointer text-left"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-black/80 hover:underline">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-black/[0.04] text-[11px] text-black/65">
              А
            </span>
            <span className="min-w-0 truncate">Админ Haliwali</span>
            <span className="shrink-0 text-black/50" aria-hidden="true">
              ▾
            </span>
          </span>
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-full z-[80] w-[min(220px,calc(100vw-2rem))] pt-2">
            <div id={menuId} role="menu" className="rounded-xl border border-black/10 bg-white p-2 shadow-lg">
              <button
                type="button"
                role="menuitem"
                className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04]"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setPasswordOpen(true);
                }}
              >
                Сменить пароль
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-black/80 hover:bg-black/[0.04] disabled:opacity-60"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  void handleLogout();
                }}
              >
                {busy ? "Выход…" : "Выйти"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <PasswordChangeModal
        apiPath="/api/admin/change-password"
        dialogTitle="Смена пароля администратора"
        showTrigger={false}
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </>
  );
}
