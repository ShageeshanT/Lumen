#!/usr/bin/env bash
# Starts a fresh "VM" for Phase 02 verification: a privileged systemd
# Ubuntu 24.04 container (host.Dockerfile) on the lumen-p2 network with the
# test CA at /root/lumen-test-ca.pem. /var/lib/docker and /var/lib/containerd
# are Docker volumes because overlayfs can't be stacked on the container's
# own overlay root (a test-environment detail; real VMs have ext4/xfs).
# Usage: start-host.sh <name> <env-dir> [platform]
set -euo pipefail

NAME="${1:?name}"
ENV_DIR="${2:?env dir}"
PLATFORM="${3:-linux/amd64}"
MOUNT="$ENV_DIR"
if command -v cygpath >/dev/null 2>&1; then
  MOUNT="$(cygpath -m "$ENV_DIR")"
fi
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker volume rm "$NAME-docker" "$NAME-containerd" >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" --hostname "$NAME" --platform "$PLATFORM" \
  --network lumen-p2 --privileged --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw --tmpfs /run --tmpfs /run/lock \
  -v "$NAME-docker:/var/lib/docker" -v "$NAME-containerd:/var/lib/containerd" \
  -v "$MOUNT/certs/ca.pem:/root/lumen-test-ca.pem:ro" \
  "lumen-p2-host:24.04-${PLATFORM##*/}" >/dev/null
for _ in $(seq 1 30); do
  state=$(docker exec "$NAME" systemctl is-system-running 2>/dev/null || true)
  case "$state" in running | degraded)
    echo "$NAME is up ($state), $(docker exec "$NAME" sh -c '. /etc/os-release; echo "$PRETTY_NAME $(uname -m)"')"
    exit 0
    ;;
  esac
  sleep 1
done
echo "$NAME did not boot" >&2
exit 1
