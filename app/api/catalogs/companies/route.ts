import { NextResponse } from "next/server";
import { ensureCatalogReady, searchCatalogCompanies } from "../../../lib/serverCatalogStore";
import { saveExtractedDrafts } from "../../../lib/serverCatalogImportPipeline";
import { CATALOG_CATEGORY_SEED } from "../../../lib/catalogTypes";
import { normalizeWebsite } from "../../../lib/catalogExtractShared";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { denyIfMutationOriginForbidden } from "../../../lib/serverCsrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CATEGORY_SLUGS = new Set(CATALOG_CATEGORY_SEED.map((category) => category.slug));

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeOptionalUrl(value: unknown): string {
  const raw = cleanText(value, 500);
  if (!raw) return "";
  const normalized = normalizeWebsite(raw);
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return normalized;
  } catch {
    return "";
  }
}

function parseOptionalCoordinate(value: unknown, min: number, max: number): number | null {
  const raw = cleanText(value, 40).replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function GET(req: Request) {
  try {
    await ensureCatalogReady();
    const url = new URL(req.url);
    const category = (url.searchParams.get("category") ?? "").trim() || undefined;
    const q = (url.searchParams.get("q") ?? "").trim() || undefined;
    const city = (url.searchParams.get("city") ?? "").trim() || undefined;
    const companies = await searchCatalogCompanies({ categorySlug: category, q, city });
    return NextResponse.json({ ok: true, companies });
  } catch {
    return NextResponse.json({ ok: true, companies: [] });
  }
}

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const ownerUserId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const name = cleanText(body.name, 160);
  const categorySlug = cleanText(body.categorySlug, 80).toLowerCase();
  const city = cleanText(body.city, 120);
  const address = cleanText(body.address, 240);
  const description = cleanText(body.description, 1200);
  const website = normalizeOptionalUrl(body.website);
  const imageUrl = normalizeOptionalUrl(body.imageUrl) || null;
  const submittedPhone = cleanText(body.phone, 80);
  const submittedEmail = cleanText(body.email, 160);
  const latitude = parseOptionalCoordinate(body.latitude, -90, 90);
  const longitude = parseOptionalCoordinate(body.longitude, -180, 180);

  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "NAME_REQUIRED" }, { status: 400 });
  }
  if (!categorySlug || !VALID_CATEGORY_SLUGS.has(categorySlug)) {
    return NextResponse.json({ ok: false, error: "CATEGORY_REQUIRED" }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ ok: false, error: "CITY_REQUIRED" }, { status: 400 });
  }
  if (description.length < 10) {
    return NextResponse.json({ ok: false, error: "DESCRIPTION_REQUIRED" }, { status: 400 });
  }
  if (body.website && !website) {
    return NextResponse.json({ ok: false, error: "WEBSITE_INVALID" }, { status: 400 });
  }
  if (body.imageUrl && !imageUrl) {
    return NextResponse.json({ ok: false, error: "LOGO_INVALID" }, { status: 400 });
  }

  const submittedAt = new Date().toISOString();
  const drafts = await saveExtractedDrafts([
    {
      input: {
        name,
        categorySlug,
        city,
        address,
        phone: submittedPhone,
        email: submittedEmail,
        website,
        description,
        latitude,
        longitude,
        imageUrl,
        sourceUrl: website || null,
        socialLinks: [],
        confidenceScore: 0.7,
        rawPayload: {
          sourceType: "owner_submitted",
          origin: "owner_submitted",
          submissionStatus: "user_submitted",
          submissionType: "public_company_form",
          ownerUserId,
          submittedAt,
          submittedContact: {
            phone: submittedPhone,
            email: submittedEmail,
          },
        },
      },
      duplicateHint: "Добавлено владельцем",
      duplicateOfCompanyId: null,
      needsReview: true,
      sourceId: 0,
    },
  ]);

  const draft = drafts[0];
  if (!draft) {
    return NextResponse.json({ ok: false, error: "CREATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draftId: draft.id });
}
