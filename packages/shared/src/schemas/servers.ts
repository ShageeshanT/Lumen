import { z } from "zod";

import { SERVER_PROVIDERS } from "../servers/providers";

/**
 * Server API schemas (PHASE-02 §4.11). Field names are snake_case like every
 * Lumen API body (DECISIONS 0019), and ids are prefixed ULIDs (DECISIONS
 * 0012), so `workspace_id` is a `ws_…` id rather than the UUID the phase
 * document sketches.
 */

const ULID = "[0-9a-hjkmnp-tv-z]{26}";
export const WorkspaceId = z
  .string()
  .regex(new RegExp(`^ws_${ULID}$`), "must be a workspace id like ws_01j8…");
export const ServerId = z
  .string()
  .regex(new RegExp(`^srv_${ULID}$`), "must be a server id like srv_01j8…");

export const ServerProviderSchema = z.enum(SERVER_PROVIDERS);
export const ServerStatus = z.enum(["pending", "online", "offline", "draining"]);
export type ServerStatus = z.infer<typeof ServerStatus>;

const Label = z.string().min(1).max(32);
const Name = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[^\u0000-\u001f]+$/, "must not contain control characters");

export const CreateJoinToken = z.object({
  workspace_id: WorkspaceId,
  name: Name,
  provider: ServerProviderSchema,
  labels: z.array(Label).max(20).default([]),
});
export type CreateJoinToken = z.infer<typeof CreateJoinToken>;

export const JoinTokenResponse = z.object({
  token: z.string(),
  expires_at: z.iso.datetime(),
  command: z.string(),
});
export type JoinTokenResponse = z.infer<typeof JoinTokenResponse>;

export const PatchServer = z
  .object({
    name: Name.optional(),
    labels: z.array(Label).max(20).optional(),
    region_label: z.string().max(64).optional(),
    monthly_cost: z.number().min(0).nullable().optional(),
    status: z.enum(["draining"]).optional(),
  })
  .strict();
export type PatchServer = z.infer<typeof PatchServer>;

export const PortCheckRequest = z.object({
  ports: z.array(z.number().int().min(1).max(65535)).min(1).max(10).default([80, 443]),
});
export type PortCheckRequest = z.infer<typeof PortCheckRequest>;

export const AgentUpdateRequest = z.object({
  /** Defaults to the latest release the control plane has. */
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/)
    .optional(),
  force: z.boolean().default(false),
});
export type AgentUpdateRequest = z.infer<typeof AgentUpdateRequest>;

/** Outcome of probing one port from the control plane (PHASE-02 §4.6). */
export const PortState = z.enum([
  "reachable",
  "listening_not_reachable",
  "not_listening",
  "timeout",
  "reachable_hairpin_unknown",
]);
export type PortState = z.infer<typeof PortState>;

const FixStepSchema = z.object({
  text: z.string(),
  command: z.string().optional(),
  link: z.string().optional(),
});
export const FixCardSchema = z.object({
  key: z.string(),
  title: z.string(),
  steps: z.array(FixStepSchema),
  estimated_minutes: z.number(),
});

export const PortResult = z.object({
  port: z.number().int(),
  state: PortState,
  latency_ms: z.number().int().nullable(),
  listener: z.string().nullable(),
  /** Set for failures: the error code and the provider's fix cards (cloud first, then OS). */
  fix: z
    .object({
      code: z.enum(["PORT_BLOCKED", "PROXY_NOT_LISTENING"]),
      message: z.string(),
      cards: z.array(FixCardSchema),
    })
    .nullable(),
});
export type PortResult = z.infer<typeof PortResult>;

export const PortCheckResult = z.object({
  op_id: z.string(),
  checked_at: z.iso.datetime(),
  ports: z.array(PortResult),
});
export type PortCheckResult = z.infer<typeof PortCheckResult>;

export const ChecklistItem = z.enum(["ok", "failed", "pending", "n/a"]);
export type ChecklistItem = z.infer<typeof ChecklistItem>;

/** Labels: Connected · Docker ready · Proxy running · Port 80 reachable · Port 443 reachable · Mesh ready. */
export const Checklist = z.object({
  connected: ChecklistItem,
  docker_ready: ChecklistItem,
  proxy_running: ChecklistItem,
  port_80: ChecklistItem,
  port_443: ChecklistItem,
  mesh: ChecklistItem,
});
export type Checklist = z.infer<typeof Checklist>;

export const DiskSampleSchema = z.object({
  mount: z.string(),
  total: z.number(),
  used: z.number(),
  free: z.number(),
  inodes_free: z.number(),
});

export const HostSampleSchema = z.object({
  ts: z.iso.datetime(),
  cpu_percent: z.number(),
  load1: z.number(),
  load5: z.number(),
  load15: z.number(),
  mem_total: z.number(),
  mem_used: z.number(),
  mem_available: z.number(),
  swap_total: z.number(),
  swap_used: z.number(),
  disks: z.array(DiskSampleSchema),
  nets: z.array(z.object({ iface: z.string(), rx_bytes: z.number(), tx_bytes: z.number() })),
  uptime_s: z.number(),
  container_count: z.number(),
  disk_low: z.boolean(),
  agent: z
    .object({
      rss_bytes: z.number(),
      goroutines: z.number(),
      send_queue_len: z.number(),
      reconnects_total: z.number(),
    })
    .nullable(),
});
export type HostSample = z.infer<typeof HostSampleSchema>;

export const AgentUpdateState = z.object({
  op_id: z.string(),
  version: z.string(),
  status: z.enum(["sent", "succeeded", "failed"]),
  error: z.string().nullable(),
  at: z.iso.datetime(),
});
export type AgentUpdateState = z.infer<typeof AgentUpdateState>;

export const ServerIssue = z.object({
  code: z.string(),
  title: z.string(),
  explanation: z.string(),
  fix: z.string(),
});

export const Server = z.object({
  id: ServerId,
  workspace_id: WorkspaceId,
  name: z.string(),
  provider: ServerProviderSchema,
  region_label: z.string().nullable(),
  public_ip: z.string().nullable(),
  arch: z.string().nullable(),
  os: z.string().nullable(),
  os_version: z.string().nullable(),
  kernel: z.string().nullable(),
  hostname: z.string().nullable(),
  cpu_cores: z.number().int().nullable(),
  memory_mb: z.number().int().nullable(),
  disk_gb: z.number().int().nullable(),
  docker_version: z.string().nullable(),
  agent_version: z.string().nullable(),
  status: ServerStatus,
  offline_since: z.iso.datetime().nullable(),
  last_heartbeat_at: z.iso.datetime().nullable(),
  labels: z.array(z.string()),
  monthly_cost: z.number().nullable(),
  disk_low: z.boolean(),
  clock_skew_ms: z.number().int().nullable(),
  checklist: Checklist,
  /** Current problems as catalog errors (AGENT_OFFLINE, DISK_FULL, CLOCK_SKEW, PORT_BLOCKED). */
  issues: z.array(ServerIssue),
  last_host_sample: HostSampleSchema.nullable(),
  port_check: PortCheckResult.nullable(),
  agent_update: AgentUpdateState.nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type Server = z.infer<typeof Server>;

export const ServerList = z.object({ servers: z.array(Server) });
