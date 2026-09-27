#!/bin/sh
# Lumen agent installer.
#
# The control plane serves this script at /install/agent.sh. Run it as:
#   curl -fsSL https://<control-plane>/install/agent.sh \
#     | sudo sh -s -- --token <join-token> --control-plane https://<control-plane>
#
# Every step is a check-then-act function. Running the script again changes
# nothing and reports "already done" for each step. Everything is appended to
# /var/log/lumen-agent-install.log with timestamps; the terminal only shows
# short, friendly lines.
#
# Exit codes:
#   0  the server is online
#   1  a step failed (the message says what to do next)
#   2  preflight failed or input is missing (unsupported server, bad flag,
#      no join token)
#   3  the downloaded agent failed verification; nothing was installed
#   4  the join command expired or was already used
#   5  this server can't reach the control plane
#
# Testing hooks (all optional):
#   LUMEN_ROOT              prefix for every path the script writes or inspects
#                           (/usr/local/bin, /var/lib, /etc, /var/log, /run)
#   LUMEN_OS_RELEASE        path of the os-release file (default /etc/os-release)
#   LUMEN_MEMINFO           path of the meminfo file (default /proc/meminfo)
#   LUMEN_METADATA_URL      link-local metadata base URL
#   LUMEN_GCP_METADATA_URL  GCP metadata base URL
#   LUMEN_AGENT_VERSION     agent version override (same as --version)
#   LUMEN_RELEASE_PUBKEY    minisign release public key override
# External commands are invoked by name so tests can shim them through PATH.

umask 077
set -u
LC_ALL=C
export LC_ALL
DEBIAN_FRONTEND=noninteractive
export DEBIAN_FRONTEND

# ---------------------------------------------------------------------------
# Values the control plane substitutes when it serves this script.
# ---------------------------------------------------------------------------
CONTROL_PLANE_DEFAULT="__LUMEN_CONTROL_PLANE__"
AGENT_VERSION="${LUMEN_AGENT_VERSION:-__LUMEN_AGENT_VERSION__}"
RELEASE_PUBKEY="${LUMEN_RELEASE_PUBKEY:-__LUMEN_RELEASE_PUBKEY__}"

# ---------------------------------------------------------------------------
# Paths. ROOT is empty on a real server.
# ---------------------------------------------------------------------------
ROOT="${LUMEN_ROOT:-}"
ROOT="${ROOT%/}"
BIN_DIR="$ROOT/usr/local/bin"
AGENT_BIN="$BIN_DIR/lumen-agent"
LIB_DIR="$ROOT/var/lib/lumen"
STATE_DIR="$LIB_DIR/agent"
ETC_DIR="$ROOT/etc/lumen"
ENV_FILE="$ETC_DIR/agent.env"
CA_COPY="$ETC_DIR/ca.pem"
UNIT_FILE="$ROOT/etc/systemd/system/lumen-agent.service"
LOG_PATH="$ROOT/var/log/lumen-agent-install.log"
OS_RELEASE="${LUMEN_OS_RELEASE:-/etc/os-release}"
MEMINFO="${LUMEN_MEMINFO:-/proc/meminfo}"
MD_URL="${LUMEN_METADATA_URL:-http://169.254.169.254}"
GCP_MD_URL="${LUMEN_GCP_METADATA_URL:-http://metadata.google.internal}"

# On-server paths written into config files (never prefixed with ROOT).
HOST_CA_COPY="/etc/lumen/ca.pem"

# sudo's secure_path on RHEL-family systems leaves out /usr/local/bin, where
# the agent lives. Append (never prepend) so nothing on PATH is shadowed.
for dir in /usr/local/sbin /usr/local/bin; do
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) PATH="$PATH:$dir" ;;
  esac
done
export PATH

# ---------------------------------------------------------------------------
# State.
# ---------------------------------------------------------------------------
START_TIME=$(date +%s)
LOG_FILE=/dev/null
LOG_READY=0
TMP_DIR=""
STEP_NO=0
STEP_TOTAL=8

TOKEN=""
CONTROL_PLANE=""
CA_FILE=""
PUBLIC_IP=""
FORCE=0
SKIP_DOCKER_INSTALL=0
ORIG_ARGS=""

ARCH=""
PKG=""
OS_ID=""
OS_VERSION_ID=""
OS_ID_LIKE=""
OS_CODENAME=""
OS_PRETTY=""
DOCKER_STATE=""
DOCKER_VER=""
PROVIDER="other"
NEW_BINARY=""
BINARY_CHANGED=0
ENV_CHANGED=0
UNIT_CHANGED=0
ENV_CA=""
ENV_PUBLIC_IP=""
CP_HTTPS=1

# ---------------------------------------------------------------------------
# Output helpers.
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
  C_BOLD=$(printf '\033[1m')
  C_GREEN=$(printf '\033[32m')
  C_YELLOW=$(printf '\033[33m')
  C_RED=$(printf '\033[31m')
  C_RESET=$(printf '\033[0m')
else
  C_BOLD=""
  C_GREEN=""
  C_YELLOW=""
  C_RED=""
  C_RESET=""
fi

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE" 2>/dev/null || :
}

say() {
  printf '  %s\n' "$1"
  log "$1"
}

note() {
  printf '    %s\n' "$1"
  log "$1"
}

ok() {
  printf '  %s✔%s %s\n' "$C_GREEN" "$C_RESET" "$1"
  log "ok: $1"
}

already() {
  ok "$1 (already done)"
}

warn() {
  printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"
  log "warning: $1"
}

step() {
  STEP_NO=$((STEP_NO + 1))
  printf '\n%s[%s/%s] %s%s\n' "$C_BOLD" "$STEP_NO" "$STEP_TOTAL" "$1" "$C_RESET"
  log "== step $STEP_NO/$STEP_TOTAL: $1"
}

# die <exit code> <what happened> [<detail>...] <what to do next>
die() {
  die_code=$1
  shift
  printf '\n  %s✘%s %s\n' "$C_RED" "$C_RESET" "$1" >&2
  log "error: $1"
  shift
  for die_line in "$@"; do
    printf '    %s\n' "$die_line" >&2
    log "error: $die_line"
  done
  exit "$die_code"
}

# run_cmd <command...>: run quietly, output to the log.
run_cmd() {
  log "\$ $*"
  "$@" >>"$LOG_FILE" 2>&1
}

# pkg_run <command...>: like run_cmd, with a normal umask so packages install
# world-readable files.
pkg_run() {
  log "\$ $*"
  (umask 022 && "$@") >>"$LOG_FILE" 2>&1
}

# Single-quote an argument for display in a copy-pasteable command.
shquote() {
  case $1 in
    '') printf "''" ;;
    *[!A-Za-z0-9._~:/=@%+,-]*) printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")" ;;
    *) printf '%s' "$1" ;;
  esac
}

fmt_kb() {
  awk -v k="$1" 'BEGIN {
    g = k / 1048576
    if (g >= 10) printf "%d GB", g
    else if (g >= 1) printf "%.1f GB", g
    else printf "%d MB", k / 1024
  }'
}

fmt_duration() {
  if [ "$1" -lt 60 ]; then
    printf '%ss' "$1"
  else
    printf '%sm %ss' "$(($1 / 60))" "$(($1 % 60))"
  fi
}

is_placeholder() {
  case $1 in
    __LUMEN_*__) return 0 ;;
    *) return 1 ;;
  esac
}

sha256_of() {
  sha256sum "$1" 2>/dev/null | cut -d ' ' -f 1
}

# same_content <a> <b>: both files exist and have identical bytes.
same_content() {
  [ -f "$1" ] && [ -f "$2" ] && [ "$(sha256_of "$1")" = "$(sha256_of "$2")" ]
}

file_size() {
  wc -c <"$1" | tr -d ' '
}

to_hex() {
  od -An -tx1 | tr -d ' \n'
}

b64_decode() {
  case $1 in
    '' | *[!A-Za-z0-9+/=]*) return 1 ;;
  esac
  printf '%s' "$1" | base64 -d 2>/dev/null
}

b64_encode() {
  base64 | tr -d '\n'
}

on_exit() {
  exit_rc=$?
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
  if [ "$exit_rc" -ne 0 ] && [ "$LOG_READY" = 1 ]; then
    log "installer exited with code $exit_rc"
    printf '\n    Full install log: %s\n' "$LOG_FILE" >&2
  fi
  exit "$exit_rc"
}

usage() {
  cat <<'EOF'
Install the Lumen agent and join this server to your Lumen workspace.

Usage:
  curl -fsSL https://<control-plane>/install/agent.sh \
    | sudo sh -s -- --token <join-token> --control-plane https://<control-plane>

Options:
  --token <token>           Join token from Lumen (Servers -> Add server).
                            Not needed when this server already joined.
  --control-plane <url>     Your Lumen address, for example https://lumen.example.com
  --ca-file <path>          Extra CA bundle for a control plane with a private or
                            self-signed certificate.
  --public-ip <ip>          Public IP to report, when auto-detection gets it wrong.
  --version <version>       Install this agent version instead of the default.
  --force                   Continue on an operating system Lumen hasn't tested.
  --skip-docker-install     Never install Docker (a usable Docker 24+ must exist).
  -h, --help                Show this help.

Running the command again is safe: finished steps report "already done".
Log: /var/log/lumen-agent-install.log
EOF
}

# ---------------------------------------------------------------------------
# Arguments and configuration.
# ---------------------------------------------------------------------------
need_value() {
  if [ $# -lt 2 ] || [ -z "$2" ]; then
    die 2 "The $1 option needs a value." "Run the command again with $1 <value>, or use --help to see every option."
  fi
}

parse_args() {
  for arg in "$@"; do
    ORIG_ARGS="$ORIG_ARGS $(shquote "$arg")"
  done
  while [ $# -gt 0 ]; do
    case $1 in
      --token) need_value "$@"; TOKEN=$2; shift 2 ;;
      --token=*) TOKEN=${1#*=}; shift ;;
      --control-plane) need_value "$@"; CONTROL_PLANE=$2; shift 2 ;;
      --control-plane=*) CONTROL_PLANE=${1#*=}; shift ;;
      --ca-file) need_value "$@"; CA_FILE=$2; shift 2 ;;
      --ca-file=*) CA_FILE=${1#*=}; shift ;;
      --public-ip) need_value "$@"; PUBLIC_IP=$2; shift 2 ;;
      --public-ip=*) PUBLIC_IP=${1#*=}; shift ;;
      --version) need_value "$@"; AGENT_VERSION=$2; shift 2 ;;
      --version=*) AGENT_VERSION=${1#*=}; shift ;;
      --force) FORCE=1; shift ;;
      --skip-docker-install) SKIP_DOCKER_INSTALL=1; shift ;;
      -h | --help) usage; exit 0 ;;
      *) die 2 "Unknown option: $1" "Run the command with --help to see every option." ;;
    esac
  done
}

resolve_config() {
  if [ -z "$CONTROL_PLANE" ]; then
    CONTROL_PLANE=$CONTROL_PLANE_DEFAULT
  fi
  if is_placeholder "$CONTROL_PLANE"; then
    die 2 "This installer doesn't know your Lumen address." "Copy the install command from Lumen (Servers -> Add server), or pass --control-plane https://<your-lumen-address>."
  fi
  if is_placeholder "$AGENT_VERSION"; then
    die 2 "This installer doesn't say which agent version to install." "Copy the install command from Lumen (Servers -> Add server), or pass --version <version>."
  fi
  if is_placeholder "$RELEASE_PUBKEY"; then
    die 2 "This installer has no release signing key, so it can't verify the agent." "Download the install command from your Lumen dashboard (Servers -> Add server) instead of using a copy of the script."
  fi

  while :; do
    case $CONTROL_PLANE in
      */) CONTROL_PLANE=${CONTROL_PLANE%/} ;;
      *) break ;;
    esac
  done
  case $CONTROL_PLANE in
    *[!A-Za-z0-9.:/_-]*)
      die 2 "The control plane address has characters Lumen doesn't accept: $CONTROL_PLANE" "Use the plain address of your Lumen dashboard, for example --control-plane https://lumen.example.com." ;;
  esac
  case $CONTROL_PLANE in
    https://?*) CP_HTTPS=1 ;;
    http://127.0.0.1 | http://127.0.0.1[:/]* | http://localhost | http://localhost[:/]*) CP_HTTPS=0 ;;
    *)
      die 2 "Lumen only installs from a control plane on https://. This command points at $CONTROL_PLANE." "Use the https:// address of your Lumen dashboard, for example --control-plane https://lumen.example.com." ;;
  esac

  case $AGENT_VERSION in
    '' | *[!A-Za-z0-9.+_-]*)
      die 2 "The agent version \"$AGENT_VERSION\" isn't valid." "Use a version like 0.2.0, or leave out --version to install the default." ;;
  esac
  if [ -n "$TOKEN" ]; then
    case $TOKEN in
      *[!A-Za-z0-9._~-]*)
        die 2 "The join token has characters Lumen never uses." "Copy the install command from Lumen again (Servers -> Add server) and paste it exactly." ;;
    esac
    if [ "${#TOKEN}" -gt 512 ]; then
      die 2 "The join token is too long." "Copy the install command from Lumen again (Servers -> Add server) and paste it exactly."
    fi
  fi
  if [ -n "$PUBLIC_IP" ]; then
    case $PUBLIC_IP in
      *[!0-9A-Fa-f.:]* | *.*:* )
        die 2 "\"$PUBLIC_IP\" isn't an IP address." "Pass the server's public IPv4 or IPv6 address, for example --public-ip 203.0.113.10." ;;
    esac
  fi
  if [ -n "$CA_FILE" ]; then
    if [ ! -f "$CA_FILE" ] || [ ! -r "$CA_FILE" ]; then
      die 2 "The CA file $CA_FILE doesn't exist or can't be read." "Check the path you passed to --ca-file, then run the command again."
    fi
    if ! grep -q -e '-----BEGIN CERTIFICATE-----' "$CA_FILE"; then
      die 2 "$CA_FILE doesn't look like a PEM certificate bundle." "Pass a file that contains one or more -----BEGIN CERTIFICATE----- blocks."
    fi
  fi
}

reinstall_command() {
  rc_cmd="curl -fsSL $CONTROL_PLANE/install/agent.sh | sudo sh -s -- --control-plane $(shquote "$CONTROL_PLANE")"
  if [ -n "$CA_FILE" ]; then
    rc_cmd="$rc_cmd --ca-file $(shquote "$CA_FILE")"
  fi
  if [ -n "$PUBLIC_IP" ]; then
    rc_cmd="$rc_cmd --public-ip $PUBLIC_IP"
  fi
  printf '%s' "$rc_cmd"
}

# curl against the control plane: HTTPS only (unless localhost), extra CA when
# given, bounded connect time.
cp_curl() {
  if [ -n "$CA_FILE" ]; then
    set -- --cacert "$CA_FILE" "$@"
  fi
  if [ "$CP_HTTPS" = 1 ]; then
    set -- --proto '=https' --proto-redir '=https' "$@"
  fi
  curl -fsSL --connect-timeout 10 "$@"
}

# ---------------------------------------------------------------------------
# Step 1: preflight.
# ---------------------------------------------------------------------------
require_root() {
  if [ "$(id -u)" != "0" ]; then
    printf '\n  The installer needs root to set up Docker, the firewall and the agent service.\n' >&2
    printf '  Run it again with sudo:\n\n' >&2
    printf '    curl -fsSL %s/install/agent.sh | sudo sh -s --%s\n\n' "$CONTROL_PLANE" "$ORIG_ARGS" >&2
    exit 1
  fi
}

init_log() {
  (umask 022 && mkdir -p "${LOG_PATH%/*}") 2>/dev/null
  if : >>"$LOG_PATH" 2>/dev/null; then
    LOG_FILE=$LOG_PATH
    LOG_READY=1
  fi
  log "---- Lumen agent installer started (control plane $CONTROL_PLANE, agent $AGENT_VERSION)"
  token_state=none
  [ -n "$TOKEN" ] && token_state=given
  log "flags: force=$FORCE skip-docker-install=$SKIP_DOCKER_INSTALL ca-file=${CA_FILE:-none} public-ip=${PUBLIC_IP:-auto} token=$token_state"
  TMP_DIR=$(mktemp -d 2>/dev/null) || die 1 "Couldn't create a temporary directory." "Check that /tmp is writable and has free space, then run the command again."
}

osr_get() {
  if [ -r "$OS_RELEASE" ]; then
    sed -n "s/^$1=//p" "$OS_RELEASE" | head -n 1 | tr -d "\"'"
  fi
}

check_os() {
  OS_ID=$(osr_get ID)
  OS_VERSION_ID=$(osr_get VERSION_ID)
  OS_ID_LIKE=$(osr_get ID_LIKE)
  OS_CODENAME=$(osr_get VERSION_CODENAME)
  OS_PRETTY=$(osr_get PRETTY_NAME)
  [ -n "$OS_ID" ] || OS_ID=unknown
  [ -n "$OS_PRETTY" ] || OS_PRETTY="$OS_ID $OS_VERSION_ID"
  case " $OS_ID_LIKE " in
    *" ubuntu "*)
      ubuntu_codename=$(osr_get UBUNTU_CODENAME)
      [ -n "$ubuntu_codename" ] && OS_CODENAME=$ubuntu_codename ;;
  esac

  case " $OS_ID $OS_ID_LIKE " in
    *" debian "* | *" ubuntu "*) PKG=apt ;;
    *" rhel "* | *" fedora "* | *" centos "* | *" rocky "* | *" almalinux "* | *" ol "*) PKG=dnf ;;
    *)
      if command -v apt-get >/dev/null 2>&1; then
        PKG=apt
      elif command -v dnf >/dev/null 2>&1; then
        PKG=dnf
      else
        PKG=none
      fi ;;
  esac

  case "$OS_ID:$OS_VERSION_ID" in
    ubuntu:22.04 | ubuntu:24.04 | debian:12)
      ok "$OS_PRETTY is supported" ;;
    rhel:9 | rhel:9.* | rocky:9 | rocky:9.* | almalinux:9 | almalinux:9.* | centos:9 | ol:9 | ol:9.*)
      ok "$OS_PRETTY is supported (RHEL family, Tier 2)" ;;
    *)
      if [ "$FORCE" = 1 ]; then
        warn "Lumen hasn't been tested on $OS_PRETTY. Continuing because you passed --force."
      else
        die 2 "Lumen hasn't been tested on $OS_PRETTY." \
          "Supported: Ubuntu 22.04 or 24.04, Debian 12, and RHEL-family 9 (RHEL, Rocky, AlmaLinux, CentOS Stream, Oracle Linux)." \
          "Use a supported image, or add --force to the command to try anyway."
      fi ;;
  esac
}

check_arch() {
  machine=$(uname -m)
  case $machine in
    x86_64 | amd64) ARCH=amd64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *)
      die 2 "This server's CPU architecture ($machine) isn't supported." "Lumen runs on 64-bit Intel/AMD (amd64) and 64-bit ARM (arm64) servers. Create the server with one of those." ;;
  esac
}

check_resources() {
  mem_kb=$(awk '/^MemTotal:/ { print $2; exit }' "$MEMINFO" 2>/dev/null)
  case $mem_kb in
    '' | *[!0-9]*)
      warn "Couldn't read the amount of memory. Lumen needs at least 1 GB; continuing."
      mem_kb="" ;;
  esac
  # 1 GB minus ~10% the kernel reserves: a "1 GB" VM reports about 950 MiB.
  if [ -n "$mem_kb" ] && [ "$mem_kb" -lt 921600 ]; then
    die 2 "This server has $(fmt_kb "$mem_kb") of memory. Lumen needs at least 1 GB." "Resize the server to 1 GB of RAM or more, then run the install command again."
  fi

  disk_path="$ROOT/var/lib"
  [ -d "$disk_path" ] || disk_path="${ROOT:-/}"
  disk_kb=$(df -Pk "$disk_path" 2>/dev/null | awk 'NR == 2 { print $4 }')
  case $disk_kb in
    '' | *[!0-9]*)
      warn "Couldn't read the free disk space on /var/lib. Lumen needs at least 2 GB; continuing."
      disk_kb="" ;;
  esac
  if [ -n "$disk_kb" ] && [ "$disk_kb" -lt 2097152 ]; then
    die 2 "Your server is almost out of disk space" \
      "Only $(fmt_kb "$disk_kb") is free on /var/lib. Lumen needs at least 2 GB." \
      "Clean up unused files (for example: sudo docker system prune) or resize the disk, then run the install command again."
  fi

  mem_text="unknown memory"
  [ -n "$mem_kb" ] && mem_text="$(fmt_kb "$mem_kb") memory"
  disk_text="unknown free disk"
  [ -n "$disk_kb" ] && disk_text="$(fmt_kb "$disk_kb") free disk"
  ok "$ARCH, $mem_text, $disk_text"
  if [ -n "$disk_kb" ] && [ "$disk_kb" -lt 10485760 ]; then
    warn "Only $(fmt_kb "$disk_kb") is free on /var/lib. Images and builds fill that quickly; plan to grow the disk to 10 GB or more."
  fi
}

check_systemd() {
  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d "$ROOT/run/systemd/system" ]; then
    die 2 "This server isn't running systemd." "Lumen uses systemd to keep the agent running. Use Ubuntu 22.04/24.04, Debian 12 or a RHEL-family 9 image."
  fi
}

check_tools() {
  missing=""
  command -v curl >/dev/null 2>&1 || missing="$missing curl"
  command -v tar >/dev/null 2>&1 || missing="$missing tar"
  command -v openssl >/dev/null 2>&1 || missing="$missing openssl"
  if [ ! -f "$ROOT/etc/ssl/certs/ca-certificates.crt" ] && [ ! -f "$ROOT/etc/pki/tls/certs/ca-bundle.crt" ]; then
    missing="$missing ca-certificates"
  fi
  if [ -z "$missing" ]; then
    already "curl, tar, openssl and CA certificates are installed"
    return 0
  fi
  say "Installing$missing (a few seconds)…"
  # shellcheck disable=SC2086 # $missing is a list of package names.
  case $PKG in
    apt)
      pkg_run apt-get -o DPkg::Lock::Timeout=300 update -q &&
        pkg_run apt-get -o DPkg::Lock::Timeout=300 install -y -q --no-install-recommends $missing ;;
    dnf)
      pkg_run dnf install -y -q $missing ;;
    *) false ;;
  esac || die 2 "Couldn't install$missing." "Install them with your package manager, then run the install command again."
  ok "Installed$missing"
}

check_clock() {
  if ! command -v timedatectl >/dev/null 2>&1; then
    log "timedatectl not found; skipping the clock check"
    return 0
  fi
  ntp=$(timedatectl show -p NTPSynchronized --value 2>/dev/null)
  if [ "$ntp" = "yes" ]; then
    ok "The clock is synced"
  else
    warn "This server's clock isn't synced. Lumen rejects messages from servers whose clock is off by more than 5 minutes. Fix it with: sudo timedatectl set-ntp true"
  fi
}

docker_detect() {
  DOCKER_VER=""
  if ! command -v docker >/dev/null 2>&1; then
    DOCKER_STATE=missing
    return 0
  fi
  DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null | head -n 1)
  case $DOCKER_VER in
    '') DOCKER_STATE=down; return 0 ;;
  esac
  docker_major=${DOCKER_VER%%.*}
  case $docker_major in
    '' | *[!0-9]*) DOCKER_STATE=old ;;
    *)
      if [ "$docker_major" -ge 24 ]; then
        DOCKER_STATE=ok
      else
        DOCKER_STATE=old
      fi ;;
  esac
}

check_docker() {
  docker_detect
  case $DOCKER_STATE in
    ok) ok "Docker $DOCKER_VER found" ;;
    old) say "Docker $DOCKER_VER is older than 24. It will be upgraded next." ;;
    down) say "Docker is installed but not running. It will be started next." ;;
    missing) say "Docker isn't installed yet. It will be installed next." ;;
  esac
}

step_preflight() {
  step "Checking your server"
  check_os
  check_arch
  check_resources
  check_systemd
  check_tools
  check_clock
  check_docker
}

# ---------------------------------------------------------------------------
# Step 2: Docker Engine.
# ---------------------------------------------------------------------------
docker_repo_download() {
  if ! curl -fsSL --proto '=https' --connect-timeout 10 --retry 3 -o "$2" "$1" >>"$LOG_FILE" 2>&1; then
    die 1 "Couldn't reach download.docker.com." "Check that this server can reach the internet over HTTPS, then run the install command again."
  fi
}

docker_install_apt() {
  case " $OS_ID $OS_ID_LIKE " in
    *" ubuntu "*) docker_distro=ubuntu ;;
    *) docker_distro=debian ;;
  esac
  if [ -z "$OS_CODENAME" ]; then
    die 1 "Couldn't tell which $OS_PRETTY release this is, so Docker's repository can't be added." "Install Docker Engine 24 or newer yourself (docs.docker.com/engine/install), then run the install command again."
  fi
  keyrings="$ROOT/etc/apt/keyrings"
  sources="$ROOT/etc/apt/sources.list.d"
  (umask 022 && mkdir -p "$keyrings" "$sources")
  docker_repo_download "https://download.docker.com/linux/$docker_distro/gpg" "$TMP_DIR/docker.asc"
  cp "$TMP_DIR/docker.asc" "$keyrings/docker.asc" && chmod 0644 "$keyrings/docker.asc"
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
    "$ARCH" "$docker_distro" "$OS_CODENAME" >"$sources/docker.list"
  chmod 0644 "$sources/docker.list"
  log "wrote $sources/docker.list"
  if ! pkg_run apt-get -o DPkg::Lock::Timeout=300 update -q; then
    die 1 "Couldn't read Docker's package list." "Check that this server can reach download.docker.com, then run the install command again."
  fi
  if ! pkg_run apt-get -o DPkg::Lock::Timeout=300 install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin; then
    die 1 "Docker couldn't be installed." "Check the log below for the package error, fix it (often another apt process is running), then run the install command again."
  fi
}

docker_install_dnf() {
  case $OS_ID in
    centos) docker_repo=centos ;;
    fedora) docker_repo=fedora ;;
    *) docker_repo=rhel ;;
  esac
  repos="$ROOT/etc/yum.repos.d"
  (umask 022 && mkdir -p "$repos")
  docker_repo_download "https://download.docker.com/linux/$docker_repo/docker-ce.repo" "$TMP_DIR/docker-ce.repo"
  cp "$TMP_DIR/docker-ce.repo" "$repos/docker-ce.repo" && chmod 0644 "$repos/docker-ce.repo"
  if ! pkg_run dnf install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin; then
    die 1 "Docker couldn't be installed." "If Podman is installed it conflicts with Docker: remove it with sudo dnf remove -y podman runc, then run the install command again."
  fi
}

step_docker() {
  step "Docker"
  docker_detect
  if [ "$DOCKER_STATE" = ok ]; then
    already "Docker $DOCKER_VER is running"
    return 0
  fi
  if [ "$DOCKER_STATE" = down ]; then
    say "Starting Docker…"
    run_cmd systemctl enable --now docker
    docker_detect
    if [ "$DOCKER_STATE" = ok ]; then
      ok "Started Docker $DOCKER_VER"
      return 0
    fi
  fi
  if [ "$SKIP_DOCKER_INSTALL" = 1 ]; then
    die 1 "Docker 24 or newer isn't running, and --skip-docker-install was given." "Start Docker 24 or newer, or run the command without --skip-docker-install."
  fi
  if [ "$DOCKER_STATE" = old ]; then
    say "Upgrading Docker $DOCKER_VER to the current release (about a minute)…"
  else
    say "Installing Docker (about a minute)…"
  fi
  case $PKG in
    apt) docker_install_apt ;;
    dnf) docker_install_dnf ;;
    *)
      die 2 "Lumen can't install Docker on $OS_PRETTY automatically." "Install Docker Engine 24 or newer yourself (docs.docker.com/engine/install), then run the install command again." ;;
  esac
  if ! run_cmd systemctl enable --now docker; then
    die 1 "Docker was installed but didn't start." "Check it with: sudo systemctl status docker. Then run the install command again."
  fi
  docker_detect
  if [ "$DOCKER_STATE" != ok ]; then
    die 1 "Docker was installed but isn't answering." "Check it with: sudo systemctl status docker. Then run the install command again."
  fi
  ok "Docker $DOCKER_VER is installed and running"
}

# ---------------------------------------------------------------------------
# Step 3: OS firewall and provider.
# ---------------------------------------------------------------------------
FW_PORTS="80/tcp 443/tcp 51820/udp"
FW_CHANGED=0

fw_ufw() {
  ufw_status=$(ufw status 2>/dev/null)
  missing=""
  for p in $FW_PORTS; do
    if ! printf '%s\n' "$ufw_status" | grep -Eq "^${p}[[:space:]]+ALLOW"; then
      missing="$missing $p"
    fi
  done
  if [ -z "$missing" ]; then
    already "Ports 80, 443 and 51820/udp are open in ufw"
    return 0
  fi
  say "Opening ports 80 and 443 in the OS firewall (ufw), plus 51820/udp for private networking"
  for p in $missing; do
    run_cmd ufw allow "$p" || die 1 "Couldn't open $p in ufw." "Open it yourself with: sudo ufw allow $p. Then run the install command again."
  done
  ok "Opened$missing in ufw"
}

fw_firewalld() {
  missing=""
  for p in $FW_PORTS; do
    firewall-cmd --permanent --query-port="$p" >/dev/null 2>&1 || missing="$missing $p"
  done
  if [ -z "$missing" ]; then
    already "Ports 80, 443 and 51820/udp are open in firewalld"
    return 0
  fi
  say "Opening ports 80 and 443 in the OS firewall (firewalld), plus 51820/udp for private networking"
  for p in $missing; do
    run_cmd firewall-cmd --permanent --add-port="$p" || die 1 "Couldn't open $p in firewalld." "Open it yourself with: sudo firewall-cmd --permanent --add-port=$p && sudo firewall-cmd --reload"
  done
  run_cmd firewall-cmd --reload || die 1 "Couldn't reload firewalld." "Reload it yourself with: sudo firewall-cmd --reload. Then run the install command again."
  ok "Opened$missing in firewalld"
}

# Inspect `<tool> -S INPUT` and insert ACCEPT rules directly before the first
# REJECT/DROP rule (Oracle's Ubuntu images end INPUT with a REJECT).
fw_iptables_one() {
  ipt=$1
  if ! ipt_rules=$("$ipt" -S INPUT 2>/dev/null); then
    log "$ipt -S INPUT failed; skipping $ipt"
    return 0
  fi
  log "$ipt -S INPUT:"
  printf '%s\n' "$ipt_rules" >>"$LOG_FILE" 2>/dev/null
  # Emits: "block <n>" (rule number of the first REJECT/DROP, 0 if none),
  # "policy <P>", "all" if an unconditional ACCEPT precedes it, and one
  # "accept <port>/<proto>" per ACCEPT rule before the block.
  ipt_scan=$(printf '%s\n' "$ipt_rules" | awk '
    $1 == "-P" { print "policy " $3; next }
    $1 == "-A" {
      n++
      if (block) next
      if ($0 ~ / -j (REJECT|DROP)( |$)/) { block = n; next }
      if ($0 ~ / -j ACCEPT( |$)/) {
        if (NF == 4) { print "all"; next }
        proto = ""; dport = ""
        for (i = 1; i <= NF; i++) {
          if ($i == "-p") proto = $(i + 1)
          if ($i == "--dport") dport = $(i + 1)
        }
        if (proto != "" && dport != "") print "accept " dport "/" proto
      }
    }
    END { print "block " (block + 0) }')
  ipt_block=$(printf '%s\n' "$ipt_scan" | sed -n 's/^block //p')
  ipt_policy=$(printf '%s\n' "$ipt_scan" | sed -n 's/^policy //p')
  if printf '%s\n' "$ipt_scan" | grep -qx all; then
    log "$ipt: an unconditional ACCEPT comes first; nothing to open"
    return 0
  fi
  if [ "$ipt_block" = 0 ] && [ "$ipt_policy" != DROP ]; then
    log "$ipt: no REJECT/DROP rule and policy $ipt_policy; nothing to open"
    return 0
  fi
  missing=""
  for p in $FW_PORTS; do
    printf '%s\n' "$ipt_scan" | grep -qx "accept $p" || missing="$missing $p"
  done
  if [ -z "$missing" ]; then
    log "$ipt: ports already accepted before the first REJECT/DROP"
    return 0
  fi
  if [ "$FW_CHANGED" = 0 ]; then
    say "Opening ports 80 and 443 in the OS firewall (iptables), plus 51820/udp for private networking"
  fi
  if [ "$ipt_block" -gt 0 ]; then
    # Insert in reverse so the final order is 80, 443, 51820, all directly
    # before the first REJECT/DROP rule.
    reversed=""
    for p in $missing; do reversed="$p $reversed"; done
    for p in $reversed; do
      run_cmd "$ipt" -I INPUT "$ipt_block" -m state --state NEW -p "${p#*/}" --dport "${p%/*}" -j ACCEPT ||
        die 1 "Couldn't add an $ipt rule for $p." "Add it yourself with: sudo $ipt -I INPUT $ipt_block -m state --state NEW -p ${p#*/} --dport ${p%/*} -j ACCEPT"
    done
  else
    for p in $missing; do
      run_cmd "$ipt" -A INPUT -m state --state NEW -p "${p#*/}" --dport "${p%/*}" -j ACCEPT ||
        die 1 "Couldn't add an $ipt rule for $p." "Add it yourself with: sudo $ipt -A INPUT -m state --state NEW -p ${p#*/} --dport ${p%/*} -j ACCEPT"
    done
  fi
  FW_CHANGED=1
  ok "Opened$missing in $ipt"
}

fw_persist() {
  if command -v netfilter-persistent >/dev/null 2>&1; then
    :
  elif [ "$PKG" = apt ]; then
    say "Installing iptables-persistent so the rules survive a reboot…"
    printf '%s\n' \
      "iptables-persistent iptables-persistent/autosave_v4 boolean true" \
      "iptables-persistent iptables-persistent/autosave_v6 boolean true" |
      debconf-set-selections >>"$LOG_FILE" 2>&1
    pkg_run apt-get -o DPkg::Lock::Timeout=300 install -y -q iptables-persistent ||
      warn "Couldn't install iptables-persistent. The new rules work now but will be lost on reboot; save them with: sudo netfilter-persistent save"
  elif [ "$PKG" = dnf ]; then
    if pkg_run dnf install -y -q iptables-services; then
      sysconfig="$ROOT/etc/sysconfig"
      mkdir -p "$sysconfig"
      iptables-save >"$sysconfig/iptables" 2>>"$LOG_FILE"
      if command -v ip6tables-save >/dev/null 2>&1; then
        ip6tables-save >"$sysconfig/ip6tables" 2>>"$LOG_FILE"
      fi
      run_cmd systemctl enable iptables ip6tables
      ok "Saved the firewall rules so they survive a reboot"
    else
      warn "Couldn't install iptables-services. The new rules work now but will be lost on reboot; save them with: sudo service iptables save"
    fi
    return 0
  fi
  if command -v netfilter-persistent >/dev/null 2>&1; then
    if run_cmd netfilter-persistent save; then
      ok "Saved the firewall rules so they survive a reboot"
    else
      warn "Couldn't save the firewall rules. They work now but will be lost on reboot; save them with: sudo netfilter-persistent save"
    fi
  elif [ "$PKG" != apt ]; then
    warn "Couldn't find a tool to save the firewall rules. They work now but will be lost on reboot; save them with your distribution's iptables tool."
  fi
}

fw_iptables() {
  FW_CHANGED=0
  for ipt in iptables ip6tables; do
    if command -v "$ipt" >/dev/null 2>&1; then
      fw_iptables_one "$ipt"
    fi
  done
  if [ "$FW_CHANGED" = 1 ]; then
    fw_persist
  else
    already "Ports 80, 443 and 51820/udp are open in the OS firewall"
  fi
}

# Metadata probes: 2 s timeout, no proxy, no credentials.
md_curl() {
  curl -fsS -m 2 --noproxy '*' "$@" 2>/dev/null
}

probe_provider() {
  if md_curl -o /dev/null -H 'Authorization: Bearer Oracle' "$MD_URL/opc/v2/instance/"; then
    echo oracle
    return 0
  fi
  imds_token=$(md_curl -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' "$MD_URL/latest/api/token")
  case $imds_token in
    '' | *[!A-Za-z0-9_=+/-]*) ;;
    *)
      if md_curl -o /dev/null -H "X-aws-ec2-metadata-token: $imds_token" "$MD_URL/latest/meta-data/instance-id"; then
        echo aws
        return 0
      fi ;;
  esac
  if md_curl -o /dev/null -H 'Metadata-Flavor: Google' "$GCP_MD_URL/computeMetadata/v1/instance/id"; then
    echo gcp
    return 0
  fi
  if md_curl -o /dev/null -H 'Metadata: true' "$MD_URL/metadata/instance?api-version=2021-02-01"; then
    echo azure
    return 0
  fi
  if md_curl -o /dev/null "$MD_URL/hetzner/v1/metadata"; then
    echo hetzner
    return 0
  fi
  if md_curl -o /dev/null "$MD_URL/metadata/v1/id"; then
    echo digitalocean
    return 0
  fi
  echo other
}

provider_name() {
  case $1 in
    oracle) echo "Oracle Cloud" ;;
    aws) echo "AWS" ;;
    gcp) echo "Google Cloud" ;;
    azure) echo "Azure" ;;
    hetzner) echo "Hetzner" ;;
    digitalocean) echo "DigitalOcean" ;;
    *) echo "your provider" ;;
  esac
}

print_cloud_card() {
  # The card is plain text from the control plane. Strip control characters so
  # it can't drive the terminal, and cap its size.
  card=$(cp_curl -m 5 "$CONTROL_PLANE/install/fix/PORT_BLOCKED/$PROVIDER/cloud" 2>>"$LOG_FILE" |
    head -c 8192 | tr -d '\000-\010\013-\037\177')
  if [ "$PROVIDER" = other ]; then
    title="Open ports 80 and 443 in your provider's firewall too"
  else
    title="Open ports 80 and 443 in your $(provider_name "$PROVIDER") firewall too"
  fi
  printf '\n  %s┃ %s%s\n' "$C_YELLOW" "$title" "$C_RESET"
  log "cloud firewall card ($PROVIDER):"
  if [ -z "$card" ]; then
    card="Open inbound TCP 80 and 443 in your provider's firewall (security group, security list or cloud firewall) so visitors can reach your apps. Lumen checks the ports once the agent is online."
  fi
  printf '%s\n' "$card" | while IFS= read -r card_line; do
    printf '  %s┃%s %s\n' "$C_YELLOW" "$C_RESET" "$card_line"
    log "  $card_line"
  done
}

step_firewall() {
  step "Firewall"
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | head -n 1 | grep -q '^Status: active'; then
    fw_ufw
  elif command -v firewall-cmd >/dev/null 2>&1 && [ "$(firewall-cmd --state 2>/dev/null)" = running ]; then
    fw_firewalld
  else
    fw_iptables
  fi
  PROVIDER=$(probe_provider)
  if [ "$PROVIDER" = other ]; then
    ok "No cloud provider detected (bare metal or another host)"
  else
    ok "Detected provider: $(provider_name "$PROVIDER")"
  fi
  print_cloud_card
}

# ---------------------------------------------------------------------------
# Step 4: download and verify the agent.
# ---------------------------------------------------------------------------
VERIFY_REASON=""

# verify_minisign <file> <minisig>: verify a minisign signature (prehashed "ED"
# or legacy "Ed") and its global signature over the trusted comment, against
# RELEASE_PUBKEY, with openssl only.
verify_minisign() {
  vm_file=$1
  vm_sig=$2
  vm_dir="$TMP_DIR/verify"
  rm -rf "$vm_dir"
  mkdir -p "$vm_dir"

  # Public key: base64("Ed" || key_id[8] || ed25519_pubkey[32]).
  if ! b64_decode "$RELEASE_PUBKEY" >"$vm_dir/pub.bin" || [ "$(file_size "$vm_dir/pub.bin")" != 42 ] ||
    [ "$(head -c 2 "$vm_dir/pub.bin")" != "Ed" ]; then
    VERIFY_REASON="The release public key in this installer is malformed."
    return 1
  fi
  pub_keyid=$(head -c 10 "$vm_dir/pub.bin" | tail -c 8 | to_hex)
  # Ed25519 SubjectPublicKeyInfo DER = 302a300506032b6570032100 || key. The
  # 12-byte prefix is a multiple of 3, so its base64 ("MCowBQYDK2VwAyEA") can be
  # concatenated with the base64 of the key.
  {
    echo "-----BEGIN PUBLIC KEY-----"
    printf 'MCowBQYDK2VwAyEA%s\n' "$(tail -c 32 "$vm_dir/pub.bin" | b64_encode)"
    echo "-----END PUBLIC KEY-----"
  } >"$vm_dir/pub.pem"

  tr -d '\r' <"$vm_sig" >"$vm_dir/sig.txt"
  sig_l1=$(sed -n 1p "$vm_dir/sig.txt")
  sig_l2=$(sed -n 2p "$vm_dir/sig.txt")
  sig_l3=$(sed -n 3p "$vm_dir/sig.txt")
  sig_l4=$(sed -n 4p "$vm_dir/sig.txt")
  case $sig_l1 in
    "untrusted comment:"*) ;;
    *) VERIFY_REASON="The signature file is malformed."; return 1 ;;
  esac
  case $sig_l3 in
    "trusted comment: "*) ;;
    *) VERIFY_REASON="The signature file is malformed."; return 1 ;;
  esac
  trusted_comment=${sig_l3#"trusted comment: "}

  if ! b64_decode "$sig_l2" >"$vm_dir/sig.bin" || [ "$(file_size "$vm_dir/sig.bin")" != 74 ]; then
    VERIFY_REASON="The signature file is malformed."
    return 1
  fi
  sig_alg=$(head -c 2 "$vm_dir/sig.bin")
  sig_keyid=$(head -c 10 "$vm_dir/sig.bin" | tail -c 8 | to_hex)
  if [ "$sig_keyid" != "$pub_keyid" ]; then
    VERIFY_REASON="It was signed with a different key than this Lumen release key."
    return 1
  fi
  tail -c 64 "$vm_dir/sig.bin" >"$vm_dir/sig.raw"

  case $sig_alg in
    ED)
      if ! openssl dgst -blake2b512 -binary "$vm_file" >"$vm_dir/msg.bin" 2>>"$LOG_FILE"; then
        VERIFY_REASON="openssl couldn't hash the file (BLAKE2b-512 needs OpenSSL 1.1.1 or newer)."
        return 1
      fi
      vm_msg="$vm_dir/msg.bin" ;;
    Ed) vm_msg=$vm_file ;;
    *) VERIFY_REASON="The signature uses an unknown algorithm."; return 1 ;;
  esac
  if ! openssl pkeyutl -verify -pubin -inkey "$vm_dir/pub.pem" -rawin -in "$vm_msg" -sigfile "$vm_dir/sig.raw" >>"$LOG_FILE" 2>&1; then
    VERIFY_REASON="The signature doesn't match the file."
    return 1
  fi

  if ! b64_decode "$sig_l4" >"$vm_dir/global.raw" || [ "$(file_size "$vm_dir/global.raw")" != 64 ]; then
    VERIFY_REASON="The signature file is malformed."
    return 1
  fi
  {
    cat "$vm_dir/sig.raw"
    printf '%s' "$trusted_comment"
  } >"$vm_dir/global.msg"
  if ! openssl pkeyutl -verify -pubin -inkey "$vm_dir/pub.pem" -rawin -in "$vm_dir/global.msg" -sigfile "$vm_dir/global.raw" >>"$LOG_FILE" 2>&1; then
    VERIFY_REASON="The signature's trusted comment was altered."
    return 1
  fi
  log "minisign signature verified (algorithm $sig_alg, key id $pub_keyid, trusted comment: $trusted_comment)"
  return 0
}

die_download() {
  die 5 "Couldn't download $1 from $CONTROL_PLANE." "Check that this server can reach $CONTROL_PLANE over HTTPS (outbound port 443), then run the install command again."
}

die_verify() {
  die 3 "The downloaded agent failed verification, so nothing was installed." "$1" "Run the install command again. If it keeps failing, something between this server and Lumen is changing downloads; ask your Lumen admin to check the release files."
}

step_download() {
  step "Downloading the agent"
  artifact="lumen-agent-linux-$ARCH"
  base_url="$CONTROL_PLANE/agent/download/$AGENT_VERSION/$artifact"
  dl_dir="$TMP_DIR/download"
  mkdir -p "$dl_dir"

  log "\$ curl $base_url.sha256"
  cp_curl --retry 3 -o "$dl_dir/$artifact.sha256" "$base_url.sha256" 2>>"$LOG_FILE" || die_download "the agent checksum"
  sha_line=$(tr -d '\r' <"$dl_dir/$artifact.sha256" | sed -n 1p)
  expected_sha=$(printf '%s' "${sha_line%% *}" | tr 'A-F' 'a-f')
  sha_name=${sha_line#* }
  sha_name=${sha_name# }
  sha_name=${sha_name#\*}
  case $expected_sha in
    *[!0-9a-f]*) die_verify "The checksum file is malformed." ;;
  esac
  if [ "${#expected_sha}" != 64 ] || [ "$sha_name" != "$artifact" ]; then
    die_verify "The checksum file is malformed."
  fi

  if [ -f "$AGENT_BIN" ] && [ "$(sha256_of "$AGENT_BIN")" = "$expected_sha" ]; then
    already "Lumen agent $AGENT_VERSION ($ARCH) is installed and matches the release"
    NEW_BINARY=""
    return 0
  fi

  say "Downloading Lumen agent $AGENT_VERSION for $ARCH…"
  log "\$ curl $base_url"
  cp_curl --retry 3 -o "$dl_dir/$artifact" "$base_url" 2>>"$LOG_FILE" || die_download "the agent"
  log "\$ curl $base_url.minisig"
  cp_curl --retry 3 -o "$dl_dir/$artifact.minisig" "$base_url.minisig" 2>>"$LOG_FILE" || die_download "the agent signature"

  # Re-write the checksum line ourselves so sha256sum -c can only ever look at
  # the file we downloaded.
  printf '%s  %s\n' "$expected_sha" "$artifact" >"$dl_dir/checksum"
  if ! (cd "$dl_dir" && sha256sum -c checksum) >>"$LOG_FILE" 2>&1; then
    die_verify "Its SHA-256 checksum doesn't match the release."
  fi
  if ! verify_minisign "$dl_dir/$artifact" "$dl_dir/$artifact.minisig"; then
    die_verify "$VERIFY_REASON"
  fi
  ok "Downloaded agent $AGENT_VERSION and verified its checksum and signature"
  NEW_BINARY="$dl_dir/$artifact"
}

# ---------------------------------------------------------------------------
# Step 5: install files.
# ---------------------------------------------------------------------------
env_value() {
  if [ -f "$ENV_FILE" ]; then
    sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1
  fi
}

# Re-running the installer without --ca-file / --public-ip keeps what an
# earlier run saved, so downloads keep trusting the private CA too.
load_saved_settings() {
  if [ -z "$CA_FILE" ] && [ "$(env_value LUMEN_CA_FILE)" = "$HOST_CA_COPY" ] && [ -f "$CA_COPY" ]; then
    CA_FILE=$CA_COPY
    log "using the CA bundle saved by an earlier run ($HOST_CA_COPY)"
  fi
  if [ -z "$PUBLIC_IP" ]; then
    saved_ip=$(env_value LUMEN_PUBLIC_IP)
    case $saved_ip in
      '' | *[!0-9A-Fa-f.:]*) ;;
      *) PUBLIC_IP=$saved_ip; log "using the public IP saved by an earlier run ($PUBLIC_IP)" ;;
    esac
  fi
}

ensure_dir() {
  ed_path=$1
  ed_mode=$2
  ed_want=$3
  if [ ! -d "$ed_path" ]; then
    if ! { mkdir -p "$ed_path" && chmod "$ed_mode" "$ed_path"; }; then
      die 1 "Couldn't create $ed_path." "Check the disk isn't read-only or full, then run the install command again."
    fi
    INSTALL_CHANGES="$INSTALL_CHANGES dir"
    log "created $ed_path ($ed_mode)"
    return 0
  fi
  # shellcheck disable=SC2012 # ls is the portable way to read a mode here.
  ed_have=$(ls -ld "$ed_path" | cut -c 1-10)
  if [ "$ed_have" != "$ed_want" ]; then
    chmod "$ed_mode" "$ed_path"
    INSTALL_CHANGES="$INSTALL_CHANGES mode"
    log "fixed the mode of $ed_path ($ed_have -> $ed_mode)"
  fi
}

step_install() {
  step "Installing the agent"
  INSTALL_CHANGES=""

  if [ ! -d "$BIN_DIR" ]; then
    (umask 022 && mkdir -p "$BIN_DIR")
  fi
  if [ -n "$NEW_BINARY" ]; then
    if ! { cp "$NEW_BINARY" "$AGENT_BIN.new" && chmod 0755 "$AGENT_BIN.new"; }; then
      die 1 "Couldn't copy the agent to /usr/local/bin." "Check the disk isn't read-only or full, then run the install command again."
    fi
    if [ -f "$AGENT_BIN" ]; then
      cp -p "$AGENT_BIN" "$AGENT_BIN.prev" ||
        die 1 "Couldn't keep a copy of the previous agent." "Check the disk isn't read-only or full, then run the install command again."
      log "kept the previous agent at /usr/local/bin/lumen-agent.prev"
    fi
    mv -f "$AGENT_BIN.new" "$AGENT_BIN" ||
      die 1 "Couldn't install the agent to /usr/local/bin." "Check the disk isn't read-only or full, then run the install command again."
    BINARY_CHANGED=1
    ok "Installed the agent at /usr/local/bin/lumen-agent"
  fi

  (umask 022 && mkdir -p "$LIB_DIR")
  ensure_dir "$STATE_DIR" 0700 drwx------
  if [ ! -d "$ETC_DIR" ]; then
    (umask 022 && mkdir -p "$ETC_DIR")
    INSTALL_CHANGES="$INSTALL_CHANGES etc"
  fi

  # CA bundle: copy what was passed (or what an earlier run saved; see
  # load_saved_settings).
  ENV_CA=""
  if [ -n "$CA_FILE" ]; then
    if ! same_content "$CA_FILE" "$CA_COPY"; then
      if ! { cp "$CA_FILE" "$CA_COPY.tmp" && chmod 0644 "$CA_COPY.tmp" && mv -f "$CA_COPY.tmp" "$CA_COPY"; }; then
        die 1 "Couldn't copy the CA file to /etc/lumen/ca.pem." "Check the disk isn't read-only or full, then run the install command again."
      fi
      INSTALL_CHANGES="$INSTALL_CHANGES ca"
      ok "Saved your CA bundle to /etc/lumen/ca.pem"
    fi
    ENV_CA=$HOST_CA_COPY
  fi
  ENV_PUBLIC_IP=$PUBLIC_IP

  {
    echo "# Written by the Lumen agent installer. Run the installer again to change it."
    echo "LUMEN_CONTROL_PLANE=$CONTROL_PLANE"
    [ -n "$ENV_CA" ] && echo "LUMEN_CA_FILE=$ENV_CA"
    [ -n "$ENV_PUBLIC_IP" ] && echo "LUMEN_PUBLIC_IP=$ENV_PUBLIC_IP"
  } >"$TMP_DIR/agent.env"
  if same_content "$TMP_DIR/agent.env" "$ENV_FILE"; then
    # shellcheck disable=SC2012 # ls is the portable way to read a mode here.
    if [ "$(ls -l "$ENV_FILE" | cut -c 1-10)" != "-rw-------" ]; then
      chmod 0600 "$ENV_FILE"
      INSTALL_CHANGES="$INSTALL_CHANGES envmode"
    fi
  else
    if ! { cp "$TMP_DIR/agent.env" "$ENV_FILE.tmp" && chmod 0600 "$ENV_FILE.tmp" && mv -f "$ENV_FILE.tmp" "$ENV_FILE"; }; then
      die 1 "Couldn't write /etc/lumen/agent.env." "Check the disk isn't read-only or full, then run the install command again."
    fi
    ENV_CHANGED=1
    INSTALL_CHANGES="$INSTALL_CHANGES env"
    ok "Wrote the agent settings to /etc/lumen/agent.env"
  fi

  if [ -z "$INSTALL_CHANGES" ] && [ "$BINARY_CHANGED" = 0 ]; then
    already "Agent files and settings are in place"
  elif [ -n "$INSTALL_CHANGES" ]; then
    log "install changes:$INSTALL_CHANGES"
  fi
}

# ---------------------------------------------------------------------------
# Step 6: join.
# ---------------------------------------------------------------------------
step_join() {
  step "Joining Lumen"
  had_identity=0
  if [ -f "$STATE_DIR/credential" ]; then
    if joined=$(lumen-agent status --check-credential 2>>"$LOG_FILE"); then
      joined=$(printf '%s' "$joined" | tr -d '\000-\010\013-\037\177' | head -n 1)
      already "${joined:-Already joined}"
      return 0
    fi
    log "credential present but lumen-agent status --check-credential failed"
    if [ -z "$TOKEN" ]; then
      die 2 "This server's Lumen credential is no longer valid (it may have been revoked or the server removed)." "Create a new join command in Lumen (Servers -> Add server) and run it here."
    fi
    say "The saved credential is no longer valid. Joining again with the new token…"
  elif [ -f "$STATE_DIR/identity.json" ]; then
    had_identity=1
  fi

  if [ -z "$TOKEN" ]; then
    if [ "$had_identity" = 1 ]; then
      die 2 "An earlier install stopped partway through joining, and no join token was given." "Create a new join command in Lumen (Servers -> Add server) and run it here."
    fi
    die 2 "This server hasn't joined Lumen yet, and the command has no join token." "Copy the install command from Lumen (Servers -> Add server) and run it here."
  fi

  set -- join --control-plane "$CONTROL_PLANE" --token "$TOKEN"
  if [ -n "$ENV_CA" ]; then
    set -- "$@" --ca-file "$CA_COPY"
  fi
  log "\$ lumen-agent join --control-plane $CONTROL_PLANE --token <redacted>${ENV_CA:+ --ca-file $CA_COPY}"
  join_out="$TMP_DIR/join.out"
  lumen-agent "$@" >"$join_out" 2>&1
  join_rc=$?
  # Never log the token, even if the agent echoes it.
  sed "s/$TOKEN/<redacted>/g" "$join_out" >>"$LOG_FILE" 2>/dev/null
  log "lumen-agent join exited with $join_rc"
  case $join_rc in
    0)
      ok "This server joined Lumen" ;;
    3)
      if [ "$had_identity" = 1 ]; then
        die 4 "An earlier install stopped partway through joining, so this join command was probably already used." "Create a new one in Lumen: Servers → Add server."
      fi
      die 4 "This join command has expired or was already used." "Create a new one in Lumen: Servers → Add server." ;;
    4)
      die 5 "This server can't reach Lumen at $CONTROL_PLANE." "Check outbound HTTPS (port 443) and DNS on this server, then run the install command again." ;;
    *)
      sed "s/$TOKEN/<redacted>/g" "$join_out" | tr -d '\000-\010\013-\037\177' | tail -n 5 | while IFS= read -r join_line; do
        printf '    %s\n' "$join_line" >&2
      done
      die 1 "Joining Lumen failed." "Run the install command again. If it fails the same way, create a new join command in Lumen (Servers → Add server)." ;;
  esac
}

# ---------------------------------------------------------------------------
# Step 7: systemd service.
# ---------------------------------------------------------------------------
write_unit() {
  cat <<'EOF'
[Unit]
Description=Lumen agent
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
ConditionPathExists=/var/lib/lumen/agent/credential
StartLimitIntervalSec=0

[Service]
Type=simple
EnvironmentFile=/etc/lumen/agent.env
ExecStart=/usr/local/bin/lumen-agent run
Restart=always
RestartSec=2
LimitNOFILE=65536
MemoryMax=256M
# The agent drives the Docker Engine API, which needs full privileges.
NoNewPrivileges=no

[Install]
WantedBy=multi-user.target
EOF
}

step_service() {
  step "Starting the agent service"
  write_unit >"$TMP_DIR/lumen-agent.service"
  if ! same_content "$TMP_DIR/lumen-agent.service" "$UNIT_FILE"; then
    (umask 022 && mkdir -p "${UNIT_FILE%/*}")
    if ! { cp "$TMP_DIR/lumen-agent.service" "$UNIT_FILE.tmp" && chmod 0644 "$UNIT_FILE.tmp" && mv -f "$UNIT_FILE.tmp" "$UNIT_FILE"; }; then
      die 1 "Couldn't write the lumen-agent service file." "Check the disk isn't read-only or full, then run the install command again."
    fi
    run_cmd systemctl daemon-reload || die 1 "systemd couldn't load the lumen-agent service." "Check it with: sudo systemctl status lumen-agent. Then run the install command again."
    UNIT_CHANGED=1
    ok "Wrote the lumen-agent service"
  fi

  if ! systemctl is-enabled --quiet lumen-agent 2>/dev/null || ! systemctl is-active --quiet lumen-agent 2>/dev/null; then
    run_cmd systemctl enable --now lumen-agent ||
      die 1 "The lumen-agent service didn't start." "Check it with: sudo systemctl status lumen-agent. Then run the install command again."
    ok "Started the lumen-agent service"
  elif [ "$BINARY_CHANGED" = 1 ] || [ "$UNIT_CHANGED" = 1 ] || [ "$ENV_CHANGED" = 1 ]; then
    run_cmd systemctl restart lumen-agent ||
      die 1 "The lumen-agent service didn't restart." "Check it with: sudo systemctl status lumen-agent. Then run the install command again."
    ok "Restarted the agent to pick up the changes"
  else
    already "The lumen-agent service is enabled and running"
  fi
}

# ---------------------------------------------------------------------------
# Step 8: wait for the server to come online.
# ---------------------------------------------------------------------------
step_wait() {
  step "Waiting for the server to come online"
  wait_rc_file="$TMP_DIR/wait.rc"
  echo 1 >"$wait_rc_file"
  {
    lumen-agent status --wait-online 90 2>&1
    echo "$?" >"$wait_rc_file"
  } | tr -d '\000-\010\013-\037\177' | while IFS= read -r wait_line; do
    printf '  %s\n' "$wait_line"
    log "agent: $wait_line"
  done
  wait_rc=$(cat "$wait_rc_file")
  elapsed=$(fmt_duration $(($(date +%s) - START_TIME)))
  if [ "$wait_rc" = 0 ]; then
    printf '\n  %sThis server is online. Go back to your browser.%s\n' "$C_BOLD" "$C_RESET"
    log "This server is online."
    say "Finished in $elapsed."
    return 0
  fi
  printf '\n  %s✘%s %s\n' "$C_RED" "$C_RESET" "This server didn't come online within 90 seconds." >&2
  log "error: the server didn't come online within 90 seconds"
  printf '    Last 20 lines of the agent log:\n\n' >&2
  journalctl -u lumen-agent --no-pager -n 20 2>&1 | tr -d '\000-\010\013-\037\177' | while IFS= read -r j_line; do
    printf '      %s\n' "$j_line" >&2
    log "journal: $j_line"
  done
  printf '\n    Fix the problem above, then run the install again (it skips finished steps):\n\n      %s\n' "$(reinstall_command)" >&2
  printf '\n    Ran for %s.\n' "$elapsed" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Main.
# ---------------------------------------------------------------------------
main() {
  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  parse_args "$@"
  resolve_config
  require_root
  init_log
  load_saved_settings

  printf '\n%sLumen agent installer%s · agent %s · %s\n' "$C_BOLD" "$C_RESET" "$AGENT_VERSION" "$CONTROL_PLANE"
  printf '  Log: %s\n' "$LOG_FILE"

  step_preflight
  step_docker
  step_firewall
  step_download
  step_install
  step_join
  step_service
  step_wait
}

main "$@"
