#!/usr/bin/env bash
# Builds signed agent releases for the Phase 02 host verification:
#   <out>/keys/release.{key,pub}          test release key (generated once)
#   <out>/releases/<v>/lumen-agent-linux-<arch>{,.sha256,.minisig}
# Versions: 0.2.0 and 0.2.1 are real agents; 0.2.2 is a broken build that
# exits immediately (internal/update/testdata/badagent) for the rollback test.
# Usage: e2e/vm/build-releases.sh <out-dir> [arches]
set -euo pipefail

OUT="${1:?usage: build-releases.sh <out-dir> [arches]}"
ARCHES="${2:-amd64 arm64}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT/keys" "$OUT/releases"

if [ ! -f "$OUT/keys/release.key" ]; then
  (cd "$ROOT/apps/agent" && go run ./cmd/lumen-release keygen -dir "$OUT/keys")
fi
PUBKEY="$(tail -n 1 "$OUT/keys/release.pub")"
echo "release key: $PUBKEY"

for v in 0.2.0 0.2.1; do
  LUMEN_VERSION="$v" LUMEN_RELEASE_PUBKEY="$PUBKEY" GOARCH_LIST="$ARCHES" bash "$ROOT/scripts/build-go.sh" >/dev/null
  mkdir -p "$OUT/releases/$v"
  for a in $ARCHES; do
    cp "$ROOT/apps/agent/bin/lumen-agent-linux-$a" "$OUT/releases/$v/"
  done
done

mkdir -p "$OUT/releases/0.2.2"
for a in $ARCHES; do
  (cd "$ROOT/apps/agent" && CGO_ENABLED=0 GOOS=linux GOARCH="$a" go build -trimpath \
    -o "$OUT/releases/0.2.2/lumen-agent-linux-$a" ./internal/update/testdata/badagent)
done

for v in 0.2.0 0.2.1 0.2.2; do
  for a in $ARCHES; do
    (cd "$ROOT/apps/agent" && go run ./cmd/lumen-release sign -key "$OUT/keys/release.key" "$OUT/releases/$v/lumen-agent-linux-$a")
  done
done
ls -la "$OUT"/releases/*
