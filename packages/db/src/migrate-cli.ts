// Entry for `pnpm db:migrate`. Reads DATABASE_URL (from the environment or the
// repository's .env) and applies pending migrations.
import { runMigrations } from "./migrate.js";

for (const candidate of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch {
    // Try the next location; a missing .env is fine when DATABASE_URL is set.
  }
}

const url = process.env["DATABASE_URL"];
if (url === undefined) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env or export it.");
  process.exit(1);
}

const { applied } = await runMigrations(url);
console.log(`${String(applied)} migration${applied === 1 ? "" : "s"} applied`);
