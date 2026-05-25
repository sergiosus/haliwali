"use client";

import { useEffect, useState } from "react";
import type { CatalogCompanyAdminItem } from "../lib/catalogTypes";
import { CATALOG_CATEGORY_SEED } from "../lib/catalogTypes";
import { catalogCategoryVisual } from "../lib/catalogVisual";

type FormState = {
  name: string;
  city: string;
  serviceCities: string;
  description: string;
  websiteUrl: string;
  categorySlug: string;
  logoUrl: string;
};

export function AdminCatalogCompanyEditModal({
  company,
  onClose,
  onSaved,
}: {
  company: CatalogCompanyAdminItem;
  onClose: () => void;
  onSaved: (updated: CatalogCompanyAdminItem) => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    name: company.name,
    city: company.city,
    serviceCities: company.serviceCities.join("\n"),
    description: company.description,
    websiteUrl: company.website ?? "",
    categorySlug: company.categorySlug,
    logoUrl: company.logoUrl ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      name: company.name,
      city: company.city,
      serviceCities: company.serviceCities.join("\n"),
      description: company.description,
      websiteUrl: company.website ?? "",
      categorySlug: company.categorySlug,
      logoUrl: company.logoUrl ?? "",
    });
    setError(null);
  }, [company]);

  const visual = catalogCategoryVisual(form.categorySlug);
  const initials = (form.name.trim().charAt(0) || "?").toUpperCase();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/catalog/companies/${company.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          primaryCity: form.city,
          serviceCities: form.serviceCities,
          description: form.description,
          websiteUrl: form.websiteUrl,
          categoryIds: [form.categorySlug],
          logoUrl: form.logoUrl.trim() || null,
        }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        company?: CatalogCompanyAdminItem;
        message?: string;
        error?: string;
      };
      if (!r.ok) {
        setError(d.message ?? d.error ?? "Ошибка сохранения");
        return;
      }
      if (d.company) onSaved(d.company);
      onClose();
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-company-edit-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-black/10 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="catalog-company-edit-title" className="text-lg font-semibold">
            Редактировать компанию
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-black/45 hover:bg-black/5 hover:text-black"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-black/45">slug: {company.slug}</p>

        <div className="mt-4 flex items-center gap-3">
          {form.logoUrl.trim() ?
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logoUrl.trim()} alt="" className="h-full w-full object-cover" />
            </div>
          : (
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white ${visual.gradient}`}
            >
              {initials}
            </div>
          )}
          <p className="text-xs text-black/50">Без URL логотипа на сайте показываются инициалы</p>
        </div>

        <div className="mt-4 grid gap-3 text-sm">
          <label className="block">
            <span className="text-black/60">Название *</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-black/60">Основной город</span>
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-black/60">Города работы</span>
            <textarea
              value={form.serviceCities}
              onChange={(e) => setForm((f) => ({ ...f, serviceCities: e.target.value }))}
              rows={4}
              placeholder="Елабуга&#10;Зеленодольск&#10;Йошкар-Ола"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-black/40">
              По одному городу в строке или через запятую. Основной город сюда не добавляйте.
            </span>
          </label>
          <label className="block">
            <span className="text-black/60">Категория</span>
            <select
              value={form.categorySlug}
              onChange={(e) => setForm((f) => ({ ...f, categorySlug: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            >
              {CATALOG_CATEGORY_SEED.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-black/60">Сайт / source URL</span>
            <input
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="https://example.ru"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-black/60">URL логотипа</span>
            <input
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              placeholder="https://…"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-black/60">Описание</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
            />
          </label>
        </div>

        {error ?
          <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
        : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || form.name.trim().length < 2}
            onClick={() => void save()}
            className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
