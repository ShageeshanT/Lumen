#!/usr/bin/env bash
# Runs the one-line join command inside a host container and records a
# timestamped transcript (the evidence PHASE-02 §8 asks for).
# Usage: run-install.sh <container> <join-command> <transcript-file> [extra installer args]
# The command is the `command` field of POST /v1/servers/join-tokens. The test
# control plane uses a private CA, so --cacert/--ca-file are added.
set -euo pipefail

HOST="${1:?container}"
CMD="${2:?join command}"
OUT="${3:?transcript file}"
EXTRA="${4:-}"
CA=/root/lumen-test-ca.pem

# curl -fsSL URL | sudo sh -s -- ARGS  →  add the CA to both halves.
CMD="${CMD/curl -fsSL /curl -fsSL --cacert $CA }"
CMD="$CMD --ca-file $CA $EXTRA"

{
  echo "# host: $HOST ($(docker exec "$HOST" sh -c '. /etc/os-release; echo "$PRETTY_NAME $(uname -m)"'))"
  echo "# command: $CMD" | sed -E 's/--token [A-Za-z0-9_-]+/--token <redacted>/'
  echo "# started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT"
start=$(date +%s)
set +e
docker exec "$HOST" bash -c "$CMD" 2>&1 | while IFS= read -r line; do
  printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$line"
done | sed -E 's/--token [A-Za-z0-9_-]+/--token <redacted>/g' | tee -a "$OUT"
status=${PIPESTATUS[0]}
set -e
end=$(date +%s)
{
  echo "# finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# exit status: $status"
  echo "# paste-to-online: $((end - start)) s"
} | tee -a "$OUT"
exit "$status"
