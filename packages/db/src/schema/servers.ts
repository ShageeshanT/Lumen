import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "../columns";

/**
 * A machine running the Lumen agent (SPEC B6 `servers`). Phase 02 owns these
 * columns; Phase 04 adds the foreign key to `workspaces` and must not change
 * them. `status` moves only pending → online, online ↔ offline and
 * online|offline → draining (PHASE-02 §5).
 */
export const servers = pgTable(
  "servers",
  {
    id: id("srv"),
    // Phase 04 adds the FK once `workspaces` exists.
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    provider: text("provider").notNull().default("other"),
    regionLabel: text("region_label"),
    publicIp: text("public_ip"),
    meshIp: text("mesh_ip"),
    containerSubnet: text("container_subnet"),
    arch: text("arch"),
    os: text("os"),
    osVersion: text("os_version"),
    kernel: text("kernel"),
    hostname: text("hostname"),
    cpuCores: integer("cpu_cores"),
    memoryMb: integer("memory_mb"),
    diskGb: integer("disk_gb"),
    dockerVersion: text("docker_version"),
    agentVersion: text("agent_version"),
    agentProtocolVersion: integer("agent_protocol_version"),
    status: text("status").notNull().default("pending"),
    offlineSince: timestamp("offline_since", { withTimezone: true, mode: "date" }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: "date" }),
    labels: text("labels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    wgPublicKey: text("wg_public_key"),
    monthlyCost: numeric("monthly_cost", { precision: 12, scale: 2, mode: "number" }),
    // Identity and credentials. Only hashes of secrets are stored.
    agentPublicKey: text("agent_public_key").notNull(),
    credentialHash: text("credential_hash").notNull(),
    previousCredentialHash: text("previous_credential_hash"),
    previousCredentialExpiresAt: timestamp("previous_credential_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    credentialRotationRequestedAt: timestamp("credential_rotation_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    // Latest health from heartbeats and metrics.
    dockerOk: boolean("docker_ok"),
    caddyOk: boolean("caddy_ok"),
    diskLow: boolean("disk_low").notNull().default(false),
    containerCount: integer("container_count"),
    clockSkewMs: integer("clock_skew_ms"),
    desiredStateVersion: bigint("desired_state_version", { mode: "number" }).notNull().default(0),
    lastHostSample: jsonb("last_host_sample").$type<Record<string, unknown>>(),
    portCheck: jsonb("port_check").$type<Record<string, unknown>>(),
    agentUpdate: jsonb("agent_update").$type<Record<string, unknown>>(),
    // Which API process holds the agent's WebSocket (PHASE-02 §4.4 registry).
    gatewayNode: text("gateway_node"),
    gatewayConnectedAt: timestamp("gateway_connected_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    index("servers_workspace_idx").on(t.workspaceId),
    index("servers_status_heartbeat_idx").on(t.status, t.lastHeartbeatAt),
    check("servers_status_check", sql`${t.status} in ('pending', 'online', 'offline', 'draining')`),
    check(
      "servers_provider_check",
      sql`${t.provider} in ('oracle', 'aws', 'gcp', 'azure', 'hetzner', 'digitalocean', 'other')`,
    ),
  ],
);

export type ServerRow = typeof servers.$inferSelect;
export type NewServerRow = typeof servers.$inferInsert;
