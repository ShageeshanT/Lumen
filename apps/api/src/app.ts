import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type pg from "pg";

import { makeError } from "@lumen/shared";

import type { Config } from "./config";
import type { ControlPlane } from "./context";
import { clientIp } from "./lib/client-ip";
import type { Logger } from "./logger";
import { errorHandler, notFoundHandler, type ErrorBody } from "./middleware/error";
import { requestId, type RequestIdVariables } from "./middleware/request-id";
import { registerOpenApi } from "./openapi";
import { agentJoinRoutes } from "./routes/agent/join";
import { healthRoutes } from "./routes/health";
import { installRoutes } from "./routes/install/agent-script";
import { serverRoutes } from "./routes/servers/index";
import type { Prober } from "./workers/port-check";

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
  /** Server routes, the agent join endpoint and install routes need the control plane. */
  controlPlane?: ControlPlane;
  /** Replaces the network prober in port-check tests. */
  prober?: Prober;
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
  if (deps.controlPlane !== undefined) {
    const cp = deps.controlPlane;
    app.route("/", agentJoinRoutes(cp));
    app.route("/", serverRoutes(cp, deps.prober === undefined ? {} : { prober: deps.prober }));
    app.route("/", installRoutes(cp));
    // Gateway metrics for loopback scrapers only (PHASE-02 §5).
    app.get("/internal/metrics", (c) => {
      const addr = clientIp(c, false);
      if (addr !== "127.0.0.1" && addr !== "::1") {
        return notFoundHandler(c);
      }
      return c.text(cp.metrics.render(), 200, { "content-type": "text/plain; version=0.0.4" });
    });
  }
  registerOpenApi(app, deps.version);

  app.notFound(notFoundHandler);
  app.onError(errorHandler(deps.logger));
  return app;
}
