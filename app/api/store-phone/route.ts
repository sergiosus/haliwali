import { NextResponse } from "next/server";
import { denyIfMutationOriginForbidden } from "../../lib/serverCsrf";

export async function POST(req: Request) {
  const csrf = denyIfMutationOriginForbidden(req);
  if (csrf) return csrf;

  void req;
  return NextResponse.json({ error: "PHONE_DISABLED" }, { status: 410 });
}

