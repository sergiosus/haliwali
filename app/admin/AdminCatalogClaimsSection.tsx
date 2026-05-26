"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CatalogCompanyClaimRequest } from "../lib/catalogTypes";

export function AdminCatalogClaimsSection() {
  const [claims, setClaims] = useState<CatalogCompanyClaimRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch("/api/admin/catalog/companies/claims", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { claims?: CatalogCompanyClaimRequest[] }) => setClaims(d.claims ?? []))
      .catch(() => setClaims([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = claims.filter((c) => c.status === "pending");
  const recent = claims.filter((c) => c.status !== "pending").slice(0, 8);

  async function review(claimId: number, action: "approve" | "reject") {
    setBusyId(claimId);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/catalog/companies/claims", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, action }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка");
        return;
      }
      setMessage(action === "approve" ? "Компания подтверждена" : "Заявка отклонена");
      load();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  }

  if (claims.length === 0) return null;

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-black">Заявки на владение карточкой</h3>
      <p className="mt-1 text-xs text-black/45">
        После одобрения компания получает статус «Подтверждённая» и доступ к «Написать».
      </p>
      {message ?
        <p className="mt-2 text-xs font-medium text-black/60">{message}</p>
      : null}
      {pending.length === 0 ?
        <p className="mt-3 text-xs text-black/40">Нет заявок на рассмотрении</p>
      : (
        <ul className="mt-3 space-y-2">
          {pending.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium text-black">{c.companyName ?? `Компания #${c.companyId}`}</span>
                {c.companySlug ?
                  <Link
                    href={`/catalogs/company/${c.companySlug}`}
                    target="_blank"
                    className="ml-2 text-xs text-black/45 underline"
                  >
                    карточка
                  </Link>
                : null}
                <p className="mt-0.5 text-xs text-black/45">
                  Пользователь: {c.userId}
                  {c.proofType ? ` · ${c.proofType}` : ""}
                </p>
                {c.message ?
                  <p className="mt-1 text-xs text-black/55">{c.message}</p>
                : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void review(c.id, "approve")}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-40"
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void review(c.id, "reject")}
                  className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium disabled:opacity-40"
                >
                  Отклонить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 ?
        <ul className="mt-4 space-y-1 border-t border-black/[0.06] pt-3 text-xs text-black/40">
          {recent.map((c) => (
            <li key={c.id}>
              {c.companyName ?? `#${c.companyId}`} —{" "}
              {c.status === "approved" ? "одобрено" : c.status === "rejected" ? "отклонено" : c.status}
            </li>
          ))}
        </ul>
      : null}
    </section>
  );
}
