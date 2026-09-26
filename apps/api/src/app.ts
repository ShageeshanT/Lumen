import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type pg from "pg";

import { makeError } from "@lumen/shared";

import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import { errorHandler, notFoundHandler, type ErrorBody } from "./middleware/error.js";
import { requestId, type RequestIdVariables } from "./middleware/request-id.js";
import { registerOpenApi } from "./openapi.js";
import { healthRoutes } from "./routes/health.js";

export interface AppEnv {
  Variables: RequestIdVariables;
}

export interface AppDeps {
  config: Pick<Config, "WEB_ORIGIN">;
  pool: pg.Pool;
  logger: Logger;
  version: string;
  startedAt?: number;
  dbTimeoutMs?: number;
}

/** Builds the API without listening, so tests can call `app.request()`. */
export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) {
        return;
      }
      const detail = result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      return c.json<ErrorBody>({ error: makeError("VALIDATION_FAILED", { detail }) }, 400);
    },
  });

  app.use(requestId);
  app.use(secureHeaders());
  app.use(
    cors({
      origin: deps.config.WEB_ORIGIN,
      credentials: true,
      allowHeaders: ["content-type", "authorization", "x-request-id"],
      exposeHeaders: ["x-request-id"],
    }),
  );
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    deps.logger.info(
      {
        req: { method: c.req.method, path: c.req.path },
        status: c.res.status,
        duration_ms: Math.round(performance.now() - started),
        requestId: c.get("requestId"),
      },
      "request",
    );
  });

  const healthDeps = {
    pool: deps.pool,
    version: deps.version,
    startedAt: deps.startedAt ?? Date.now(),
    ...(deps.dbTimeoutMs === undefined ? {} : { dbTimeoutMs: deps.dbTimeoutMs }),
  };
  app.route("/", healthRoutes(healthDeps));
  registerOpenApi(app, deps.version);

  app.notFound(notFoundHandler);
  app.onError(errorHandler(deps.logger));
  return app;
}
