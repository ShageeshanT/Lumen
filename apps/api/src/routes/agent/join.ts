import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { LumenHttpError } from "@lumen/shared";

import type { AppEnv } from "../../app";
import type { ControlPlane } from "../../context";
import { credentialMatches, parseAgentBearer } from "../../gateway/verify";
import { clientIp } from "../../lib/client-ip";
import { WindowLimiter } from "../../lib/rate-limit";
import { publishEvent } from "../../realtime/topics";
import { ErrorResponse, internalErrorResponse } from "../../schemas/error";
import { consumeJoinToken } from "../../services/servers/join-tokens";
import { loadServer } from "../../services/servers/servers";

const Host = z
  .object({
    os: z.string().max(64).optional(),
    os_version: z.string().max(64).optional(),
    arch: z.string().max(16).optional(),
    cpu_cores: z.number().int().min(0).max(4096).optional(),
    memory_bytes: z.number().min(0).optional(),
    disk_bytes: z.number().min(0).optional(),
    docker_version: z.string().max(64).optional(),
    public_ip: z.union([z.ipv4(), z.ipv6(), z.literal("")]).optional(),
    hostname: z.string().max(255).optional(),
    kernel: z.string().max(128).optional(),
    agent_version: z.string().max(64).optional(),
    protocol_version: z.number().int().min(0).optional(),
    provider: z.string().max(32).optional(),
    region_label: z.string().max(64).optional(),
  })
  .openapi("AgentHostFacts");

const JoinBody = z
  .object({
    join_token: z.string().min(16).max(128),
    public_key: z
      .string()
      .refine((s) => Buffer.from(s, "base64").length === 32, "must be a base64 Ed25519 public key"),
    host: Host,
  })
  .openapi("AgentJoinRequest");

const JoinResponse = z
  .object({
    server_id: z.string(),
    name: z.string(),
    credential: z.string().openapi({ description: "Shown once; stored only as a SHA-256 hash." }),
    control_plane_ws_url: z.string(),
    control_plane_public_key: z
      .string()
      .openapi({ description: "Base64 Ed25519 key that signs control plane envelopes." }),
    observed_ip: z.string().nullable(),
  })
  .openapi("AgentJoinResponse");

const joinRoute = createRoute({
  method: "post",
  path: "/agent/v1/join",
  operationId: "agentJoin",
  tags: ["agent"],
  summary: "Exchange a join token for a server credential",
  description:
    "Called by `lumen-agent join`. The token is single use and expires after an hour; expired, used and unknown tokens all return the same 401. Limited to 10 attempts per minute per address.",
  security: [],
  request: { body: { content: { "application/json": { schema: JoinBody } }, required: true } },
  responses: {
    200: { description: "Joined", content: { "application/json": { schema: JoinResponse } } },
    400: {
      description: "Invalid request",
      content: { "application/json": { schema: ErrorResponse } },
    },
    401: {
      description: "Token expired, used or unknown",
      content: { "application/json": { schema: ErrorResponse } },
    },
    429: {
      description: "Too many attempts",
      content: { "application/json": { schema: ErrorResponse } },
    },
    500: internalErrorResponse,
  },
});

const credentialRoute = createRoute({
  method: "get",
  path: "/agent/v1/credential",
  operationId: "agentCheckCredential",
  tags: ["agent"],
  summary: "Check a server credential",
  description:
    "Used by the installer's re-run (`lumen-agent status --check-credential`). Bearer `<server_id>.<credential>`.",
  security: [],
  responses: {
    200: {
      description: "Valid",
      content: {
        "application/json": { schema: z.object({ server_id: z.string(), name: z.string() }) },
      },
    },
    401: {
      description: "Invalid or revoked",
      content: { "application/json": { schema: ErrorResponse } },
    },
    500: internalErrorResponse,
  },
});

function wsUrl(publicUrl: string): string {
  const u = new URL(publicUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = `${u.pathname.replace(/\/$/, "")}/agent/v1`;
  return u.toString();
}

export function agentJoinRoutes(cp: ControlPlane): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  const limiter = new WindowLimiter(cp.config.AGENT_JOIN_RATE_LIMIT, 60_000);

  app.openapi(joinRoute, async (c) => {
    const ip = clientIp(c, cp.config.TRUST_PROXY);
    const wait = limiter.hit(ip ?? "unknown");
    if (wait > 0) {
      throw new LumenHttpError("RATE_LIMITED", { retryAfterS: wait });
    }
    const body = c.req.valid("json");
    const joined = await consumeJoinToken(cp, {
      token: body.join_token,
      publicKey: body.public_key,
      host: body.host,
      remoteIp: ip,
    });
    const now = cp.now();
    await publishEvent(cp.bus, {
      type: "server.status",
      server_id: joined.serverId,
      workspace_id: joined.workspaceId,
      status: "pending",
      previous: null,
      last_heartbeat_at: null,
      at: now.toISOString(),
    });
    cp.logger.info({ server_id: joined.serverId }, "server joined");
    const publicUrl = cp.config.PUBLIC_URL ?? new URL(c.req.url).origin;
    return c.json(
      {
        server_id: joined.serverId,
        name: joined.name,
        credential: joined.credential,
        control_plane_ws_url: wsUrl(publicUrl),
        control_plane_public_key: Buffer.from(cp.instanceKey.publicKeyRaw).toString("base64"),
        observed_ip: ip,
      },
      200,
    );
  });

  app.openapi(credentialRoute, async (c) => {
    const auth = parseAgentBearer(c.req.header("authorization"));
    if (auth === null) {
      throw new LumenHttpError("UNAUTHENTICATED");
    }
    const row = await loadServer(cp, auth.serverId);
    if (row === null || !credentialMatches(row, auth.credential, cp.now())) {
      throw new LumenHttpError("UNAUTHENTICATED");
    }
    return c.json({ server_id: row.id, name: row.name }, 200);
  });

  return app;
}
