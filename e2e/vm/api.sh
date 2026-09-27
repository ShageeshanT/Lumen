#!/usr/bin/env bash
# Calls the test control plane's API as the instance admin.
# Usage: api.sh <env-dir> <METHOD> <path> [json-body]
set -euo pipefail

ENV_DIR="${1:?env dir}"
METHOD="${2:?method}"
URL_PATH="${3:?path}"
BODY="${4:-}"
TOKEN="$(tr -d '\r\n' < "$ENV_DIR/admin.token")"
REVOKE=""
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) REVOKE="--ssl-no-revoke" ;; esac

args=(-sS $REVOKE --cacert "$ENV_DIR/certs/ca.pem" --resolve lumen-p2-cp:4204:127.0.0.1
  -X "$METHOD" -H "authorization: Bearer $TOKEN" -w '\nHTTP %{http_code} in %{time_total}s\n')
if [ -n "$BODY" ]; then
  args+=(-H 'content-type: application/json' -d "$BODY")
fi
curl "${args[@]}" "https://lumen-p2-cp:4204$URL_PATH"
