import { catalog } from "./catalog";
import {
  LUMEN_ERROR_CODES,
  type ErrorContext,
  type LumenError,
  type LumenErrorCode,
} from "./types";

export { catalog } from "./catalog";
export * from "./types";

/** Builds a user-facing error from the catalog. */
export function makeError(code: LumenErrorCode, ctx: ErrorContext = {}): LumenError {
  const entry = catalog[code](ctx);
  const error: LumenError = { code, ...entry };
  if (ctx.raw !== undefined) {
    error.raw = ctx.raw;
  }
  if (ctx.supportId !== undefined) {
    error.supportId = ctx.supportId;
  }
  return error;
}

/** Type guard for values that already carry a catalog error. */
export function isLumenError(value: unknown): value is LumenError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["code"] === "string" &&
    (LUMEN_ERROR_CODES as readonly string[]).includes(candidate["code"]) &&
    typeof candidate["title"] === "string" &&
    typeof candidate["explanation"] === "string" &&
    typeof candidate["fix"] === "string" &&
    typeof candidate["action"] === "object" &&
    candidate["action"] !== null
  );
}

/** HTTP status the API uses for each code. */
export const ERROR_STATUS: Record<LumenErrorCode, number> = {
  PORT_BLOCKED: 409,
  AGENT_OFFLINE: 503,
  DISK_FULL: 507,
  OOM_KILLED: 409,
  CRASH_LOOP: 409,
  HEALTHCHECK_TIMEOUT: 409,
  NO_START_COMMAND: 422,
  BUILD_LOCKFILE_MISSING: 422,
  BUILD_FAILED_GENERIC: 409,
  PRE_DEPLOY_FAILED: 409,
  VARIABLE_REF_MISSING: 422,
  VARIABLE_REF_CYCLE: 422,
  DNS_NOT_POINTED: 409,
  TLS_FAILED: 409,
  IMAGE_PULL_AUTH: 422,
  GITHUB_ACCESS_REVOKED: 409,
  SERVER_CAPACITY: 409,
  VOLUME_FULL: 409,
  BACKUP_FAILED: 409,
  MESH_UNREACHABLE: 409,
  CLOCK_SKEW: 409,
  AGENT_TIMEOUT: 504,
  JOIN_TOKEN_INVALID: 401,
  SIGNATURE_INVALID: 401,
  UPDATE_VERIFY_FAILED: 422,
  UPDATE_ROLLED_BACK: 409,
  PROTOCOL_UNSUPPORTED: 426,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Thrown by API code; the error middleware turns it into `{ error: LumenError }` with the right status. */
export class LumenHttpError extends Error {
  readonly status: number;
  readonly error: LumenError;

  constructor(code: LumenErrorCode, ctx: ErrorContext = {}, status?: number) {
    const error = makeError(code, ctx);
    super(error.title);
    this.name = "LumenHttpError";
    this.status = status ?? ERROR_STATUS[code];
    this.error = error;
  }
}
