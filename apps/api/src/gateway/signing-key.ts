import { randomBytes, type KeyObject } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ed25519PrivateKeyFromSeed, ed25519RawPublicKey } from "@lumen/protocol";

import type { Logger } from "../logger";

/** The control plane's instance key: signs every envelope sent to agents. */
export interface InstanceKey {
  privateKey: KeyObject;
  /** Raw 32 bytes, delivered to agents in the join response. */
  publicKeyRaw: Uint8Array;
}

export function instanceKeyFromSeed(seed: Uint8Array): InstanceKey {
  const privateKey = ed25519PrivateKeyFromSeed(seed);
  return { privateKey, publicKeyRaw: ed25519RawPublicKey(privateKey) };
}

/**
 * Loads AGENT_SIGNING_KEY (base64 seed). Outside production, a missing key is
 * generated once into `<stateDir>/agent-signing.key` (0600) so agents joined
 * against a dev control plane survive restarts. Production requires the
 * variable (config.ts enforces it); the self-host installer generates it.
 */
export function loadInstanceKey(
  env: { AGENT_SIGNING_KEY?: string | undefined; STATE_DIR: string },
  logger: Logger,
): InstanceKey {
  if (env.AGENT_SIGNING_KEY !== undefined) {
    const seed = Buffer.from(env.AGENT_SIGNING_KEY, "base64");
    if (seed.length !== 32) {
      throw new Error("AGENT_SIGNING_KEY must be 32 bytes, base64-encoded");
    }
    return instanceKeyFromSeed(seed);
  }
  const path = join(env.STATE_DIR, "agent-signing.key");
  try {
    return instanceKeyFromSeed(Buffer.from(readFileSync(path, "utf8").trim(), "base64"));
  } catch {
    mkdirSync(env.STATE_DIR, { recursive: true, mode: 0o700 });
    const seed = randomBytes(32);
    writeFileSync(path, `${seed.toString("base64")}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
    logger.warn(
      { path },
      "AGENT_SIGNING_KEY is not set; generated a development signing key. Set it in production.",
    );
    return instanceKeyFromSeed(seed);
  }
}
