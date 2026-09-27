import type { Heartbeat } from "@lumen/protocol";
import type { ServerStatus } from "@lumen/shared";

import type { ControlPlane } from "../../context";
import { publishEvent } from "../../realtime/topics";
import { checklistEvent, loadServer } from "../../services/servers/servers";

export interface HeartbeatOutcome {
  previous: ServerStatus;
  status: ServerStatus;
}

interface Row {
  id: string;
  workspace_id: string;
  status: ServerStatus;
  previous_status: ServerStatus;
  last_heartbeat_at: Date;
  flags_changed: boolean;
}

/**
 * Records a heartbeat: `last_heartbeat_at = GREATEST(existing, now)` so
 * out-of-order writes never move time backwards, `pending|offline → online`,
 * and the Docker/Caddy probe results. Publishes `server.status` on a
 * transition and `server.checklist` when a probe result changed.
 */
export async function recordHeartbeat(
  cp: ControlPlane,
  serverId: string,
  hb: Heartbeat,
): Promise<HeartbeatOutcome | null> {
  const now = cp.now();
  const res = await cp.pool.query<Row>(
    `with prev as (
       select id, status, docker_ok, caddy_ok from servers where id = $1 for update
     )
     update servers s set
       last_heartbeat_at = greatest(coalesce(s.last_heartbeat_at, $2::timestamptz), $2::timestamptz),
       status = case when s.status in ('pending', 'offline') then 'online' else s.status end,
       offline_since = case when s.status in ('pending', 'offline') then null else s.offline_since end,
       docker_ok = $3, caddy_ok = $4, container_count = $5,
       updated_at = now()
     from prev
     where s.id = prev.id
     returning s.id, s.workspace_id, s.status, prev.status as previous_status, s.last_heartbeat_at,
       (prev.docker_ok is distinct from $3 or prev.caddy_ok is distinct from $4) as flags_changed`,
    [serverId, now, hb.dockerOk, hb.caddyOk, hb.containerCount],
  );
  const row = res.rows[0];
  if (row === undefined) {
    return null;
  }
  if (row.previous_status !== row.status) {
    await publishEvent(cp.bus, {
      type: "server.status",
      server_id: row.id,
      workspace_id: row.workspace_id,
      status: row.status,
      previous: row.previous_status,
      last_heartbeat_at: row.last_heartbeat_at.toISOString(),
      at: now.toISOString(),
    });
  }
  if (row.flags_changed || row.previous_status !== row.status) {
    const server = await loadServer(cp, serverId);
    if (server !== null) {
      await publishEvent(cp.bus, checklistEvent(server, now));
    }
  }
  return { previous: row.previous_status, status: row.status };
}
