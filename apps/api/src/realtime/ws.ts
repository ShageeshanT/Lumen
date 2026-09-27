import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocketServer, type WebSocket } from "ws";

import { secretEqual } from "../lib/crypto";
import type { Logger } from "../logger";

import type { Bus } from "./bus";
import { EVENTS_CHANNEL, TOPIC_PATTERN, topicsFor, type RealtimeEvent } from "./topics";

const PROTOCOL = "lumen.v1";
const MAX_TOPICS = 100;

interface Client {
  ws: WebSocket;
  topics: Set<string>;
}

/**
 * `GET /v1/ws`: multiplexed realtime subscriptions (SPEC J1). Browsers cannot
 * set headers on a WebSocket, so the token travels as a second subprotocol
 * `auth.<token>`; other clients may send `Authorization: Bearer <token>`.
 * Until Phase 04 the token is the instance-admin token.
 *
 * Client → server: `{"type":"subscribe","topics":["server:srv_…"]}`,
 * `{"type":"unsubscribe","topics":[…]}`.
 * Server → client: `{"type":"subscribed","topics":[…]}`,
 * `{"type":"event","topic":"…","event":{…}}`.
 */
export class RealtimeServer {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false),
  });
  private readonly clients = new Set<Client>();

  constructor(
    private readonly bus: Bus,
    private readonly adminToken: string | undefined,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    await this.bus.subscribe(EVENTS_CHANNEL, (payload) => {
      this.fanOut(payload);
    });
  }

  private authorized(req: IncomingMessage): boolean {
    if (this.adminToken === undefined) {
      return false;
    }
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ") === true && secretEqual(header.slice(7), this.adminToken)) {
      return true;
    }
    const protocols = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
    const auth = protocols.find((p) => p.startsWith("auth."));
    return auth !== undefined && secretEqual(auth.slice(5), this.adminToken);
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.authorized(req)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, topics: new Set() };
      this.clients.add(client);
      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          return;
        }
        this.onMessage(client, Buffer.isBuffer(data) ? data.toString("utf8") : "");
      });
      ws.on("close", () => {
        this.clients.delete(client);
      });
      ws.on("error", () => {
        this.clients.delete(client);
      });
    });
  }

  private onMessage(client: Client, text: string): void {
    let msg: { type?: unknown; topics?: unknown };
    try {
      msg = JSON.parse(text) as { type?: unknown; topics?: unknown };
    } catch {
      client.ws.send(JSON.stringify({ type: "error", message: "messages must be JSON" }));
      return;
    }
    const topics = Array.isArray(msg.topics)
      ? msg.topics.filter((t): t is string => typeof t === "string" && TOPIC_PATTERN.test(t))
      : [];
    if (msg.type === "subscribe") {
      for (const t of topics) {
        if (client.topics.size < MAX_TOPICS) {
          client.topics.add(t);
        }
      }
      client.ws.send(JSON.stringify({ type: "subscribed", topics: [...client.topics] }));
    } else if (msg.type === "unsubscribe") {
      for (const t of topics) {
        client.topics.delete(t);
      }
      client.ws.send(JSON.stringify({ type: "subscribed", topics: [...client.topics] }));
    }
  }

  private fanOut(payload: string): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(payload) as RealtimeEvent;
    } catch {
      this.logger.warn("dropped a malformed realtime event");
      return;
    }
    const topics = topicsFor(event);
    for (const c of this.clients) {
      const topic = topics.find((t) => c.topics.has(t));
      if (topic !== undefined && c.ws.readyState === c.ws.OPEN) {
        c.ws.send(`{"type":"event","topic":${JSON.stringify(topic)},"event":${payload}}`);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }

  close(): void {
    for (const c of this.clients) {
      c.ws.close(1001, "shutting down");
    }
    this.wss.close();
  }
}
