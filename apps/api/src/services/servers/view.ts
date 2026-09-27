import type { ServerRow } from "@lumen/db";
import {
  isServerProvider,
  makeError,
  type AgentUpdateState,
  type Checklist,
  type ChecklistItem,
  type HostSample,
  type PortCheckResult,
  type Server,
  type ServerStatus,
} from "@lumen/shared";

/** A heartbeat older than this means the server is offline (PHASE-02 §4.4). */
export const OFFLINE_AFTER_MS = 30_000;
/** Clock skew beyond this is surfaced as CLOCK_SKEW. */
export const CLOCK_SKEW_LIMIT_MS = 5 * 60_000;

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

function flag(v: boolean | null, connected: boolean): ChecklistItem {
  if (v === null) {
    return "pending";
  }
  if (!connected) {
    return v ? "pending" : "failed";
  }
  return v ? "ok" : "failed";
}

function portItem(pc: PortCheckResult | null, port: number): ChecklistItem {
  const p = pc?.ports.find((x) => x.port === port);
  if (p === undefined) {
    return "pending";
  }
  return p.state === "reachable" || p.state === "reachable_hairpin_unknown" ? "ok" : "failed";
}

function isConnected(row: ServerRow, now: Date): boolean {
  return (
    row.lastHeartbeatAt !== null &&
    now.getTime() - row.lastHeartbeatAt.getTime() <= OFFLINE_AFTER_MS &&
    row.status !== "offline" &&
    row.status !== "pending"
  );
}

/**
 * The join checklist (PHASE-02 §5 Copy): Connected · Docker ready · Proxy
 * running · Port 80 reachable · Port 443 reachable · Mesh ready. Unknown items
 * are `pending` so the wizard can render skeletons; Mesh is `n/a` until
 * Phase 12.
 */
export function checklistFor(row: ServerRow, now: Date): Checklist {
  const connected = isConnected(row, now);
  const pc = (row.portCheck ?? null) as PortCheckResult | null;
  return {
    connected: connected ? "ok" : row.status === "pending" ? "pending" : "failed",
    docker_ready: flag(row.dockerOk, connected),
    proxy_running: flag(row.caddyOk, connected),
    port_80: portItem(pc, 80),
    port_443: portItem(pc, 443),
    mesh: "n/a",
  };
}

function freeGb(sample: HostSample | null): number | undefined {
  const watched = sample?.disks.filter((d) => d.mount !== "/") ?? [];
  const disks = watched.length > 0 ? watched : (sample?.disks ?? []);
  if (disks.length === 0) {
    return undefined;
  }
  return Math.round((Math.min(...disks.map((d) => d.free)) / 1024 ** 3) * 10) / 10;
}

/** Maps a row to the API shape, with the checklist and current issues. */
export function toServer(row: ServerRow, now: Date): Server {
  const sample = (row.lastHostSample ?? null) as HostSample | null;
  const portCheck = (row.portCheck ?? null) as PortCheckResult | null;
  const issues: Server["issues"] = [];
  const strip = (e: ReturnType<typeof makeError>) => ({
    code: e.code,
    title: e.title,
    explanation: e.explanation,
    fix: e.fix,
  });
  if (row.status === "offline") {
    issues.push(strip(makeError("AGENT_OFFLINE", { serverName: row.name })));
  }
  if (row.diskLow) {
    const gb = freeGb(sample);
    issues.push(strip(makeError("DISK_FULL", gb === undefined ? {} : { freeDiskGb: gb })));
  }
  if (row.clockSkewMs !== null && Math.abs(row.clockSkewMs) > CLOCK_SKEW_LIMIT_MS) {
    issues.push(
      strip(
        makeError("CLOCK_SKEW", { skewMinutes: Math.round(Math.abs(row.clockSkewMs) / 60_000) }),
      ),
    );
  }
  for (const p of portCheck?.ports ?? []) {
    if (p.fix?.code === "PORT_BLOCKED") {
      issues.push(strip(makeError("PORT_BLOCKED", { port: p.port })));
    }
  }
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    name: row.name,
    provider: isServerProvider(row.provider) ? row.provider : "other",
    region_label: row.regionLabel,
    public_ip: row.publicIp,
    arch: row.arch,
    os: row.os,
    os_version: row.osVersion,
    kernel: row.kernel,
    hostname: row.hostname,
    cpu_cores: row.cpuCores,
    memory_mb: row.memoryMb,
    disk_gb: row.diskGb,
    docker_version: row.dockerVersion,
    agent_version: row.agentVersion,
    status: row.status as ServerStatus,
    offline_since: iso(row.offlineSince),
    last_heartbeat_at: iso(row.lastHeartbeatAt),
    labels: row.labels,
    monthly_cost: row.monthlyCost,
    disk_low: row.diskLow,
    clock_skew_ms: row.clockSkewMs,
    checklist: checklistFor(row, now),
    issues,
    last_host_sample: sample,
    port_check: portCheck,
    agent_update: (row.agentUpdate ?? null) as AgentUpdateState | null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
