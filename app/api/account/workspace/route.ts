import { NextResponse } from "next/server";
import { loadAccountWorkspace, parseWorkspaceFilters } from "../../../lib/serverAccountWorkspace";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

/** Aggregated workspace for the signed-in user (chats, tasks, summaries, notes). */
export async function GET(req: Request) {
  const userId = ((await getUserIdFromSessionCookie()) ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const filters = parseWorkspaceFilters(new URL(req.url).searchParams);
  try {
    const data = await loadAccountWorkspace(userId, filters);
    return NextResponse.json({ ok: true, filters, ...data });
  } catch {
    return NextResponse.json(
      { error: "UNAVAILABLE", message: "Не удалось загрузить рабочее пространство." },
      { status: 503 },
    );
  }
}
