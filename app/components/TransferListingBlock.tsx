"use client";

import { useCallback, useState } from "react";
import { getCurrentUserId, refreshAuthFromServer } from "../lib/auth";
import type { ListingTransferDraftPrefill } from "../lib/listingTransferDraft";

type SourceKey = "avito" | "drom" | "other" | null;

const SOURCE_CARDS: {
  key: Exclude<SourceKey, null>;
  label: string;
  hint: string;
}[] = [
  { key: "avito", label: "Авито", hint: "Перенести с Авито" },
  { key: "drom", label: "Дром", hint: "Перенести с Дрома" },
  { key: "other", label: "Другая площадка", hint: "Вставить ссылку вручную" },
];

function instructionsFor(source: Exclude<SourceKey, null>): { title: string; steps: string[] } {
  if (source === "avito") {
    return {
      title: "Как перенести объявление",
      steps: [
        "Откройте своё объявление в Авито",
        'Нажмите «Поделиться»',
        'Нажмите «Копировать ссылку»',
        "Вернитесь в Haliwali",
        "Вставьте ссылку ниже",
      ],
    };
  }
  if (source === "drom") {
    return {
      title: "Как перенести объявление",
      steps: [
        "Откройте своё объявление на Дроме",
        'Нажмите «Поделиться» или скопируйте адрес из браузера',
        "Вернитесь в Haliwali",
        "Вставьте ссылку ниже",
      ],
    };
  }
  return {
    title: "Как перенести объявление",
    steps: [
      "Откройте своё объявление на другой площадке",
      "Скопируйте ссылку на страницу объявления",
      "Вернитесь в Haliwali",
      "Вставьте ссылку ниже",
    ],
  };
}

export function TransferListingBlock({
  onDraftReady,
  onNeedAuth,
}: {
  onDraftReady: (draft: ListingTransferDraftPrefill) => void;
  onNeedAuth: (resume: () => void) => void;
}) {
  const [activeSource, setActiveSource] = useState<SourceKey>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const runImport = useCallback(async () => {
    setError(null);
    setSuccess(false);
    const t = url.trim();
    if (t.length < 8) {
      setError("Некорректная ссылка");
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/listings/import-url", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: t }),
        });
        const d = (await r.json().catch(() => null)) as {
          ok?: boolean;
          draft?: ListingTransferDraftPrefill;
          message?: string;
          error?: string;
        };
        if (!r.ok || !d.ok || !d.draft) {
          setError(
            typeof d.message === "string" && d.message.trim() ?
              d.message.trim()
            : "Не удалось получить данные. Попробуйте другую ссылку.",
          );
          return;
        }
        setSuccess(true);
        onDraftReady({
          title: d.draft.title,
          description: d.draft.description,
          price: typeof d.draft.price === "number" ? d.draft.price : undefined,
          showPhotoHint: true,
        });
        setActiveSource(null);
        setUrl("");
      } catch {
        setError("Не удалось получить данные. Попробуйте другую ссылку.");
      } finally {
        setLoading(false);
      }
    };

    if (!getCurrentUserId()) {
      const authed = await refreshAuthFromServer({ bypassCache: true });
      if (!authed) {
        onNeedAuth(() => void run());
        return;
      }
    }
    await run();
  }, [url, onDraftReady, onNeedAuth]);

  const panel = activeSource ? instructionsFor(activeSource) : null;

  return (
    <section
      className="rounded-2xl border border-orange-200/80 bg-gradient-to-b from-orange-50/90 to-white p-4 shadow-sm sm:p-5"
      aria-labelledby="transfer-listing-heading"
    >
      <h2 id="transfer-listing-heading" className="text-lg font-semibold text-gray-900 sm:text-xl">
        Перенести объявление
      </h2>
      <p className="mt-1.5 text-sm leading-snug text-black/60">
        Скопируйте ваше объявление с другой площадки — мы попробуем заполнить всё автоматически
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {SOURCE_CARDS.map((card) => {
          const open = activeSource === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setActiveSource(open ? null : card.key);
                setError(null);
                setSuccess(false);
              }}
              className={`flex min-h-[4.25rem] flex-col items-start justify-center rounded-xl border px-3 py-3 text-left transition-colors ${
                open ?
                  "border-orange-400 bg-white shadow-sm ring-2 ring-orange-200/80"
                : "border-black/10 bg-white hover:border-orange-300 hover:bg-orange-50/50"
              }`}
            >
              <span className="text-base font-bold text-gray-900">{card.label}</span>
              <span className="mt-0.5 text-xs font-medium text-black/55">{card.hint}</span>
            </button>
          );
        })}
      </div>

      {panel ?
        <div className="mt-4 rounded-xl border border-black/10 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">{panel.title}</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-snug text-black/70">
            {panel.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <label className="mt-4 block">
            <span className="sr-only">Ссылка на объявление</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
                setSuccess(false);
              }}
              placeholder="Вставьте ссылку на объявление"
              className="h-12 w-full rounded-xl border border-black/12 bg-white px-3 text-base text-black outline-none placeholder:text-black/40 focus:border-orange-400 focus:ring-2 focus:ring-orange-200/60"
            />
          </label>

          {error ?
            <p className="mt-2 text-sm text-[#c2410c]" role="alert">
              {error}
            </p>
          : null}
          {success ?
            <p className="mt-2 text-sm text-emerald-700" role="status">
              Черновик готов — проверьте поля ниже и добавьте фото вручную.
            </p>
          : null}

          <button
            type="button"
            disabled={loading}
            onClick={() => void runImport()}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-[#ff7a00] px-5 text-base font-semibold text-white transition-colors hover:bg-[#f07000] disabled:opacity-60 sm:w-auto sm:min-w-[12rem]"
          >
            {loading ? "Загружаем…" : "Создать черновик"}
          </button>
        </div>
      : null}
    </section>
  );
}
