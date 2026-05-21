"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUserId, refreshAuthFromServer } from "../lib/auth";
import {
  buildManualTransferDraft,
  TRANSFER_FETCH_FAILED_HINT,
  type ListingTransferDraftPrefill,
} from "../lib/listingTransferDraft";
import { validatePublicHttpUrl } from "../lib/listingUrlImport";

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

function scrollToManualForm() {
  try {
    document.getElementById("listing-manual-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    /* noop */
  }
}

function applyDraftAndFinish(
  draft: ListingTransferDraftPrefill,
  onDraftReady: (draft: ListingTransferDraftPrefill) => void,
  setSuccess: (v: boolean) => void,
  setActiveSource: (v: SourceKey) => void,
  setUrl: (v: string) => void,
) {
  onDraftReady(draft);
  setSuccess(true);
  setActiveSource(null);
  setUrl("");
  queueMicrotask(() => scrollToManualForm());
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
  const [info, setInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const runImport = useCallback(async () => {
    setError(null);
    setInfo(null);
    setSuccess(false);
    const t = url.trim();

    const validated = validatePublicHttpUrl(t);
    if (!validated.ok) {
      setError("Некорректная ссылка");
      return;
    }
    const canonicalUrl = validated.url.toString();

    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/listings/import-url", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: canonicalUrl }),
        });
        const d = (await r.json().catch(() => null)) as {
          ok?: boolean;
          draft?: ListingTransferDraftPrefill;
          message?: string;
          error?: string;
        };

        if (r.ok && d.ok && d.draft) {
          applyDraftAndFinish(
            {
              title: d.draft.title,
              description: d.draft.description,
              price: typeof d.draft.price === "number" ? d.draft.price : undefined,
              showPhotoHint: true,
              sourceUrl: canonicalUrl,
              manualFallback: false,
            },
            onDraftReady,
            setSuccess,
            setActiveSource,
            setUrl,
          );
          return;
        }

        if (r.status === 401) {
          setError(typeof d.message === "string" && d.message.trim() ? d.message.trim() : "Войдите в аккаунт");
          return;
        }
        if (r.status === 429) {
          setError(
            typeof d.message === "string" && d.message.trim() ?
              d.message.trim()
            : "Слишком много попыток. Подождите немного и попробуйте снова.",
          );
          return;
        }
        if (d.error === "INVALID_URL" || d.error === "BLOCKED_URL") {
          setError("Некорректная ссылка");
          return;
        }

        setInfo(TRANSFER_FETCH_FAILED_HINT);
        applyDraftAndFinish(buildManualTransferDraft(canonicalUrl), onDraftReady, setSuccess, setActiveSource, setUrl);
      } catch {
        setInfo(TRANSFER_FETCH_FAILED_HINT);
        applyDraftAndFinish(buildManualTransferDraft(canonicalUrl), onDraftReady, setSuccess, setActiveSource, setUrl);
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
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isOpen = mounted && expanded;

  return (
    <section
      className={[
        "rounded-2xl border border-orange-200/80 bg-gradient-to-b from-orange-50/90 to-white shadow-sm",
        isOpen ? "p-4 sm:p-5" : "px-4 py-3",
        mounted ? "transition-[padding] duration-300 ease-out" : "",
      ].join(" ")}
      aria-labelledby="transfer-listing-heading"
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={isOpen}
        aria-controls="transfer-listing-panel"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="min-w-0 flex-1">
          <h2 id="transfer-listing-heading" className="text-base font-semibold text-gray-900 sm:text-lg">
            Перенести объявление с другой площадки
          </h2>
          <p className="mt-1 text-xs leading-snug text-black/55 sm:text-sm">
            Ссылка с Авито, Дрома или другого сайта — черновик заполнится автоматически
          </p>
        </span>
        <span
          className={[
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-200/80 bg-white/80 text-orange-700",
            mounted ? "transition-transform duration-300 ease-out" : "",
            isOpen ? "rotate-180" : "rotate-0",
          ].join(" ")}
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="block">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <div
        id="transfer-listing-panel"
        className={[
          "grid",
          mounted ? "transition-[grid-template-rows,opacity] duration-300 ease-out" : "",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {SOURCE_CARDS.map((card) => {
          const open = activeSource === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setActiveSource(open ? null : card.key);
                setError(null);
                setInfo(null);
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
                setInfo(null);
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
          {info ?
            <p className="mt-2 text-sm text-amber-800" role="status">
              {info}
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
          </div>
        </div>
      </div>
    </section>
  );
}
