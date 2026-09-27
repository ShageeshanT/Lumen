import type { ServerProvider } from "../servers/providers";

/** One instruction on a fix card. `text` is a single imperative sentence. */
export interface FixStep {
  text: string;
  /** A shell command to copy. Several commands are separated by newlines. */
  command?: string;
  /** Official documentation for this step. */
  link?: string;
}

/**
 * A provider-specific fix card. `estimated_minutes` is snake_case on purpose:
 * cards travel as API JSON, which is snake_case (DECISIONS 0019).
 */
export interface FixCard {
  /** `<code>.<provider>.<layer>`, for example `PORT_BLOCKED.oracle.cloud`. */
  key: FixKey;
  /** Sentence case, no trailing period, no exclamation mark. */
  title: string;
  steps: FixStep[];
  estimated_minutes: number;
}

/** Where the block lives: the provider's network firewall, or the server's own firewall. */
export type FixLayer = "cloud" | "os";

export const FIX_LAYERS = ["cloud", "os"] as const satisfies readonly FixLayer[];

/** Error codes that have fix cards. */
export type FixCode = "PORT_BLOCKED" | "MESH_UNREACHABLE";

export const FIX_CODES = ["PORT_BLOCKED", "MESH_UNREACHABLE"] as const satisfies readonly FixCode[];

export type FixKey = `${FixCode}.${ServerProvider}.${FixLayer}`;

/** Values a card interpolates. Everything is optional; cards always render. */
export interface FixOptions {
  /** TCP ports that failed the check. Defaults to 80 and 443. Used by `PORT_BLOCKED`. */
  ports?: readonly number[];
  /** Public IPs of the other servers in the mesh. Used by `MESH_UNREACHABLE`. */
  peerIps?: readonly string[];
}
