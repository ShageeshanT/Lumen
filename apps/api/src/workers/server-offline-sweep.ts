import type { ControlPlane } from "../context";
import { publishEvent } from "../realtime/topics";
import { notify } from "../services/notifications";

/** Sweep interval and offline threshold (PHASE-02 §4.4). */
export const SWEEP_EVERY_MS = 5_000;
export const OFFLINE_AFTER_S = 30;

interface Swept {
  id: string;
  workspace_id: string;
  name: string;
  last_heartbeat_at: Date | null;
}

/**
 * One sweep: every `online` server without a heartbeat for 30 s becomes
 * `offline` (with `offline_since`), gets an in-app AGENT_OFFLINE notification,
 * and `server.status` + `server.offline` are published. Draining servers keep
 * their status. Returns the ids that went offline.
 */
export async function sweepOffline(cp: ControlPlane): Promise<string[]> {
  const now = cp.now();
  const res = await cp.pool.query<Swept>(
    `update servers set status = 'offline', offline_since = $1, updated_at = now()
     where status = 'online' and last_heartbeat_at < $1::timestamptz - make_interval(secs => $2)
     returning id, workspace_id, name, last_heartbeat_at`,
    [now, OFFLINE_AFTER_S],
  );
  for (const row of res.rows) {
    const lastHb = row.last_heartbeat_at?.toISOString() ?? null;
    cp.logger.warn({ server_id: row.id }, "server went offline");
    await notify(cp.db, {
      workspaceId: row.workspace_id,
      kind: "server.offline",
      severity: "critical",
      code: "AGENT_OFFLINE",
      ctx: { serverName: row.name },
      targetType: "server",
      targetId: row.id,
      data: { last_heartbeat_at: lastHb },
    });
    await publishEvent(cp.bus, {
      type: "server.status",
      server_id: row.id,
      workspace_id: row.workspace_id,
      status: "offline",
      previous: "online",
      last_heartbeat_at: lastHb,
      at: now.toISOString(),
    });
    await publishEvent(cp.bus, {
      type: "server.offline",
      server_id: row.id,
      workspace_id: row.workspace_id,
      name: row.name,
      last_heartbeat_at: lastHb,
      at: now.toISOString(),
    });
  }
  return res.rows.map((r) => r.id);
}

/** Drops op ids older than 24 h and expired rotation grace periods. */
export async function housekeeping(cp: ControlPlane): Promise<void> {
  await cp.pool.query("delete from agent_ops where received_at < now() - interval '24 hours'");
  await cp.pool.query(
    `update servers set previous_credential_hash = null, previous_credential_expires_at = null
     where previous_credential_expires_at < now()`,
  );
}

/** Starts the sweep loop; returns a stop function. */
export function startOfflineSweep(cp: ControlPlane): () => void {
  let running = false;
  let ticks = 0;
  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    ticks += 1;
    const work = async () => {
      await sweepOffline(cp);
      if (ticks % 720 === 1) {
        await housekeeping(cp);
      }
    };
    work()
      .catch((error: unknown) => {
        cp.logger.error({ err: error }, "offline sweep failed");
      })
      .finally(() => {
        running = false;
      });
  }, SWEEP_EVERY_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
