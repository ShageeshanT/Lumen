import { generateKeyPairSync } from "node:crypto";

import { create } from "@bufbuild/protobuf";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, serverJoinTokens, servers } from "@lumen/db";
import {
  AckSchema,
  ed25519RawPublicKey,
  PortCheckResultSchema,
  PortStateSchema,
  type EnvelopeBody,
} from "@lumen/protocol";
import { newId, PortCheckResult, Server } from "@lumen/shared";

import type { AgentLink } from "../../gateway/registry";
import { sha256Hex } from "../../lib/crypto";
import { auth, createHarness, DATABASE_URL, json, type Harness } from "../../test-support/harness";
import type { Prober } from "../../workers/port-check";

const WS = newId("ws");

/** Blocks 443 from outside, like an Oracle security list without the rule. */
const prober: Prober = {
  connect: (_host, port) =>
    Promise.resolve(port === 443 ? { ok: false, reason: "timeout" } : { ok: true, ms: 3 }),
  get: (_host, _port, path) =>
    Promise.resolve({ ok: true, body: path.split("/").pop() ?? "", ms: 12 }),
};

describe.skipIf(DATABASE_URL === undefined)("server routes (Postgres)", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({}, { prober, requestTimeoutMs: 1_000 });
  });
  afterAll(async () => {
    await h.close();
  });

  async function createToken(name = "oracle-1", provider = "oracle") {
    const res = await h.app.request("/v1/servers/join-tokens", {
      method: "POST",
      headers: { ...auth, ...json },
      body: JSON.stringify({ workspace_id: WS, name, provider }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { token: string; expires_at: string; command: string };
  }

  async function join(token: string) {
    const pub = ed25519RawPublicKey(generateKeyPairSync("ed25519").publicKey);
    return h.app.request("/agent/v1/join", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        join_token: token,
        public_key: Buffer.from(pub).toString("base64"),
        host: {
          os: "ubuntu",
          os_version: "24.04",
          arch: "arm64",
          cpu_cores: 4,
          memory_bytes: 24 * 1024 ** 3,
          public_ip: "203.0.113.10",
          provider: "oracle",
          region_label: "eu-frankfurt-1",
        },
      }),
    });
  }

  async function joinedServer(name = "oracle-1") {
    const { token } = await createToken(name);
    const res = await join(token);
    expect(res.status).toBe(200);
    return (await res.json()) as {
      server_id: string;
      credential: string;
      control_plane_public_key: string;
      control_plane_ws_url: string;
    };
  }

  describe("POST /v1/servers/join-tokens", () => {
    it("returns a one-hour token once, with the paste-able command, and stores only its hash", async () => {
      const before = Date.now();
      const body = await createToken();
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const ttl = new Date(body.expires_at).getTime() - before;
      expect(ttl).toBeGreaterThan(59 * 60_000);
      expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 1_000);
      expect(body.command).toBe(
        `curl -fsSL https://cp.example.com/install/agent.sh | sudo sh -s -- --token ${body.token} --control-plane https://cp.example.com`,
      );
      const rows = await h.cp.db
        .select()
        .from(serverJoinTokens)
        .where(eq(serverJoinTokens.tokenHash, sha256Hex(body.token)));
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain(body.token);
      const audit = await h.cp.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.target, rows[0]?.id ?? ""));
      expect(audit[0]?.action).toBe("server.join_token.create");
      expect(JSON.stringify(audit)).not.toContain(body.token);
    });

    it("rejects invalid bodies with field errors (400)", async () => {
      const res = await h.app.request("/v1/servers/join-tokens", {
        method: "POST",
        headers: { ...auth, ...json },
        body: JSON.stringify({ workspace_id: "nope", name: "", provider: "linode" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string; explanation: string } };
      expect(body.error.code).toBe("VALIDATION_FAILED");
      expect(body.error.explanation).toContain("workspace_id");
      expect(body.error.explanation).toContain("name");
      expect(body.error.explanation).toContain("provider");
    });

    it("requires the admin token (401)", async () => {
      const res = await h.app.request("/v1/servers/join-tokens", {
        method: "POST",
        headers: { ...json, authorization: "Bearer wrong" },
        body: JSON.stringify({ workspace_id: WS, name: "x", provider: "aws" }),
      });
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "UNAUTHENTICATED",
      );
    });
  });

  describe("POST /agent/v1/join", () => {
    it("joins once; reused, expired and unknown tokens get the same 401", async () => {
      const { token } = await createToken("hetzner-1", "hetzner");
      const first = await join(token);
      expect(first.status).toBe(200);
      const joined = (await first.json()) as {
        server_id: string;
        credential: string;
        control_plane_public_key: string;
        control_plane_ws_url: string;
      };
      expect(joined.server_id).toMatch(/^srv_/);
      expect(joined.control_plane_ws_url).toBe("wss://cp.example.com/agent/v1");
      expect(Buffer.from(joined.control_plane_public_key, "base64")).toEqual(
        Buffer.from(h.cp.instanceKey.publicKeyRaw),
      );
      const [row] = await h.cp.db.select().from(servers).where(eq(servers.id, joined.server_id));
      expect(row?.credentialHash).toBe(sha256Hex(joined.credential));
      expect(row?.status).toBe("pending");
      expect(row?.provider).toBe("oracle"); // detected provider wins over the wizard's
      expect(row?.memoryMb).toBe(24 * 1024);

      const reused = await join(token);
      expect(reused.status).toBe(401);
      const unknown = await join("x".repeat(43));
      expect(unknown.status).toBe(401);

      const expired = await createToken("old");
      await h.cp.db
        .update(serverJoinTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(serverJoinTokens.tokenHash, sha256Hex(expired.token)));
      const late = await join(expired.token);
      expect(late.status).toBe(401);
      const bodies = await Promise.all([reused.json(), unknown.json(), late.json()]);
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
      expect((bodies[0] as { error: { code: string } }).error.code).toBe("JOIN_TOKEN_INVALID");
    });

    it("validates the public key (400) and checks credentials", async () => {
      const bad = await h.app.request("/agent/v1/join", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ join_token: "x".repeat(43), public_key: "short", host: {} }),
      });
      expect(bad.status).toBe(400);

      const joined = await joinedServer("cred-check");
      const ok = await h.app.request("/agent/v1/credential", {
        headers: { authorization: `Bearer ${joined.server_id}.${joined.credential}` },
      });
      expect(ok.status).toBe(200);
      const wrong = await h.app.request("/agent/v1/credential", {
        headers: { authorization: `Bearer ${joined.server_id}.nope` },
      });
      expect(wrong.status).toBe(401);
    });
  });

  describe("GET /v1/servers and /v1/servers/:id", () => {
    it("lists and gets servers with a pending checklist", async () => {
      const joined = await joinedServer("list-me");
      const list = await h.app.request(`/v1/servers?workspace_id=${WS}`, { headers: auth });
      expect(list.status).toBe(200);
      const { servers: all } = (await list.json()) as { servers: unknown[] };
      expect(all.length).toBeGreaterThan(0);
      all.forEach((s) => Server.parse(s));

      const one = await h.app.request(`/v1/servers/${joined.server_id}`, { headers: auth });
      expect(one.status).toBe(200);
      const server = Server.parse(await one.json());
      expect(server.checklist).toEqual({
        connected: "pending",
        docker_ready: "pending",
        proxy_running: "pending",
        port_80: "pending",
        port_443: "pending",
        mesh: "n/a",
      });
      expect(JSON.stringify(server)).not.toContain(joined.credential);
    });

    it("answers 400, 401 and 404", async () => {
      expect((await h.app.request("/v1/servers?workspace_id=bad", { headers: auth })).status).toBe(
        400,
      );
      expect((await h.app.request("/v1/servers/not-an-id", { headers: auth })).status).toBe(400);
      expect((await h.app.request("/v1/servers")).status).toBe(401);
      expect((await h.app.request(`/v1/servers/${newId("srv")}`)).status).toBe(401);
      expect((await h.app.request(`/v1/servers/${newId("srv")}`, { headers: auth })).status).toBe(
        404,
      );
    });
  });

  describe("PATCH /v1/servers/:id", () => {
    it("renames and relabels, with an audit entry", async () => {
      const joined = await joinedServer("rename-me");
      const res = await h.app.request(`/v1/servers/${joined.server_id}`, {
        method: "PATCH",
        headers: { ...auth, ...json },
        body: JSON.stringify({ name: "db-1", labels: ["db"], monthly_cost: 4.5 }),
      });
      expect(res.status).toBe(200);
      const s = Server.parse(await res.json());
      expect([s.name, s.labels, s.monthly_cost]).toEqual(["db-1", ["db"], 4.5]);
      const audit = await h.cp.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.target, joined.server_id));
      expect(audit.map((a) => a.action)).toContain("server.update");
    });

    it("answers 400 and 401", async () => {
      const joined = await joinedServer("patch-errors");
      const bad = await h.app.request(`/v1/servers/${joined.server_id}`, {
        method: "PATCH",
        headers: { ...auth, ...json },
        body: JSON.stringify({ status: "online", public_ip: "1.1.1.1" }),
      });
      expect(bad.status).toBe(400);
      const pendingDrain = await h.app.request(`/v1/servers/${joined.server_id}`, {
        method: "PATCH",
        headers: { ...auth, ...json },
        body: JSON.stringify({ status: "draining" }),
      });
      expect(pendingDrain.status).toBe(400);
      const unauth = await h.app.request(`/v1/servers/${joined.server_id}`, {
        method: "PATCH",
        headers: json,
        body: JSON.stringify({ name: "x" }),
      });
      expect(unauth.status).toBe(401);
    });
  });

  /** Puts a server online with a fake agent connection that answers requests. */
  async function onlineWithAgent(answer: (body: EnvelopeBody) => EnvelopeBody | null) {
    const joined = await joinedServer("online-1");
    await h.cp.db
      .update(servers)
      .set({
        status: "online",
        lastHeartbeatAt: new Date(),
        publicIp: "203.0.113.10",
        dockerOk: true,
        caddyOk: true,
      })
      .where(eq(servers.id, joined.server_id));
    const sent: EnvelopeBody[] = [];
    const link: AgentLink = {
      serverId: joined.server_id,
      connectedAt: Date.now(),
      send(body) {
        sent.push(body);
        const reply = answer(body);
        const opId =
          body.case === "portCheck" || body.case === "agentUpdate" || body.case === "revoke"
            ? (body.value.meta?.opId ?? "")
            : "";
        if (reply !== null) {
          setTimeout(() => void h.cp.registry.deliver(opId, reply), 5);
        }
      },
      close() {
        /* nothing to close */
      },
    };
    await h.cp.registry.claim(link);
    return { serverId: joined.server_id, sent };
  }

  describe("POST /v1/servers/:id/port-check", () => {
    it("reports 80 reachable and 443 blocked with the Oracle fix cards", async () => {
      const { serverId, sent } = await onlineWithAgent((body) =>
        body.case === "portCheck"
          ? {
              case: "portCheckResult",
              value: create(PortCheckResultSchema, {
                opId: body.value.meta?.opId ?? "",
                ports: body.value.ports.map((p) =>
                  create(PortStateSchema, {
                    port: p,
                    listening: true,
                    listener: "caddy",
                    nonceRouteInstalled: true,
                  }),
                ),
              }),
            }
          : null,
      );
      const res = await h.app.request(`/v1/servers/${serverId}/port-check`, {
        method: "POST",
        headers: { ...auth, ...json },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const result = PortCheckResult.parse(await res.json());
      expect(sent[0]?.case).toBe("portCheck");
      const p80 = result.ports.find((p) => p.port === 80);
      const p443 = result.ports.find((p) => p.port === 443);
      expect(p80?.state).toBe("reachable");
      expect(p80?.latency_ms).toBe(12);
      expect(p443?.state).toBe("listening_not_reachable");
      expect(p443?.fix?.code).toBe("PORT_BLOCKED");
      expect(p443?.fix?.cards.map((c) => c.key)).toEqual([
        "PORT_BLOCKED.oracle.cloud",
        "PORT_BLOCKED.oracle.os",
      ]);
      expect(JSON.stringify(p443?.fix?.cards)).toContain("443");

      const server = Server.parse(
        await (await h.app.request(`/v1/servers/${serverId}`, { headers: auth })).json(),
      );
      expect(server.checklist.port_80).toBe("ok");
      expect(server.checklist.port_443).toBe("failed");
      expect(server.issues.map((i) => i.code)).toContain("PORT_BLOCKED");
      expect(server.issues.find((i) => i.code === "PORT_BLOCKED")?.title).toBe(
        "Port 443 is blocked on your server",
      );
    });

    it("answers 400, 401, 503 offline and 504 when the agent never answers", async () => {
      const { serverId } = await onlineWithAgent(() => null);
      const bad = await h.app.request(`/v1/servers/${serverId}/port-check`, {
        method: "POST",
        headers: { ...auth, ...json },
        body: JSON.stringify({ ports: [0] }),
      });
      expect(bad.status).toBe(400);
      const unauth = await h.app.request(`/v1/servers/${serverId}/port-check`, { method: "POST" });
      expect(unauth.status).toBe(401);
      const silent = await h.app.request(`/v1/servers/${serverId}/port-check`, {
        method: "POST",
        headers: { ...auth, ...json },
        body: "{}",
      });
      expect(silent.status).toBe(504);
      expect(((await silent.json()) as { error: { code: string } }).error.code).toBe(
        "AGENT_TIMEOUT",
      );

      const joined = await joinedServer("never-online");
      const offline = await h.app.request(`/v1/servers/${joined.server_id}/port-check`, {
        method: "POST",
        headers: { ...auth, ...json },
        body: "{}",
      });
      expect(offline.status).toBe(503);
    });
  });

  describe("POST /v1/servers/:id/agent-update", () => {
    it("answers 400 for a bad version, 401 without a token and 404 without a release", async () => {
      const { serverId } = await onlineWithAgent((body) =>
        body.case === "agentUpdate"
          ? { case: "ack", value: create(AckSchema, { opId: body.value.meta?.opId ?? "" }) }
          : null,
      );
      const bad = await h.app.request(`/v1/servers/${serverId}/agent-update`, {
        method: "POST",
        headers: { ...auth, ...json },
        body: JSON.stringify({ version: "latest" }),
      });
      expect(bad.status).toBe(400);
      expect(
        (await h.app.request(`/v1/servers/${serverId}/agent-update`, { method: "POST" })).status,
      ).toBe(401);
      const missing = await h.app.request(`/v1/servers/${serverId}/agent-update`, {
        method: "POST",
        headers: { ...auth, ...json },
        body: JSON.stringify({ version: "9.9.9" }),
      });
      expect(missing.status).toBe(404);
    });
  });

  describe("POST /v1/servers/:id/rotate-credential", () => {
    it("requests a rotation (202), and answers 400 and 401", async () => {
      const joined = await joinedServer("rotate-me");
      const ok = await h.app.request(`/v1/servers/${joined.server_id}/rotate-credential`, {
        method: "POST",
        headers: auth,
      });
      expect(ok.status).toBe(202);
      const [row] = await h.cp.db.select().from(servers).where(eq(servers.id, joined.server_id));
      expect(row?.credentialRotationRequestedAt).toBeInstanceOf(Date);
      expect(
        (
          await h.app.request("/v1/servers/bad/rotate-credential", {
            method: "POST",
            headers: auth,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await h.app.request(`/v1/servers/${joined.server_id}/rotate-credential`, {
            method: "POST",
          })
        ).status,
      ).toBe(401);
    });
  });

  describe("DELETE /v1/servers/:id", () => {
    it("sends Revoke to a connected agent and removes the server", async () => {
      const { serverId, sent } = await onlineWithAgent(() => null);
      const res = await h.app.request(`/v1/servers/${serverId}`, {
        method: "DELETE",
        headers: auth,
      });
      expect(res.status).toBe(204);
      expect(sent.map((b) => b.case)).toContain("revoke");
      expect(await h.cp.db.select().from(servers).where(eq(servers.id, serverId))).toHaveLength(0);
      expect(
        (await h.app.request(`/v1/servers/${serverId}`, { method: "DELETE", headers: auth }))
          .status,
      ).toBe(404);
      expect(
        (await h.app.request("/v1/servers/bad", { method: "DELETE", headers: auth })).status,
      ).toBe(400);
      expect((await h.app.request(`/v1/servers/${serverId}`, { method: "DELETE" })).status).toBe(
        401,
      );
    });
  });

  it("documents every route in OpenAPI", async () => {
    const doc = (await (await h.app.request("/v1/openapi.json")).json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const paths = doc.paths;
    expect(Object.keys(paths["/v1/servers/join-tokens"] ?? {})).toContain("post");
    expect(Object.keys(paths["/v1/servers"] ?? {})).toContain("get");
    expect(Object.keys(paths["/v1/servers/{id}"] ?? {}).sort()).toEqual(["delete", "get", "patch"]);
    for (const p of ["port-check", "agent-update", "rotate-credential"]) {
      expect(Object.keys(paths[`/v1/servers/{id}/${p}`] ?? {})).toContain("post");
    }
    expect(Object.keys(paths["/agent/v1/join"] ?? {})).toContain("post");
  });
});
