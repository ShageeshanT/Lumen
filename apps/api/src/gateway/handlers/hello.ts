import { create } from "@bufbuild/protobuf";
import { eq } from "drizzle-orm";

import { servers, type ServerRow } from "@lumen/db";
import {
  acceptsProtocolVersion,
  AgentConfigSchema,
  ControlHelloSchema,
  PROTOCOL_VERSION,
  type AgentHello,
  type ControlHello,
} from "@lumen/protocol";
import { isServerProvider } from "@lumen/shared";

import type { ControlPlane } from "../../context";
import { randomToken, sha256Hex } from "../../lib/crypto";

/** How long the old credential keeps working after a rotation. */
export const ROTATION_GRACE_MS = 5 * 60_000;

const mb = (bytes: bigint): number => Math.round(Number(bytes) / 1024 ** 2);
const gb = (bytes: bigint): number => Math.round(Number(bytes) / 1024 ** 3);

/**
 * Handles AgentHello: negotiates the protocol version, stores the host facts
 * and the measured clock skew, delivers a rotated credential when one was
 * requested, and builds the ControlHello.
 */
export async function handleHello(
  cp: ControlPlane,
  row: ServerRow,
  hello: AgentHello,
  opts: { remoteIp: string | null; envelopeTimestampMs: number; envelopeVersion: number },
): Promise<ControlHello> {
  const now = cp.now();
  if (
    !acceptsProtocolVersion(opts.envelopeVersion) ||
    !acceptsProtocolVersion(hello.protocolVersion)
  ) {
    return create(ControlHelloSchema, {
      accepted: false,
      rejectReason: "PROTOCOL_UNSUPPORTED",
      serverTimeMs: BigInt(now.getTime()),
    });
  }
  const skewMs = opts.envelopeTimestampMs - now.getTime();

  let rotated = "";
  const rotation: Partial<typeof servers.$inferInsert> = {};
  if (row.credentialRotationRequestedAt !== null) {
    rotated = randomToken();
    rotation.previousCredentialHash = row.credentialHash;
    rotation.previousCredentialExpiresAt = new Date(now.getTime() + ROTATION_GRACE_MS);
    rotation.credentialHash = sha256Hex(rotated);
    rotation.credentialRotationRequestedAt = null;
  }

  const detected = isServerProvider(hello.provider) ? hello.provider : null;
  await cp.db
    .update(servers)
    .set({
      agentVersion: hello.agentVersion,
      agentProtocolVersion: hello.protocolVersion,
      os: hello.os || null,
      osVersion: hello.osVersion || null,
      arch: hello.arch || null,
      kernel: hello.kernel || null,
      hostname: hello.hostname || null,
      cpuCores: hello.cpuCores || null,
      memoryMb: hello.memoryBytes > 0n ? mb(hello.memoryBytes) : null,
      diskGb: hello.diskBytes > 0n ? gb(hello.diskBytes) : null,
      dockerVersion: hello.dockerVersion || null,
      publicIp: hello.publicIp !== "" ? hello.publicIp : (opts.remoteIp ?? row.publicIp),
      // A detected provider wins over the wizard's guess, except "other".
      ...(detected !== null && detected !== "other" ? { provider: detected } : {}),
      ...(hello.regionLabel !== "" ? { regionLabel: hello.regionLabel } : {}),
      caddyOk: hello.caddyRunning,
      clockSkewMs: Math.max(-2_147_483_648, Math.min(2_147_483_647, skewMs)),
      ...rotation,
      updatedAt: now,
    })
    .where(eq(servers.id, row.id));

  if (rotated !== "") {
    cp.logger.info({ server_id: row.id }, "delivered a rotated server credential");
  }
  return create(ControlHelloSchema, {
    accepted: true,
    desiredStateVersion: BigInt(row.desiredStateVersion),
    negotiatedProtocolVersion: Math.min(PROTOCOL_VERSION, hello.protocolVersion),
    serverTimeMs: BigInt(now.getTime()),
    config: create(AgentConfigSchema, {
      heartbeatIntervalS: 10,
      metricsIntervalS: 10,
      logRetentionDays: 7,
      caddyImage: cp.config.CADDY_IMAGE,
      tcpProxyPortMin: 20000,
      tcpProxyPortMax: 29999,
      rotatedCredential: rotated,
    }),
  });
}
