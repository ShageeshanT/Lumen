import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Phase 11 packages the standalone output into the self-host image.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  typedRoutes: true,
  // Workspace packages are TypeScript source and compiled by Next.
  transpilePackages: ["@lumen/shared", "@lumen/ui"],
  // Next would otherwise write AGENTS.md and CLAUDE.md into apps/web; the
  // repository root already carries the project context.
  agentRules: false,
  // Keep screenshots and the gallery free of the framework's floating dev badge.
  devIndicators: false,
};

export default config;
