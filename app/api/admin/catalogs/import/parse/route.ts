import path from "node:path";
import { NextResponse } from "next/server";
import {
  parseUrlList,
  processCsvInput,
  processTextInput,
  processUrlBatch,
} from "../../../../../lib/catalogExtractionService";
import { recordCatalogImportSession } from "../../../../../lib/serverCatalogImportSessionStore";
import type { CatalogImportParseKind } from "../../../../../lib/catalogImportTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";
import { checkIpRateLimit, extractIp } from "../../../../../lib/serverAbuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_IP_PATH = path.join(process.cwd(), ".data", "catalog-import-url-ip.json");
const RL_IP_LIMIT = 40;
const RL_WINDOW_MS = 60 * 60 * 1000;

function parseKind(v: unknown): CatalogImportParseKind | null {
  if (v === "csv" || v === "text" || v === "url" || v === "urls") return v;
  return null;
}

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const contentType = req.headers.get("content-type") ?? "";
  let kind: CatalogImportParseKind | null = null;
  let categorySlug = "";
  let city = "";
  let text = "";
  let url = "";
  let vkPaste = false;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    kind = parseKind(form.get("kind"));
    categorySlug = String(form.get("categorySlug") ?? form.get("category") ?? "").trim().toLowerCase();
    city = String(form.get("city") ?? "").trim();
    url = String(form.get("url") ?? "").trim();
    const pasted = form.get("text");
    if (typeof pasted === "string") text = pasted;
    const urlsField = form.get("urls");
    if (typeof urlsField === "string" && urlsField.trim()) text = urlsField;
    vkPaste = form.get("vkPaste") === "true" || form.get("vkPaste") === "1";
    const file = form.get("file");
    if (file instanceof File) text = await file.text();
    else if (!text && typeof form.get("csv") === "string") text = String(form.get("csv"));
  } else {
    const body = (await req.json()) as Record<string, unknown>;
    kind = parseKind(body.kind);
    categorySlug = String(body.categorySlug ?? body.category ?? "").trim().toLowerCase();
    city = String(body.city ?? "").trim();
    text = String(body.text ?? body.urls ?? "").trim();
    url = String(body.url ?? "").trim();
    vkPaste = Boolean(body.vkPaste);
  }

  if (!kind) {
    return NextResponse.json({ ok: false, error: "INVALID_KIND" }, { status: 400 });
  }
  if (!categorySlug) {
    return NextResponse.json({ ok: false, error: "CATEGORY_REQUIRED" }, { status: 400 });
  }

  const defaults = { categorySlug, city };

  if (kind === "url" || kind === "urls") {
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

    const urls = kind === "urls" ? parseUrlList(text || url) : [url || text].filter((u) => /^https?:\/\//i.test(u));
    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "URL_REQUIRED" }, { status: 400 });
    }

    const { drafts, errors } = await processUrlBatch(urls, defaults);
    await recordCatalogImportSession({
      query: urls.join("\n").slice(0, 2000),
      city,
      categorySlug,
      resultCount: drafts.length,
    });
    return NextResponse.json({
      ok: true,
      drafts,
      count: drafts.length,
      errors,
    });
  }

  if (kind === "text") {
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "TEXT_REQUIRED" }, { status: 400 });
    }
    const drafts = await processTextInput(text, defaults, { vkPaste });
    return NextResponse.json({ ok: true, drafts, count: drafts.length });
  }

  const drafts = await processCsvInput(text, defaults);
  if (drafts.length === 0) {
    return NextResponse.json({ ok: false, error: "EMPTY_CSV" }, { status: 400 });
  }
  await recordCatalogImportSession({
    query: "csv upload",
    city,
    categorySlug,
    resultCount: drafts.length,
  });
  return NextResponse.json({ ok: true, drafts, count: drafts.length });
}
