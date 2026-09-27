#!/usr/bin/env bash
# Test double for every external command the installer calls by name.
# Wrappers in $SHIM_BIN run: bash shim.bash <command-name> <args...>
#
# Every call is appended to $SHIM_STATE/calls.log as "<name> <args>".
# Behaviour is driven by environment variables and files in $SHIM_STATE:
#   SHIM_UID (id -u), SHIM_ARCH (uname -m), SHIM_DISK_KB (df), SHIM_NTP,
#   SHIM_UFW=active, SHIM_FIREWALLD=running, SHIM_PROVIDER, SHIM_CARD_FAIL,
#   SHIM_RELEASE_DIR (agent downloads), SHIM_JOIN_RC, SHIM_CRED_VALID,
#   SHIM_WAIT_RC, SHIM_PROXY_CONTAINERS,
#   $SHIM_STATE/docker_version (docker server version; absent = daemon down),
#   $SHIM_STATE/{iptables,ip6tables}.rules (seeded from SHIM_IPTABLES_FIXTURE /
#   SHIM_IP6TABLES_FIXTURE), $SHIM_STATE/ufw_rules, $SHIM_STATE/firewalld_ports,
#   $SHIM_STATE/{active,enabled}_<unit>.

set -u
name=$1
shift
state=${SHIM_STATE:?SHIM_STATE is not set}
printf '%s %s\n' "$name" "$*" >>"$state/calls.log"

real() {
  local p
  p=$(PATH=${PATH#"$SHIM_BIN:"} command -v "$name") || exit 127
  exec "$p" "$@"
}

make_wrapper() {
  printf '#!/bin/sh\nexec bash "%s" %s "$@"\n' "$SHIM_SCRIPT" "$1" >"$SHIM_BIN/$1"
  chmod +x "$SHIM_BIN/$1"
}

unit_name() {
  local u=$1
  printf '%s' "${u%.service}"
}

case $name in
  id)
    if [ "${1:-}" = -u ]; then
      echo "${SHIM_UID:-0}"
      exit 0
    fi
    real "$@"
    ;;

  uname)
    if [ "${1:-}" = -m ]; then
      echo "${SHIM_ARCH:-x86_64}"
      exit 0
    fi
    real "$@"
    ;;

  df)
    echo "Filesystem     1024-blocks    Used Available Capacity Mounted on"
    echo "/dev/sda1        104857600 1000000 ${SHIM_DISK_KB:-52428800}      2% /"
    ;;

  timedatectl)
    echo "${SHIM_NTP:-yes}"
    ;;

  journalctl)
    for i in $(seq 1 20); do echo "lumen-agent[42]: agent log line $i"; done
    ;;

  docker)
    case ${1:-} in
      version)
        if [ -f "$state/docker_version" ]; then
          cat "$state/docker_version"
        else
          echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock." >&2
          exit 1
        fi
        ;;
      ps)
        for id in ${SHIM_PROXY_CONTAINERS:-}; do echo "$id"; done
        ;;
      rm) ;;
    esac
    ;;

  systemctl)
    cmd=${1:-}
    shift || true
    case $cmd in
      is-active | is-enabled)
        [ "${1:-}" = --quiet ] && shift
        u=$(unit_name "$1")
        if [ "$cmd" = is-active ]; then f="$state/active_$u"; else f="$state/enabled_$u"; fi
        [ -f "$f" ]
        exit
        ;;
      enable)
        now=0
        if [ "${1:-}" = --now ]; then now=1; shift; fi
        for u in "$@"; do
          u=$(unit_name "$u")
          touch "$state/enabled_$u"
          [ "$now" = 1 ] && touch "$state/active_$u"
        done
        ;;
      disable)
        now=0
        if [ "${1:-}" = --now ]; then now=1; shift; fi
        for u in "$@"; do
          u=$(unit_name "$u")
          rm -f "$state/enabled_$u"
          [ "$now" = 1 ] && rm -f "$state/active_$u"
        done
        ;;
      start | restart)
        for u in "$@"; do touch "$state/active_$(unit_name "$u")"; done
        ;;
      stop)
        for u in "$@"; do rm -f "$state/active_$(unit_name "$u")"; done
        ;;
      *) ;;
    esac
    exit 0
    ;;

  apt-get | dnf)
    case " $* " in
      *" install "*)
        case " $* " in
          *" docker-ce "*)
            echo "${SHIM_INSTALLED_DOCKER:-27.3.1}" >"$state/docker_version"
            make_wrapper docker
            ;;
        esac
        case " $* " in
          *" iptables-persistent "*) make_wrapper netfilter-persistent ;;
        esac
        ;;
    esac
    exit "${SHIM_PKG_RC:-0}"
    ;;

  debconf-set-selections)
    cat >>"$state/debconf"
    ;;

  ufw)
    case ${1:-} in
      status)
        if [ "${SHIM_UFW:-inactive}" = active ]; then
          echo "Status: active"
          echo
          echo "To                         Action      From"
          echo "--                         ------      ----"
          [ -f "$state/ufw_rules" ] && cat "$state/ufw_rules"
        else
          echo "Status: inactive"
        fi
        ;;
      allow)
        printf '%-26s ALLOW       Anywhere\n' "$2" >>"$state/ufw_rules"
        echo "Rule added"
        ;;
    esac
    ;;

  firewall-cmd)
    case ${1:-} in
      --state)
        if [ "${SHIM_FIREWALLD:-}" = running ]; then echo running; exit 0; fi
        echo "not running"
        exit 252
        ;;
      --permanent)
        case ${2:-} in
          --query-port=*)
            grep -qx "${2#*=}" "$state/firewalld_ports" 2>/dev/null && { echo yes; exit 0; }
            echo no
            exit 1
            ;;
          --add-port=*)
            echo "${2#*=}" >>"$state/firewalld_ports"
            echo success
            ;;
        esac
        ;;
      --reload) echo success ;;
    esac
    ;;

  iptables | ip6tables)
    rules="$state/$name.rules"
    if [ ! -f "$rules" ]; then
      if [ "$name" = iptables ]; then fixture=${SHIM_IPTABLES_FIXTURE:-}; else fixture=${SHIM_IP6TABLES_FIXTURE:-}; fi
      if [ -n "$fixture" ]; then cp "$fixture" "$rules"; else : >"$rules"; fi
    fi
    case ${1:-} in
      -S)
        echo "-P INPUT ${SHIM_POLICY:-ACCEPT}"
        grep -- "^-A INPUT " "$rules" || true
        ;;
      -I)
        chain=$2
        pos=$3
        shift 3
        new="-A $chain $*"
        awk -v pos="$pos" -v r="$new" '
          { n++; if (n == pos) print r; print }
          END { if (n < pos) print r }' "$rules" >"$rules.tmp" && mv "$rules.tmp" "$rules"
        ;;
      -A)
        chain=$2
        shift 2
        echo "-A $chain $*" >>"$rules"
        ;;
    esac
    ;;

  iptables-save | ip6tables-save)
    cat "$state/${name%-save}.rules" 2>/dev/null || true
    ;;

  netfilter-persistent) ;;

  curl)
    out=""
    method=GET
    url=""
    headers=()
    while [ $# -gt 0 ]; do
      case $1 in
        -o | --output) out=$2; shift 2 ;;
        -H | --header) headers+=("$2"); shift 2 ;;
        -X | --request) method=$2; shift 2 ;;
        -m | --max-time | --connect-timeout | --retry | --proto | --proto-redir | --cacert | --noproxy) shift 2 ;;
        -*) shift ;;
        *) url=$1; shift ;;
      esac
    done
    has_header() {
      local h
      for h in "${headers[@]}"; do [ "$h" = "$1" ] && return 0; done
      return 1
    }
    emit() {
      if [ -n "$out" ]; then cat >"$out"; else cat; fi
    }
    md=${LUMEN_METADATA_URL:-http://169.254.169.254}
    gcp=${LUMEN_GCP_METADATA_URL:-http://metadata.google.internal}
    p=${SHIM_PROVIDER:-other}
    case $url in
      "$md/opc/v2/instance/")
        [ "$p" = oracle ] && has_header "Authorization: Bearer Oracle" && { echo '{"id":"ocid1.instance"}' | emit; exit 0; }
        exit 22 ;;
      "$md/latest/api/token")
        [ "$p" = aws ] && [ "$method" = PUT ] && has_header "X-aws-ec2-metadata-token-ttl-seconds: 60" && { printf 'AQAEAtoken==' | emit; exit 0; }
        exit 22 ;;
      "$md/latest/meta-data/instance-id")
        [ "$p" = aws ] && has_header "X-aws-ec2-metadata-token: AQAEAtoken==" && { echo i-0123456789 | emit; exit 0; }
        exit 22 ;;
      "$gcp/computeMetadata/v1/instance/id")
        [ "$p" = gcp ] && has_header "Metadata-Flavor: Google" && { echo 1234567890 | emit; exit 0; }
        exit 22 ;;
      "$md/metadata/instance?api-version=2021-02-01")
        [ "$p" = azure ] && has_header "Metadata: true" && { echo '{"compute":{}}' | emit; exit 0; }
        exit 22 ;;
      "$md/hetzner/v1/metadata")
        [ "$p" = hetzner ] && { echo "instance-id: 42" | emit; exit 0; }
        exit 22 ;;
      "$md/metadata/v1/id")
        [ "$p" = digitalocean ] && { echo 987654 | emit; exit 0; }
        exit 22 ;;
      */install/fix/PORT_BLOCKED/*/cloud)
        [ -n "${SHIM_CARD_FAIL:-}" ] && exit 22
        prov=${url%/cloud}
        prov=${prov##*/}
        printf 'CARD[%s] Open inbound TCP 80 and 443.\nSecond line of the card.\n' "$prov" | emit
        ;;
      */agent/download/*)
        f=${url##*/}
        [ -f "${SHIM_RELEASE_DIR:-/nonexistent}/$f" ] || exit 22
        emit <"$SHIM_RELEASE_DIR/$f"
        ;;
      https://download.docker.com/*)
        echo "docker repo file" | emit
        ;;
      *) exit 22 ;;
    esac
    ;;

  lumen-agent)
    agent_state="${LUMEN_ROOT:-}/var/lib/lumen/agent"
    case ${1:-} in
      status)
        case ${2:-} in
          --check-credential)
            if [ -f "$agent_state/credential" ] && [ "${SHIM_CRED_VALID:-1}" = 1 ]; then
              echo "Already joined as web-1 (srv_0123)"
              exit 0
            fi
            echo "no valid credential" >&2
            exit 1
            ;;
          --wait-online)
            echo "✔ Connected"
            if [ "${SHIM_WAIT_RC:-0}" = 0 ]; then
              echo "✔ Docker ready"
              echo "✔ Proxy running"
              exit 0
            fi
            echo "Still waiting for Docker…"
            exit 1
            ;;
        esac
        ;;
      join)
        rc=${SHIM_JOIN_RC:-0}
        mkdir -p "$agent_state"
        echo '{"public_key":"test"}' >"$agent_state/identity.json"
        if [ "$rc" = 0 ]; then
          echo "credential" >"$agent_state/credential"
          echo "Joined as web-1"
        else
          echo "join failed with code $rc"
        fi
        exit "$rc"
        ;;
    esac
    ;;

  *)
    echo "shim: unknown command $name" >&2
    exit 127
    ;;
esac
