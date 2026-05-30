import path from "node:path";
import { NextResponse } from "next/server";
import { logAdminCatalogImport, logCatalogDiscover, logCatalogImport } from "../../../../../lib/catalogCatalogLog";
import { normalizeImportDomain } from "../../../../../lib/catalogImportDomain";
import { MAX_URLS_PER_BATCH, processCompanyUrlBatch } from "../../../../../lib/catalogExtractionService";
import {
  partitionImportUrls,
  processSourceOfferUrlBatch,
} from "../../../../../lib/catalogSourceOfferExtractionService";
import type { CatalogImportDraft } from "../../../../../lib/catalogImportTypes";
import type { ImportCandidateResultStatus, PersistedImportCandidate } from "../../../../../lib/catalogImportCandidateTypes";
import {
  applyCandidateImportResults,
  type CandidateImportResultPatch,
  getImportCandidateSession,
  updateImportCandidateSession,
} from "../../../../../lib/serverCatalogImportCandidatesStore";
import { recordCatalogImportSession } from "../../../../../lib/serverCatalogImportSessionStore";
import { countCatalogImportDraftsInDb } from "../../../../../lib/serverCatalogImportDraftStore";
import { listCatalogCompaniesAdmin } from "../../../../../lib/serverCatalogStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";
import { checkIpRateLimit, extractIp } from "../../../../../lib/serverAbuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_IP_PATH = path.join(process.cwd(), ".data", "catalog-discover-import-ip.json");
const RL_IP_LIMIT = 30;
const RL_WINDOW_MS = 60 * 60 * 1000;

type CandidateImportResult = CandidateImportResultPatch & {
  domain: string;
};

function resultDomain(rawUrl: string, candidate?: PersistedImportCandidate): string {
  if (candidate?.domain) return candidate.domain.trim().toLowerCase();
  try {
    return normalizeImportDomain(rawUrl);
  } catch {
    return "";
  }
}

function selectBestUrlsForImport(
  urls: string[],
  candidatesByUrl: Map<string, PersistedImportCandidate>,
): string[] {
  if (urls.length <= MAX_URLS_PER_BATCH) return urls;
  return urls
    .map((url, index) => ({ url, index, score: candidatesByUrl.get(url)?.relevanceScore ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_URLS_PER_BATCH)
    .map((item) => item.url);
}

function draftDomain(draft: CatalogImportDraft): string {
  const rawRoot = String(draft.rawPayload?.rootDomain ?? "").trim();
  if (rawRoot) return rawRoot.toLowerCase();
  return normalizeImportDomain(draft.sourceUrlDisplay ?? draft.sourceUrl ?? draft.website ?? "");
}

function resultSummary(results: CandidateImportResult[]): {
  imported: number;
  duplicates: number;
  errors: number;
  skipped: number;
} {
  return {
    imported: results.filter((r) => r.status === "imported").length,
    duplicates: results.filter((r) => r.status === "skipped_duplicate").length,
    errors: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped_invalid" || r.status === "skipped_hidden").length,
  };
}

function invalidStatus(error: string): ImportCandidateResultStatus {
  return error === "NO_COMPANY_EXTRACTED" || error === "URL_REQUIRED" ? "skipped_invalid" : "failed";
}

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const ip = extractIp(req);
  const rl = await checkIpRateLimit({
    path: RL_IP_PATH,
    ip,
    limit: RL_IP_LIMIT,
    windowMs: RL_WINDOW_MS,
  });
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "RATE_LIMIT" }, { status: 429 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const categorySlug = String(body.categorySlug ?? "").trim().toLowerCase();
  const city = String(body.city ?? "").trim();
  const rawUrls = Array.isArray(body.urls)
    ? body.urls.map((u) => String(u).trim()).filter(Boolean)
    : [];
  const requestedCountFromClient = Number(body.requestedCount);

  if (!categorySlug) {
    return NextResponse.json({ ok: false, error: "CATEGORY_REQUIRED" }, { status: 400 });
  }
  if (rawUrls.length === 0) {
    return NextResponse.json({ ok: false, error: "URLS_REQUIRED" }, { status: 400 });
  }

  const searchQuery = String(body.searchQuery ?? body.query ?? "").trim();
  const sessionId = Number(body.sessionId);
  const existing =
    Number.isFinite(sessionId) && sessionId > 0 ? await getImportCandidateSession(sessionId) : null;
  const candidatesByUrl = new Map((existing?.candidates ?? []).map((c) => [c.url.trim(), c]));
  const urlsToProcess = selectBestUrlsForImport(rawUrls, candidatesByUrl);
  const requestedCount =
    Number.isFinite(requestedCountFromClient) && requestedCountFromClient > 0 ?
      Math.max(rawUrls.length, Math.floor(requestedCountFromClient))
    : rawUrls.length;
  const truncated = requestedCount > urlsToProcess.length;

  logCatalogImport("selected_count", { requested: requestedCount, received: rawUrls.length, processed: urlsToProcess.length });
  logCatalogDiscover("import_batch", {
    requestedUrlCount: requestedCount,
    receivedUrlCount: rawUrls.length,
    processedUrlCount: urlsToProcess.length,
    categorySlug,
    city: city.slice(0, 40),
  });
  const preliminaryResults: CandidateImportResult[] = [];
  const importableUrls: string[] = [];

  for (const url of urlsToProcess) {
    const candidate = candidatesByUrl.get(url);
    const domain = resultDomain(url, candidate);
    if (!/^https?:\/\//i.test(url)) {
      preliminaryResults.push({ url, domain, status: "skipped_invalid", reason: "INVALID_URL" });
    } else if (candidate?.catalogMatchStatus === "already_published") {
      preliminaryResults.push({
        url,
        domain,
        status: "skipped_duplicate",
        reason: "ALREADY_PUBLISHED",
        duplicateOfCompanyId: candidate.existingCompany?.id ?? null,
        duplicateName: candidate.existingCompany?.name ?? null,
        duplicateHref: candidate.existingCompany?.href ?? null,
      });
    } else if (candidate?.hidden) {
      preliminaryResults.push({ url, domain, status: "skipped_hidden", reason: candidate.hideReason ?? "HIDDEN" });
    } else {
      importableUrls.push(url);
    }
  }

  const { companyUrls, sourceOfferUrls } = partitionImportUrls(importableUrls);
  const emptyCompany = {
    drafts: [] as CatalogImportDraft[],
    errors: [] as { url: string; error: string }[],
    upsert: { drafts: [], createdIds: [], updatedIds: [], sourcesCreated: 0 },
  };
  const [companyBatch, offerBatch] = await Promise.all([
    companyUrls.length > 0 ?
      processCompanyUrlBatch(companyUrls, { categorySlug, city })
    : Promise.resolve(emptyCompany),
    sourceOfferUrls.length > 0 ?
      processSourceOfferUrlBatch(sourceOfferUrls, { categorySlug, city })
    : Promise.resolve({ drafts: [], errors: [], upsert: { drafts: [], createdIds: [], updatedIds: [] } }),
  ]);
  const drafts = companyBatch.drafts;
  const errors = [...companyBatch.errors, ...offerBatch.errors];
  const upsert = companyBatch.upsert;
  const sourceOfferDrafts = offerBatch.drafts;

  logCatalogImport("inserted_sources_count", { count: upsert.sourcesCreated });
  logCatalogImport("inserted_drafts_count", {
    count: drafts.length,
    created: upsert.createdIds.length,
    updated: upsert.updatedIds.length,
    sourceOffers: sourceOfferDrafts.length,
  });

  await recordCatalogImportSession({
    query: searchQuery || rawUrls.slice(0, 5).join("\n"),
    city,
    categorySlug,
    resultCount: drafts.length + sourceOfferDrafts.length,
  });

  const dbDraftCount = await countCatalogImportDraftsInDb();
  logCatalogImport("db_drafts_verify", { count: dbDraftCount });

  const companies = await listCatalogCompaniesAdmin().catch(() => []);
  const companiesById = new Map(companies.map((c) => [c.id, c]));
  const draftsByDomain = new Map<string, CatalogImportDraft>();
  for (const draft of drafts) {
    const domain = draftDomain(draft);
    if (domain) draftsByDomain.set(domain, draft);
  }
  const offerDraftByUrl = new Map(
    sourceOfferDrafts.map((d) => [d.sourceUrl.trim().toLowerCase(), d]),
  );
  const errorsByDomain = new Map<string, string>();
  for (const err of errors) {
    const domain = resultDomain(err.url, candidatesByUrl.get(err.url));
    if (domain) errorsByDomain.set(domain, err.error);
  }
  const urlsByDomain = new Map<string, string[]>();
  for (const url of companyUrls) {
    const domain = resultDomain(url, candidatesByUrl.get(url));
    const list = urlsByDomain.get(domain) ?? [];
    list.push(url);
    urlsByDomain.set(domain, list);
  }

  const results: CandidateImportResult[] = [...preliminaryResults];

  for (const url of sourceOfferUrls) {
    const domain = resultDomain(url, candidatesByUrl.get(url));
    const draft = offerDraftByUrl.get(url.trim().toLowerCase());
    const err = errors.find((e) => e.url === url)?.error;
    if (err || !draft) {
      results.push({
        url,
        domain,
        status: invalidStatus(err ?? "NO_RESULT"),
        reason: err ?? "NO_RESULT",
      });
      continue;
    }
    const isDup = draft.status === "duplicate" || offerBatch.upsert.updatedIds.includes(draft.id);
    results.push({
      url,
      domain,
      status: isDup ? "skipped_duplicate" : "imported",
      reason: isDup ? "SOURCE_OFFER_DUPLICATE" : "SOURCE_OFFER_DRAFT_CREATED",
      draftId: draft.id,
      duplicateHref: draft.duplicateOfOfferId ? `/catalogs/predlozheniya#offer-${draft.duplicateOfOfferId}` : null,
      duplicateName: draft.duplicateHint,
    });
  }

  for (const [domain, domainUrls] of urlsByDomain) {
    const draft = draftsByDomain.get(domain);
    const error = errorsByDomain.get(domain);
    if (error || !draft) {
      const status = invalidStatus(error ?? "NO_RESULT");
      for (const url of domainUrls) {
        results.push({ url, domain, status, reason: error ?? "NO_RESULT" });
      }
      continue;
    }

    const duplicateCompany = draft.duplicateOfCompanyId ? companiesById.get(draft.duplicateOfCompanyId) : null;
    const duplicateName = duplicateCompany?.name ?? (draft.duplicateHint ? draft.name : null);
    const duplicateHref =
      duplicateCompany ? `/catalogs/${duplicateCompany.categorySlug}/${duplicateCompany.slug}` : null;
    const firstUrl = domainUrls[0]!;
    const firstStatus: ImportCandidateResultStatus =
      draft.duplicateOfCompanyId || upsert.updatedIds.includes(draft.id) ? "skipped_duplicate" : "imported";
    results.push({
      url: firstUrl,
      domain,
      status: firstStatus,
      reason:
        firstStatus === "skipped_duplicate" ?
          draft.duplicateOfCompanyId ? "PUBLISHED_COMPANY_DUPLICATE" : "EXISTING_DRAFT_UPDATED"
        : "DRAFT_CREATED",
      draftId: draft.id,
      duplicateOfCompanyId: draft.duplicateOfCompanyId,
      duplicateName,
      duplicateHref,
    });
    for (const url of domainUrls.slice(1)) {
      results.push({
        url,
        domain,
        status: "skipped_duplicate",
        reason: "SAME_DOMAIN_ALREADY_IMPORTED",
        draftId: draft.id,
        duplicateOfCompanyId: draft.duplicateOfCompanyId,
        duplicateName: duplicateName ?? draft.name,
        duplicateHref,
      });
    }
  }

  for (const result of results) {
    logAdminCatalogImport("candidate result", {
      domain: result.domain,
      status: result.status,
      reason: result.reason ?? "",
    });
  }

  let session = null;
  if (existing) {
      const updatedCandidates = applyCandidateImportResults(existing.candidates, results);
      session = await updateImportCandidateSession(sessionId, updatedCandidates);
  }
  const summary = resultSummary(results);

  return NextResponse.json({
    ok: true,
    results,
    summary,
    drafts,
    draftIds: drafts.map((d) => d.id),
    createdIds: upsert.createdIds,
    updatedIds: upsert.updatedIds,
    count: drafts.length,
    created: upsert.createdIds.length,
    updated: upsert.updatedIds.length,
    errors,
    dbDraftCount,
    session,
    requestedCount,
    processedCount: urlsToProcess.length,
    processedLimit: MAX_URLS_PER_BATCH,
    truncated,
    importUrl: "/admin/catalogs/import/drafts",
    sourceOfferDrafts,
    sourceOfferImportUrl: "/admin/catalogs/import/drafts?panel=source-offers",
  });
}
