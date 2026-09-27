#!/usr/bin/env bash
# Bundles the control plane API into one self-contained ESM file so it can run
# in a plain Linux Node container during host verification (the workspace's
# node_modules are Windows-specific symlinks). Usage: bundle-api.sh <out-dir>
set -euo pipefail

OUT="${1:?usage: bundle-api.sh <out-dir>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT"
cd "$ROOT/apps/api"
LUMEN_BUNDLE_OUT="$OUT" node --input-type=module -e '
import { build } from "tsup";
await build({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: process.env.LUMEN_BUNDLE_OUT,
  clean: true,
  splitting: false,
  config: false,
  noExternal: [/.*/],
  external: ["pg-native"],
  banner: {
    js: "import { createRequire as __lumenCreateRequire } from \"node:module\"; const require = __lumenCreateRequire(import.meta.url);",
  },
});
'
cp "$ROOT/deploy/agent-install.sh" "$OUT/agent-install.sh"
ls -la "$OUT"
