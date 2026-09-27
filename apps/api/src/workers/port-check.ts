import http from "node:http";
import https from "node:https";
import net from "node:net";

import { create } from "@bufbuild/protobuf";
import { eq } from "drizzle-orm";

import { servers, type ServerRow } from "@lumen/db";
import { MetaSchema, PortCheckSchema, type EnvelopeBody } from "@lumen/protocol";
import {
  getFix,
  isServerProvider,
  LumenHttpError,
  makeError,
  type PortCheckResult,
  type PortResult,
  type PortState,
} from "@lumen/shared";

import type { ControlPlane } from "../context";
import { randomToken, uuidv7 } from "../lib/crypto";
import { publishEvent } from "../realtime/topics";
import { checklistEvent, loadServer } from "../services/servers/servers";

const PROBE_TIMEOUT_MS = 5_000;

export type ConnectOutcome =
  { ok: true; ms: number } | { ok: false; reason: "refused" | "timeout" | "error" };
export type HttpOutcome =
  { ok: true; body: string; ms: number } | { ok: false; reason: "timeout" | "error" };

/** How the worker reaches a server from outside; replaced in tests. */
export interface Prober {
  connect(host: string, port: number): Promise<ConnectOutcome>;
  get(host: string, port: number, path: string): Promise<HttpOutcome>;
}

export const netProber: Prober = {
  connect(host, port) {
    return new Promise((resolve) => {
      const started = performance.now();
      const socket = net.connect({ host, port });
      socket.setTimeout(PROBE_TIMEOUT_MS);
      socket.once("connect", () => {
        socket.destroy();
        resolve({ ok: true, ms: Math.round(performance.now() - started) });
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve({ ok: false, reason: "timeout" });
      });
      socket.once("error", (error: NodeJS.ErrnoException) => {
        resolve({ ok: false, reason: error.code === "ECONNREFUSED" ? "refused" : "error" });
      });
    });
  },
  get(host, port, path) {
    return new Promise((resolve) => {
      const started = performance.now();
      const tls = port === 443;
      // The port-check route answers on Caddy's self-signed fallback
      // certificate, so verification is skipped for this probe only.
      const req = (tls ? https : http).request(
        {
          host,
          port,
          path,
          method: "GET",
          timeout: PROBE_TIMEOUT_MS,
          headers: { "user-agent": "lumen-portcheck" },
          ...(tls ? { rejectUnauthorized: false, servername: undefined } : {}),
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            if (body.length < 1024) {
              body += chunk;
            }
          });
          res.on("end", () => {
            resolve(
              res.statusCode === 200
                ? { ok: true, body: body.trim(), ms: Math.round(performance.now() - started) }
                : { ok: false, reason: "error" },
            );
          });
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, reason: "timeout" });
      });
      req.on("error", () => {
        resolve({ ok: false, reason: "error" });
      });
      req.end();
    });
  },
};

/** Classifies one port from the agent's view and the outside probe. */
export async function probePort(
  prober: Prober,
  host: string,
  port: number,
  nonce: string,
  listening: boolean,
  hairpinHost: string | null,
): Promise<{ state: PortState; latency_ms: number | null }> {
  if (!listening) {
    return { state: "not_listening", latency_ms: null };
  }
  const tryHost = async (h: string) => {
    const c = await prober.connect(h, port);
    if (!c.ok) {
      return { state: "listening_not_reachable" as const, latency_ms: null };
    }
    const g = await prober.get(h, port, `/.lumen/portcheck/${nonce}`);
    if (!g.ok) {
      return g.reason === "timeout"
        ? { state: "timeout" as const, latency_ms: null }
        : { state: "listening_not_reachable" as const, latency_ms: null };
    }
    // Success requires our nonce: anything else means another machine answered.
    return g.body === nonce
      ? { state: "reachable" as const, latency_ms: g.ms }
      : { state: "listening_not_reachable" as const, latency_ms: null };
  };
  const outside = await tryHost(host);
  if (outside.state === "listening_not_reachable" && hairpinHost !== null) {
    const loop = await tryHost(hairpinHost);
    if (loop.state === "reachable") {
      return { state: "reachable_hairpin_unknown", latency_ms: loop.latency_ms };
    }
  }
  return outside;
}

/** Builds the stored result, attaching PORT_BLOCKED fix cards to blocked ports. */
export function buildResult(
  row: Pick<ServerRow, "provider" | "name">,
  opId: string,
  checkedAt: Date,
  ports: { port: number; state: PortState; latency_ms: number | null; listener: string | null }[],
): PortCheckResult {
  const provider = isServerProvider(row.provider) ? row.provider : "other";
  const blocked = ports.filter((p) => p.state === "listening_not_reachable").map((p) => p.port);
  const out: PortResult[] = ports.map((p) => {
    if (p.state !== "listening_not_reachable") {
      return { ...p, fix: null };
    }
    const err = makeError("PORT_BLOCKED", { port: p.port, serverName: row.name });
    return {
      ...p,
      fix: {
        code: "PORT_BLOCKED",
        message: err.title,
        cards: [
          getFix("PORT_BLOCKED", provider, "cloud", { ports: blocked }),
          getFix("PORT_BLOCKED", provider, "os", { ports: blocked }),
        ],
      },
    };
  });
  return { op_id: opId, checked_at: checkedAt.toISOString(), ports: out };
}

/**
 * Runs a port check end to end (PHASE-02 §4.6): asks the agent which ports
 * listen and to install nonce routes, probes each from here, stores the
 * result on `servers.port_check` and publishes `server.checklist`.
 */
export async function runPortCheck(
  cp: ControlPlane,
  serverId: string,
  ports: number[],
  prober: Prober = netProber,
): Promise<PortCheckResult> {
  const row = await loadServer(cp, serverId);
  if (row === null) {
    throw new LumenHttpError("NOT_FOUND", { resource: "server" });
  }
  if (row.status === "offline" || row.status === "pending" || row.publicIp === null) {
    throw new LumenHttpError("AGENT_OFFLINE", { serverName: row.name });
  }
  const opId = uuidv7();
  const nonce = randomToken(16);
  const req: EnvelopeBody = {
    case: "portCheck",
    value: create(PortCheckSchema, {
      meta: create(MetaSchema, { opId, timestampMs: BigInt(cp.now().getTime()) }),
      ports,
      nonce,
    }),
  };
  const reply = await cp.registry.request(serverId, opId, req, row.name);
  if (reply.case === "opError") {
    throw new LumenHttpError("VALIDATION_FAILED", { detail: reply.value.message });
  }
  if (reply.case !== "portCheckResult") {
    throw new LumenHttpError("INTERNAL");
  }
  const hairpin =
    cp.config.CONTROL_PLANE_PUBLIC_IP !== undefined &&
    cp.config.CONTROL_PLANE_PUBLIC_IP === row.publicIp
      ? "127.0.0.1"
      : null;
  const results = await Promise.all(
    ports.map(async (port) => {
      const agentView = reply.value.ports.find((p) => p.port === port);
      const listening = agentView?.listening ?? false;
      const probed = await probePort(prober, row.publicIp ?? "", port, nonce, listening, hairpin);
      return {
        port,
        ...probed,
        listener:
          agentView?.listener !== undefined && agentView.listener !== ""
            ? agentView.listener
            : null,
      };
    }),
  );
  const now = cp.now();
  const result = buildResult(row, opId, now, results);
  await cp.db
    .update(servers)
    .set({ portCheck: result, updatedAt: now })
    .where(eq(servers.id, serverId));
  const updated = await loadServer(cp, serverId);
  if (updated !== null) {
    await publishEvent(cp.bus, checklistEvent(updated, now));
  }
  return result;
}
