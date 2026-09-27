#!/bin/sh
# Lumen agent uninstaller.
#
#   curl -fsSL https://<control-plane>/install/agent-uninstall.sh | sudo sh -s -- --yes
#
# Stops and removes the lumen-agent service, the platform proxy container, the
# agent binaries and /etc/lumen. /var/lib/lumen (the agent's identity and
# credential) is removed too unless --keep-data is given. Your apps' containers,
# Docker itself and firewall rules are left alone. Safe to run more than once.
#
# Exit codes: 0 removed (or nothing to remove) · 1 a step failed ·
#             2 not confirmed or bad flag.
#
# Testing: LUMEN_ROOT prefixes every path the script touches; external commands
# (systemctl, docker, id) are called by name so tests can shim them via PATH.

umask 077
set -u
LC_ALL=C
export LC_ALL

ROOT="${LUMEN_ROOT:-}"
ROOT="${ROOT%/}"
BIN_DIR="$ROOT/usr/local/bin"
UNIT_FILE="$ROOT/etc/systemd/system/lumen-agent.service"
ETC_DIR="$ROOT/etc/lumen"
LIB_DIR="$ROOT/var/lib/lumen"
LOG_PATH="$ROOT/var/log/lumen-agent-install.log"
LOG_FILE=/dev/null

YES=0
KEEP_DATA=0
CHANGED=0

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE" 2>/dev/null || :
}

ok() {
  printf '  ✔ %s\n' "$1"
  log "uninstall: $1"
}

die() {
  die_code=$1
  shift
  printf '  ✘ %s\n' "$1" >&2
  log "uninstall error: $1"
  shift
  for die_line in "$@"; do
    printf '    %s\n' "$die_line" >&2
  done
  exit "$die_code"
}

run_cmd() {
  log "\$ $*"
  "$@" >>"$LOG_FILE" 2>&1
}

usage() {
  cat <<'EOF'
Remove the Lumen agent from this server.

Usage:
  sudo sh agent-uninstall.sh [--yes] [--keep-data]

Options:
  --yes         Don't ask for confirmation.
  --keep-data   Keep /var/lib/lumen (the agent identity), so the server can
                rejoin without a new join command after a reinstall.
  -h, --help    Show this help.

Your apps' containers, Docker and firewall rules are not touched.
EOF
}

while [ $# -gt 0 ]; do
  case $1 in
    --yes | -y) YES=1 ;;
    --keep-data) KEEP_DATA=1 ;;
    -h | --help) usage; exit 0 ;;
    *) die 2 "Unknown option: $1" "Run with --help to see every option." ;;
  esac
  shift
done

if [ "$(id -u)" != "0" ]; then
  die 1 "The uninstaller needs root." "Run it again with sudo."
fi

(umask 022 && mkdir -p "${LOG_PATH%/*}") 2>/dev/null
if : >>"$LOG_PATH" 2>/dev/null; then
  LOG_FILE=$LOG_PATH
fi
log "---- Lumen agent uninstaller started (keep-data=$KEEP_DATA)"

if [ "$YES" != 1 ]; then
  if [ "$KEEP_DATA" = 1 ]; then
    question="Remove the Lumen agent from this server (keeping /var/lib/lumen)? [y/N] "
  else
    question="Remove the Lumen agent and its data from this server? [y/N] "
  fi
  answer=""
  # stdin is usually the piped script, so ask on the terminal. Probe it in a
  # subshell first: a failed redirection must not end this shell.
  if (: </dev/tty) 2>/dev/null; then
    printf '%s' "$question"
    read -r answer </dev/tty || answer=""
  else
    die 2 "There's no terminal to confirm on." "Run the command again with --yes to remove the agent."
  fi
  case $answer in
    y | Y | yes | YES | Yes) ;;
    *) printf '  Nothing was removed.\n'; exit 2 ;;
  esac
fi

# 1. Service.
if [ -f "$UNIT_FILE" ] || systemctl is-enabled --quiet lumen-agent 2>/dev/null || systemctl is-active --quiet lumen-agent 2>/dev/null; then
  run_cmd systemctl disable --now lumen-agent || log "systemctl disable --now lumen-agent failed; continuing"
  if [ -f "$UNIT_FILE" ]; then
    rm -f "$UNIT_FILE" || die 1 "Couldn't remove $UNIT_FILE." "Remove it yourself with: sudo rm $UNIT_FILE"
  fi
  run_cmd systemctl daemon-reload || log "systemctl daemon-reload failed; continuing"
  ok "Stopped and removed the lumen-agent service"
  CHANGED=1
fi

# 2. Platform proxy container.
if command -v docker >/dev/null 2>&1; then
  proxy_ids=$(docker ps -aq --filter label=lumen.role=proxy 2>/dev/null)
  if [ -n "$proxy_ids" ]; then
    # shellcheck disable=SC2086 # one container id per word.
    run_cmd docker rm -f $proxy_ids || die 1 "Couldn't remove the Lumen proxy container." "Remove it yourself with: sudo docker rm -f \$(sudo docker ps -aq --filter label=lumen.role=proxy)"
    ok "Removed the Lumen proxy container"
    CHANGED=1
  fi
fi

# 3. Binaries.
for bin in lumen-agent lumen-agent.prev lumen-agent.new; do
  if [ -e "$BIN_DIR/$bin" ]; then
    rm -f "$BIN_DIR/$bin" || die 1 "Couldn't remove /usr/local/bin/$bin." "Remove it yourself with: sudo rm /usr/local/bin/$bin"
    log "removed /usr/local/bin/$bin"
    removed_bin=1
  fi
done
if [ "${removed_bin:-0}" = 1 ]; then
  ok "Removed the agent binaries"
  CHANGED=1
fi

# 4. Settings.
if [ -e "$ETC_DIR" ]; then
  rm -rf "$ETC_DIR" || die 1 "Couldn't remove /etc/lumen." "Remove it yourself with: sudo rm -rf /etc/lumen"
  ok "Removed /etc/lumen"
  CHANGED=1
fi

# 5. Data.
if [ "$KEEP_DATA" = 1 ]; then
  if [ -e "$LIB_DIR" ]; then
    ok "Kept /var/lib/lumen (--keep-data)"
  fi
elif [ -e "$LIB_DIR" ]; then
  rm -rf "$LIB_DIR" || die 1 "Couldn't remove /var/lib/lumen." "Remove it yourself with: sudo rm -rf /var/lib/lumen"
  ok "Removed /var/lib/lumen"
  CHANGED=1
fi

if [ "$CHANGED" = 0 ]; then
  ok "The Lumen agent isn't installed on this server (already done)"
else
  printf '\n  The Lumen agent is removed. Remove the server in Lumen too (Servers → the server → Remove).\n'
  log "uninstall finished"
fi
