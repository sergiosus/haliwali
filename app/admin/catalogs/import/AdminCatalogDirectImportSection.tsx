"use client";

import { useCallback, useEffect, useState } from "react";
import { SettlementLocationField } from "../../../components/location/SettlementLocationField";
import {
  catalogDiscoverCityLabel,
  persistCatalogDiscoverLocation,
  readCatalogDiscoverLocation,
  type CatalogDiscoverLocation,
} from "../../../lib/catalogDiscoverLocationStorage";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";
import { AdminCatalogOfferImportSuccessBanner } from "../AdminCatalogOfferImportSuccessBanner";

type InputKind = "csv" | "text" | "url" | "urls";

export function AdminCatalogDirectImportSection({
  onChanged,
  onSuccess,
  onOpenOfferImport,
  offerOnly = false,
  hideShell = false,
}: {
  onChanged?: () => void;
  onSuccess?: () => void;
  onOpenOfferImport?: () => void;
  offerOnly?: boolean;
  hideShell?: boolean;
}) {
  const [kind, setKind] = useState<InputKind>("urls");
  const [categorySlug, setCategorySlug] = useState("remont");
  const [location, setLocation] = useState<CatalogDiscoverLocation | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [vkPaste, setVkPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<{ url: string; error: string }[]>([]);
  const [sourceOfferDraftCount, setSourceOfferDraftCount] = useState(0);

  useEffect(() => {
    const saved = readCatalogDiscoverLocation();
    if (saved) setLocation(saved);
  }, []);

  const cityLabel = catalogDiscoverCityLabel(location);

  const runParse = useCallback(
    async (file?: File) => {
      setBusy(true);
      setMessage(null);
      setParseErrors([]);
      setSourceOfferDraftCount(0);
      try {
        const fd = new FormData();
        fd.set("kind", kind === "url" ? "url" : kind);
        fd.set("categorySlug", categorySlug);
        fd.set("city", cityLabel);
        if (kind === "csv" && file) fd.set("file", file);
        else if (kind === "csv") fd.set("csv", pastedText);
        else if (kind === "text") {
          fd.set("text", pastedText);
          if (vkPaste) fd.set("vkPaste", "1");
        } else if (kind === "urls") {
          fd.set("kind", "urls");
          fd.set("urls", urlsText);
        } else {
          fd.set("url", websiteUrl);
        }

        const r = await fetch("/api/admin/catalogs/import/parse", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const d = (await r.json()) as {
          ok?: boolean;
          error?: string;
          count?: number;
          errors?: { url: string; error: string }[];
          sourceOfferDrafts?: unknown[];
        };
        if (!r.ok) {
          setMessage(d.error ?? "Ошибка разбора");
          return;
        }
        setParseErrors(d.errors ?? []);
        const errN = d.errors?.length ?? 0;
        const offerCount = d.sourceOfferDrafts?.length ?? 0;
        setSourceOfferDraftCount(offerCount);
        if (offerOnly) {
          setMessage(`Создано кандидатов предложений: ${offerCount}${errN > 0 ? `, ошибок: ${errN}` : ""}`);
        } else {
          const companyCount = Math.max(0, (d.count ?? 0) - offerCount);
          setMessage(`Создано кандидатов: ${companyCount}${errN > 0 ? `, ошибок: ${errN}` : ""}`);
        }
        onChanged?.();
        if (offerOnly) {
          if (offerCount > 0) onSuccess?.();
        } else {
          onSuccess?.();
        }
      } catch {
        setMessage("Ошибка сети");
      } finally {
        setBusy(false);
      }
    },
    [
      categorySlug,
      cityLabel,
      kind,
      offerOnly,
      onChanged,
      onSuccess,
      pastedText,
      urlsText,
      vkPaste,
      websiteUrl,
    ],
  );

  const body = (
    <>
      <h3 className="text-base font-semibold">
        {offerOnly ? "Создать кандидатов предложений" : "Извлечение по URL / CSV / тексту"}
      </h3>
      <p className="mt-1 text-sm text-black/55">
        {offerOnly ?
          "Ссылки на Avito, Drom, VK и сайты компаний. Объявления попадут в «Кандидаты предложений»."
        : "Сайты компаний, справочники, VK, текст, CSV. Создаёт кандидатов в списке ниже."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["urls", "Несколько URL"],
            ["url", "Один URL"],
            ["text", "Текст / VK"],
            ["csv", "CSV"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={[
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              kind === k ?
                "border-black/15 bg-black/[0.06] text-black"
              : "border-black/10 text-black/55",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-black/60">Категория</span>
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2"
          >
            {CATALOG_CATEGORY_SEED.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <SettlementLocationField
            value={location}
            onChange={setLocation}
            onPersist={persistCatalogDiscoverLocation}
            label="Город / регион"
            placeholder="Ижевск"
          />
        </div>
      </div>

      {kind === "csv" ?
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className="mt-4 block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void runParse(f);
          }}
        />
      : null}

      {kind === "urls" ?
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={5}
          placeholder={"https://www.avito.ru/...\nhttps://auto.drom.ru/..."}
          className="mt-4 w-full rounded-xl border border-black/15 px-3 py-2 font-mono text-sm"
        />
      : null}

      {kind === "text" ?
        <>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={vkPaste} onChange={(e) => setVkPaste(e.target.checked)} />
            Вставка из VK
          </label>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </>
      : null}

      {kind === "url" ?
        <input
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://example.ru"
          className="mt-4 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
        />
      : null}

      {kind !== "csv" ?
        <button
          type="button"
          disabled={busy}
          onClick={() => void runParse()}
          className="mt-4 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Извлечение…" : "Создать кандидатов"}
        </button>
      : null}

      {message ?
        <p className="mt-3 text-sm font-medium text-black/70">{message}</p>
      : null}
      <AdminCatalogOfferImportSuccessBanner
        count={offerOnly ? 0 : sourceOfferDraftCount}
        onOpenImport={offerOnly ? onSuccess : onOpenOfferImport}
      />
      {offerOnly && sourceOfferDraftCount > 0 ?
        <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <p className="font-medium">Кандидаты предложений созданы.</p>
          {onSuccess ?
            <button
              type="button"
              onClick={onSuccess}
              className="mt-2 rounded-full bg-violet-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-800"
            >
              Открыть кандидаты предложений
            </button>
          : null}
        </div>
      : null}
      {parseErrors.length > 0 ?
        <ul className="mt-2 list-inside list-disc text-xs text-red-700">
          {parseErrors.map((e) => (
            <li key={e.url}>
              {e.url}: {e.error}
            </li>
          ))}
        </ul>
      : null}
    </>
  );

  if (hideShell) {
    return <div className="w-full min-w-0 overflow-visible">{body}</div>;
  }

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5">{body}</section>
  );
}
