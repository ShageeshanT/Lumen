import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { hostname } from "node:os";
import type { Duplex } from "node:stream";

import { serve, type ServerType } from "@hono/node-server";

import type { DbHandle } from "@lumen/db";

import { createApp } from "./app";
import type { Config } from "./config";
import type { ControlPlane } from "./context";
import { AgentGateway } from "./gateway/agent-ws";
import { GatewayMetrics } from "./gateway/metrics";
import { Registry } from "./gateway/registry";
import { loadInstanceKey, type InstanceKey } from "./gateway/signing-key";
import type { Logger } from "./logger";
import { PgBus } from "./realtime/bus";
import { RealtimeServer } from "./realtime/ws";
import { runPortCheck, type Prober } from "./workers/port-check";
import { startOfflineSweep } from "./workers/server-offline-sweep";

export interface RunningServer {
  cp: ControlPlane;
  server: ServerType;
  port: number;
  close: () => Promise<void>;
}

export interface StartOptions {
  config: Config;
  logger: Logger;
  handle: DbHandle;
  version: string;
  /** 0 picks a free port (tests). */
  port?: number;
  instanceKey?: InstanceKey;
  prober?: Prober;
  /** Disable the offline sweep (tests drive it by hand). */
  sweep?: boolean;
}

/**
 * Builds the control plane (bus, registry, gateway, realtime, workers) and
 * starts the HTTP(S) server with WebSocket upgrades on `/agent/v1` and
 * `/v1/ws`.
 */
export async function startServer(opts: StartOptions): Promise<RunningServer> {
  const { config, logger, handle } = opts;
  const bus = new PgBus(handle.pool, config.DATABASE_URL, logger);
  const metrics = new GatewayMetrics();
  const nodeId =
    config.GATEWAY_NODE_ID ??
    `${hostname()}-${String(process.pid)}-${randomBytes(3).toString("hex")}`;
  const registry = new Registry({ db: handle.db, bus, nodeId, logger, metrics });
  const cp: ControlPlane = {
    db: handle.db,
    pool: handle.pool,
    bus,
    logger,
    config,
    instanceKey: opts.instanceKey ?? loadInstanceKey(config, logger),
    registry,
    metrics,
    now: () => new Date(),
  };
  await registry.start();
  const realtime = new RealtimeServer(bus, config.LUMEN_ADMIN_TOKEN, logger);
  await realtime.start();
  // Last automatic port-check attempt per server; a failed attempt (no
  // result stored) is retried at most every five minutes.
  const autoChecks = new Map<string, number>();
  const gateway = new AgentGateway(cp, {
    onProxyReady: (serverId) => {
      // Once after install, as soon as the proxy runs (PHASE-02 §4.6).
      const last = autoChecks.get(serverId);
      if (last !== undefined && Date.now() - last < 5 * 60_000) {
        return;
      }
      autoChecks.set(serverId, Date.now());
      runPortCheck(cp, serverId, [80, 443], opts.prober)
        .then((r) => {
          logger.info(
            { server_id: serverId, ports: r.ports.map((p) => `${String(p.port)}:${p.state}`) },
            "automatic port check",
          );
        })
        .catch((error: unknown) => {
          logger.warn({ err: error, server_id: serverId }, "automatic port check failed");
        });
    },
  });
  const stopSweep = opts.sweep === false ? () => undefined : startOfflineSweep(cp);

  const app = createApp({
    config,
    pool: handle.pool,
    logger,
    version: opts.version,
    controlPlane: cp,
    ...(opts.prober === undefined ? {} : { prober: opts.prober }),
  });
  const tls =
    config.TLS_CERT_FILE !== undefined && config.TLS_KEY_FILE !== undefined
      ? { cert: readFileSync(config.TLS_CERT_FILE), key: readFileSync(config.TLS_KEY_FILE) }
      : undefined;
  const port = opts.port ?? config.API_PORT;
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve(
      {
        fetch: app.fetch,
        port,
        ...(tls === undefined ? {} : { createServer: createHttpsServer, serverOptions: tls }),
      },
      () => {
        resolve(s);
      },
    );
  });
  (server as HttpServer).on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/agent/v1") {
      void gateway.handleUpgrade(req, socket, head);
    } else if (path === "/v1/ws") {
      realtime.handleUpgrade(req, socket, head);
    } else {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    }
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  logger.info({ port: actualPort, tls: tls !== undefined, node: nodeId }, "control plane ready");

  return {
    cp,
    server,
    port: actualPort,
    close: async () => {
      stopSweep();
      registry.closeAll();
      realtime.close();
      gateway.close();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        (server as HttpServer).closeAllConnections();
      });
      await bus.close();
    },
  };
}
