#!/usr/bin/env bash
# Phase 02 host-verification scenarios against the lumen-p2 test environment
# (start-control-plane.sh + start-host.sh + run-install.sh). Each scenario
# prints a timestamped transcript to stdout; redirect it into
# docs/evidence/phase-02/.
#
# Usage: scenarios.sh <env-dir> <scenario> <host-container> <server-id> [args]
#   portblock  – remove the 443 ACCEPT rule (Oracle-style REJECT applies), port-check,
#                restore it, port-check again
#   offline    – cut the host off the network, watch offline via API + /v1/ws, restore
#   diskfull   – fallocate until <dir> (default /var/lib/lumen) has < 2 GB free, watch
#                disk_low and the DISK_FULL notification, clean up (args: dir)
#   update     – POST agent-update to <version> and watch the result (args: version)
#   caddy      – remove the proxy container by hand and watch it come back
#   audit      – ss -tlnp, MemoryCurrent, agent RSS, binary size
set -euo pipefail

ENV_DIR="${1:?env dir}"
SCENARIO="${2:?scenario}"
HOST="${3:?host container}"
SERVER="${4:?server id}"
shift 4
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE_ENV_DIR="$ENV_DIR"
if command -v cygpath >/dev/null 2>&1; then
  NODE_ENV_DIR="$(cygpath -m "$ENV_DIR")"
fi

ts() { date -u +%H:%M:%S.%3N; }
say() { printf '%s  %s\n' "$(ts)" "$*"; }
api() { bash "$HERE/api.sh" "$ENV_DIR" "$@"; }
field() { # field <json-path-expression> reads the server and prints one value
  api GET "/v1/servers/$SERVER" | sed '/^HTTP /d' |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);console.log(JSON.stringify($1))})"
}

case "$SCENARIO" in
portblock)
  say "iptables INPUT on $HOST before:"
  docker exec "$HOST" iptables -S INPUT | sed 's/^/    /'
  say "removing the ACCEPT rule for 443 (the REJECT at the end now applies to it)"
  docker exec "$HOST" iptables -D INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
  say "POST /v1/servers/$SERVER/port-check (before opening 443)"
  api POST "/v1/servers/$SERVER/port-check" '{}'
  echo
  say "checklist and issues:"
  field "{checklist:x.checklist,issues:x.issues}"
  say "re-adding the ACCEPT rule for 443 before the REJECT (the fix card's OS step)"
  pos=$(docker exec "$HOST" iptables -S INPUT | grep -n -- '-j REJECT' | head -n1 | cut -d: -f1)
  docker exec "$HOST" iptables -I INPUT $((pos - 1)) -m state --state NEW -p tcp --dport 443 -j ACCEPT
  say "POST /v1/servers/$SERVER/port-check (after opening 443)"
  api POST "/v1/servers/$SERVER/port-check" '{}'
  echo
  say "checklist:"
  field "x.checklist"
  ;;
offline)
  NODE_EXTRA_CA_CERTS="$NODE_ENV_DIR/certs/ca.pem" node "$HERE/watch-ws.mjs" "$NODE_ENV_DIR" "server:$SERVER" 150 >"$ENV_DIR/ws-$SERVER.log" 2>&1 &
  watcher=$!
  sleep 2
  say "status: $(field x.status)"
  say "disconnecting $HOST from the network (docker network disconnect lumen-p2)"
  docker network disconnect lumen-p2 "$HOST"
  cut=$(date +%s)
  while :; do
    s=$(field x.status)
    if [ "$s" = '"offline"' ]; then
      say "status: $s after $(($(date +%s) - cut)) s without network"
      break
    fi
    sleep 1
  done
  say "notifications row and issues:"
  field "x.issues"
  say "reconnecting $HOST"
  docker network connect lumen-p2 "$HOST"
  back=$(date +%s)
  while :; do
    s=$(field x.status)
    if [ "$s" = '"online"' ]; then
      say "status: $s $(($(date +%s) - back)) s after the network came back"
      break
    fi
    sleep 1
  done
  sleep 3
  kill "$watcher" 2>/dev/null || true
  say "/v1/ws events received (latency = receive time - event 'at'):"
  sed 's/^/    /' "$ENV_DIR/ws-$SERVER.log"
  ;;
diskfull)
  dir="${1:-/var/lib/lumen}"
  say "free space before:"
  docker exec "$HOST" df -h "$dir" | sed 's/^/    /'
  avail=$(docker exec "$HOST" df --output=avail -B1 "$dir" | tail -n1 | tr -d ' ')
  fill=$((avail - 1536 * 1024 * 1024))
  say "fallocate $((fill / 1024 / 1024 / 1024)) GB into $dir/lumen-fill (leaves ~1.5 GB free)"
  docker exec "$HOST" fallocate -l "$fill" "$dir/lumen-fill"
  start=$(date +%s)
  while :; do
    low=$(field x.disk_low)
    if [ "$low" = true ]; then
      say "disk_low = true after $(($(date +%s) - start)) s"
      break
    fi
    sleep 1
  done
  field "x.issues"
  say "removing the file"
  docker exec "$HOST" rm -f "$dir/lumen-fill"
  start=$(date +%s)
  while [ "$(field x.disk_low)" != false ]; do sleep 1; done
  say "disk_low = false after $(($(date +%s) - start)) s"
  ;;
update)
  version="${1:?version}"
  say "agent before: $(field x.agent_version); $(docker exec "$HOST" lumen-agent version)"
  say "proxy container before: $(docker exec "$HOST" docker inspect -f '{{.Id}} started {{.State.StartedAt}}' lumen-caddy | cut -c1-80)"
  say "POST /v1/servers/$SERVER/agent-update {\"version\":\"$version\"}"
  api POST "/v1/servers/$SERVER/agent-update" "{\"version\":\"$version\"}"
  echo
  op=""
  for _ in $(seq 1 180); do
    st=$(field "x.agent_update")
    if printf '%s' "$st" | grep -q '"status":"succeeded"\|"status":"failed"'; then
      say "agent_update: $st"
      break
    fi
    sleep 1
  done
  sleep 3
  say "agent after: $(field x.agent_version); $(docker exec "$HOST" lumen-agent version)"
  say "binaries on the host:"
  docker exec "$HOST" sh -c 'ls -l /usr/local/bin/lumen-agent*' | sed 's/^/    /'
  say "proxy container after: $(docker exec "$HOST" docker inspect -f '{{.Id}} started {{.State.StartedAt}}' lumen-caddy | cut -c1-80)"
  say "agent log (update lines):"
  docker exec "$HOST" journalctl -u lumen-agent -o cat --no-pager --since "-4min" | grep -E 'updat|roll|trial|healthy|started|new agent' | cut -c1-240 | sed 's/^/    /'
  ;;
caddy)
  say "removing the proxy container by hand: docker rm -f lumen-caddy"
  docker exec "$HOST" docker rm -f lumen-caddy >/dev/null
  start=$(date +%s)
  while ! docker exec "$HOST" docker inspect -f '{{.State.Running}}' lumen-caddy 2>/dev/null | grep -q true; do sleep 1; done
  say "lumen-caddy is running again after $(($(date +%s) - start)) s"
  docker exec "$HOST" curl -sI http://127.0.0.1/ | head -n 3 | sed 's/^/    /'
  ;;
audit)
  say "ss -tlnp on $HOST"
  docker exec "$HOST" ss -tlnp | sed 's/^/    /'
  say "systemctl show -p MemoryCurrent lumen-agent"
  docker exec "$HOST" systemctl show -p MemoryCurrent -p MemoryPeak lumen-agent | sed 's/^/    /'
  say "agent RSS (ps)"
  docker exec "$HOST" ps -o pid,rss,etime,cmd -C lumen-agent | sed 's/^/    /'
  say "binary"
  docker exec "$HOST" sh -c 'ls -l /usr/local/bin/lumen-agent; lumen-agent version; file /usr/local/bin/lumen-agent 2>/dev/null || true' | sed 's/^/    /'
  say "proxy container hardening"
  docker exec "$HOST" docker inspect -f 'image={{.Config.Image}} network={{.HostConfig.NetworkMode}} readonly={{.HostConfig.ReadonlyRootfs}} capdrop={{.HostConfig.CapDrop}} capadd={{.HostConfig.CapAdd}} pids={{.HostConfig.PidsLimit}} mem={{.HostConfig.Memory}} privileged={{.HostConfig.Privileged}} restart={{.HostConfig.RestartPolicy.Name}}' lumen-caddy | sed 's/^/    /'
  say "admin API from the host (loopback) and from the control plane (network)"
  docker exec "$HOST" sh -c 'curl -s -o /dev/null -w "    127.0.0.1:2019/config/ -> HTTP %{http_code}\n" http://127.0.0.1:2019/config/'
  ip=$(docker exec "$HOST" hostname -I | awk '{print $1}')
  docker exec lumen-p2-cp node -e "require('net').connect(2019,'$ip').on('connect',()=>{console.log('    $ip:2019 from the control plane -> CONNECTED (bad)');process.exit(0)}).on('error',e=>{console.log('    $ip:2019 from the control plane -> '+e.code);process.exit(0)})"
  docker exec lumen-p2-cp node -e "fetch('http://$ip/').then(async r=>{console.log('    http://$ip/ -> HTTP '+r.status+' '+(await r.text()).match(/<h1>(.*)<\/h1>/)[1])})"
  ;;
*)
  echo "unknown scenario $SCENARIO" >&2
  exit 2
  ;;
esac
