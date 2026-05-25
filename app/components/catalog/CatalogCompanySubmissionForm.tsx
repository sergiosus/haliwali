"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogCategory } from "../../lib/catalogTypes";
import { refreshAuthFromServer, useAuth } from "../../lib/auth";

type SubmitState = "idle" | "submitting" | "submitted";

type FormState = {
  name: string;
  categorySlug: string;
  city: string;
  description: string;
  website: string;
  imageUrl: string;
  phone: string;
  email: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  categorySlug: "",
  city: "",
  description: "",
  website: "",
  imageUrl: "",
  phone: "",
  email: "",
};

const ERROR_LABELS: Record<string, string> = {
  NAME_REQUIRED: "Название компании должно быть не короче 2 символов.",
  CATEGORY_REQUIRED: "Выберите категорию.",
  CITY_REQUIRED: "Укажите город.",
  DESCRIPTION_REQUIRED: "Описание должно быть не короче 10 символов.",
  WEBSITE_INVALID: "Проверьте ссылку на сайт.",
  LOGO_INVALID: "Проверьте URL логотипа.",
  UNAUTHORIZED: "Войдите, чтобы добавить компанию.",
};

export function CatalogCompanySubmissionForm({
  categories,
  initialCategorySlug,
  initialLoggedIn,
  buttonClassName,
  showForGuests = false,
}: {
  categories: readonly CatalogCategory[];
  initialCategorySlug?: string;
  initialLoggedIn: boolean;
  buttonClassName?: string;
  showForGuests?: boolean;
}) {
  const router = useRouter();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    ...INITIAL_FORM,
    categorySlug: initialCategorySlug ?? "",
  });

  useEffect(() => {
    void refreshAuthFromServer();
  }, []);

  useEffect(() => {
    setForm((prev) => ({ ...prev, categorySlug: initialCategorySlug ?? prev.categorySlug }));
  }, [initialCategorySlug]);

  const loggedIn = useMemo(() => {
    if (auth.status === "ready") return Boolean(auth.userId);
    return initialLoggedIn;
  }, [auth.status, auth.userId, initialLoggedIn]);

  function requireLogin(): boolean {
    if (loggedIn) return true;
    const next =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/catalogs";
    router.push(`/login?next=${encodeURIComponent(next)}`);
    return false;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!requireLogin()) return;
    setState("submitting");
    setError(null);
    try {
      const r = await fetch("/api/catalogs/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.status === 401) {
        requireLogin();
        setState("idle");
        return;
      }
      if (!r.ok || data.ok === false) {
        setError(ERROR_LABELS[data.error ?? ""] ?? "Не удалось отправить компанию. Попробуйте ещё раз.");
        setState("idle");
        return;
      }
      setState("submitted");
      setForm({ ...INITIAL_FORM, categorySlug: initialCategorySlug ?? "" });
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
      setState("idle");
    }
  }

  if (!loggedIn && !showForGuests) return null;

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={() => {
          if (requireLogin()) setOpen((value) => !value);
        }}
        className={
          buttonClassName ??
          "inline-flex h-10 items-center justify-center rounded-full bg-[#ff7a00] px-4 text-sm font-semibold text-white hover:bg-[#f07000]"
        }
      >
        Добавить компанию
      </button>

      {open ?
        <form
          onSubmit={onSubmit}
          className="mt-4 grid gap-3 rounded-2xl border border-black/[0.08] bg-white p-4 text-sm shadow-sm sm:grid-cols-2"
        >
          <label className="block">
            <span className="font-medium text-black/70">Название компании *</span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              minLength={2}
              required
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="font-medium text-black/70">Категория *</span>
            <select
              value={form.categorySlug}
              onChange={(e) => setForm((prev) => ({ ...prev, categorySlug: e.target.value }))}
              required
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">Выберите категорию</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-medium text-black/70">Город *</span>
            <input
              value={form.city}
              onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              required
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="font-medium text-black/70">Сайт / ссылка</span>
            <input
              value={form.website}
              onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
              inputMode="url"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="font-medium text-black/70">URL логотипа</span>
            <input
              value={form.imageUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
              inputMode="url"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="font-medium text-black/70">Телефон</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="font-medium text-black/70">Email</span>
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              inputMode="email"
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-medium text-black/70">Описание *</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              minLength={10}
              required
              rows={4}
              className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          {error ? <p className="font-medium text-red-700 sm:col-span-2">{error}</p> : null}
          {state === "submitted" ?
            <p className="font-medium text-emerald-700 sm:col-span-2">
              Компания отправлена на модерацию и появится в каталоге после одобрения.
            </p>
          : null}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={state === "submitting"}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {state === "submitting" ? "Отправка..." : "Отправить на модерацию"}
            </button>
            <button
              type="button"
              disabled={state === "submitting"}
              onClick={() => setOpen(false)}
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5 disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </form>
      : null}
    </div>
  );
}
