import { serve } from "@hono/node-server";

import { createDb } from "@lumen/db";

import pkg from "../package.json" with { type: "json" };

import { createApp } from "./app";
import { ConfigError, loadConfig, loadDotEnv, redactConnectionString } from "./config";
import { createLogger } from "./logger";
import { checkDb } from "./routes/health";

loadDotEnv();

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger(config.LOG_LEVEL);
const handle = createDb(config.DATABASE_URL);
const app = createApp({ config, pool: handle.pool, logger, version: pkg.version });

void checkDb(handle.pool, 2_000).then((db) => {
  if (db !== "ok") {
    logger.warn(
      `Postgres isn't reachable at ${redactConnectionString(config.DATABASE_URL)}. Start it with: pnpm dev:infra`,
    );
  }
});

const server = serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  logger.info({ port: info.port }, `Lumen API listening on http://localhost:${String(info.port)}`);
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    void handle.close().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
