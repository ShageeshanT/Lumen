#!/usr/bin/env bash
# Measures the agent's CPU share and memory on a host over a window:
# utime+stime from /proc/<pid>/stat before and after, the cgroup's
# MemoryCurrent, RSS, and the goroutine count the agent reports in its
# host samples (via the API). Usage: measure-agent.sh <env-dir> <host> <server-id> [seconds]
set -euo pipefail

ENV_DIR="${1:?env dir}"
HOST="${2:?host}"
SERVER="${3:?server id}"
WINDOW="${4:-300}"
HERE="$(cd "$(dirname "$0")" && pwd)"

snapshot() {
  docker exec "$HOST" sh -c '
    pid=$(systemctl show -p MainPID --value lumen-agent)
    set -- $(cut -d" " -f14,15,22 /proc/$pid/stat)
    echo "pid=$pid ticks=$(( $1 + $2 )) starttime=$3 hz=$(getconf CLK_TCK) uptime=$(cut -d" " -f1 /proc/uptime) nproc=$(nproc)"
    echo "rss_kb=$(grep VmRSS /proc/$pid/status | tr -s " " | cut -d" " -f2) $(systemctl show -p MemoryCurrent lumen-agent)"'
}
goroutines() {
  bash "$HERE/api.sh" "$ENV_DIR" GET "/v1/servers/$SERVER" | sed '/^HTTP /d' |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s).last_host_sample;console.log('goroutines='+(x?.agent?.goroutines)+' agent_rss='+(x?.agent?.rss_bytes)+' queue='+(x?.agent?.send_queue_len)+' reconnects='+(x?.agent?.reconnects_total)+' sample_ts='+x?.ts)})"
}

echo "# $(date -u +%FT%TZ) start"
a=$(snapshot)
echo "$a"
goroutines
sleep "$WINDOW"
echo "# $(date -u +%FT%TZ) after ${WINDOW}s"
b=$(snapshot)
echo "$b"
goroutines
ta=$(echo "$a" | sed -n 's/.*ticks=\([0-9]*\).*/\1/p')
tb=$(echo "$b" | sed -n 's/.*ticks=\([0-9]*\).*/\1/p')
hz=$(echo "$b" | sed -n 's/.*hz=\([0-9]*\).*/\1/p')
awk -v a="$ta" -v b="$tb" -v hz="$hz" -v w="$WINDOW" 'BEGIN { printf "agent CPU over the window: %.2f s = %.3f %% of one core\n", (b - a) / hz, (b - a) / hz / w * 100 }'
