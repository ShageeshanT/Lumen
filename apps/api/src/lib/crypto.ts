import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url: join tokens, server credentials, nonces. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * SHA-256 hex. Adequate for 256-bit random secrets (tokens, credentials);
 * low-entropy passwords use argon2 instead (Phase 04). DECISIONS "SHA-256 for
 * random secrets".
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests of equal expected length. */
export function hexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** Constant-time string comparison (for the admin token). */
export function secretEqual(a: string, b: string): boolean {
  return hexEqual(sha256Hex(a), sha256Hex(b));
}

/** UUIDv7 (RFC 9562): 48-bit Unix milliseconds, version 7, random rest. */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) {
    b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
