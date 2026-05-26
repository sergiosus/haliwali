import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../../../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../../../../lib/serverSession";
import { requestCatalogCompanyClaim } from "../../../../../lib/serverCatalogStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { slug } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const claim = await requestCatalogCompanyClaim({
    slug,
    userId,
    proofType: cleanText(body.proofType, 40) || "manual",
    proofValue: cleanText(body.proofValue, 300),
    message: cleanText(body.message, 1000),
  });

  if (!claim) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, claimId: claim.id, status: claim.status });
}
