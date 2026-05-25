import { NextResponse } from "next/server";
import {
  getImportCandidateSession,
  getLatestImportCandidateSession,
  updateImportCandidateSession,
} from "../../../../../lib/serverCatalogImportCandidatesStore";
import type { PersistedImportCandidate } from "../../../../../lib/catalogImportCandidateTypes";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const idParam = new URL(req.url).searchParams.get("id");
  const session =
    idParam ?
      await getImportCandidateSession(Number(idParam))
    : await getLatestImportCandidateSession();

  if (!session) {
    return NextResponse.json({ ok: true, session: null });
  }
  return NextResponse.json({ ok: true, session });
}

export async function PATCH(req: Request) {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  const body = (await req.json()) as Record<string, unknown>;
  const sessionId = Number(body.sessionId);
  const candidates = body.candidates as PersistedImportCandidate[] | undefined;

  if (!Number.isFinite(sessionId) || sessionId < 1) {
    return NextResponse.json({ ok: false, error: "SESSION_ID_REQUIRED" }, { status: 400 });
  }
  if (!Array.isArray(candidates)) {
    return NextResponse.json({ ok: false, error: "CANDIDATES_REQUIRED" }, { status: 400 });
  }

  const session = await updateImportCandidateSession(sessionId, candidates);
  if (!session) {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}
