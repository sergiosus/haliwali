import { NextResponse } from "next/server";
import { getAdminPrivilegedFailure, restDenyPrivilegedAdminResponse } from "../../../../lib/serverAdminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy endpoint — direct publish disabled; use /api/admin/catalogs/import/parse */
export async function POST() {
  const deny = restDenyPrivilegedAdminResponse(await getAdminPrivilegedFailure());
  if (deny) return deny;

  return NextResponse.json(
    {
      ok: false,
      error: "DEPRECATED",
      message: "Используйте /admin/catalogs/import — импорт только через черновики и модерацию.",
      redirect: "/admin/catalogs/import",
    },
    { status: 410 },
  );
}
