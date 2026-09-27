import { randomBytes } from "node:crypto";

import pg from "pg";

import { createDb, runMigrations, type DbHandle } from "@lumen/db";

import { createApp } from "../app";
import { loadConfig, type Config } from "../config";
import type { ControlPlane } from "../context";
import { GatewayMetrics } from "../gateway/metrics";
import { Registry } from "../gateway/registry";
import { instanceKeyFromSeed } from "../gateway/signing-key";
import { createLogger } from "../logger";
import { PgBus } from "../realtime/bus";
import type { Prober } from "../workers/port-check";

export const DATABASE_URL = process.env["DATABASE_URL"];
export const ADMIN_TOKEN = "test-admin-token-0123456789abcdef0123456789";

function withSearchPath(url: string, schema: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}options=-c%20search_path%3D${schema}`;
}

export interface Harness {
  cp: ControlPlane;
  handle: DbHandle;
  config: Config;
  scopedUrl: string;
  app: ReturnType<typeof createApp>;
  close: () => Promise<void>;
}

/**
 * A control plane on a fresh Postgres schema: migrations applied, a real
 * LISTEN/NOTIFY bus, registry and instance key. Needs DATABASE_URL.
 */
export async function createHarness(
  overrides: Record<string, string> = {},
  opts: { prober?: Prober; requestTimeoutMs?: number } = {},
): Promise<Harness> {
  if (DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is required");
  }
  const schema = `t_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  await admin.query(`create schema "${schema}"`);
  await admin.end();
  const scopedUrl = withSearchPath(DATABASE_URL, schema);
  await runMigrations(scopedUrl, { migrationsSchema: schema });
  const config = loadConfig({
    DATABASE_URL: scopedUrl,
    LUMEN_ADMIN_TOKEN: ADMIN_TOKEN,
    PUBLIC_URL: "https://cp.example.com",
    NODE_ENV: "test",
    AGENT_JOIN_RATE_LIMIT: "1000",
    ...overrides,
  });
  const logger = createLogger("silent");
  const handle = createDb(scopedUrl, { max: 4 });
  const bus = new PgBus(handle.pool, scopedUrl, logger);
  const metrics = new GatewayMetrics();
  const registry = new Registry({
    db: handle.db,
    bus,
    nodeId: `test-${schema}`,
    logger,
    metrics,
    ...(opts.requestTimeoutMs === undefined ? {} : { timeoutMs: opts.requestTimeoutMs }),
  });
  await registry.start();
  const cp: ControlPlane = {
    db: handle.db,
    pool: handle.pool,
    bus,
    logger,
    config,
    instanceKey: instanceKeyFromSeed(randomBytes(32)),
    registry,
    metrics,
    now: () => new Date(),
  };
  const app = createApp({
    config,
    pool: handle.pool,
    logger,
    version: "0.0.0-test",
    controlPlane: cp,
    ...(opts.prober === undefined ? {} : { prober: opts.prober }),
  });
  return {
    cp,
    handle,
    config,
    scopedUrl,
    app,
    close: async () => {
      registry.closeAll();
      await bus.close();
      await handle.close();
      const a = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
      await a.query(`drop schema "${schema}" cascade`);
      await a.end();
    },
  };
}

export const auth = { authorization: `Bearer ${ADMIN_TOKEN}` };
export const json = { "content-type": "application/json" };
