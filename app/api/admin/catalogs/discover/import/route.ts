import path from "node:path";
import { NextResponse } from "next/server";
import { logCatalogDiscover, logCatalogImport } from "../../../../../lib/catalogCatalogLog";
import { MAX_URLS_PER_BATCH, processUrlBatch } from "../../../../../lib/catalogExtractionService";
import { recordCatalogImportSession } from "../../../../../lib/serverCatalogImportSessionStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";
import { checkIpRateLimit, extractIp } from "../../../../../lib/serverAbuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_IP_PATH = path.join(process.cwd(), ".data", "catalog-discover-import-ip.json");
const RL_IP_LIMIT = 30;
const RL_WINDOW_MS = 60 * 60 * 1000;

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
  const urls = Array.isArray(body.urls)
    ? body.urls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u))
    : [];

  if (!categorySlug) {
    return NextResponse.json({ ok: false, error: "CATEGORY_REQUIRED" }, { status: 400 });
  }
  if (urls.length === 0) {
    return NextResponse.json({ ok: false, error: "URLS_REQUIRED" }, { status: 400 });
  }
  if (urls.length > MAX_URLS_PER_BATCH) {
    return NextResponse.json({ ok: false, error: "TOO_MANY_URLS", max: MAX_URLS_PER_BATCH }, { status: 400 });
  }

  logCatalogDiscover("import_batch", { urlCount: urls.length, categorySlug, city: city.slice(0, 40) });

  const searchQuery = String(body.searchQuery ?? body.query ?? "").trim();
  const { drafts, errors } = await processUrlBatch(urls, { categorySlug, city });

  await recordCatalogImportSession({
    query: searchQuery || urls.slice(0, 5).join("\n"),
    city,
    categorySlug,
    resultCount: drafts.length,
  });

  logCatalogImport("drafts_created", { count: drafts.length, errors: errors.length });

  return NextResponse.json({
    ok: true,
    drafts,
    count: drafts.length,
    errors,
    importUrl: "/admin/catalogs/import",
  });
}
