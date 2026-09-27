import { desc, eq } from "drizzle-orm";

import { servers, type ServerRow } from "@lumen/db";
import type { PortCheckResult } from "@lumen/shared";

import type { ControlPlane } from "../../context";
import type { RealtimeEvent } from "../../realtime/topics";

import { checklistFor } from "./view";

export async function loadServer(
  cp: Pick<ControlPlane, "db">,
  id: string,
): Promise<ServerRow | null> {
  const [row] = await cp.db.select().from(servers).where(eq(servers.id, id));
  return row ?? null;
}

export async function listServers(
  cp: Pick<ControlPlane, "db">,
  workspaceId: string | undefined,
): Promise<ServerRow[]> {
  const q = cp.db.select().from(servers);
  const rows = await (
    workspaceId === undefined ? q : q.where(eq(servers.workspaceId, workspaceId))
  ).orderBy(desc(servers.createdAt));
  return rows;
}

/** The `server.checklist` event for a row. */
export function checklistEvent(row: ServerRow, now: Date): RealtimeEvent {
  return {
    type: "server.checklist",
    server_id: row.id,
    workspace_id: row.workspaceId,
    checklist: checklistFor(row, now),
    port_check: (row.portCheck ?? null) as PortCheckResult | null,
    at: now.toISOString(),
  };
}
