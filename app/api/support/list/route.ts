import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../lib/serverAdminSession";
import { readSupportDb } from "../../../lib/serverSupportStore";
import { deriveSupportSubject } from "../../../lib/supportUiLabels";

export const runtime = "nodejs";

export async function GET() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const db = await readSupportDb();
  const tickets = db.tickets
    .map((t) => {
      const first = t.messages[0];
      const preview = first ? (first.text.length > 140 ? `${first.text.slice(0, 137)}…` : first.text) : "";
      const src = t.source ?? "account";
      const isPublic = src === "public_feedback";
      return {
        id: t.id,
        userId: t.userId,
        source: src,
        category: t.category,
        status: t.status,
        updatedAt: t.updatedAt,
        createdAt: t.createdAt,
        preview,
        subject: deriveSupportSubject(t),
        messageCount: t.messages.length,
        ...(t.listingId ? { listingId: t.listingId } : {}),
        ...(isPublic && (t.contactName ?? "").trim() ? { contactName: (t.contactName ?? "").trim() } : {}),
        ...(isPublic && (t.contactEmail ?? "").trim() ? { contactEmail: (t.contactEmail ?? "").trim() } : {}),
        ...(isPublic && (t.contactPhone ?? "").trim() ? { contactPhone: (t.contactPhone ?? "").trim() } : {}),
        ...(isPublic
          ? {
              userLabel: (t.contactName ?? "").trim() || "Обратная связь",
            }
          : {}),
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ tickets });
}
