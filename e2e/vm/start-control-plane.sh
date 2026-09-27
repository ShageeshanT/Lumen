#!/usr/bin/env bash
# Starts the bundled control plane (bundle-api.sh) in a Linux Node container on
# the `lumen-p2` Docker network, serving HTTPS on :4204 with the test CA's
# certificate for `lumen-p2-cp`. Hosts on the same network reach it at
# https://lumen-p2-cp:4204; the port is also published on the machine running
# Docker for API calls.
#
# Usage: start-control-plane.sh <env-dir> <database-url> [latest-version]
#   <env-dir> holds cp/ (bundle), certs/, releases/, keys/, signing.key, admin.token
set -euo pipefail

ENV_DIR="${1:?usage: start-control-plane.sh <env-dir> <database-url> [latest-version]}"
DB_URL="${2:?database url}"
LATEST="${3:-0.2.0}"
MOUNT="$ENV_DIR"
if command -v cygpath >/dev/null 2>&1; then
  MOUNT="$(cygpath -m "$ENV_DIR")"
fi

docker network inspect lumen-p2 >/dev/null 2>&1 || docker network create lumen-p2 >/dev/null
docker rm -f lumen-p2-cp >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name lumen-p2-cp --network lumen-p2 -p 4204:4204 \
  -v "$MOUNT:/p2" -w /p2 \
  -e DATABASE_URL="$DB_URL" \
  -e API_PORT=4204 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e LUMEN_ADMIN_TOKEN="$(tr -d '\r\n' < "$ENV_DIR/admin.token")" \
  -e AGENT_SIGNING_KEY="$(tr -d '\r\n' < "$ENV_DIR/signing.key")" \
  -e PUBLIC_URL=https://lumen-p2-cp:4204 \
  -e TLS_CERT_FILE=/p2/certs/cp.pem \
  -e TLS_KEY_FILE=/p2/certs/cp.key \
  -e AGENT_RELEASE_DIR=/p2/releases \
  -e AGENT_LATEST_VERSION="$LATEST" \
  -e AGENT_RELEASE_PUBKEY="$(tail -n 1 "$ENV_DIR/keys/release.pub" | tr -d '\r\n')" \
  -e AGENT_INSTALL_SCRIPT=/p2/cp/agent-install.sh \
  -e WEB_ORIGIN=http://localhost:3204 \
  node:24-bookworm-slim node cp/index.js >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS --cacert "$ENV_DIR/certs/ca.pem" --resolve lumen-p2-cp:4204:127.0.0.1 https://lumen-p2-cp:4204/v1/health >/dev/null 2>&1; then
    echo "control plane is up at https://lumen-p2-cp:4204"
    exit 0
  fi
  sleep 1
done
docker logs --tail 40 lumen-p2-cp
exit 1
