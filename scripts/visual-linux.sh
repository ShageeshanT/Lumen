#!/usr/bin/env bash
# Generates or checks the Linux screenshot baselines inside the same Playwright
# image CI uses, so they match CI's font rasterisation exactly.
#
#   bash scripts/visual-linux.sh            # compare against committed linux baselines
#   bash scripts/visual-linux.sh --update   # write missing/changed linux baselines
#
# The working tree (tracked + untracked, minus ignored files) is copied into the
# container, so node_modules and Windows build output never cross over. Only
# *-linux.png files come back out. Downloads are cached in the
# lumen-visual-pnpm-store volume, so only the first run fetches packages.
set -euo pipefail

cd "$(dirname "$0")/.."
PLAYWRIGHT_VERSION="$(node -p "require('./e2e/node_modules/@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"
UPDATE_FLAG=""
if [[ "${1:-}" == "--update" ]]; then
  UPDATE_FLAG="--update-snapshots=changed"
fi
SPECS="${SPECS:-tests/gallery.spec.ts}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

echo "Using $IMAGE; specs: $SPECS"
git ls-files -co --exclude-standard -z |
  tar --null -T - -cf - |
  docker run --rm -i \
    -e CI=1 -e E2E_WEB_ONLY=1 -e NEXT_TELEMETRY_DISABLED=1 \
    -e UPDATE_FLAG="$UPDATE_FLAG" -e SPECS="$SPECS" \
    "$IMAGE" bash -c '
      set -euo pipefail
      mkdir -p /work && cd /work && tar -xf - 1>&2
      corepack enable 1>&2
      # Registry access from Docker Desktop can be flaky; the store volume keeps
      # finished downloads, so each retry picks up where the last one stopped.
      for attempt in 1 2 3 4 5; do
        pnpm install --frozen-lockfile --filter e2e --filter @lumen/web... 1>&2 && break
        [[ $attempt == 5 ]] && exit 1
        echo "pnpm install failed (attempt $attempt), retrying" 1>&2
      done
      cd e2e
      status=0
      npx playwright test $SPECS $UPDATE_FLAG --reporter=line 1>&2 || status=$?
      cd /work && find e2e/__screenshots__ -name "*-linux.png" -print0 | tar --null -T - -cf - 2>/dev/null
      exit $status
    ' >"$OUT/linux.tar" || status=$?

if [[ -s "$OUT/linux.tar" ]]; then
  tar -xf "$OUT/linux.tar"
  echo "Linux baselines: $(find e2e/__screenshots__ -name '*-linux.png' | wc -l | tr -d ' ') files"
fi
exit "${status:-0}"
