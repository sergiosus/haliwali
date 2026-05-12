import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getPool, usesPostgres } from "./pgPool";
import { assertFileStoreNotUsedInProduction } from "./productionGuards";

const AUDIT_JSONL_PATH = path.join(process.cwd(), ".data", "admin-audit-log.jsonl");

export type AdminAuditAction = "user_soft_deleted" | "user_restored" | "user_purged";

export async function appendAdminAuditLog(args: {
  adminUserId: string;
  targetUserId: string;
  action: AdminAuditAction;
  reason?: string;
}): Promise<void> {
  const adminUserId = (args.adminUserId ?? "").trim() || "admin";
  const targetUserId = (args.targetUserId ?? "").trim();
  if (!targetUserId) return;
  const reason = (args.reason ?? "").trim() || null;

  if (usesPostgres()) {
    await getPool().query(
      `INSERT INTO admin_audit_log (admin_user_id, target_user_id, action, reason)
       VALUES ($1, $2, $3, $4)`,
      [adminUserId, targetUserId, args.action, reason],
    );
    return;
  }

  assertFileStoreNotUsedInProduction("serverAdminAuditLog.appendAdminAuditLog", { path: AUDIT_JSONL_PATH });
  await mkdir(path.dirname(AUDIT_JSONL_PATH), { recursive: true });
  const row = {
    adminUserId,
    targetUserId,
    action: args.action,
    reason,
    createdAt: Date.now(),
  };
  await appendFile(AUDIT_JSONL_PATH, `${JSON.stringify(row)}\n`, "utf8");
}
