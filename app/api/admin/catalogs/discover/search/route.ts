import { NextResponse } from "next/server";
import { logCatalogDiscover } from "../../../../../lib/catalogCatalogLog";
import { toPersistedCandidates } from "../../../../../lib/catalogImportCandidateTypes";
import { rankAndFilterCandidates } from "../../../../../lib/catalogDiscoverRanking";
import { searchLocaleParams } from "../../../../../lib/catalogSearchQueryBuilder";
import { groupCandidatesByDomain, searchPublicWeb } from "../../../../../lib/catalogSearchProvider";
import { saveImportCandidateSession } from "../../../../../lib/serverCatalogImportCandidatesStore";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  SEARCH_PROVIDER_NONE:
    "Поиск не настроен. Задайте SEARCH_PROVIDER и SEARCH_API_KEY (serpapi, brave, bing, yandex_xml, dataforseo).",
  SEARCH_API_KEY_MISSING: "Не задан SEARCH_API_KEY.",
  EMPTY_QUERY: "Введите поисковый запрос.",
  SEARCH_FAILED: "Ошибка поискового API.",
};

export async function POST(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const query = String(body.query ?? "").trim();
  const city = String(body.city ?? "").trim();
  const categorySlug = String(body.categorySlug ?? "drugie").trim().toLowerCase();
  const locale = searchLocaleParams();

  const result = await searchPublicWeb({ query, city, categorySlug });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        message: ERROR_MESSAGES[result.error ?? ""] ?? "Поиск недоступен",
        candidates: [],
        hidden: [],
        groups: {},
        hiddenCount: 0,
        queriesUsed: result.queriesUsed,
      },
      { status: result.error === "SEARCH_PROVIDER_NONE" ? 503 : 400 },
    );
  }

  const { visible, hidden } = rankAndFilterCandidates(result.candidates, {
    city,
    categorySlug,
    query,
    regionBoost: locale.regionBoost,
  });

  const groups = groupCandidatesByDomain(visible);

  logCatalogDiscover("ranked", {
    visible: visible.length,
    hidden: hidden.length,
    topScore: visible[0]?.relevanceScore,
  });

  let session = null;
  try {
    session = await saveImportCandidateSession({
      query,
      city,
      categorySlug,
      queriesUsed: result.queriesUsed,
      candidates: toPersistedCandidates(visible, hidden),
    });
  } catch {
    /* persistence optional when DB unavailable in dev */
  }

  return NextResponse.json({
    ok: true,
    sessionId: session?.id ?? null,
    session,
    candidates: visible,
    hidden,
    groups,
    count: visible.length,
    hiddenCount: hidden.length,
    queriesUsed: result.queriesUsed,
  });
}
