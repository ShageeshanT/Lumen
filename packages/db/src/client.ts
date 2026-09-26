import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Maximum pooled connections. Default 10; the control plane must stay light (SPEC B14). */
  max?: number;
  /** How long to wait for a new connection before failing. Default 5 s. */
  connectionTimeoutMillis?: number;
}

/** Opens a connection pool and wraps it in Drizzle. Call `close()` on shutdown. */
export function createDb(connectionString: string, options: CreateDbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}
