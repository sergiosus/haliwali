import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";
import { getUserIdFromSessionCookie } from "../../lib/serverSession";
import { appendReport } from "../../lib/serverTrustStore";

export const runtime = "nodejs";

const REASON_KEYS = new Set(["fraud", "prohibited", "spam", "insults", "other"]);

const REASON_LABELS: Record<string, string> = {
  fraud: "Мошенничество",
  prohibited: "Запрещённый товар/услуга",
  spam: "Спам",
  insults: "Оскорбления",
  other: "Другое",
};

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  const reporterId = await getUserIdFromSessionCookie();
  if (!reporterId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    targetType?: string;
    targetId?: string;
    reason?: string;
    comment?: string;
  };
  const targetType = body.targetType === "listing" || body.targetType === "user" ? body.targetType : "";
  const targetId = (body.targetId ?? "").trim();
  const reasonKey = typeof body.reason === "string" ? body.reason.trim() : "";
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : "";

  if (!targetType || !targetId || !REASON_KEYS.has(reasonKey)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  await appendReport({
    reporterId,
    targetType,
    targetId,
    reason: REASON_LABELS[reasonKey] ?? reasonKey,
    comment,
  });
  return NextResponse.json({ ok: true });
}
