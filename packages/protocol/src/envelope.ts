import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import { EnvelopeSchema, type Envelope } from "../gen/ts/lumen/agent/v1/envelope_pb";

import { PROTOCOL_VERSION } from "./version";

/** Largest frame either side accepts (PHASE-02 §5). */
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

/** The body of an envelope: the `body` oneof, without the framing fields. */
export type EnvelopeBody = Envelope["body"];

export class EnvelopeError extends Error {
  readonly kind: "bad_signature" | "malformed";

  constructor(kind: "bad_signature" | "malformed", message: string) {
    super(message);
    this.name = "EnvelopeError";
    this.kind = kind;
  }
}

/**
 * The exact bytes a signature covers: protocol_version (u32) || len(server_id)
 * (u16) || server_id || seq (u64) || timestamp_ms (i64) || payload, big-endian.
 * Mirrors `SigningBytes` in packages/protocol/envelope.go.
 */
export function signingBytes(
  version: number,
  serverId: string,
  seq: bigint,
  timestampMs: bigint,
  payload: Uint8Array,
): Uint8Array {
  const id = new TextEncoder().encode(serverId).subarray(0, 0xffff);
  const out = new Uint8Array(4 + 2 + id.length + 8 + 8 + payload.length);
  const view = new DataView(out.buffer);
  let offset = 0;
  view.setUint32(offset, version);
  offset += 4;
  view.setUint16(offset, id.length);
  offset += 2;
  out.set(id, offset);
  offset += id.length;
  view.setBigUint64(offset, BigInt.asUintN(64, seq));
  offset += 8;
  view.setBigInt64(offset, BigInt.asIntN(64, timestampMs));
  offset += 8;
  out.set(payload, offset);
  return out;
}

export interface SealInput {
  serverId: string;
  seq: bigint;
  timestampMs: bigint;
  body: EnvelopeBody;
}

/** Serializes `body` into a body-only envelope, wraps and signs it. */
export function sealEnvelope(key: KeyObject, input: SealInput): Envelope {
  if (input.body.case === undefined) {
    throw new EnvelopeError("malformed", "body is empty");
  }
  const payload = toBinary(EnvelopeSchema, create(EnvelopeSchema, { body: input.body }));
  if (payload.length > MAX_MESSAGE_BYTES) {
    throw new EnvelopeError("malformed", `payload is ${String(payload.length)} bytes`);
  }
  const signature = sign(
    null,
    signingBytes(PROTOCOL_VERSION, input.serverId, input.seq, input.timestampMs, payload),
    key,
  );
  return create(EnvelopeSchema, {
    protocolVersion: PROTOCOL_VERSION,
    serverId: input.serverId,
    seq: input.seq,
    timestampMs: input.timestampMs,
    payload,
    signature: new Uint8Array(signature),
  });
}

/** Verifies the signature with `key` and returns the decoded body. */
export function openEnvelope(key: KeyObject, envelope: Envelope): EnvelopeBody {
  if (envelope.payload.length === 0) {
    throw new EnvelopeError("malformed", "empty payload");
  }
  if (envelope.body.case !== undefined) {
    throw new EnvelopeError("malformed", "outer body must be unset");
  }
  if (envelope.signature.length !== 64) {
    throw new EnvelopeError("bad_signature", "signature missing or wrong length");
  }
  const message = signingBytes(
    envelope.protocolVersion,
    envelope.serverId,
    envelope.seq,
    envelope.timestampMs,
    envelope.payload,
  );
  if (!verify(null, message, key, envelope.signature)) {
    throw new EnvelopeError("bad_signature", "signature does not verify");
  }
  let inner: Envelope;
  try {
    inner = fromBinary(EnvelopeSchema, envelope.payload);
  } catch (error) {
    throw new EnvelopeError(
      "malformed",
      `payload does not decode: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (inner.body.case === undefined || inner.payload.length > 0 || inner.signature.length > 0) {
    throw new EnvelopeError("malformed", "payload must carry exactly one body");
  }
  return inner.body;
}

/** Decodes a wire frame. Throws EnvelopeError("malformed") on garbage. */
export function decodeFrame(frame: Uint8Array): Envelope {
  if (frame.length > MAX_MESSAGE_BYTES + 1024) {
    throw new EnvelopeError("malformed", "frame too large");
  }
  try {
    return fromBinary(EnvelopeSchema, frame);
  } catch (error) {
    throw new EnvelopeError(
      "malformed",
      `frame does not decode: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Encodes an envelope for the wire. */
export function encodeFrame(envelope: Envelope): Uint8Array {
  return toBinary(EnvelopeSchema, envelope);
}

/** True when a peer at `version` can be served: N and N-1 (SPEC B5). */
export function acceptsProtocolVersion(version: number): boolean {
  const previous = PROTOCOL_VERSION - 1;
  return version === PROTOCOL_VERSION || (previous >= 1 && version === previous);
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** Builds a public key object from the raw 32 bytes. */
export function ed25519PublicKeyFromRaw(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) {
    throw new EnvelopeError("malformed", "an Ed25519 public key is 32 bytes");
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/** Builds a private key object from the raw 32-byte seed. */
export function ed25519PrivateKeyFromSeed(seed: Uint8Array): KeyObject {
  if (seed.length !== 32) {
    throw new EnvelopeError("malformed", "an Ed25519 seed is 32 bytes");
  }
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

/** Returns the raw 32-byte public key of an Ed25519 key object. */
export function ed25519RawPublicKey(key: KeyObject): Uint8Array {
  const der = (key.type === "private" ? createPublicKey(key) : key).export({
    format: "der",
    type: "spki",
  });
  return new Uint8Array(der.subarray(der.length - 32));
}
