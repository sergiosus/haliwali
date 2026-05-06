import { NextResponse } from "next/server";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";
import { readSupportDb } from "../../../lib/serverSupportStore";
import { deriveSupportSubject, supportCategoryLabelRu } from "../../../lib/supportUiLabels";

export const runtime = "nodejs";

/** Список обращений текущего пользователя (для страницы «Поддержка»). */
export async function GET() {
  const uid = (await getUserIdFromSessionCookie()) ?? "";
  if (!uid.trim()) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const me = uid.trim();

  const db = await readSupportDb();
  const appeals = db.tickets
    .filter((t) => t.userId === me)
    .map((t) => {
      const last = t.messages[t.messages.length - 1];
      const preview = last ? (last.text.length > 100 ? `${last.text.slice(0, 97)}…` : last.text) : "";
      return {
        id: t.id,
        type: supportCategoryLabelRu(t.category),
        category: t.category,
        subject: deriveSupportSubject(t),
        status: t.status,
        updatedAt: t.updatedAt,
        createdAt: t.createdAt,
        preview,
        messageCount: t.messages.length,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return NextResponse.json({ appeals });
}
