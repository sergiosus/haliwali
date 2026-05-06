"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { incomingModalFieldsToScope } from "../../lib/locationModalSearchScope";
import {
  DEFAULT_SEARCH_SCOPE,
  homepageLocationLabelFromScope,
  normalizeSearchScope,
  type SearchScopeLocation,
} from "../../lib/searchScopeLocation";
import {
  isValidDetectedSettlement,
  looksLikeDistrictAdministrativeLabel,
  looksLikeRuralAutoSettlement,
} from "../../lib/russiaPlaceLabelHeuristics";
import { canonicalRussiaRegionLabel } from "../../lib/russiaRegionCanonical";
import {
  FEDERAL_DISTRICTS,
  federalDistrictForSubject,
  SUBJECTS_BY_DISTRICT,
  subjectsForFederalDistrict,
} from "../../lib/russiaFederalDistricts";
import { buildSearchVariants, matchesSearchVariantsInText } from "../../lib/utils/keyboardLayout";
import { slugify } from "../../lib/slugify";

const RUSSIA_VALUE = "__russia__";
const WHOLE_SUBJECT_VALUE = "__whole_subject__";

type LoadedSettlement = { name: string; lat: number; lng: number };

function isAllowedSettlementName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (!isValidDetectedSettlement(t)) return false;
  if (looksLikeDistrictAdministrativeLabel(t)) return false;
  if (looksLikeRuralAutoSettlement(t)) return false;
  return true;
}

function allSubjectsCanonical(): string[] {
  const out: string[] = [];
  for (const d of FEDERAL_DISTRICTS) {
    for (const s of SUBJECTS_BY_DISTRICT[d]) out.push(canonicalRussiaRegionLabel(s));
  }
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const s of out) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    uniq.push(t);
  }
  return uniq.sort((a, b) => a.localeCompare(b, "ru"));
}

function subjectSlugToCanonical(): Map<string, string> {
  const m = new Map<string, string>();
  for (const subjects of Object.values(SUBJECTS_BY_DISTRICT)) {
    for (const s of subjects) {
      const canon = canonicalRussiaRegionLabel(s).trim();
      if (!canon) continue;
      const slug = slugify(canon);
      if (!slug) continue;
      if (!m.has(slug)) m.set(slug, canon);
    }
  }
  return m;
}

function rankByVariants(hayRaw: string, queryRaw: string): number {
  const hay = (hayRaw ?? "").trim().toLowerCase();
  const q = (queryRaw ?? "").trim();
  if (!q) return 999;
  const variants = buildSearchVariants(q).map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (variants.length === 0) return 999;
  let best = 999;
  for (const v of variants) {
    if (!v) continue;
    if (hay.startsWith(v)) best = Math.min(best, 0);
    else if (hay.includes(v)) best = Math.min(best, 1);
  }
  return best;
}

export function MapRegionSettlementSelectors({
  scope,
  onScopeChange,
}: {
  scope: SearchScopeLocation;
  onScopeChange: (next: SearchScopeLocation) => void;
}) {
  const [settlementQuery, setSettlementQuery] = useState("");
  const [debouncedSettlementQuery, setDebouncedSettlementQuery] = useState("");
  const searchCacheRef = useRef<Map<string, LoadedSettlement[]>>(new Map());
  const [searchSettlementsLoading, setSearchSettlementsLoading] = useState(false);
  const [searchSettlementsError, setSearchSettlementsError] = useState("");
  const [searchResults, setSearchResults] = useState<LoadedSettlement[]>([]);
  const slugToCanonMemo = useMemo(() => subjectSlugToCanonical(), []);

  const topValue = useMemo(() => {
    if (scope.type === "country") return RUSSIA_VALUE;
    if (scope.type === "federal_district") return (scope.label ?? scope.region ?? "").trim();
    if (scope.type === "region") {
      const subj = canonicalRussiaRegionLabel((scope.label ?? scope.region ?? "").trim());
      return federalDistrictForSubject(subj) ?? RUSSIA_VALUE;
    }
    if (scope.type === "city" || scope.type === "settlement") {
      const subj = canonicalRussiaRegionLabel((scope.parentName ?? scope.region ?? "").trim());
      return federalDistrictForSubject(subj) ?? RUSSIA_VALUE;
    }
    return RUSSIA_VALUE;
  }, [scope]);

  const districtSelected = topValue !== RUSSIA_VALUE ? topValue : null;

  const subjectValue = useMemo(() => {
    if (scope.type === "region") return canonicalRussiaRegionLabel((scope.label ?? scope.region ?? "").trim());
    if (scope.type === "city" || scope.type === "settlement") {
      return canonicalRussiaRegionLabel((scope.parentName ?? scope.region ?? "").trim());
    }
    return "";
  }, [scope]);

  const subjectSlugValue = useMemo(() => {
    const canon = subjectValue.trim();
    return canon ? slugify(canon) : "";
  }, [subjectValue]);

  // Debounce city query (300ms) to avoid API spam.
  useEffect(() => {
    const q = settlementQuery;
    const t = setTimeout(() => setDebouncedSettlementQuery(q), 300);
    return () => clearTimeout(t);
  }, [settlementQuery]);

  // Global/district/subject city search (server-side; never returns full dataset).
  useEffect(() => {
    const q = debouncedSettlementQuery.trim();
    const subjSlug = subjectSlugValue.trim();
    const district = districtSelected?.trim() ?? "";

    setSearchSettlementsError("");
    if (q.length < 2) {
      setSearchSettlementsLoading(false);
      setSearchResults([]);
      return;
    }

    const key = `${q.toLowerCase()}\0${district.toLowerCase()}\0${subjSlug.toLowerCase()}`;
    const cached = searchCacheRef.current.get(key);
    if (cached) {
      setSearchResults(cached);
      setSearchSettlementsLoading(false);
      return;
    }

    let cancelled = false;
    setSearchSettlementsLoading(true);
    const url =
      `/api/cities?query=${encodeURIComponent(q)}` +
      `${subjSlug ? `&region=${encodeURIComponent(subjSlug)}` : ""}` +
      `${district ? `&district=${encodeURIComponent(district)}` : ""}`;

    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[/map] cities request", url);
    }
    void fetch(
      url,
      { cache: "no-store" },
    )
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (cancelled) return;
        const ok = Boolean(d && typeof d === "object" && (d as { ok?: unknown }).ok === true);
        const arr = d && typeof d === "object" ? (d as { cities?: unknown }).cities : null;
        if (!ok) {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.error("[/map] /api/cities returned ok:false", d);
          }
          setSearchSettlementsError("Города временно недоступны");
          setSearchResults([]);
          setSearchSettlementsLoading(false);
          return;
        }
        if (!Array.isArray(arr)) {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.error("[/map] /api/cities failed", d);
          }
          setSearchSettlementsError("Города временно недоступны");
          setSearchResults([]);
          setSearchSettlementsLoading(false);
          return;
        }
        const rows = (arr as unknown[])
          .map((x) => x as { name?: unknown; region?: unknown; lat?: unknown; lng?: unknown })
          .map((x) => ({
            name: typeof x.name === "string" ? x.name.trim() : "",
            region: typeof x.region === "string" ? canonicalRussiaRegionLabel(x.region).trim() : "",
            lat: typeof x.lat === "number" ? x.lat : Number(x.lat),
            lng: typeof x.lng === "number" ? x.lng : Number(x.lng),
          }))
          .filter((x) => x.name && x.region && Number.isFinite(x.lat + x.lng) && isAllowedSettlementName(x.name))
          .map((x) => ({ name: `${x.region}, ${x.name}`, lat: x.lat, lng: x.lng }));
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log("[/map] cities response", { q, got: rows.length });
        }
        searchCacheRef.current.set(key, rows);
        setSearchResults(rows);
        setSearchSettlementsLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("[/map] /api/cities failed", e);
        }
        setSearchSettlementsError("Города временно недоступны");
        setSearchResults([]);
        setSearchSettlementsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSettlementQuery, districtSelected, subjectSlugValue]);

  const subjects = useMemo(() => {
    const base = districtSelected
      ? subjectsForFederalDistrict(districtSelected)
      : allSubjectsCanonical();
    return base;
  }, [districtSelected]);

  const shown = homepageLocationLabelFromScope(scope);

  return (
    <div className="grid gap-2">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Регион</div>
        <select
          className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
          value={topValue}
          onChange={(e) => {
            const v = e.target.value;
            setSettlementQuery("");
            if (v === RUSSIA_VALUE) {
              onScopeChange({ ...DEFAULT_SEARCH_SCOPE });
              return;
            }
            onScopeChange(normalizeSearchScope({ type: "federal_district", label: v, region: v }));
          }}
        >
          <option value={RUSSIA_VALUE}>Вся Россия</option>
          {FEDERAL_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Субъект</div>
        <select
          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
          value={subjectSlugValue || ""}
          onChange={(e) => {
            const slug = e.target.value;
            setSettlementQuery("");
            if (!slug) {
              // Clear to the currently selected district (or whole Russia)
              if (districtSelected) onScopeChange(normalizeSearchScope({ type: "federal_district", label: districtSelected, region: districtSelected }));
              else onScopeChange({ ...DEFAULT_SEARCH_SCOPE });
              return;
            }
            const canon = slugToCanonMemo.get(slug) ?? "";
            if (!canon) return;
            onScopeChange(normalizeSearchScope({ type: "region", label: canon, region: canon }));
          }}
        >
          <option value="">
            Выберите субъект…
          </option>
          {subjects.map((s) => (
            <option key={s} value={slugify(s)}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Город / населённый пункт</div>
        <input
          type="search"
          value={settlementQuery}
          onChange={(e) => setSettlementQuery(e.target.value)}
          placeholder="Поиск поселения…"
          className="mb-1.5 mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs outline-none focus:border-black/20"
          aria-label="Поиск поселения"
        />
        {settlementQuery.trim().length >= 2 ? (
          <div className="mb-1.5 grid gap-1">
            {(() => {
              const q = settlementQuery.trim();
              const ranked = searchResults
                .map((r) => ({ r, rank: rankByVariants(r.name, q) }))
                .filter((x) => x.rank < 999)
                .sort((a, b) => a.rank - b.rank || a.r.name.localeCompare(b.r.name, "ru"))
                .map((x) => x.r)
                .slice(0, 8);
              return ranked;
            })().map((s) => (
              <button
                key={`settle-suggest-${s.name}-${s.lat}-${s.lng}`}
                type="button"
                className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-left text-xs hover:border-black/20"
                onClick={() => {
                  const label = s.name;
                  const firstComma = label.indexOf(",");
                  const subj = firstComma >= 0 ? label.slice(0, firstComma).trim() : "";
                  const city = firstComma >= 0 ? label.slice(firstComma + 1).trim() : label.trim();
                  onScopeChange(
                    normalizeSearchScope(
                      incomingModalFieldsToScope({
                        city,
                        region: subj,
                        lat: s.lat,
                        lng: s.lng,
                        displayName: label,
                      }),
                    ),
                  );
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
        {searchSettlementsLoading ? (
          <div className="mb-1.5 text-xs text-black/45">Поиск…</div>
        ) : null}
        {searchSettlementsError ? (
          <div className="mb-1.5 text-xs text-red-600">{searchSettlementsError}</div>
        ) : null}
        {!searchSettlementsLoading && !searchSettlementsError && debouncedSettlementQuery.trim().length >= 2 && searchResults.length === 0 ? (
          <div className="mb-1.5 text-xs text-black/45">Нет данных</div>
        ) : null}
      </div>

      <div className="text-xs text-black/55">
        Выбрано: <span className="font-medium text-black/80">{shown}</span>
      </div>
    </div>
  );
}
