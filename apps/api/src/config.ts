import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * Temporary instance-admin bearer token guarding the server routes until
   * Phase 04 replaces it with sessions and RBAC. Unset means every guarded
   * route answers 401.
   */
  LUMEN_ADMIN_TOKEN: z.string().min(32).optional(),
  /** The URL servers and browsers use to reach this control plane (join commands, downloads). */
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** Base64 Ed25519 seed signing control plane → agent envelopes. Required in production. */
  AGENT_SIGNING_KEY: z.string().optional(),
  /** Where development keys live when AGENT_SIGNING_KEY is unset. */
  STATE_DIR: z.string().default(".lumen"),
  /** Directory of agent releases: <version>/lumen-agent-linux-<arch>{,.sha256,.minisig}. */
  AGENT_RELEASE_DIR: z.string().optional(),
  /** The minisign public key (base64 line) releases are signed with; embedded in the installer. */
  AGENT_RELEASE_PUBKEY: z.string().optional(),
  /** Version the installer downloads and updates default to. */
  AGENT_LATEST_VERSION: z.string().optional(),
  /** Serve HTTPS directly (the self-host install puts Caddy in front instead). */
  TLS_CERT_FILE: z.string().optional(),
  TLS_KEY_FILE: z.string().optional(),
  /** Trust X-Forwarded-For for client addresses (only behind a proxy you control). */
  TRUST_PROXY: booleanish,
  /** This control plane's public IP, for the single-VM hairpin case in port checks. */
  CONTROL_PLANE_PUBLIC_IP: z.string().optional(),
  /** Platform Caddy image pinned by digest, sent to agents in AgentConfig. */
  CADDY_IMAGE: z
    .string()
    .default(
      "caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b",
    ),
  /** Join attempts allowed per client address per minute (PHASE-02 §5: 10). */
  AGENT_JOIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  /** Identifies this API process in the socket-ownership registry. */
  GATEWAY_NODE_ID: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

/** Thrown when required environment variables are missing or malformed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Parses the environment and fails fast with a readable list of problems. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) {
    const config = parsed.data;
    if (config.NODE_ENV === "production" && config.AGENT_SIGNING_KEY === undefined) {
      throw new ConfigError(
        "Missing or invalid environment variables:\n - AGENT_SIGNING_KEY: required in production\nCopy .env.example to .env and fill in the values.",
      );
    }
    if ((config.TLS_CERT_FILE === undefined) !== (config.TLS_KEY_FILE === undefined)) {
      throw new ConfigError(
        "Missing or invalid environment variables:\n - TLS_CERT_FILE / TLS_KEY_FILE: set both or neither\nCopy .env.example to .env and fill in the values.",
      );
    }
    return config;
  }
  const lines = parsed.error.issues.map((issue) => ` - ${issue.path.join(".")}: ${issue.message}`);
  throw new ConfigError(
    `Missing or invalid environment variables:\n${lines.join("\n")}\nCopy .env.example to .env and fill in the values.`,
  );
}

/**
 * Loads the repository's .env in development. Production deployments set real
 * environment variables and never rely on a file being present.
 */
export function loadDotEnv(): void {
  if (process.env["NODE_ENV"] === "production") {
    return;
  }
  for (const candidate of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      // Try the next location; a missing .env is fine when variables are exported.
    }
  }
}

/** Hides the password in a connection string so it can appear in a log line. */
export function redactConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password !== "") {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "<invalid url>";
  }
}
