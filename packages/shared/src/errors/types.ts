/**
 * Error codes from SPEC J6 (the user-facing catalog) plus the infrastructure
 * codes the API needs from day one. Every user-facing failure in Lumen maps to
 * one of these; raw errors never reach the UI.
 */
export const LUMEN_ERROR_CODES = [
  // SPEC J6
  "PORT_BLOCKED",
  "AGENT_OFFLINE",
  "DISK_FULL",
  "OOM_KILLED",
  "CRASH_LOOP",
  "HEALTHCHECK_TIMEOUT",
  "NO_START_COMMAND",
  "BUILD_LOCKFILE_MISSING",
  "BUILD_FAILED_GENERIC",
  "PRE_DEPLOY_FAILED",
  "VARIABLE_REF_MISSING",
  "VARIABLE_REF_CYCLE",
  "DNS_NOT_POINTED",
  "TLS_FAILED",
  "IMAGE_PULL_AUTH",
  "GITHUB_ACCESS_REVOKED",
  "SERVER_CAPACITY",
  "VOLUME_FULL",
  "BACKUP_FAILED",
  "MESH_UNREACHABLE",
  // Agent and servers (PHASE-02)
  "CLOCK_SKEW",
  "AGENT_TIMEOUT",
  "JOIN_TOKEN_INVALID",
  "SIGNATURE_INVALID",
  "UPDATE_VERIFY_FAILED",
  "UPDATE_ROLLED_BACK",
  // Infrastructure
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHENTICATED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type LumenErrorCode = (typeof LUMEN_ERROR_CODES)[number];

/** Identifiers the dashboard maps to concrete handlers (open a panel, stage a change, and so on). */
export type ErrorActionId =
  | "open_fix_card"
  | "open_troubleshooting"
  | "clean_up_disk"
  | "increase_memory"
  | "jump_to_logs"
  | "set_healthcheck"
  | "set_start_command"
  | "view_logs"
  | "jump_to_variable"
  | "show_cycle"
  | "recheck_dns"
  | "recheck_tls"
  | "add_registry_credentials"
  | "reconnect_github"
  | "open_placement"
  | "increase_volume_limit"
  | "test_backup_destination"
  | "retry"
  | "sign_in"
  | "create_join_token";

export type ErrorAction =
  | { kind: "none" }
  | { kind: "link"; label: string; href: string }
  | { kind: "button"; label: string; actionId: ErrorActionId }
  | { kind: "command"; label: string; command: string };

/** The shape every error card, API error body and CLI error message is built from. */
export interface LumenError {
  code: LumenErrorCode;
  /** Plain-language title in the SPEC C9 voice. Never ends with a period. */
  title: string;
  /** What happened and why, in at most 200 characters. */
  explanation: string;
  /** What the user can do about it. */
  fix: string;
  action: ErrorAction;
  /** Raw details for "Show raw error"; never a stack trace. */
  raw?: string;
  /** Correlates the user's report with server logs. */
  supportId?: string;
}

/** Values the catalog interpolates into titles and explanations. All optional. */
export interface ErrorContext {
  port?: number;
  serverName?: string;
  memoryMb?: number;
  suggestedMemoryMb?: number;
  hostname?: string;
  variableKey?: string;
  cycle?: readonly string[];
  image?: string;
  repo?: string;
  volumeName?: string;
  freeDiskGb?: number;
  /** How far the server clock is off, in minutes (CLOCK_SKEW). */
  skewMinutes?: number;
  /** Agent version involved in an update (UPDATE_*). */
  version?: string;
  resource?: string;
  roleNeeded?: string;
  retryAfterS?: number;
  detail?: string;
  supportId?: string;
  raw?: string;
}
