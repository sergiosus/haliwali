"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SettlementLocationField } from "../../../components/location/SettlementLocationField";
import {
  catalogDiscoverCityLabel,
  persistCatalogDiscoverLocation,
  readCatalogDiscoverLocation,
  type CatalogDiscoverLocation,
} from "../../../lib/catalogDiscoverLocationStorage";
import type { CatalogImportDraft } from "../../../lib/catalogImportTypes";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";

type InputKind = "csv" | "text" | "url" | "urls";

export default function AdminCatalogImportClient() {
  const [draftCount, setDraftCount] = useState(0);
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

  const loadDraftCount = useCallback(() => {
    void fetch("/api/admin/catalogs/import/drafts", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { drafts?: CatalogImportDraft[] }) => setDraftCount(d.drafts?.length ?? 0))
      .catch(() => setDraftCount(0));
  }, []);

  useEffect(() => {
    loadDraftCount();
    const saved = readCatalogDiscoverLocation();
    if (saved) setLocation(saved);
  }, [loadDraftCount]);

  const cityLabel = catalogDiscoverCityLabel(location);

  async function runParse(file?: File) {
    setBusy(true);
    setMessage(null);
    setParseErrors([]);
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
      };
      if (!r.ok) {
        setMessage(d.error ?? "Ошибка разбора");
        return;
      }
      setParseErrors(d.errors ?? []);
      const errN = d.errors?.length ?? 0;
      setMessage(`Создано кандидатов: ${d.count ?? 0}${errN > 0 ? `, ошибок: ${errN}` : ""}`);
      loadDraftCount();
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/catalogs/discover"
          className="rounded-full border border-black/15 px-4 py-2 font-medium hover:bg-black/5"
        >
          Поиск источников
        </Link>
        <Link
          href="/admin/catalogs/import/drafts"
          className="rounded-full border border-black/15 px-4 py-2 font-medium hover:bg-black/5"
        >
          Кандидаты ({draftCount})
        </Link>
      </div>

      <section className="rounded-3xl border border-black/10 bg-white p-5">
        <h2 className="text-lg font-semibold">Извлечение из публичных источников</h2>
        <p className="mt-1 text-sm text-black/55">
          Сайты, справочники, VK, объявления, текст, CSV. Без автопубликации — только кандидаты.
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
            rows={6}
            placeholder={"https://example.ru\nhttps://vk.com/group"}
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
              rows={6}
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
        {parseErrors.length > 0 ?
          <ul className="mt-2 list-inside list-disc text-xs text-red-700">
            {parseErrors.map((e) => (
              <li key={e.url}>
                {e.url}: {e.error}
              </li>
            ))}
          </ul>
        : null}

        {message && !busy ?
          <Link
            href="/admin/catalogs/import/drafts"
            className="mt-4 inline-flex rounded-full border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Перейти к кандидатам →
          </Link>
        : null}
      </section>
    </div>
  );
}
