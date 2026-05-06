import { Pool } from "pg";

let pool: Pool | null = null;

/** True when DATABASE_URL is set — enables PostgreSQL for users, sessions, and registration pending. */
export function usesPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Production requires DATABASE_URL before any auth DB access. */
export function assertProductionDatabaseUrl(): void {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is required in production for PostgreSQL-backed authentication and sessions.",
    );
  }
}

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. For local JSON auth, unset DATABASE_URL and run in development.",
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString, max: 15, idleTimeoutMillis: 30_000 });
  }
  return pool;
}
