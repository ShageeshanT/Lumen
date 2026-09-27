import { readFileSync } from "node:fs";
import { join } from "node:path";

import { create } from "@bufbuild/protobuf";
import { eq } from "drizzle-orm";

import { servers } from "@lumen/db";
import { AgentUpdateSchema, MetaSchema } from "@lumen/protocol";
import { LumenHttpError, type AgentUpdateState } from "@lumen/shared";

import type { ControlPlane } from "../context";
import { uuidv7 } from "../lib/crypto";
import { publishEvent } from "../realtime/topics";
import { listServers, loadServer } from "../services/servers/servers";

const VERSION = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;
const ARCHES = new Set(["amd64", "arm64"]);

export interface Release {
  version: string;
  arch: string;
  sha256: string;
  signature: string;
  file: string;
}

/** Reads `<AGENT_RELEASE_DIR>/<version>/lumen-agent-linux-<arch>{.sha256,.minisig}`. */
export function readRelease(
  dir: string | undefined,
  version: string,
  arch: string,
): Release | null {
  if (dir === undefined || !VERSION.test(version) || !ARCHES.has(arch)) {
    return null;
  }
  const file = `lumen-agent-linux-${arch}`;
  try {
    const sha =
      readFileSync(join(dir, version, `${file}.sha256`), "utf8")
        .trim()
        .split(/\s+/)[0] ?? "";
    const signature = readFileSync(join(dir, version, `${file}.minisig`), "utf8");
    if (!/^[0-9a-f]{64}$/.test(sha)) {
      return null;
    }
    return { version, arch, sha256: sha, signature, file };
  } catch {
    return null;
  }
}

function baseUrl(cp: ControlPlane): string {
  if (cp.config.PUBLIC_URL === undefined) {
    throw new LumenHttpError("VALIDATION_FAILED", {
      detail: "PUBLIC_URL must be set so servers can download the agent.",
    });
  }
  return cp.config.PUBLIC_URL.replace(/\/$/, "");
}

/**
 * Sends AgentUpdate to one server and waits for its Ack. The result
 * (success, or failure after a rollback) arrives later as AgentUpdateResult
 * and lands on `servers.agent_update`.
 */
export async function sendAgentUpdate(
  cp: ControlPlane,
  serverId: string,
  version: string | undefined,
  force: boolean,
): Promise<AgentUpdateState> {
  const row = await loadServer(cp, serverId);
  if (row === null) {
    throw new LumenHttpError("NOT_FOUND", { resource: "server" });
  }
  if (row.status !== "online" && row.status !== "draining") {
    throw new LumenHttpError("AGENT_OFFLINE", { serverName: row.name });
  }
  const target = version ?? cp.config.AGENT_LATEST_VERSION;
  const arch = row.arch ?? "amd64";
  const release =
    target === undefined ? null : readRelease(cp.config.AGENT_RELEASE_DIR, target, arch);
  if (release === null) {
    throw new LumenHttpError("NOT_FOUND", { resource: "agent release" });
  }
  const opId = uuidv7();
  const now = cp.now();
  // Record "sent" before sending so a fast AgentUpdateResult can't be overwritten.
  const sent: AgentUpdateState = {
    op_id: opId,
    version: release.version,
    status: "sent",
    error: null,
    at: now.toISOString(),
  };
  await cp.db
    .update(servers)
    .set({ agentUpdate: sent, updatedAt: now })
    .where(eq(servers.id, serverId));
  let reply;
  try {
    reply = await cp.registry.request(
      serverId,
      opId,
      {
        case: "agentUpdate",
        value: create(AgentUpdateSchema, {
          meta: create(MetaSchema, { opId, timestampMs: BigInt(now.getTime()) }),
          version: release.version,
          url: `${baseUrl(cp)}/agent/download/${release.version}/${release.file}`,
          sha256: release.sha256,
          signature: release.signature,
          force,
        }),
      },
      row.name,
    );
  } catch (error) {
    const failed: AgentUpdateState = {
      ...sent,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    await cp.db.update(servers).set({ agentUpdate: failed }).where(eq(servers.id, serverId));
    throw error;
  }
  if (reply.case === "opError") {
    throw new LumenHttpError("VALIDATION_FAILED", { detail: reply.value.message });
  }
  await publishEvent(cp.bus, {
    type: "server.update",
    server_id: serverId,
    workspace_id: row.workspaceId,
    agent_update: sent,
    at: now.toISOString(),
  });
  const current = await loadServer(cp, serverId);
  return (current?.agentUpdate ?? sent) as AgentUpdateState;
}

/** Waits until the server's agent_update for opId settles, or the timeout passes. */
export async function waitForUpdate(
  cp: ControlPlane,
  serverId: string,
  opId: string,
  timeoutMs: number,
  pollMs = 1_000,
): Promise<AgentUpdateState | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await loadServer(cp, serverId);
    const st = (row?.agentUpdate ?? null) as AgentUpdateState | null;
    if (st?.op_id === opId && st.status !== "sent") {
      return st;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

/**
 * Rolls an agent version out across a workspace one server at a time and
 * stops at the first failure (PHASE-02 §4.10). Servers already on the version
 * are skipped. The instance-admin update page (Phase 11) drives this.
 */
export async function rolloutAgentUpdate(
  cp: ControlPlane,
  workspaceId: string,
  version: string,
  opts: { perServerTimeoutMs?: number } = {},
): Promise<{
  updated: string[];
  failed: { server_id: string; error: string } | null;
  skipped: string[];
}> {
  const rows = await listServers(cp, workspaceId);
  const updated: string[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    if (row.agentVersion === version || row.status !== "online") {
      skipped.push(row.id);
      continue;
    }
    let error: string;
    try {
      const sent = await sendAgentUpdate(cp, row.id, version, false);
      const settled =
        sent.status === "sent"
          ? await waitForUpdate(cp, row.id, sent.op_id, opts.perServerTimeoutMs ?? 180_000)
          : sent;
      if (settled?.status === "succeeded") {
        updated.push(row.id);
        continue;
      }
      error = settled?.error ?? "the server did not report a result in time";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    cp.logger.warn(
      { server_id: row.id, version, error },
      "agent rollout stopped at a failed server",
    );
    return { updated, failed: { server_id: row.id, error }, skipped };
  }
  return { updated, failed: null, skipped };
}
