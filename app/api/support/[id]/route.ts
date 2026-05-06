import path from "node:path";
import { NextResponse } from "next/server";
import { getPublicUserName } from "../../../lib/getPublicUserName";
import { adminPrivilegesActive } from "../../../lib/serverAdminSession";
import { readUsersDb } from "../../../lib/serverUsersStore";
import { getSupportTicketById } from "../../../lib/serverSupportStore";
import { getUserIdFromSessionCookie } from "../../../lib/serverSession";

export const runtime = "nodejs";

const USERS_PATH = path.join(process.cwd(), ".data", "verified-users.json");

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw ?? "").trim();
  if (!id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const ticket = await getSupportTicketById(id);
  if (!ticket) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const admin = await adminPrivilegesActive();
  const sessionUser = ((await getUserIdFromSessionCookie()) ?? "").trim();
  const owner = ticket.userId.trim();

  if (!admin) {
    if (!sessionUser || !owner || sessionUser !== owner) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return NextResponse.json({
      ticket: {
        ...ticket,
        messages: ticket.messages,
      },
    });
  }

  const db = await readUsersDb(USERS_PATH);
  let userDisplayName: string;
  if (ticket.source === "public_feedback" || !ticket.userId.trim()) {
    const cn = (ticket.contactName ?? "").trim();
    userDisplayName = cn || "Обратная связь (без имени)";
  } else {
    const u = db.usersById[ticket.userId];
    const emailTrim = (u?.email ?? "").trim();
    userDisplayName =
      (u?.deletionStatus ?? "") === "deleted"
        ? "Удалённый пользователь"
        : getPublicUserName({
            name: u?.name,
            displayName: u?.displayName,
            email: emailTrim,
          });
  }

  return NextResponse.json({
    ticket: {
      ...ticket,
      userDisplayName,
      messages: ticket.messages,
    },
  });
}
