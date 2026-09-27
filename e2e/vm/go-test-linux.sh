#!/usr/bin/env bash
# Cross-compiles the Go test binaries for linux/amd64 so they can run on a
# Linux host (a few tests only run there: /proc symlink ownership, trial runs
# with shell-script binaries). Usage: go-test-linux.sh <out-dir>
# Then on Linux: for each <pkg>.test, cd into the package directory and run it.
set -euo pipefail

OUT="${1:?out dir}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT"
: >"$OUT/manifest"
cd "$ROOT"
for pkg in $(go list ./apps/agent/... ./packages/protocol/...); do
  rel="${pkg#github.com/ShageeshanT/Lumen/}"
  name="$(echo "$rel" | tr '/' '_')"
  if GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go test -c -o "$OUT/$name.test" "./$rel" >/dev/null 2>&1 && [ -f "$OUT/$name.test" ]; then
    echo "$rel $name.test" >>"$OUT/manifest"
  fi
done
cat "$OUT/manifest"
