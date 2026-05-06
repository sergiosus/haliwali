import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertFileStoreNotUsedInProduction, isProduction } from "./productionGuards";

const OVERRIDE_PATH = path.join(process.cwd(), ".data", "admin-login-override.txt");

function ensureDirFor(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Password for legacy dev-only `ADMIN_PASSWORD` / admin_session login.
 * In production, only `ADMIN_PASSWORD` is used (no `.data` override file).
 */
export function getAdminPassword(): string {
  if (isProduction()) {
    return (process.env.ADMIN_PASSWORD ?? "").trim();
  }
  try {
    if (existsSync(OVERRIDE_PATH)) {
      const fromFile = readFileSync(OVERRIDE_PATH, "utf8").trim();
      if (fromFile) return fromFile;
    }
  } catch {
    /* ignore */
  }
  return (process.env.ADMIN_PASSWORD ?? "").trim();
}

/** Persist new password to `.data/admin-login-override.txt` (env is unchanged). Development only. */
export function setAdminPassword(next: string): void {
  const v = (next ?? "").trim();
  if (!v) return;
  assertFileStoreNotUsedInProduction("admin-login-override.txt", { op: "setAdminPassword" });
  ensureDirFor(OVERRIDE_PATH);
  writeFileSync(OVERRIDE_PATH, v, "utf8");
}
