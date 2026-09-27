import { eq } from "drizzle-orm";

import { servers } from "@lumen/db";
import type { AgentUpdateResult } from "@lumen/protocol";
import type { AgentUpdateState } from "@lumen/shared";

import type { ControlPlane } from "../../context";
import { publishEvent } from "../../realtime/topics";
import { notify } from "../../services/notifications";
import { loadServer } from "../../services/servers/servers";

/** Records AgentUpdateResult on the server and raises a notification on failure. */
export async function recordUpdateResult(
  cp: ControlPlane,
  serverId: string,
  result: AgentUpdateResult,
): Promise<void> {
  const row = await loadServer(cp, serverId);
  if (row === null) {
    return;
  }
  const now = cp.now();
  const prev = (row.agentUpdate ?? null) as AgentUpdateState | null;
  const state: AgentUpdateState = {
    op_id: result.opId,
    version: prev?.op_id === result.opId ? prev.version : result.runningVersion,
    status: result.success ? "succeeded" : "failed",
    error: result.success ? null : result.error || null,
    at: now.toISOString(),
  };
  await cp.db
    .update(servers)
    .set({
      agentUpdate: state,
      ...(result.runningVersion === "" ? {} : { agentVersion: result.runningVersion }),
      updatedAt: now,
    })
    .where(eq(servers.id, serverId));
  if (!result.success) {
    const code = result.error.startsWith("UPDATE_VERIFY_FAILED")
      ? "UPDATE_VERIFY_FAILED"
      : "UPDATE_ROLLED_BACK";
    await notify(cp.db, {
      workspaceId: row.workspaceId,
      kind: "server.update_failed",
      severity: "warning",
      code,
      ctx: { version: state.version, serverName: row.name },
      targetType: "server",
      targetId: serverId,
      data: { op_id: result.opId, running_version: result.runningVersion },
    });
  }
  await publishEvent(cp.bus, {
    type: "server.update",
    server_id: serverId,
    workspace_id: row.workspaceId,
    agent_update: state,
    at: now.toISOString(),
  });
}
