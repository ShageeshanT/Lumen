import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { eq } from "drizzle-orm";

import { servers, type Db } from "@lumen/db";
import { EnvelopeSchema, type EnvelopeBody } from "@lumen/protocol";
import { LumenHttpError } from "@lumen/shared";

import type { Logger } from "../logger";
import type { Bus } from "../realtime/bus";

import type { GatewayMetrics } from "./metrics";

/** NOTIFY channel for cross-process gateway traffic. */
export const AGENT_CHANNEL = "lumen_agent";
/** Unanswered requests fail after this (PHASE-02 §5: AGENT_TIMEOUT at 60 s). */
export const REQUEST_TIMEOUT_MS = 60_000;

/** One agent connection held by this process. */
export interface AgentLink {
  serverId: string;
  connectedAt: number;
  send(body: EnvelopeBody): void;
  close(code: number, reason: string): void;
}

type BusMessage =
  | { type: "claimed"; server_id: string; node: string; at: number }
  | { type: "command"; node: string; server_id: string; body: string }
  | { type: "reply"; op_id: string; body: string };

interface Pending {
  serverId: string;
  resolve: (body: EnvelopeBody) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function encodeBody(body: EnvelopeBody): string {
  return Buffer.from(toBinary(EnvelopeSchema, create(EnvelopeSchema, { body }))).toString("base64");
}

function decodeBody(b64: string): EnvelopeBody {
  return fromBinary(EnvelopeSchema, Buffer.from(b64, "base64")).body;
}

/**
 * Which process holds each agent's socket. In memory: `server_id → link`.
 * In Postgres: `servers.gateway_node`, so any API process can route a
 * command to the owner over NOTIFY (PHASE-02 §4.4). The newest connection
 * wins: a second one for the same server closes the older with 4001
 * superseded, locally or on whichever process held it.
 */
export class Registry {
  private readonly local = new Map<string, AgentLink>();
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly deps: {
      db: Db;
      bus: Bus;
      nodeId: string;
      logger: Logger;
      metrics: GatewayMetrics;
      timeoutMs?: number;
    },
  ) {}

  async start(): Promise<void> {
    await this.deps.bus.subscribe(AGENT_CHANNEL, (payload) => {
      this.onBus(payload);
    });
  }

  private onBus(payload: string): void {
    let msg: BusMessage;
    try {
      msg = JSON.parse(payload) as BusMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "claimed": {
        if (msg.node === this.deps.nodeId) {
          return;
        }
        const link = this.local.get(msg.server_id);
        if (link !== undefined && link.connectedAt <= msg.at) {
          this.local.delete(msg.server_id);
          this.deps.metrics.superseded += 1;
          link.close(4001, "superseded");
        }
        return;
      }
      case "command": {
        if (msg.node !== this.deps.nodeId) {
          return;
        }
        this.local.get(msg.server_id)?.send(decodeBody(msg.body));
        return;
      }
      case "reply": {
        const p = this.pending.get(msg.op_id);
        if (p !== undefined) {
          this.settle(msg.op_id, decodeBody(msg.body));
        }
        return;
      }
    }
  }

  /** Registers a new connection, superseding any older one for the server. */
  async claim(link: AgentLink): Promise<void> {
    const old = this.local.get(link.serverId);
    if (old !== undefined && old !== link) {
      this.deps.metrics.superseded += 1;
      old.close(4001, "superseded");
    }
    this.local.set(link.serverId, link);
    this.deps.metrics.connectedAgents = this.local.size;
    await this.deps.db
      .update(servers)
      .set({ gatewayNode: this.deps.nodeId, gatewayConnectedAt: new Date(link.connectedAt) })
      .where(eq(servers.id, link.serverId));
    await this.deps.bus.publish(
      AGENT_CHANNEL,
      JSON.stringify({
        type: "claimed",
        server_id: link.serverId,
        node: this.deps.nodeId,
        at: link.connectedAt,
      } satisfies BusMessage),
    );
  }

  /** Forgets a connection that closed (only if it is still the current one). */
  release(link: AgentLink): void {
    if (this.local.get(link.serverId) === link) {
      this.local.delete(link.serverId);
    }
    this.deps.metrics.connectedAgents = this.local.size;
  }

  isLocal(serverId: string): boolean {
    return this.local.has(serverId);
  }

  /** Closes a connection held by this process (revocation). */
  disconnect(serverId: string, code: number, reason: string): void {
    const link = this.local.get(serverId);
    if (link !== undefined) {
      this.local.delete(serverId);
      link.close(code, reason);
    }
    this.deps.metrics.connectedAgents = this.local.size;
  }

  /** Sends a message to the agent wherever its socket lives. */
  async send(serverId: string, body: EnvelopeBody): Promise<void> {
    const link = this.local.get(serverId);
    if (link !== undefined) {
      link.send(body);
      return;
    }
    const [row] = await this.deps.db
      .select({ node: servers.gatewayNode, name: servers.name, status: servers.status })
      .from(servers)
      .where(eq(servers.id, serverId));
    const node = row?.node ?? null;
    if (
      row === undefined ||
      node === null ||
      node === this.deps.nodeId ||
      row.status === "offline"
    ) {
      throw new LumenHttpError("AGENT_OFFLINE", { serverName: row?.name ?? serverId });
    }
    await this.deps.bus.publish(
      AGENT_CHANNEL,
      JSON.stringify({
        type: "command",
        node,
        server_id: serverId,
        body: encodeBody(body),
      } satisfies BusMessage),
    );
  }

  /**
   * Sends a request and waits for the reply with the same op id (a typed
   * result, Ack or OpError). Times out with AGENT_TIMEOUT.
   */
  request(
    serverId: string,
    opId: string,
    body: EnvelopeBody,
    serverName: string,
  ): Promise<EnvelopeBody> {
    return new Promise<EnvelopeBody>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(opId);
        reject(new LumenHttpError("AGENT_TIMEOUT", { serverName }));
      }, this.deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
      timer.unref();
      this.pending.set(opId, { serverId, resolve, reject, timer });
      this.send(serverId, body).catch((error: unknown) => {
        clearTimeout(timer);
        this.pending.delete(opId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /**
   * Called by the gateway for every reply-type message. Resolves a local
   * waiter or forwards the reply to the other processes.
   */
  async deliver(opId: string, body: EnvelopeBody): Promise<void> {
    if (this.pending.has(opId)) {
      this.settle(opId, body);
      return;
    }
    await this.deps.bus.publish(
      AGENT_CHANNEL,
      JSON.stringify({ type: "reply", op_id: opId, body: encodeBody(body) } satisfies BusMessage),
    );
  }

  private settle(opId: string, body: EnvelopeBody): void {
    const p = this.pending.get(opId);
    if (p === undefined) {
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(opId);
    p.resolve(body);
  }

  closeAll(): void {
    for (const link of this.local.values()) {
      link.close(1001, "control plane shutting down");
    }
    this.local.clear();
    for (const [op, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("shutting down"));
      this.pending.delete(op);
    }
  }
}
