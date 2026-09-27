import type { KeyObject } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { create } from "@bufbuild/protobuf";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

import {
  AckSchema,
  acceptsProtocolVersion,
  ed25519PublicKeyFromRaw,
  EnvelopeError,
  HeartbeatAckSchema,
  MAX_MESSAGE_BYTES,
  OpErrorSchema,
  type EnvelopeBody,
} from "@lumen/protocol";

import type { ControlPlane } from "../context";
import { WindowLimiter, TokenBucket } from "../lib/rate-limit";
import { loadServer } from "../services/servers/servers";

import { recordHeartbeat } from "./handlers/heartbeat";
import { handleHello } from "./handlers/hello";
import { recordMetrics } from "./handlers/metrics";
import { recordUpdateResult } from "./handlers/update-result";
import type { AgentLink } from "./registry";
import {
  credentialMatches,
  GatewayError,
  InboundVerifier,
  inWindow,
  OutboundSigner,
  parseAgentBearer,
} from "./verify";

export const CLOSE = {
  superseded: 4001,
  badSequence: 4002,
  revoked: 4003,
  helloRequired: 4004,
  rateLimited: 4008,
  idle: 4009,
} as const;

const HELLO_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 30_000;
const PING_EVERY_MS = 10_000;
/** Control plane → agent queue bound per socket (PHASE-02 §5). */
const SEND_QUEUE_LIMIT = 256;

export interface GatewayHooks {
  /** Called when a server's first heartbeat moves it from pending to online. */
  onFirstOnline?: (serverId: string) => void;
}

function opIdOf(body: EnvelopeBody): string {
  switch (body.case) {
    case "heartbeat":
    case "metricsBatch":
      return body.value.meta?.opId ?? "";
    case "portCheckResult":
    case "agentUpdateResult":
    case "ack":
    case "opError":
      return body.value.opId;
    case "portCheck":
    case "agentUpdate":
    case "revoke":
      return body.value.meta?.opId ?? "";
    case "heartbeatAck":
      return body.value.opId;
    case "agentHello":
    case "controlHello":
    case undefined:
      return "";
  }
}

function reject(socket: Duplex, status: number, text: string): void {
  socket.end(
    `HTTP/1.1 ${String(status)} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

/**
 * The `/agent/v1` WebSocket gateway (PHASE-02 §4.4): authenticates the server
 * credential on upgrade, requires AgentHello first, verifies every envelope
 * (signature, seq, timestamp window), rate-limits each connection (200 msg/s,
 * 2 MB/s) and routes messages to their handlers.
 */
export class AgentGateway {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES + 4096,
    perMessageDeflate: false,
  });
  private readonly upgrades = new WindowLimiter(60, 60_000);

  constructor(
    private readonly cp: ControlPlane,
    private readonly hooks: GatewayHooks = {},
  ) {}

  async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const ip = req.socket.remoteAddress ?? "unknown";
    if (this.upgrades.hit(ip) > 0) {
      reject(socket, 429, "Too Many Requests");
      return;
    }
    const auth = parseAgentBearer(req.headers.authorization);
    const proto = Number(req.headers["x-lumen-protocol"] ?? "0");
    if (auth === null) {
      reject(socket, 401, "Unauthorized");
      return;
    }
    if (!acceptsProtocolVersion(proto)) {
      reject(socket, 426, "Upgrade Required");
      return;
    }
    let row;
    try {
      row = await loadServer(this.cp, auth.serverId);
    } catch (error) {
      this.cp.logger.error({ err: error }, "gateway could not load the server");
      reject(socket, 503, "Service Unavailable");
      return;
    }
    if (row === null || !credentialMatches(row, auth.credential, this.cp.now())) {
      reject(socket, 401, "Unauthorized");
      return;
    }
    let agentKey: KeyObject;
    try {
      agentKey = ed25519PublicKeyFromRaw(Buffer.from(row.agentPublicKey, "base64"));
    } catch {
      reject(socket, 401, "Unauthorized");
      return;
    }
    const serverRow = row;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      new AgentSession(this.cp, ws, serverRow.id, agentKey, ip, this.hooks).start();
    });
  }

  close(): void {
    this.wss.close();
  }
}

/** One agent connection. Messages are processed strictly in order. */
class AgentSession implements AgentLink {
  readonly connectedAt = Date.now();
  private readonly verifier: InboundVerifier;
  private readonly signer: OutboundSigner;
  private readonly messages = new TokenBucket(200, 200);
  private readonly bytes = new TokenBucket(2 * 1024 * 1024, 2 * 1024 * 1024);
  private chain: Promise<void> = Promise.resolve();
  private helloDone = false;
  private closed = false;
  private lastFrameAt = Date.now();
  private timers: NodeJS.Timeout[] = [];
  private inFlight = 0;

  constructor(
    private readonly cp: ControlPlane,
    private readonly ws: WebSocket,
    readonly serverId: string,
    agentKey: KeyObject,
    private readonly remoteIp: string,
    private readonly hooks: GatewayHooks,
  ) {
    this.verifier = new InboundVerifier(agentKey, serverId);
    this.signer = new OutboundSigner(cp.instanceKey.privateKey, serverId);
  }

  start(): void {
    this.timers.push(
      setTimeout(() => {
        if (!this.helloDone) {
          this.close(CLOSE.helloRequired, "hello_timeout");
        }
      }, HELLO_TIMEOUT_MS),
      setInterval(() => {
        if (Date.now() - this.lastFrameAt > IDLE_TIMEOUT_MS) {
          this.close(CLOSE.idle, "idle");
          return;
        }
        this.ws.ping();
      }, PING_EVERY_MS),
    );
    this.ws.on("ping", () => {
      this.lastFrameAt = Date.now();
    });
    this.ws.on("pong", () => {
      this.lastFrameAt = Date.now();
    });
    this.ws.on("message", (data: RawData, isBinary: boolean) => {
      this.lastFrameAt = Date.now();
      const frame = toBytes(data);
      if (!this.messages.take(1) || !this.bytes.take(frame.length)) {
        this.cp.metrics.rateLimitCloses += 1;
        this.cp.logger.warn({ server_id: this.serverId }, "agent exceeded the gateway rate limit");
        this.close(CLOSE.rateLimited, "rate_limited");
        return;
      }
      if (!isBinary) {
        return;
      }
      this.chain = this.chain
        .then(() => this.onFrame(frame))
        .catch((error: unknown) => {
          this.cp.logger.error({ err: error, server_id: this.serverId }, "agent message failed");
        });
    });
    this.ws.on("close", () => {
      this.cleanup();
    });
    this.ws.on("error", (error) => {
      this.cp.logger.warn({ err: error, server_id: this.serverId }, "agent socket error");
      this.cleanup();
    });
  }

  send(body: EnvelopeBody): void {
    if (this.closed) {
      return;
    }
    if (this.ws.bufferedAmount > 0 && this.inFlight >= SEND_QUEUE_LIMIT) {
      this.cp.logger.warn({ server_id: this.serverId }, "agent send queue is full; closing");
      this.close(CLOSE.rateLimited, "send_queue_full");
      return;
    }
    this.inFlight += 1;
    this.ws.send(this.signer.seal(body), { binary: true }, () => {
      this.inFlight -= 1;
    });
  }

  close(code: number, reason: string): void {
    if (this.closed) {
      return;
    }
    this.ws.close(code, reason);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.cp.registry.release(this);
  }

  private async onFrame(frame: Uint8Array): Promise<void> {
    if (this.closed) {
      return;
    }
    let opened;
    try {
      opened = this.verifier.open(frame);
    } catch (error) {
      this.onVerifyError(error);
      return;
    }
    const { body, timestampMs, protocolVersion, skewMs } = opened;
    this.cp.metrics.message(body.case ?? "unknown");

    if (!this.helloDone) {
      if (body.case !== "agentHello") {
        this.close(CLOSE.helloRequired, "hello_required");
        return;
      }
      await this.onHello(body.value, timestampMs, protocolVersion);
      return;
    }
    if (!inWindow(skewMs)) {
      const skew = skewMs;
      this.cp.metrics.clockSkewRejections += 1;
      this.cp.logger.warn(
        { server_id: this.serverId, skew_ms: skew },
        "rejected a message outside the time window",
      );
      this.send({
        case: "opError",
        value: create(OpErrorSchema, {
          opId: opIdOf(body),
          code: "CLOCK_SKEW",
          message: "The message timestamp is outside the accepted window.",
          details: { skew_ms: String(skew) },
        }),
      });
      return;
    }
    const opId = opIdOf(body);
    if (opId !== "" && !(await this.firstSeen(opId, body.case ?? "unknown"))) {
      if (body.case === "heartbeat") {
        this.ackHeartbeat(opId);
      }
      return;
    }
    await this.dispatch(body, timestampMs);
  }

  private onVerifyError(error: unknown): void {
    if (!(error instanceof GatewayError)) {
      if (error instanceof EnvelopeError) {
        this.cp.logger.warn(
          { server_id: this.serverId, err: error.message },
          "dropped a malformed envelope",
        );
        return;
      }
      throw error;
    }
    switch (error.kind) {
      case "bad_sequence":
        this.cp.metrics.sequenceFailures += 1;
        this.cp.logger.warn(
          { server_id: this.serverId, detail: error.message },
          "bad sequence; closing",
        );
        this.close(CLOSE.badSequence, "bad_sequence");
        return;
      case "bad_signature":
      case "wrong_server":
        this.cp.metrics.signatureFailures += 1;
        this.cp.logger.warn(
          { server_id: this.serverId, detail: error.message },
          "dropped an envelope that failed verification",
        );
        return;
      case "malformed":
        this.cp.logger.warn(
          { server_id: this.serverId, detail: error.message },
          "dropped a malformed envelope",
        );
        return;
    }
  }

  private async firstSeen(opId: string, kind: string): Promise<boolean> {
    const res = await this.cp.pool.query(
      "insert into agent_ops (server_id, op_id, kind) values ($1, $2, $3) on conflict do nothing",
      [this.serverId, opId, kind],
    );
    return res.rowCount === 1;
  }

  private async onHello(
    hello: Extract<EnvelopeBody, { case: "agentHello" }>["value"],
    timestampMs: number,
    envelopeVersion: number,
  ): Promise<void> {
    const row = await loadServer(this.cp, this.serverId);
    if (row === null) {
      this.close(CLOSE.revoked, "revoked");
      return;
    }
    const ch = await handleHello(this.cp, row, hello, {
      remoteIp: normaliseIp(this.remoteIp),
      envelopeTimestampMs: timestampMs,
      envelopeVersion,
    });
    this.send({ case: "controlHello", value: ch });
    if (!ch.accepted) {
      this.cp.logger.warn(
        { server_id: this.serverId, reason: ch.rejectReason },
        "rejected an agent hello",
      );
      setTimeout(() => {
        this.close(1008, ch.rejectReason);
      }, 250);
      return;
    }
    this.helloDone = true;
    await this.cp.registry.claim(this);
    this.cp.logger.info(
      {
        server_id: this.serverId,
        agent_version: hello.agentVersion,
        skew_ms: timestampMs - Date.now(),
      },
      "agent connected",
    );
  }

  private ackHeartbeat(opId: string): void {
    this.send({
      case: "heartbeatAck",
      value: create(HeartbeatAckSchema, { opId, serverTimeMs: BigInt(this.cp.now().getTime()) }),
    });
  }

  private async dispatch(body: EnvelopeBody, timestampMs: number): Promise<void> {
    switch (body.case) {
      case "heartbeat": {
        this.cp.metrics.heartbeatLag((this.cp.now().getTime() - timestampMs) / 1000);
        this.ackHeartbeat(body.value.meta?.opId ?? "");
        const outcome = await recordHeartbeat(this.cp, this.serverId, body.value);
        if (outcome?.previous === "pending" && outcome.status === "online") {
          this.hooks.onFirstOnline?.(this.serverId);
        }
        return;
      }
      case "metricsBatch":
        await recordMetrics(this.cp, this.serverId, body.value);
        return;
      case "agentUpdateResult":
        await recordUpdateResult(this.cp, this.serverId, body.value);
        this.send({ case: "ack", value: create(AckSchema, { opId: body.value.opId }) });
        await this.cp.registry.deliver(body.value.opId, body);
        return;
      case "portCheckResult":
      case "ack":
      case "opError":
        await this.cp.registry.deliver(body.value.opId, body);
        return;
      case "agentHello":
      case "controlHello":
      case "heartbeatAck":
      case "portCheck":
      case "agentUpdate":
      case "revoke":
      case undefined:
        this.cp.logger.warn(
          { server_id: this.serverId, type: body.case },
          "ignored an unexpected message",
        );
    }
  }
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function normaliseIp(ip: string): string | null {
  if (ip === "unknown") {
    return null;
  }
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}
