import { generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";

import { create } from "@bufbuild/protobuf";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createDb, notifications, runMigrations, servers, type DbHandle } from "@lumen/db";
import {
  AckSchema,
  AgentHelloSchema,
  AgentUpdateResultSchema,
  decodeFrame,
  ed25519PublicKeyFromRaw,
  ed25519RawPublicKey,
  encodeFrame,
  HeartbeatSchema,
  MetaSchema,
  MetricsBatchSchema,
  HostSampleSchema,
  DiskSampleSchema,
  openEnvelope,
  sealEnvelope,
  type EnvelopeBody,
} from "@lumen/protocol";
import { newId } from "@lumen/shared";

import { loadConfig } from "../config";
import { uuidv7 } from "../lib/crypto";
import { createLogger } from "../logger";
import { startServer, type RunningServer } from "../server";
import { ADMIN_TOKEN, DATABASE_URL } from "../test-support/harness";
import { sweepOffline } from "../workers/server-offline-sweep";

import { instanceKeyFromSeed } from "./signing-key";

const WS = newId("ws");

/** A minimal agent speaking the real protocol over `ws`. */
class FakeAgent {
  seq = 0n;
  readonly received: EnvelopeBody[] = [];
  closeCode: number | null = null;
  ws!: WebSocket;
  private cpKey: KeyObject;

  constructor(
    readonly serverId: string,
    readonly credential: string,
    readonly key: KeyObject,
    cpPublicRaw: Uint8Array,
  ) {
    this.cpKey = ed25519PublicKeyFromRaw(cpPublicRaw);
  }

  connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${String(port)}/agent/v1`, {
        headers: {
          authorization: `Bearer ${this.serverId}.${this.credential}`,
          "x-lumen-protocol": "1",
        },
      });
      this.ws.on("open", () => {
        resolve();
      });
      this.ws.on("unexpected-response", (_req, res) => {
        reject(new Error(`HTTP ${String(res.statusCode)}`));
      });
      this.ws.on("error", reject);
      this.ws.on("close", (code) => {
        this.closeCode = code;
      });
      this.ws.on("message", (data: Buffer) => {
        this.received.push(openEnvelope(this.cpKey, decodeFrame(new Uint8Array(data))));
      });
    });
  }

  send(body: EnvelopeBody, opts: { key?: KeyObject; seq?: bigint; ts?: number } = {}): void {
    if (opts.seq === undefined) {
      this.seq += 1n;
    }
    const env = sealEnvelope(opts.key ?? this.key, {
      serverId: this.serverId,
      seq: opts.seq ?? this.seq,
      timestampMs: BigInt(opts.ts ?? Date.now()),
      body,
    });
    this.ws.send(encodeFrame(env));
  }

  hello(ts?: number): void {
    this.send(
      {
        case: "agentHello",
        value: create(AgentHelloSchema, {
          serverId: this.serverId,
          agentVersion: "0.2.0",
          protocolVersion: 1,
          os: "ubuntu",
          arch: "amd64",
          publicIp: "203.0.113.20",
          caddyRunning: true,
          provider: "hetzner",
        }),
      },
      ts === undefined ? {} : { ts },
    );
  }

  heartbeat(opId = uuidv7()): string {
    this.send({
      case: "heartbeat",
      value: create(HeartbeatSchema, {
        meta: create(MetaSchema, { opId, timestampMs: BigInt(Date.now()) }),
        dockerOk: true,
        caddyOk: true,
        containerCount: 1,
      }),
    });
    return opId;
  }

  async waitFor(pred: (b: EnvelopeBody) => boolean, ms = 3_000): Promise<EnvelopeBody> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const hit = this.received.find(pred);
      if (hit !== undefined) {
        return hit;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("timed out waiting for a message");
  }

  async waitClosed(ms = 3_000): Promise<number> {
    const deadline = Date.now() + ms;
    while (this.closeCode === null && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return this.closeCode ?? -1;
  }
}

describe.skipIf(DATABASE_URL === undefined)("agent gateway over WebSocket (Postgres)", () => {
  let running: RunningServer;
  let handle: DbHandle;
  let schema: string;
  const seed = randomBytes(32);
  const cpKey = instanceKeyFromSeed(seed);

  beforeAll(async () => {
    if (DATABASE_URL === undefined) {
      throw new Error("DATABASE_URL");
    }
    schema = `g_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
    await admin.query(`create schema "${schema}"`);
    await admin.end();
    const url = `${DATABASE_URL}${DATABASE_URL.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
    await runMigrations(url, { migrationsSchema: schema });
    const config = loadConfig({
      DATABASE_URL: url,
      LUMEN_ADMIN_TOKEN: ADMIN_TOKEN,
      PUBLIC_URL: "https://cp.example.com",
      NODE_ENV: "test",
      AGENT_JOIN_RATE_LIMIT: "1000",
    });
    handle = createDb(url, { max: 6 });
    running = await startServer({
      config,
      logger: createLogger("silent"),
      handle,
      version: "0.0.0-test",
      port: 0,
      instanceKey: cpKey,
      sweep: false,
      prober: {
        connect: () => Promise.resolve({ ok: true, ms: 1 }),
        get: (_h, _p, path) =>
          Promise.resolve({ ok: true, body: path.split("/").pop() ?? "", ms: 2 }),
      },
    });
  });

  afterAll(async () => {
    await running.close();
    await handle.close();
    const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
    await admin.query(`drop schema "${schema}" cascade`);
    await admin.end();
  });

  const base = () => `http://127.0.0.1:${String(running.port)}`;

  async function joinAgent(name: string): Promise<FakeAgent> {
    const tokenRes = await fetch(`${base()}/v1/servers/join-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: WS, name, provider: "other" }),
    });
    const { token } = (await tokenRes.json()) as { token: string };
    const { privateKey } = generateKeyPairSync("ed25519");
    const joinRes = await fetch(`${base()}/agent/v1/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        join_token: token,
        public_key: Buffer.from(ed25519RawPublicKey(privateKey)).toString("base64"),
        host: { hostname: name },
      }),
    });
    const joined = (await joinRes.json()) as {
      server_id: string;
      credential: string;
      control_plane_public_key: string;
    };
    return new FakeAgent(
      joined.server_id,
      joined.credential,
      privateKey,
      Buffer.from(joined.control_plane_public_key, "base64"),
    );
  }

  function subscribe(topics: string[]): Promise<{
    events: { event: { type: string; at: string; status?: string }; receivedAt: number }[];
    ws: WebSocket;
  }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${String(running.port)}/v1/ws`, [
        "lumen.v1",
        `auth.${ADMIN_TOKEN}`,
      ]);
      const events: { event: { type: string; at: string; status?: string }; receivedAt: number }[] =
        [];
      ws.on("message", (data: Buffer) => {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          event?: { type: string; at: string };
        };
        if (msg.type === "subscribed") {
          resolve({ events, ws });
        }
        if (msg.type === "event" && msg.event !== undefined) {
          events.push({ event: msg.event, receivedAt: Date.now() });
        }
      });
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "subscribe", topics }));
      });
      ws.on("error", reject);
    });
  }

  it("rejects upgrades without a valid credential", async () => {
    const agent = await joinAgent("no-auth");
    const bad = new FakeAgent(agent.serverId, "wrong", agent.key, cpKey.publicKeyRaw);
    await expect(bad.connect(running.port)).rejects.toThrow(/401/);
    const rt = new WebSocket(`ws://127.0.0.1:${String(running.port)}/v1/ws`, [
      "lumen.v1",
      "auth.nope",
    ]);
    await expect(
      new Promise((resolve, reject) => {
        rt.on("open", resolve);
        rt.on("error", reject);
      }),
    ).rejects.toThrow(/401/);
  });

  it("handshakes, heartbeats, turns online and publishes server.status on /v1/ws in under a second", async () => {
    const agent = await joinAgent("hb-1");
    const sub = await subscribe([`server:${agent.serverId}`]);
    await agent.connect(running.port);
    agent.hello();
    const ch = await agent.waitFor((b) => b.case === "controlHello");
    expect(ch.case === "controlHello" && ch.value.accepted).toBe(true);
    expect(ch.case === "controlHello" && ch.value.config?.heartbeatIntervalS).toBe(10);
    expect(ch.case === "controlHello" && ch.value.config?.caddyImage).toContain("@sha256:");

    const op = agent.heartbeat();
    const ack = await agent.waitFor((b) => b.case === "heartbeatAck");
    expect(ack.case === "heartbeatAck" && ack.value.opId).toBe(op);

    const deadline = Date.now() + 3_000;
    while (!sub.events.some((e) => e.event.type === "server.status") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const status = sub.events.find((e) => e.event.type === "server.status");
    expect(status?.event.status).toBe("online");
    const latency = (status?.receivedAt ?? 0) - new Date(status?.event.at ?? 0).getTime();
    expect(latency).toBeLessThan(1_000);

    const [row] = await handle.db.select().from(servers).where(eq(servers.id, agent.serverId));
    expect(row?.status).toBe("online");
    expect(row?.publicIp).toBe("203.0.113.20");
    expect(row?.provider).toBe("hetzner");
    expect(row?.gatewayNode).not.toBeNull();
    sub.ws.close();
    agent.ws.close();
  });

  it("drops and counts wrongly signed envelopes without closing, and closes on a bad sequence", async () => {
    const agent = await joinAgent("sig-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    const before = running.cp.metrics.signatureFailures;
    const { privateKey: evil } = generateKeyPairSync("ed25519");
    agent.send(
      {
        case: "heartbeat",
        value: create(HeartbeatSchema, { meta: create(MetaSchema, { opId: uuidv7() }) }),
      },
      { key: evil, seq: 2n },
    );
    agent.seq = 1n;
    const op = agent.heartbeat(); // seq 2, genuine
    await agent.waitFor((b) => b.case === "heartbeatAck" && b.value.opId === op);
    expect(running.cp.metrics.signatureFailures).toBe(before + 1);

    agent.seq = 9n; // skip ahead
    agent.heartbeat();
    expect(await agent.waitClosed()).toBe(4002);
  });

  it("answers an out-of-window timestamp with CLOCK_SKEW and stores the hello skew", async () => {
    const agent = await joinAgent("skew-1");
    await agent.connect(running.port);
    agent.hello(Date.now() - 7 * 60_000); // raw clock 7 minutes behind
    await agent.waitFor((b) => b.case === "controlHello" && b.value.accepted);
    const [row] = await handle.db.select().from(servers).where(eq(servers.id, agent.serverId));
    expect(Math.round((row?.clockSkewMs ?? 0) / 60_000)).toBe(-7);
    const opId = uuidv7();
    agent.send(
      { case: "heartbeat", value: create(HeartbeatSchema, { meta: create(MetaSchema, { opId }) }) },
      { ts: Date.now() - 6 * 60_000 },
    );
    const err = await agent.waitFor((b) => b.case === "opError");
    expect(err.case === "opError" && err.value.code).toBe("CLOCK_SKEW");
    expect(err.case === "opError" && err.value.opId).toBe(opId);
    const res = await fetch(`${base()}/v1/servers/${agent.serverId}`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const server = (await res.json()) as { issues: { code: string; title: string }[] };
    expect(server.issues.find((i) => i.code === "CLOCK_SKEW")?.title).toBe(
      "Your server's clock is off by 7 minutes",
    );
    agent.ws.close();
  });

  it("closes the older connection with 4001 when a second one arrives", async () => {
    const a1 = await joinAgent("dup-1");
    await a1.connect(running.port);
    a1.hello();
    await a1.waitFor((b) => b.case === "controlHello");
    const a2 = new FakeAgent(a1.serverId, a1.credential, a1.key, cpKey.publicKeyRaw);
    await a2.connect(running.port);
    a2.hello();
    await a2.waitFor((b) => b.case === "controlHello");
    expect(await a1.waitClosed()).toBe(4001);
    a2.ws.close();
  });

  it("closes a flooding agent with 4008", async () => {
    const agent = await joinAgent("flood-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    for (let i = 0; i < 400; i++) {
      agent.heartbeat();
    }
    expect(await agent.waitClosed()).toBe(4008);
    expect(running.cp.metrics.rateLimitCloses).toBeGreaterThan(0);
  });

  it("stores host metrics and raises DISK_FULL once when disk_low turns on", async () => {
    const agent = await joinAgent("disk-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    const batch = (low: boolean) => ({
      case: "metricsBatch" as const,
      value: create(MetricsBatchSchema, {
        meta: create(MetaSchema, { opId: uuidv7() }),
        hostSample: create(HostSampleSchema, {
          tsMs: BigInt(Date.now()),
          memTotal: 1024n ** 3n,
          disks: [
            create(DiskSampleSchema, {
              mount: "/var/lib/docker",
              total: 50n * 1024n ** 3n,
              free: low ? 1024n ** 3n : 40n * 1024n ** 3n,
            }),
          ],
          diskLow: low,
        }),
      }),
    });
    agent.send(batch(false));
    agent.send(batch(true));
    agent.send(batch(true));
    const deadline = Date.now() + 3_000;
    let rows: (typeof notifications.$inferSelect)[] = [];
    while (Date.now() < deadline) {
      rows = await handle.db
        .select()
        .from(notifications)
        .where(eq(notifications.targetId, agent.serverId));
      if (rows.length > 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    await new Promise((r) => setTimeout(r, 200));
    rows = await handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.targetId, agent.serverId));
    expect(rows.map((r) => r.code)).toEqual(["DISK_FULL"]);
    expect(rows[0]?.title).toBe("Your server is almost out of disk space");
    const [row] = await handle.db.select().from(servers).where(eq(servers.id, agent.serverId));
    expect(row?.diskLow).toBe(true);
    agent.ws.close();
  });

  it("marks a silent server offline after 30 s with a notification and server.offline", async () => {
    const agent = await joinAgent("sweep-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    agent.heartbeat();
    await agent.waitFor((b) => b.case === "heartbeatAck");
    await new Promise((r) => setTimeout(r, 100));
    const sub = await subscribe([`server:${agent.serverId}`]);
    await handle.db
      .update(servers)
      .set({ lastHeartbeatAt: new Date(Date.now() - 31_000) })
      .where(eq(servers.id, agent.serverId));
    const swept = await sweepOffline(running.cp);
    expect(swept).toContain(agent.serverId);
    const deadline = Date.now() + 3_000;
    while (!sub.events.some((e) => e.event.type === "server.offline") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(sub.events.map((e) => e.event.type)).toEqual(
      expect.arrayContaining(["server.status", "server.offline"]),
    );
    const rows = await handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.targetId, agent.serverId));
    expect(rows.map((r) => r.code)).toContain("AGENT_OFFLINE");
    expect(rows[0]?.title).toBe("Server 'sweep-1' isn't responding");

    agent.heartbeat();
    const back = Date.now() + 3_000;
    while (!sub.events.some((e) => e.event.status === "online") && Date.now() < back) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(sub.events.some((e) => e.event.status === "online")).toBe(true);
    sub.ws.close();
    agent.ws.close();
  });

  it("revokes a connected agent on DELETE and refuses its credential afterwards", async () => {
    const agent = await joinAgent("revoke-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    const res = await fetch(`${base()}/v1/servers/${agent.serverId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status).toBe(204);
    const revoke = await agent.waitFor((b) => b.case === "revoke");
    expect(revoke.case).toBe("revoke");
    const again = new FakeAgent(agent.serverId, agent.credential, agent.key, cpKey.publicKeyRaw);
    await expect(again.connect(running.port)).rejects.toThrow(/401/);
  });

  it("delivers a rotated credential in ControlHello and keeps the old one for five minutes", async () => {
    const agent = await joinAgent("rotate-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    const rot = await fetch(`${base()}/v1/servers/${agent.serverId}/rotate-credential`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(rot.status).toBe(202);
    expect(await agent.waitClosed()).toBe(4000);
    const again = new FakeAgent(agent.serverId, agent.credential, agent.key, cpKey.publicKeyRaw);
    await again.connect(running.port);
    again.hello();
    const ch = await again.waitFor((b) => b.case === "controlHello");
    const rotated = ch.case === "controlHello" ? (ch.value.config?.rotatedCredential ?? "") : "";
    expect(rotated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    again.ws.close();
    // Old credential: still valid in the grace period; new one works too.
    const check = async (cred: string) =>
      (
        await fetch(`${base()}/agent/v1/credential`, {
          headers: { authorization: `Bearer ${agent.serverId}.${cred}` },
        })
      ).status;
    expect(await check(agent.credential)).toBe(200);
    expect(await check(rotated)).toBe(200);
  });

  it("records an update result that reuses the op id of an earlier Ack", async () => {
    const agent = await joinAgent("upd-1");
    await agent.connect(running.port);
    agent.hello();
    await agent.waitFor((b) => b.case === "controlHello");
    const opId = uuidv7();
    await handle.db
      .update(servers)
      .set({
        agentUpdate: {
          op_id: opId,
          version: "0.2.2",
          status: "sent",
          error: null,
          at: new Date().toISOString(),
        },
      })
      .where(eq(servers.id, agent.serverId));
    agent.send({ case: "ack", value: create(AckSchema, { opId }) });
    agent.send({
      case: "agentUpdateResult",
      value: create(AgentUpdateResultSchema, {
        opId,
        success: false,
        runningVersion: "0.2.1",
        error: "UPDATE_ROLLED_BACK: the new agent failed its trial run",
      }),
    });
    const ack = await agent.waitFor((b) => b.case === "ack" && b.value.opId === opId);
    expect(ack.case).toBe("ack");
    const [row] = await handle.db.select().from(servers).where(eq(servers.id, agent.serverId));
    expect(row?.agentUpdate).toMatchObject({ op_id: opId, status: "failed", version: "0.2.2" });
    expect(row?.agentVersion).toBe("0.2.1");
    const rows = await handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.targetId, agent.serverId));
    expect(rows.map((r) => r.code)).toEqual(["UPDATE_ROLLED_BACK"]);
    agent.ws.close();
  });

  it("serves gateway metrics to loopback only", async () => {
    const res = await fetch(`${base()}/internal/metrics`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("lumen_gateway_signature_failures_total");
    expect(text).toContain("lumen_gateway_heartbeat_lag_seconds_bucket");
  });
});
