import { eq } from "drizzle-orm";

import { serverJoinTokens, servers } from "@lumen/db";
import { LumenHttpError, type CreateJoinToken } from "@lumen/shared";

import type { ControlPlane } from "../../context";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { recordAudit } from "../audit";

/** Empty strings from the agent mean "unknown". */
function blank(s: string | undefined): string | null {
  return s === undefined || s === "" ? null : s;
}

/** Join tokens live one hour (SPEC B12). */
export const JOIN_TOKEN_TTL_MS = 60 * 60_000;

/** The paste-able install command shown once in the wizard. */
export function joinCommand(publicUrl: string, token: string): string {
  const base = publicUrl.replace(/\/$/, "");
  return `curl -fsSL ${base}/install/agent.sh | sudo sh -s -- --token ${token} --control-plane ${base}`;
}

/** Creates a single-use token; only its SHA-256 is stored. Returns the token once. */
export async function createJoinToken(
  cp: ControlPlane,
  input: CreateJoinToken,
  actor: string,
  ip: string | null,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(cp.now().getTime() + JOIN_TOKEN_TTL_MS);
  const [row] = await cp.db
    .insert(serverJoinTokens)
    .values({
      workspaceId: input.workspace_id,
      tokenHash: sha256Hex(token),
      name: input.name,
      provider: input.provider,
      labels: input.labels,
      expiresAt,
      createdBy: actor,
    })
    .returning({ id: serverJoinTokens.id });
  if (row === undefined) {
    throw new LumenHttpError("INTERNAL");
  }
  await recordAudit(cp.db, {
    workspaceId: input.workspace_id,
    actor,
    action: "server.join_token.create",
    target: row.id,
    metadata: { name: input.name, provider: input.provider, expires_at: expiresAt.toISOString() },
    ip,
  });
  return { id: row.id, token, expiresAt };
}

export interface JoinRequest {
  token: string;
  publicKey: string;
  host: {
    os?: string | undefined;
    os_version?: string | undefined;
    arch?: string | undefined;
    cpu_cores?: number | undefined;
    memory_bytes?: number | undefined;
    disk_bytes?: number | undefined;
    docker_version?: string | undefined;
    public_ip?: string | undefined;
    hostname?: string | undefined;
    agent_version?: string | undefined;
    protocol_version?: number | undefined;
    kernel?: string | undefined;
    provider?: string | undefined;
    region_label?: string | undefined;
  };
  remoteIp: string | null;
}

/**
 * Exchanges a join token for a server and credential in one transaction:
 * the token row is locked, checked (unexpired, unused), marked used, and the
 * server inserted, so a crash can't create two servers from one token.
 * Expired, used and unknown tokens all fail the same way (401).
 */
export async function consumeJoinToken(
  cp: ControlPlane,
  req: JoinRequest,
): Promise<{ serverId: string; name: string; workspaceId: string; credential: string }> {
  const now = cp.now();
  const credential = randomToken();
  const hash = sha256Hex(req.token);
  const mb = (b?: number) => (b === undefined || b <= 0 ? null : Math.round(b / 1024 ** 2));
  const gb = (b?: number) => (b === undefined || b <= 0 ? null : Math.round(b / 1024 ** 3));

  const result = await cp.db.transaction(async (tx) => {
    const [tok] = await tx
      .select()
      .from(serverJoinTokens)
      .where(eq(serverJoinTokens.tokenHash, hash))
      .for("update");
    // Unknown, used and expired tokens all fail the same way.
    if (tok?.usedAt !== null || tok.expiresAt <= now) {
      return null;
    }
    // A detected provider wins over the wizard's choice, except "other".
    const detected = blank(req.host.provider);
    const provider = detected !== null && detected !== "other" ? detected : tok.provider;
    const [server] = await tx
      .insert(servers)
      .values({
        workspaceId: tok.workspaceId,
        name: tok.name,
        provider: ["oracle", "aws", "gcp", "azure", "hetzner", "digitalocean", "other"].includes(
          provider,
        )
          ? provider
          : "other",
        labels: tok.labels,
        regionLabel: blank(req.host.region_label),
        publicIp: blank(req.host.public_ip) ?? req.remoteIp,
        arch: blank(req.host.arch),
        os: blank(req.host.os),
        osVersion: blank(req.host.os_version),
        kernel: blank(req.host.kernel),
        hostname: blank(req.host.hostname),
        cpuCores: req.host.cpu_cores ?? null,
        memoryMb: mb(req.host.memory_bytes),
        diskGb: gb(req.host.disk_bytes),
        dockerVersion: blank(req.host.docker_version),
        agentVersion: blank(req.host.agent_version),
        agentProtocolVersion: req.host.protocol_version ?? null,
        agentPublicKey: req.publicKey,
        credentialHash: sha256Hex(credential),
        status: "pending",
      })
      .returning({ id: servers.id, name: servers.name, workspaceId: servers.workspaceId });
    if (server === undefined) {
      throw new LumenHttpError("INTERNAL");
    }
    await tx
      .update(serverJoinTokens)
      .set({ usedAt: now, serverId: server.id, updatedAt: now })
      .where(eq(serverJoinTokens.id, tok.id));
    await recordAudit(tx, {
      workspaceId: tok.workspaceId,
      actor: `agent:${server.id}`,
      action: "server.join",
      target: server.id,
      metadata: { join_token_id: tok.id, hostname: req.host.hostname ?? null },
      ip: req.remoteIp,
    });
    return server;
  });
  if (result === null) {
    throw new LumenHttpError("JOIN_TOKEN_INVALID");
  }
  return { serverId: result.id, name: result.name, workspaceId: result.workspaceId, credential };
}
