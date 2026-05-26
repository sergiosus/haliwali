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

const PROOF_METHODS = new Set(["domain_email", "official_phone", "document_screenshot", "other"]);

function cleanEmail(value: unknown): string {
  return cleanText(value, 160).toLowerCase();
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

  const fullName = cleanText(body.fullName, 160);
  const position = cleanText(body.position, 120);
  const email = cleanEmail(body.email);
  const phone = cleanText(body.phone, 80);
  const companyWebsite = cleanText(body.companyWebsite, 300);
  const proofMethodRaw = cleanText(body.proofMethod, 40);
  const proofMethod =
    PROOF_METHODS.has(proofMethodRaw) ?
      (proofMethodRaw as "domain_email" | "official_phone" | "document_screenshot" | "other")
    : null;
  const proofText = cleanText(body.proofText, 2000);
  const proofFileUrl = cleanText(body.proofFileUrl, 500);
  const message = cleanText(body.message, 1000);

  if (!fullName || !position || !email || !phone || !proofMethod || !proofText) {
    return NextResponse.json({ ok: false, error: "REQUIRED_FIELDS_MISSING" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "EMAIL_INVALID" }, { status: 400 });
  }

  const claim = await requestCatalogCompanyClaim({
    slug,
    userId,
    fullName,
    position,
    email,
    phone,
    companyWebsite,
    proofMethod,
    proofText,
    proofFileUrl,
    proofType: proofMethod,
    proofValue: proofText.slice(0, 300),
    message,
  });

  if (!claim) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, claimId: claim.id, status: claim.status });
}
