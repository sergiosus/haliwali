"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  catalogCompanyOwnershipStatus,
  catalogCompanyOwnershipStatusLabel,
} from "../lib/catalogCompanyOrigin";
import type { CatalogCompanyClaimRequest } from "../lib/catalogTypes";

const PROOF_METHOD_LABELS: Record<CatalogCompanyClaimRequest["proofMethod"], string> = {
  domain_email: "Email на домене компании",
  official_phone: "Звонок по официальному телефону",
  document_screenshot: "Документ/скрин подтверждения",
  other: "Другое",
};

export function AdminCatalogClaimsSection({
  onPendingCountChange,
}: {
  onPendingCountChange?: (count: number) => void;
}) {
  const [claims, setClaims] = useState<CatalogCompanyClaimRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch("/api/admin/catalog/companies/claims", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { claims?: CatalogCompanyClaimRequest[] }) => {
        const next = d.claims ?? [];
        setClaims(next);
        onPendingCountChange?.(next.filter((claim) => claim.status === "pending").length);
      })
      .catch(() => {
        setClaims([]);
        onPendingCountChange?.(0);
      });
  }, [onPendingCountChange]);

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
      setMessage(action === "approve" ? "Подтверждение одобрено" : "Заявка отклонена");
      load();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-black">Заявки на владение карточкой ({pending.length})</h3>
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
            <li key={c.id} className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
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
                  Текущий статус:{" "}
                  {catalogCompanyOwnershipStatusLabel(
                    catalogCompanyOwnershipStatus({
                      origin: c.companyOrigin,
                      profileStatus: c.companyProfileStatus,
                      hasPendingClaim: c.status === "pending",
                    }),
                  )}
                  {" · "}Пользователь: {c.userId}
                </p>
                </div>
                <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => void review(c.id, "approve")}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-40"
                >
                  Одобрить подтверждение
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
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-black/60 sm:grid-cols-2">
                <div><dt className="inline text-black/40">ФИО: </dt><dd className="inline">{c.fullName || "—"}</dd></div>
                <div><dt className="inline text-black/40">Должность: </dt><dd className="inline">{c.position || "—"}</dd></div>
                <div><dt className="inline text-black/40">Email: </dt><dd className="inline">{c.email || "—"}</dd></div>
                <div><dt className="inline text-black/40">Телефон: </dt><dd className="inline">{c.phone || "—"}</dd></div>
                <div><dt className="inline text-black/40">Сайт: </dt><dd className="inline">{c.companyWebsite || "—"}</dd></div>
                <div>
                  <dt className="inline text-black/40">Способ: </dt>
                  <dd className="inline">{PROOF_METHOD_LABELS[c.proofMethod] ?? c.proofMethod}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="inline text-black/40">Доказательство: </dt>
                  <dd className="inline">{c.proofText || c.proofValue || "—"}</dd>
                </div>
                {c.proofFileUrl ?
                  <div className="sm:col-span-2">
                    <dt className="inline text-black/40">Файл/ссылка: </dt>
                    <dd className="inline">{c.proofFileUrl}</dd>
                  </div>
                : null}
                {c.message ?
                  <div className="sm:col-span-2">
                    <dt className="inline text-black/40">Комментарий: </dt>
                    <dd className="inline">{c.message}</dd>
                  </div>
                : null}
                <div><dt className="inline text-black/40">Отправлено: </dt><dd className="inline">{new Date(c.createdAt).toLocaleString("ru-RU")}</dd></div>
              </dl>
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
