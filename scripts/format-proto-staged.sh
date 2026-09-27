#!/usr/bin/env bash
# lint-staged hook for .proto files. `buf format -w` accepts one source at a
# time, so each staged file is formatted separately. Exits 0 when buf is not
# installed so contributors without it can still commit (CI checks formatting).
set -euo pipefail

if ! command -v buf >/dev/null 2>&1; then
  exit 0
fi

for f in "$@"; do
  buf format -w "$f"
done
