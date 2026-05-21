import { NextResponse } from "next/server";
import path from "node:path";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";
import { checkIdentifierRateLimit, checkIpRateLimit, extractIp } from "../../../lib/serverAbuse";
import { importListingFromPublicUrl, type ListingUrlImportErrorCode } from "../../../lib/listingUrlImport";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_IP_PATH = path.join(process.cwd(), ".data", "listing-import-url-ip.json");
const RL_USER_SCOPE = "listing_import_url_user";
const RL_IP_LIMIT = 30;
const RL_USER_LIMIT = 15;
const RL_WINDOW_MS = 60 * 60 * 1000;

function userMessage(code: ListingUrlImportErrorCode): string {
  switch (code) {
    case "INVALID_URL":
    case "BLOCKED_URL":
      return "Некорректная ссылка";
    case "TIMEOUT":
      return "Сайт долго отвечает. Попробуйте позже.";
    case "EMPTY_RESULT":
    case "RESPONSE_TOO_LARGE":
    case "FETCH_FAILED":
    default:
      return "Не удалось автоматически получить данные. Можно создать черновик и заполнить вручную.";
  }
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const sessionUserId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!sessionUserId) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: "Войдите в аккаунт" }, { status: 401 });
  }

  const ip = extractIp(req);
  const rlIp = await checkIpRateLimit({
    path: RL_IP_PATH,
    ip,
    limit: RL_IP_LIMIT,
    windowMs: RL_WINDOW_MS,
  });
  const rateLimitMessage = "Слишком много попыток. Подождите немного и попробуйте снова.";

  if (!rlIp.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT", message: rateLimitMessage },
      { status: 429 },
    );
  }

  const rlUser = await checkIdentifierRateLimit({
    scope: RL_USER_SCOPE,
    identifier: sessionUserId,
    limit: RL_USER_LIMIT,
    windowMs: RL_WINDOW_MS,
  });
  if (!rlUser.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT", message: rateLimitMessage },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_URL", message: userMessage("INVALID_URL") },
      { status: 400 },
    );
  }

  const url = typeof (body as { url?: unknown })?.url === "string" ? (body as { url: string }).url : "";
  const result = await importListingFromPublicUrl(url);
  if (!result.ok) {
    const status =
      result.code === "INVALID_URL" || result.code === "BLOCKED_URL" ? 400
      : result.code === "TIMEOUT" ? 504
      : 422;
    return NextResponse.json(
      { ok: false, error: result.code, message: userMessage(result.code) },
      { status },
    );
  }

  const { title, description, priceRub } = result.data;
  return NextResponse.json({
    ok: true,
    draft: {
      title,
      description,
      price: priceRub,
      showPhotoHint: true,
    },
  });
}
