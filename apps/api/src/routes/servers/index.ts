import { create } from "@bufbuild/protobuf";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { servers } from "@lumen/db";
import { MetaSchema, RevokeSchema } from "@lumen/protocol";
import {
  AgentUpdateRequest,
  AgentUpdateState,
  CreateJoinToken,
  JoinTokenResponse,
  LumenHttpError,
  PatchServer,
  PortCheckRequest,
  PortCheckResult,
  Server,
  WorkspaceId,
} from "@lumen/shared";

import type { AppEnv } from "../../app";
import type { ControlPlane } from "../../context";
import { clientIp } from "../../lib/client-ip";
import { uuidv7 } from "../../lib/crypto";
import { requireAdmin, type ActorVariables } from "../../middleware/admin-auth";
import { publishEvent } from "../../realtime/topics";
import { ErrorResponse, internalErrorResponse } from "../../schemas/error";
import { recordAudit } from "../../services/audit";
import { createJoinToken, joinCommand } from "../../services/servers/join-tokens";
import { listServers, loadServer } from "../../services/servers/servers";
import { toServer } from "../../services/servers/view";
import { sendAgentUpdate } from "../../workers/agent-update-rollout";
import { runPortCheck, type Prober } from "../../workers/port-check";

type Env = AppEnv & { Variables: ActorVariables };

const err = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorResponse } },
});
const common = {
  400: err("Invalid request; the body lists each field problem"),
  401: err("Missing or wrong instance-admin token"),
  500: internalErrorResponse,
};
const IdParam = z.object({
  id: z
    .string()
    .regex(/^srv_[0-9a-hjkmnp-tv-z]{26}$/, "must be a server id like srv_01j8…")
    .openapi({ param: { name: "id", in: "path" }, example: "srv_01j8x9k2d3m4n5p6q7r8s9t0v1" }),
});

const ServerSchema = Server;
const PortCheckResultSchema = PortCheckResult;
const AgentUpdateStateSchema = AgentUpdateState;

const routes = {
  createJoinToken: createRoute({
    method: "post",
    path: "/v1/servers/join-tokens",
    operationId: "createJoinToken",
    tags: ["servers"],
    summary: "Create a join command for a new server",
    description:
      "Returns a single-use token (valid one hour) and the full command to paste into the server. The token is shown only here; Lumen stores its SHA-256.",
    request: {
      body: { content: { "application/json": { schema: CreateJoinToken } }, required: true },
    },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: JoinTokenResponse } },
      },
      ...common,
    },
  }),
  list: createRoute({
    method: "get",
    path: "/v1/servers",
    operationId: "listServers",
    tags: ["servers"],
    summary: "List servers",
    request: { query: z.object({ workspace_id: WorkspaceId.optional() }) },
    responses: {
      200: {
        description: "Servers, newest first",
        content: { "application/json": { schema: z.object({ servers: z.array(ServerSchema) }) } },
      },
      ...common,
    },
  }),
  get: createRoute({
    method: "get",
    path: "/v1/servers/{id}",
    operationId: "getServer",
    tags: ["servers"],
    summary: "Get a server with its checklist",
    request: { params: IdParam },
    responses: {
      200: { description: "The server", content: { "application/json": { schema: ServerSchema } } },
      404: err("No such server"),
      ...common,
    },
  }),
  patch: createRoute({
    method: "patch",
    path: "/v1/servers/{id}",
    operationId: "updateServer",
    tags: ["servers"],
    summary: "Rename, relabel or mark a server draining",
    description:
      "`status: draining` is a flag in this phase; moving services off arrives in Phase 12.",
    request: {
      params: IdParam,
      body: { content: { "application/json": { schema: PatchServer } }, required: true },
    },
    responses: {
      200: { description: "Updated", content: { "application/json": { schema: ServerSchema } } },
      404: err("No such server"),
      ...common,
    },
  }),
  remove: createRoute({
    method: "delete",
    path: "/v1/servers/{id}",
    operationId: "deleteServer",
    tags: ["servers"],
    summary: "Remove a server",
    description:
      "Sends Revoke to a connected agent (it deletes its credential and stops) and removes the server. Phase 03 adds 409 SERVER_HAS_SERVICES.",
    request: { params: IdParam },
    responses: { 204: { description: "Removed" }, 404: err("No such server"), ...common },
  }),
  portCheck: createRoute({
    method: "post",
    path: "/v1/servers/{id}/port-check",
    operationId: "checkServerPorts",
    tags: ["servers"],
    summary: "Check that ports reach this server from outside",
    description:
      "Asks the agent which ports listen, probes each from the control plane with a one-time nonce, stores the result on the server and returns it. Blocked ports carry the provider's fix cards.",
    request: {
      params: IdParam,
      body: { content: { "application/json": { schema: PortCheckRequest } }, required: false },
    },
    responses: {
      200: {
        description: "Result per port",
        content: { "application/json": { schema: PortCheckResultSchema } },
      },
      404: err("No such server"),
      503: err("The server is offline"),
      504: err("The agent didn't answer within a minute"),
      ...common,
    },
  }),
  agentUpdate: createRoute({
    method: "post",
    path: "/v1/servers/{id}/agent-update",
    operationId: "updateServerAgent",
    tags: ["servers"],
    summary: "Update the agent on a server",
    description:
      "Sends a signed release to the agent, which verifies it, trial-runs it, swaps it in and restarts. The final result arrives on the server's `agent_update` and as a `server.update` event.",
    request: {
      params: IdParam,
      body: { content: { "application/json": { schema: AgentUpdateRequest } }, required: false },
    },
    responses: {
      202: {
        description: "Sent",
        content: { "application/json": { schema: AgentUpdateStateSchema } },
      },
      404: err("No such server or release"),
      503: err("The server is offline"),
      504: err("The agent didn't answer within a minute"),
      ...common,
    },
  }),
  rotate: createRoute({
    method: "post",
    path: "/v1/servers/{id}/rotate-credential",
    operationId: "rotateServerCredential",
    tags: ["servers"],
    summary: "Rotate a server's credential",
    description:
      "The agent receives a new credential on its next connection (this process reconnects it right away when it holds the socket). The old credential keeps working for five minutes after delivery.",
    request: { params: IdParam },
    responses: {
      202: {
        description: "Rotation requested",
        content: {
          "application/json": {
            schema: z.object({ status: z.enum(["requested"]), reconnected: z.boolean() }),
          },
        },
      },
      404: err("No such server"),
      ...common,
    },
  }),
};

export function serverRoutes(cp: ControlPlane, deps: { prober?: Prober } = {}): OpenAPIHono<Env> {
  const app = new OpenAPIHono<Env>();
  app.use("/v1/servers", requireAdmin(cp.config.LUMEN_ADMIN_TOKEN));
  app.use("/v1/servers/*", requireAdmin(cp.config.LUMEN_ADMIN_TOKEN));
  const ip = (c: Parameters<typeof clientIp>[0]) => clientIp(c, cp.config.TRUST_PROXY);
  const mustLoad = async (id: string) => {
    const row = await loadServer(cp, id);
    if (row === null) {
      throw new LumenHttpError("NOT_FOUND", { resource: "server" });
    }
    return row;
  };

  app.openapi(routes.createJoinToken, async (c) => {
    const body = c.req.valid("json");
    const created = await createJoinToken(cp, body, c.get("actor"), ip(c));
    const publicUrl = cp.config.PUBLIC_URL ?? new URL(c.req.url).origin;
    return c.json(
      {
        token: created.token,
        expires_at: created.expiresAt.toISOString(),
        command: joinCommand(publicUrl, created.token),
      },
      201,
    );
  });

  app.openapi(routes.list, async (c) => {
    const { workspace_id } = c.req.valid("query");
    const rows = await listServers(cp, workspace_id);
    const now = cp.now();
    return c.json({ servers: rows.map((r) => toServer(r, now)) }, 200);
  });

  app.openapi(routes.get, async (c) => {
    const row = await mustLoad(c.req.valid("param").id);
    return c.json(toServer(row, cp.now()), 200);
  });

  app.openapi(routes.patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const row = await mustLoad(id);
    if (body.status === "draining" && row.status === "pending") {
      throw new LumenHttpError("VALIDATION_FAILED", {
        detail: "status: a server that hasn't connected yet can't be drained",
      });
    }
    const now = cp.now();
    const [updated] = await cp.db
      .update(servers)
      .set({
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.labels === undefined ? {} : { labels: body.labels }),
        ...(body.region_label === undefined ? {} : { regionLabel: body.region_label }),
        ...(body.monthly_cost === undefined ? {} : { monthlyCost: body.monthly_cost }),
        ...(body.status === undefined ? {} : { status: body.status }),
        updatedAt: now,
      })
      .where(eq(servers.id, id))
      .returning();
    if (updated === undefined) {
      throw new LumenHttpError("NOT_FOUND", { resource: "server" });
    }
    await recordAudit(cp.db, {
      workspaceId: row.workspaceId,
      actor: c.get("actor"),
      action: "server.update",
      target: id,
      metadata: { fields: Object.keys(body) },
      ip: ip(c),
    });
    if (body.status !== undefined && body.status !== row.status) {
      await publishEvent(cp.bus, {
        type: "server.status",
        server_id: id,
        workspace_id: row.workspaceId,
        status: body.status,
        previous: row.status as "pending" | "online" | "offline" | "draining",
        last_heartbeat_at: row.lastHeartbeatAt?.toISOString() ?? null,
        at: now.toISOString(),
      });
    }
    return c.json(toServer(updated, now), 200);
  });

  app.openapi(routes.remove, async (c) => {
    const { id } = c.req.valid("param");
    const row = await mustLoad(id);
    let revoked = false;
    try {
      await cp.registry.send(id, {
        case: "revoke",
        value: create(RevokeSchema, {
          meta: create(MetaSchema, { opId: uuidv7(), timestampMs: BigInt(cp.now().getTime()) }),
          reason: "This server was removed from Lumen.",
        }),
      });
      revoked = true;
    } catch {
      // Offline: the credential stops working when the row is gone.
    }
    await cp.db.delete(servers).where(eq(servers.id, id));
    await recordAudit(cp.db, {
      workspaceId: row.workspaceId,
      actor: c.get("actor"),
      action: "server.delete",
      target: id,
      metadata: { name: row.name, revoke_sent: revoked },
      ip: ip(c),
    });
    await publishEvent(cp.bus, {
      type: "server.deleted",
      server_id: id,
      workspace_id: row.workspaceId,
      at: cp.now().toISOString(),
    });
    setTimeout(() => {
      cp.registry.disconnect(id, 4003, "revoked");
    }, 2_000).unref();
    return c.body(null, 204);
  });

  app.openapi(routes.portCheck, async (c) => {
    const { id } = c.req.valid("param");
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = PortCheckRequest.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new LumenHttpError("VALIDATION_FAILED", {
        detail: parsed.error.issues
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; "),
      });
    }
    await mustLoad(id);
    const result = await runPortCheck(cp, id, parsed.data.ports, deps.prober);
    return c.json(result, 200);
  });

  app.openapi(routes.agentUpdate, async (c) => {
    const { id } = c.req.valid("param");
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsed = AgentUpdateRequest.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new LumenHttpError("VALIDATION_FAILED", {
        detail: parsed.error.issues
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; "),
      });
    }
    const row = await mustLoad(id);
    const state = await sendAgentUpdate(cp, id, parsed.data.version, parsed.data.force);
    await recordAudit(cp.db, {
      workspaceId: row.workspaceId,
      actor: c.get("actor"),
      action: "server.agent_update",
      target: id,
      metadata: { version: state.version, op_id: state.op_id },
      ip: ip(c),
    });
    return c.json(state, 202);
  });

  app.openapi(routes.rotate, async (c) => {
    const { id } = c.req.valid("param");
    const row = await mustLoad(id);
    await cp.db
      .update(servers)
      .set({ credentialRotationRequestedAt: cp.now(), updatedAt: cp.now() })
      .where(eq(servers.id, id));
    await recordAudit(cp.db, {
      workspaceId: row.workspaceId,
      actor: c.get("actor"),
      action: "server.rotate_credential",
      target: id,
      ip: ip(c),
    });
    const reconnected = cp.registry.isLocal(id);
    if (reconnected) {
      // The agent reconnects with its current credential and receives the new one.
      cp.registry.disconnect(id, 4000, "rotate_credential");
    }
    return c.json({ status: "requested" as const, reconnected }, 202);
  });

  return app;
}
