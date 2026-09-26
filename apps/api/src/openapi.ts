import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

import type { AppEnv } from "./app";

/** Registers the OpenAPI document and the interactive reference page. */
export function registerOpenApi(app: OpenAPIHono<AppEnv>, version: string): void {
  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description:
      "An API token. Tokens and their scopes arrive in Phase 14; the dashboard uses a session cookie instead. Routes marked public (an empty security list) need neither.",
  });

  app.doc31("/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Lumen API",
      version,
      description:
        "The public API of a Lumen instance. The dashboard, CLI and MCP server all use it; anything they can do, you can do with a token.",
    },
    servers: [{ url: "/", description: "This instance" }],
    tags: [{ name: "system", description: "Instance health and metadata" }],
    // Every route requires a token unless it opts out with `security: []`.
    security: [{ bearerAuth: [] }],
  });

  app.get(
    "/v1/docs",
    Scalar({
      url: "/v1/openapi.json",
      pageTitle: "Lumen API",
      theme: "kepler",
    }),
  );
}
