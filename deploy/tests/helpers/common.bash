# Shared setup for the installer bats suites.
# shellcheck shell=bash
# shellcheck disable=SC2154 # $output, $status and $lines are set by bats `run`.

HELPERS_DIR="$BATS_TEST_DIRNAME/helpers"
FIXTURES_DIR="$HELPERS_DIR/fixtures"
INSTALLER="$BATS_TEST_DIRNAME/../agent-install.sh"
UNINSTALLER="$BATS_TEST_DIRNAME/../agent-uninstall.sh"
CP="https://cp.test"
TOKEN="tok_Abc-123_xyz"

SHIMMED_COMMANDS="curl systemctl docker apt-get dnf ufw firewall-cmd iptables ip6tables
  iptables-save ip6tables-save netfilter-persistent debconf-set-selections timedatectl
  uname id df journalctl lumen-agent"

# Harmless system tools the scripts and shims may use for real. The scripts
# run with PATH="$SHIM_BIN:$SYSBIN" only, so a real docker, iptables or
# systemctl on the test machine can never be reached.
REAL_TOOLS="bash dash sh env cat sed awk head tail tr cut grep mkdir chmod cp mv rm ls
  wc od base64 sha256sum mktemp date openssl tar touch seq sort stat basename dirname
  cmp true false sleep"

# Run the installer under dash (Ubuntu's /bin/sh) when available.
TEST_SH=$(command -v dash || command -v sh)

build_sysbin() {
  export SYSBIN="$BATS_FILE_TMPDIR/sysbin"
  mkdir -p "$SYSBIN"
  local tool path
  for tool in $REAL_TOOLS; do
    if path=$(command -v "$tool"); then
      ln -sf "$path" "$SYSBIN/$tool"
    fi
  done
}

# make_release <dir> <keydir> [--legacy]: a fake agent binary for both
# architectures with its .sha256 and .minisig.
make_release() {
  local dir=$1 keydir=$2 legacy=${3:-}
  mkdir -p "$dir"
  local arch
  for arch in amd64 arm64; do
    local name="lumen-agent-linux-$arch"
    printf '#!/bin/sh\necho "lumen-agent 0.2.0 %s"\n' "$arch" >"$dir/$name"
    head -c 4096 /dev/urandom >>"$dir/$name"
    (cd "$dir" && sha256sum "$name" >"$name.sha256")
    if [ -n "$legacy" ]; then
      sh "$HELPERS_DIR/make-minisig.sh" sign "$keydir" "$dir/$name" --legacy
    else
      sh "$HELPERS_DIR/make-minisig.sh" sign "$keydir" "$dir/$name"
    fi
  done
}

# Build every release variant once per file.
build_releases() {
  local base=$BATS_FILE_TMPDIR
  build_sysbin
  RELEASE_PUBKEY=$(sh "$HELPERS_DIR/make-minisig.sh" keygen "$base/key")
  sh "$HELPERS_DIR/make-minisig.sh" keygen "$base/otherkey" >/dev/null
  printf '%s\n' "$RELEASE_PUBKEY" >"$base/pubkey"

  make_release "$base/release-good" "$base/key"
  make_release "$base/release-legacy" "$base/key" --legacy
  make_release "$base/release-otherkey" "$base/otherkey"

  local n="lumen-agent-linux-amd64"

  # Tampered: the binary changed after the checksum and signature were made.
  cp -r "$base/release-good" "$base/release-tampered"
  printf 'evil' >>"$base/release-tampered/$n"

  # Bad signature: binary changed and checksum recomputed, old signature kept.
  cp -r "$base/release-tampered" "$base/release-badsig"
  (cd "$base/release-badsig" && sha256sum "$n" >"$n.sha256")

  # Altered trusted comment: the global signature no longer matches.
  cp -r "$base/release-good" "$base/release-badcomment"
  sed -i '3s/.*/trusted comment: timestamp:0\tfile:evil/' "$base/release-badcomment/$n.minisig"
}

# Per-test sandbox: fake root, shim bin dir, shim state, default fixtures.
setup_sandbox() {
  export LUMEN_ROOT="$BATS_TEST_TMPDIR/root"
  export SHIM_STATE="$BATS_TEST_TMPDIR/state"
  export SHIM_BIN="$BATS_TEST_TMPDIR/bin"
  export SHIM_SCRIPT="$HELPERS_DIR/shim.bash"
  mkdir -p "$LUMEN_ROOT/etc/ssl/certs" "$LUMEN_ROOT/var/lib" "$LUMEN_ROOT/var/log" \
    "$LUMEN_ROOT/run/systemd/system" "$LUMEN_ROOT/usr/local/bin" "$SHIM_STATE" "$SHIM_BIN"
  : >"$LUMEN_ROOT/etc/ssl/certs/ca-certificates.crt"
  : >"$SHIM_STATE/calls.log"

  local cmd
  for cmd in $SHIMMED_COMMANDS; do
    printf '#!/bin/sh\nexec bash "%s" %s "$@"\n' "$SHIM_SCRIPT" "$cmd" >"$SHIM_BIN/$cmd"
    chmod +x "$SHIM_BIN/$cmd"
  done

  use_os ubuntu-24.04
  set_memory_kb 4027264
  echo "27.3.1" >"$SHIM_STATE/docker_version"

  export LUMEN_METADATA_URL="http://md.test"
  export LUMEN_GCP_METADATA_URL="http://gcp.test"
  export LUMEN_AGENT_VERSION="0.2.0"
  LUMEN_RELEASE_PUBKEY=$(cat "$BATS_FILE_TMPDIR/pubkey")
  export LUMEN_RELEASE_PUBKEY
  export SHIM_RELEASE_DIR="$BATS_FILE_TMPDIR/release-good"
  unset SHIM_UID SHIM_ARCH SHIM_DISK_KB SHIM_NTP SHIM_UFW SHIM_FIREWALLD SHIM_PROVIDER \
    SHIM_CARD_FAIL SHIM_JOIN_RC SHIM_CRED_VALID SHIM_WAIT_RC SHIM_IPTABLES_FIXTURE \
    SHIM_IP6TABLES_FIXTURE SHIM_POLICY SHIM_PROXY_CONTAINERS SHIM_PKG_RC
}

use_os() {
  export LUMEN_OS_RELEASE="$FIXTURES_DIR/os-release-$1"
}

set_memory_kb() {
  printf 'MemTotal:       %s kB\nMemFree:          100000 kB\n' "$1" >"$BATS_TEST_TMPDIR/meminfo"
  export LUMEN_MEMINFO="$BATS_TEST_TMPDIR/meminfo"
}

remove_shim() {
  rm -f "$SHIM_BIN/$1"
}

# run_installer [args...]: control plane and token are added unless
# NO_DEFAULT_ARGS=1.
run_installer() {
  if [ "${NO_DEFAULT_ARGS:-0}" = 1 ]; then
    run env PATH="$SHIM_BIN:$SYSBIN" "$TEST_SH" "$INSTALLER" "$@"
  else
    run env PATH="$SHIM_BIN:$SYSBIN" "$TEST_SH" "$INSTALLER" --control-plane "$CP" --token "$TOKEN" "$@"
  fi
}

run_uninstaller() {
  run env PATH="$SHIM_BIN:$SYSBIN" "$TEST_SH" "$UNINSTALLER" "$@"
}

calls() {
  cat "$SHIM_STATE/calls.log"
}

# assert_output_contains <text>
assert_contains() {
  if [[ "$output" != *"$1"* ]]; then
    printf 'expected output to contain: %s\n--- output ---\n%s\n' "$1" "$output" >&2
    return 1
  fi
}

refute_contains() {
  if [[ "$output" == *"$1"* ]]; then
    printf 'expected output NOT to contain: %s\n--- output ---\n%s\n' "$1" "$output" >&2
    return 1
  fi
}

assert_called() {
  if ! grep -qF -- "$1" "$SHIM_STATE/calls.log"; then
    printf 'expected a call matching: %s\n--- calls ---\n%s\n' "$1" "$(calls)" >&2
    return 1
  fi
}

refute_called() {
  if grep -qF -- "$1" "$SHIM_STATE/calls.log"; then
    printf 'expected NO call matching: %s\n--- calls ---\n%s\n' "$1" "$(calls)" >&2
    return 1
  fi
}

assert_status() {
  if [ "$status" -ne "$1" ]; then
    printf 'expected exit %s, got %s\n--- output ---\n%s\n' "$1" "$status" "$output" >&2
    return 1
  fi
}
