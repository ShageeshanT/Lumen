import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
    return parsed.data;
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
