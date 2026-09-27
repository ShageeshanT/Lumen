import { createMiddleware } from "hono/factory";

import { LumenHttpError } from "@lumen/shared";

import { secretEqual } from "../lib/crypto";

export interface ActorVariables {
  actor: string;
}

/**
 * Temporary guard for instance-admin routes: `Authorization: Bearer
 * <LUMEN_ADMIN_TOKEN>`. Phase 04 replaces it with sessions, API tokens and
 * RBAC. With no token configured every guarded route answers 401.
 */
export function requireAdmin(token: string | undefined) {
  return createMiddleware<{ Variables: ActorVariables }>(async (c, next) => {
    const header = c.req.header("authorization");
    if (
      token === undefined ||
      header?.startsWith("Bearer ") !== true ||
      !secretEqual(header.slice(7).trim(), token)
    ) {
      throw new LumenHttpError("UNAUTHENTICATED");
    }
    c.set("actor", "instance-admin");
    await next();
  });
}
