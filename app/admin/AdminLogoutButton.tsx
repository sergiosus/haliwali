"use client";

import { useState } from "react";

export default function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      className="h-10 rounded-full border border-black/20 bg-white px-4 text-sm font-semibold text-black hover:bg-black/5 disabled:opacity-60"
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void (async () => {
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
        })();
      }}
    >
      {busy ? "Выход…" : "Выйти"}
    </button>
  );
}
