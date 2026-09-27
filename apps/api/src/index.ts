import { createDb } from "@lumen/db";

import pkg from "../package.json" with { type: "json" };

import { ConfigError, loadConfig, loadDotEnv, redactConnectionString } from "./config";
import { createLogger } from "./logger";
import { checkDb } from "./routes/health";
import { startServer } from "./server";

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

const db = await checkDb(handle.pool, 2_000);
if (db !== "ok") {
  logger.warn(
    `Postgres isn't reachable at ${redactConnectionString(config.DATABASE_URL)}. Start it with: pnpm dev:infra`,
  );
}
if (config.LUMEN_ADMIN_TOKEN === undefined) {
  logger.warn("LUMEN_ADMIN_TOKEN is not set; the server routes will answer 401 until it is.");
}

const running = await startServer({ config, logger, handle, version: pkg.version });
logger.info(
  { port: running.port },
  `Lumen API listening on ${config.TLS_CERT_FILE === undefined ? "http" : "https"}://localhost:${String(running.port)}`,
);

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  void running
    .close()
    .then(() => handle.close())
    .finally(() => {
      process.exit(0);
    });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
