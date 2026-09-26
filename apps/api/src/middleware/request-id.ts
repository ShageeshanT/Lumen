import { createMiddleware } from "hono/factory";

import { isId, newId } from "@lumen/shared";

export const REQUEST_ID_HEADER = "x-request-id";

export interface RequestIdVariables {
  requestId: string;
}

/**
 * Gives every request a `req_<ulid>` id, echoed in the response header and
 * used as the support id on error cards. A well-formed incoming id is kept so
 * the CLI and dashboard can correlate retries.
 */
export const requestId = createMiddleware<{ Variables: RequestIdVariables }>(async (c, next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const id = incoming !== undefined && isId(incoming, "req") ? incoming : newId("req");
  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);
  await next();
});
