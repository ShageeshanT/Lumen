#!/usr/bin/env bash
# Builds the agent and CLI for linux/amd64 and linux/arm64 as static binaries.
# Usage: scripts/build-go.sh            (both architectures)
#        GOARCH_LIST=arm64 scripts/build-go.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${LUMEN_VERSION:-0.0.0-dev}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ARCHES="${GOARCH_LIST:-amd64 arm64}"

build() {
  local app="$1" bin="$2" module="$3"
  for arch in $ARCHES; do
    local out="apps/$app/bin/$bin-linux-$arch"
    echo "building $out"
    (
      cd "apps/$app"
      CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -trimpath \
        -ldflags "-s -w \
          -X $module/internal/version.Version=$VERSION \
          -X $module/internal/version.Commit=$COMMIT \
          -X $module/internal/version.BuildDate=$DATE" \
        -o "bin/$bin-linux-$arch" "./cmd/$bin"
    )
  done
}

build agent lumen-agent github.com/ShageeshanT/Lumen/apps/agent
build cli lumen github.com/ShageeshanT/Lumen/apps/cli

echo "done"
