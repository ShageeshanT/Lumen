import type { MetricsBatch } from "@lumen/protocol";
import type { HostSample } from "@lumen/shared";

import type { ControlPlane } from "../../context";
import { publishEvent } from "../../realtime/topics";
import { notify } from "../../services/notifications";
import { checklistEvent, loadServer } from "../../services/servers/servers";

const num = (v: bigint | number): number => Number(v);

/** Converts the protobuf sample to the API's JSON shape (numbers, ISO time). */
export function toHostSample(batch: MetricsBatch): HostSample | null {
  const s = batch.hostSample;
  if (s === undefined) {
    return null;
  }
  return {
    ts: new Date(num(s.tsMs)).toISOString(),
    cpu_percent: Math.round(s.cpuPercent * 100) / 100,
    load1: s.load1,
    load5: s.load5,
    load15: s.load15,
    mem_total: num(s.memTotal),
    mem_used: num(s.memUsed),
    mem_available: num(s.memAvailable),
    swap_total: num(s.swapTotal),
    swap_used: num(s.swapUsed),
    disks: s.disks.map((d) => ({
      mount: d.mount,
      total: num(d.total),
      used: num(d.used),
      free: num(d.free),
      inodes_free: num(d.inodesFree),
    })),
    nets: s.nets.map((n) => ({
      iface: n.iface,
      rx_bytes: num(n.rxBytes),
      tx_bytes: num(n.txBytes),
    })),
    uptime_s: num(s.uptimeS),
    container_count: s.containerCount,
    disk_low: s.diskLow,
    agent:
      s.self === undefined
        ? null
        : {
            rss_bytes: num(s.self.agentRssBytes),
            goroutines: s.self.goroutines,
            send_queue_len: s.self.sendQueueLen,
            reconnects_total: num(s.self.reconnectsTotal),
          },
  };
}

/**
 * Stores the latest host sample (1-minute rollups arrive in Phase 08),
 * publishes `server.metrics`, and raises DISK_FULL once when `disk_low`
 * turns on: an in-app notification row plus a checklist event.
 */
export async function recordMetrics(
  cp: ControlPlane,
  serverId: string,
  batch: MetricsBatch,
): Promise<void> {
  const sample = toHostSample(batch);
  if (sample === null) {
    return;
  }
  const now = cp.now();
  const res = await cp.pool.query<{ workspace_id: string; name: string; was_low: boolean }>(
    `with prev as (select id, disk_low from servers where id = $1 for update)
     update servers s set last_host_sample = $2::jsonb, disk_low = $3, updated_at = now()
     from prev where s.id = prev.id
     returning s.workspace_id, s.name, prev.disk_low as was_low`,
    [serverId, JSON.stringify(sample), sample.disk_low],
  );
  const row = res.rows[0];
  if (row === undefined) {
    return;
  }
  await publishEvent(cp.bus, {
    type: "server.metrics",
    server_id: serverId,
    workspace_id: row.workspace_id,
    sample,
    at: now.toISOString(),
  });
  if (sample.disk_low !== row.was_low) {
    if (sample.disk_low) {
      const watched = sample.disks.filter((d) => d.mount !== "/");
      const free = Math.min(...(watched.length > 0 ? watched : sample.disks).map((d) => d.free));
      await notify(cp.db, {
        workspaceId: row.workspace_id,
        kind: "server.disk_full",
        severity: "critical",
        code: "DISK_FULL",
        ctx: { freeDiskGb: Math.round((free / 1024 ** 3) * 10) / 10, serverName: row.name },
        targetType: "server",
        targetId: serverId,
      });
      cp.logger.warn({ server_id: serverId }, "server disk is low");
    }
    const server = await loadServer(cp, serverId);
    if (server !== null) {
      await publishEvent(cp.bus, checklistEvent(server, now));
    }
  }
}
