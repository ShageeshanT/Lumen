import type {
  AgentUpdateState,
  Checklist,
  HostSample,
  PortCheckResult,
  ServerStatus,
} from "@lumen/shared";

import type { Bus } from "./bus";

/** The NOTIFY channel every realtime event travels on. */
export const EVENTS_CHANNEL = "lumen_events";

interface Base {
  server_id: string;
  workspace_id: string;
  /** When the change was written, ISO; clients measure latency against it. */
  at: string;
}

/**
 * Realtime events published on `/v1/ws` (PHASE-02 §3): `server.status`,
 * `server.checklist`, `server.metrics`, plus `server.offline` (the alert
 * event; external delivery is Phase 08) and `server.update`.
 */
export type RealtimeEvent =
  | (Base & {
      type: "server.status";
      status: ServerStatus;
      previous: ServerStatus | null;
      last_heartbeat_at: string | null;
    })
  | (Base & { type: "server.offline"; name: string; last_heartbeat_at: string | null })
  | (Base & { type: "server.checklist"; checklist: Checklist; port_check: PortCheckResult | null })
  | (Base & { type: "server.metrics"; sample: HostSample })
  | (Base & { type: "server.update"; agent_update: AgentUpdateState })
  | (Base & { type: "server.deleted" });

/** A client subscribes to `workspace:<id>`, `server:<id>` or `servers` (everything, instance admin). */
export function topicsFor(event: RealtimeEvent): string[] {
  return ["servers", `workspace:${event.workspace_id}`, `server:${event.server_id}`];
}

export const TOPIC_PATTERN = /^(servers|workspace:ws_[0-9a-z]{26}|server:srv_[0-9a-z]{26})$/;

export async function publishEvent(bus: Bus, event: RealtimeEvent): Promise<void> {
  await bus.publish(EVENTS_CHANNEL, JSON.stringify(event));
}
