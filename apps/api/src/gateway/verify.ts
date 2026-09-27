import type { KeyObject } from "node:crypto";

import {
  decodeFrame,
  encodeFrame,
  EnvelopeError,
  openEnvelope,
  sealEnvelope,
  type EnvelopeBody,
} from "@lumen/protocol";

import { hexEqual, sha256Hex } from "../lib/crypto";

/** Envelopes older than this or further in the future are rejected (PHASE-02 §4.4). */
export const MAX_PAST_MS = 5 * 60_000;
export const MAX_FUTURE_MS = 60_000;

export type GatewayErrorKind = "bad_signature" | "bad_sequence" | "malformed" | "wrong_server";

export class GatewayError extends Error {
  constructor(
    readonly kind: GatewayErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/** Parses `Authorization: Bearer <server_id>.<credential>`. */
export function parseAgentBearer(
  header: string | undefined,
): { serverId: string; credential: string } | null {
  if (header?.startsWith("Bearer ") !== true) {
    return null;
  }
  const value = header.slice(7).trim();
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) {
    return null;
  }
  const serverId = value.slice(0, dot);
  const credential = value.slice(dot + 1);
  if (!/^srv_[0-9a-z]{26}$/.test(serverId) || credential.length > 128) {
    return null;
  }
  return { serverId, credential };
}

/**
 * True when `credential` matches the current hash, or the previous hash
 * while its five-minute rotation grace period lasts.
 */
export function credentialMatches(
  row: {
    credentialHash: string;
    previousCredentialHash: string | null;
    previousCredentialExpiresAt: Date | null;
  },
  credential: string,
  now: Date,
): boolean {
  const hash = sha256Hex(credential);
  if (hexEqual(hash, row.credentialHash)) {
    return true;
  }
  return (
    row.previousCredentialHash !== null &&
    row.previousCredentialExpiresAt !== null &&
    row.previousCredentialExpiresAt > now &&
    hexEqual(hash, row.previousCredentialHash)
  );
}

/**
 * Opens agent envelopes for one connection: signature (agent identity key),
 * server id and strictly increasing seq (+1 each time). The caller applies the
 * timestamp window (the hello is exempt: its skew is measured, not rejected).
 */
export class InboundVerifier {
  private lastSeq = 0n;

  constructor(
    private readonly agentKey: KeyObject,
    private readonly serverId: string,
    private readonly now: () => number = Date.now,
  ) {}

  open(frame: Uint8Array): {
    body: EnvelopeBody;
    timestampMs: number;
    protocolVersion: number;
    skewMs: number;
  } {
    let envelope;
    try {
      envelope = decodeFrame(frame);
    } catch (error) {
      throw new GatewayError("malformed", (error as Error).message);
    }
    let body: EnvelopeBody;
    try {
      body = openEnvelope(this.agentKey, envelope);
    } catch (error) {
      if (error instanceof EnvelopeError) {
        throw new GatewayError(
          error.kind === "bad_signature" ? "bad_signature" : "malformed",
          error.message,
        );
      }
      throw error;
    }
    if (envelope.serverId !== this.serverId) {
      throw new GatewayError("wrong_server", `envelope for ${envelope.serverId}`);
    }
    if (envelope.seq !== this.lastSeq + 1n) {
      throw new GatewayError(
        "bad_sequence",
        `seq ${String(envelope.seq)} after ${String(this.lastSeq)}`,
      );
    }
    this.lastSeq = envelope.seq;
    const ts = Number(envelope.timestampMs);
    return {
      body,
      timestampMs: ts,
      protocolVersion: envelope.protocolVersion,
      skewMs: ts - this.now(),
    };
  }
}

/** True when a timestamp skew is inside the accepted window. */
export function inWindow(skewMs: number): boolean {
  return skewMs >= -MAX_PAST_MS && skewMs <= MAX_FUTURE_MS;
}

/** Seals control plane → agent envelopes with the instance key and a per-connection seq. */
export class OutboundSigner {
  private seq = 0n;

  constructor(
    private readonly key: KeyObject,
    private readonly serverId: string,
    private readonly now: () => number = Date.now,
  ) {}

  seal(body: EnvelopeBody): Uint8Array {
    this.seq += 1n;
    const envelope = sealEnvelope(this.key, {
      serverId: this.serverId,
      seq: this.seq,
      timestampMs: BigInt(this.now()),
      body,
    });
    return encodeFrame(envelope);
  }
}
