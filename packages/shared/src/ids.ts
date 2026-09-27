import { monotonicFactory } from "ulid";

/**
 * Every row id in Lumen is `<prefix>_<ulid>`. The prefix makes ids readable in
 * logs and URLs and lets the API reject an id of the wrong kind early.
 */
export const ID_PREFIXES = [
  "usr", // user
  "ws", // workspace
  "srv", // server
  "prj", // project
  "env", // environment
  "svc", // service
  "dep", // deployment
  "var", // variable
  "vol", // volume
  "dom", // domain
  "tpl", // template
  "tok", // API token
  "jtk", // server join token
  "ntf", // in-app notification
  "aud", // audit log entry
  "req", // request (tracing only, never stored)
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

const ULID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;

// Monotonic within a process: ids generated in the same millisecond still sort
// in creation order.
const nextUlid = monotonicFactory();

/** Generates a new prefixed, lowercase, monotonic ULID such as `prj_01j8x9k2d3m4n5p6q7r8s9t0v1`. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nextUlid().toLowerCase()}`;
}

/** Splits an id into its prefix and ULID, or returns `null` when it is not a Lumen id. */
export function parseId(id: string): { prefix: IdPrefix; ulid: string } | null {
  const separator = id.indexOf("_");
  if (separator <= 0) {
    return null;
  }
  const prefix = id.slice(0, separator);
  const ulid = id.slice(separator + 1);
  if (!isIdPrefix(prefix) || !ULID_PATTERN.test(ulid)) {
    return null;
  }
  return { prefix, ulid };
}

/** True when `id` is a well-formed Lumen id with the given prefix. */
export function isId(id: string, prefix: IdPrefix): boolean {
  return parseId(id)?.prefix === prefix;
}

function isIdPrefix(value: string): value is IdPrefix {
  return (ID_PREFIXES as readonly string[]).includes(value);
}
