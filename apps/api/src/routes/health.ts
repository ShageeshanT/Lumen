import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type pg from "pg";

import type { AppEnv } from "../app.js";
import { internalErrorResponse } from "../schemas/error.js";

export const HealthResponse = z
  .object({
    status: z.enum(["ok", "degraded"]).openapi({ example: "ok" }),
    version: z.string().openapi({ example: "0.0.0" }),
    db: z.enum(["ok", "unavailable"]).openapi({ example: "ok" }),
    uptime_s: z.number().int().nonnegative().openapi({ example: 42 }),
  })
  .openapi("Health");

export type Health = z.infer<typeof HealthResponse>;

const healthRoute = createRoute({
  method: "get",
  path: "/v1/health",
  operationId: "getHealth",
  tags: ["system"],
  summary: "Health of the API and its database",
  description:
    "Returns 200 when the database answers within two seconds and 503 otherwise, so uptime monitors can alert on it.",
  // Public: uptime monitors call this without a token.
  security: [],
  responses: {
    200: {
      description: "Healthy",
      content: { "application/json": { schema: HealthResponse } },
    },
    503: {
      description: "Database unavailable",
      content: { "application/json": { schema: HealthResponse } },
    },
    500: internalErrorResponse,
  },
});

export interface HealthDeps {
  pool: pg.Pool;
  version: string;
  startedAt: number;
  /** Default 2000 ms (SPEC Phase 0). */
  dbTimeoutMs?: number;
}

/** Runs `select 1` with a timeout; never throws. */
export async function checkDb(pool: pg.Pool, timeoutMs: number): Promise<"ok" | "unavailable"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"unavailable">((resolve) => {
    timer = setTimeout(() => {
      resolve("unavailable");
    }, timeoutMs);
  });
  const query = pool.query("select 1").then(
    () => "ok" as const,
    () => "unavailable" as const,
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function healthRoutes(deps: HealthDeps): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  app.openapi(healthRoute, async (c) => {
    const db = await checkDb(deps.pool, deps.dbTimeoutMs ?? 2_000);
    const uptime_s = Math.max(0, Math.floor((Date.now() - deps.startedAt) / 1000));
    if (db === "ok") {
      return c.json({ status: "ok" as const, version: deps.version, db, uptime_s }, 200);
    }
    return c.json({ status: "degraded" as const, version: deps.version, db, uptime_s }, 503);
  });
  return app;
}
