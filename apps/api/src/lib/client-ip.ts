import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/**
 * The client's address. X-Forwarded-For is only trusted when TRUST_PROXY is
 * set (the control plane sits behind its own Caddy); otherwise it could be
 * forged to dodge rate limits.
 */
export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first !== undefined && first !== "") {
      return first;
    }
  }
  try {
    const addr = getConnInfo(c).remote.address;
    if (addr === undefined) {
      return null;
    }
    return addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  } catch {
    // app.request() in tests has no socket.
    return null;
  }
}
