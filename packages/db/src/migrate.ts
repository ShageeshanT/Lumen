import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";

import { createDb } from "./client.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

export interface MigrateOptions {
  /** Schema that holds Drizzle's migration journal. Default `drizzle`. */
  migrationsSchema?: string;
}

export interface MigrateResult {
  /** Number of migrations this run applied; 0 when the database was already current. */
  applied: number;
}

/**
 * Applies every pending migration from `packages/db/migrations`. Safe to run
 * repeatedly: a second run applies nothing.
 */
export async function runMigrations(
  connectionString: string,
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  const migrationsSchema = options.migrationsSchema ?? "drizzle";
  if (!SCHEMA_NAME.test(migrationsSchema)) {
    throw new Error(`Invalid migrations schema name: ${migrationsSchema}`);
  }
  const handle = createDb(connectionString, { max: 1 });
  try {
    const before = await countApplied(handle.pool, migrationsSchema);
    await migrate(handle.db, { migrationsFolder, migrationsSchema });
    const after = await countApplied(handle.pool, migrationsSchema);
    return { applied: after - before };
  } finally {
    await handle.close();
  }
}

async function countApplied(pool: pg.Pool, schema: string): Promise<number> {
  const exists = await pool.query<{ count: string }>(
    "select count(*)::text as count from information_schema.tables where table_schema = $1 and table_name = '__drizzle_migrations'",
    [schema],
  );
  if (exists.rows[0]?.count !== "1") {
    return 0;
  }
  const rows = await pool.query<{ count: string }>(
    `select count(*)::text as count from "${schema}"."__drizzle_migrations"`,
  );
  return Number(rows.rows[0]?.count ?? "0");
}
