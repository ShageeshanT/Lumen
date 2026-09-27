#!/usr/bin/env bats
# Tests for deploy/agent-install.sh and deploy/agent-uninstall.sh.
# Every external command is replaced by helpers/shim.bash through PATH, and
# every written path lives under a per-test LUMEN_ROOT.
#
#   cd deploy/tests && bats install.bats

load helpers/common

setup_file() {
  build_releases
}

setup() {
  setup_sandbox
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

@test "preflight: not root prints the exact sudo command and exits 1" {
  export SHIM_UID=1000
  run_installer
  assert_status 1
  assert_contains "needs root"
  assert_contains "curl -fsSL https://cp.test/install/agent.sh | sudo sh -s -- --control-plane https://cp.test --token $TOKEN"
  [ ! -e "$LUMEN_ROOT/var/log/lumen-agent-install.log" ]
}

@test "preflight: unsupported CPU architecture exits 2" {
  export SHIM_ARCH=i686
  run_installer
  assert_status 2
  assert_contains "CPU architecture (i686) isn't supported"
}

@test "preflight: arm64 is detected and downloads the arm64 build" {
  export SHIM_ARCH=aarch64
  run_installer
  assert_status 0
  assert_called "/agent/download/0.2.0/lumen-agent-linux-arm64"
  cmp "$LUMEN_ROOT/usr/local/bin/lumen-agent" "$SHIM_RELEASE_DIR/lumen-agent-linux-arm64"
}

@test "preflight: less than 1 GB of RAM exits 2" {
  set_memory_kb 512000
  run_installer
  assert_status 2
  assert_contains "This server has 500 MB of memory. Lumen needs at least 1 GB."
  assert_contains "Resize the server"
}

@test "preflight: a 1 GB VM with kernel-reserved memory (950 MiB) passes" {
  set_memory_kb 972800
  run_installer
  assert_status 0
}

@test "preflight: less than 2 GB free disk exits 2 with the DISK_FULL wording" {
  export SHIM_DISK_KB=1000000
  run_installer
  assert_status 2
  assert_contains "Your server is almost out of disk space"
  assert_contains "Lumen needs at least 2 GB"
  refute_called "apt-get"
}

@test "preflight: less than 10 GB free disk warns and continues" {
  export SHIM_DISK_KB=5242880
  run_installer
  assert_status 0
  assert_contains "Only 5.0 GB is free on /var/lib"
}

@test "preflight: untested OS without --force exits 2" {
  use_os arch
  run_installer
  assert_status 2
  assert_contains "Lumen hasn't been tested on Arch Linux."
  assert_contains "add --force"
}

@test "preflight: untested OS with --force warns and continues" {
  use_os arch
  run_installer --force
  assert_status 0
  assert_contains "Continuing because you passed --force"
  assert_contains "This server is online. Go back to your browser."
}

@test "preflight: Debian 12 is supported" {
  use_os debian-12
  run_installer
  assert_status 0
  assert_contains "Debian GNU/Linux 12 (bookworm) is supported"
}

@test "preflight: Rocky 9 is supported as Tier 2" {
  use_os rocky-9
  run_installer
  assert_status 0
  assert_contains "Rocky Linux 9.4 (Blue Onyx) is supported (RHEL family, Tier 2)"
}

@test "preflight: a non-https control plane is refused" {
  NO_DEFAULT_ARGS=1 run_installer --control-plane http://cp.test --token "$TOKEN"
  assert_status 2
  assert_contains "Lumen only installs from a control plane on https://"
  refute_called "curl"
}

@test "preflight: http on localhost is allowed for development" {
  NO_DEFAULT_ARGS=1 run_installer --control-plane http://127.0.0.1:8080 --token "$TOKEN"
  assert_status 0
  assert_called "http://127.0.0.1:8080/agent/download/0.2.0/lumen-agent-linux-amd64"
}

@test "preflight: unsubstituted placeholders exit 2 with a clear message" {
  NO_DEFAULT_ARGS=1 run_installer --token "$TOKEN"
  assert_status 2
  assert_contains "doesn't know your Lumen address"

  unset LUMEN_AGENT_VERSION
  run_installer
  assert_status 2
  assert_contains "doesn't say which agent version to install"

  run_installer --version 0.2.0
  assert_status 0

  unset LUMEN_RELEASE_PUBKEY
  run_installer --version 0.2.0
  assert_status 2
  assert_contains "no release signing key"
}

@test "preflight: no systemd exits 2" {
  rm -rf "$LUMEN_ROOT/run/systemd"
  run_installer
  assert_status 2
  assert_contains "isn't running systemd"
}

@test "preflight: unsynced clock warns with the fix" {
  export SHIM_NTP=no
  run_installer
  assert_status 0
  assert_contains "sudo timedatectl set-ntp true"
}

@test "preflight: unknown options and bad tokens exit 2" {
  run_installer --frobnicate
  assert_status 2
  assert_contains "Unknown option: --frobnicate"

  NO_DEFAULT_ARGS=1 run_installer --control-plane "$CP" --token 'bad token;rm'
  assert_status 2
  assert_contains "join token has characters"
}

@test "--help prints usage and exits 0" {
  NO_DEFAULT_ARGS=1 run_installer --help
  assert_status 0
  assert_contains "--ca-file <path>"
  assert_contains "--skip-docker-install"
}

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

@test "docker: installs from the official apt repo when missing" {
  remove_shim docker
  rm -f "$SHIM_STATE/docker_version"
  run_installer
  assert_status 0
  assert_contains "Installing Docker (about a minute)…"
  assert_called "apt-get -o DPkg::Lock::Timeout=300 install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin"
  assert_called "systemctl enable --now docker"
  assert_called "curl -fsSL --proto =https --connect-timeout 10 --retry 3 -o"
  [ "$(cat "$LUMEN_ROOT/etc/apt/sources.list.d/docker.list")" = \
    "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" ]
  [ "$(stat -c %a "$LUMEN_ROOT/etc/apt/keyrings/docker.asc")" = 644 ]
  assert_contains "Docker 27.3.1 is installed and running"
}

@test "docker: an old Docker is upgraded" {
  echo "20.10.24" >"$SHIM_STATE/docker_version"
  run_installer
  assert_status 0
  assert_contains "Docker 20.10.24 is older than 24"
  assert_contains "Upgrading Docker 20.10.24 to the current release"
  assert_called "install -y -q docker-ce"
}

@test "docker: RHEL family uses the dnf repo" {
  use_os rocky-9
  remove_shim docker
  rm -f "$SHIM_STATE/docker_version"
  run_installer
  assert_status 0
  assert_called "dnf install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin"
  assert_called "https://download.docker.com/linux/rhel/docker-ce.repo"
  [ -f "$LUMEN_ROOT/etc/yum.repos.d/docker-ce.repo" ]
}

@test "docker: --skip-docker-install without a usable Docker exits 1" {
  rm -f "$SHIM_STATE/docker_version"
  run_installer --skip-docker-install
  assert_status 1
  assert_contains "--skip-docker-install was given"
  refute_called "docker-ce"
}

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------

@test "firewall: Oracle iptables REJECT gets ACCEPT rules inserted at position 5" {
  export SHIM_IPTABLES_FIXTURE="$FIXTURES_DIR/iptables-oracle.rules"
  run_installer
  assert_status 0
  assert_contains "Opening ports 80 and 443 in the OS firewall"
  assert_called "iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT"
  assert_called "iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT"
  assert_called "iptables -I INPUT 5 -m state --state NEW -p udp --dport 51820 -j ACCEPT"
  [ "$(grep -c -- ' -I INPUT' "$SHIM_STATE/calls.log")" = 3 ]
  assert_called "netfilter-persistent save"
  refute_called "ip6tables -I"

  run cat "$SHIM_STATE/iptables.rules"
  [ "${lines[3]}" = "-A INPUT -p tcp -m state --state NEW -m tcp --dport 22 -j ACCEPT" ]
  [ "${lines[4]}" = "-A INPUT -m state --state NEW -p tcp --dport 80 -j ACCEPT" ]
  [ "${lines[5]}" = "-A INPUT -m state --state NEW -p tcp --dport 443 -j ACCEPT" ]
  [ "${lines[6]}" = "-A INPUT -m state --state NEW -p udp --dport 51820 -j ACCEPT" ]
  [ "${lines[7]}" = "-A INPUT -j REJECT --reject-with icmp-host-prohibited" ]
}

@test "firewall: the insert position follows the REJECT rule, not a fixed line" {
  head -n 2 "$FIXTURES_DIR/iptables-oracle.rules" >"$BATS_TEST_TMPDIR/short.rules"
  echo "-A INPUT -j DROP" >>"$BATS_TEST_TMPDIR/short.rules"
  export SHIM_IPTABLES_FIXTURE="$BATS_TEST_TMPDIR/short.rules"
  export SHIM_IP6TABLES_FIXTURE="$BATS_TEST_TMPDIR/short.rules"
  run_installer
  assert_status 0
  assert_called "iptables -I INPUT 3 -m state --state NEW -p tcp --dport 80 -j ACCEPT"
  assert_called "ip6tables -I INPUT 3 -m state --state NEW -p tcp --dport 80 -j ACCEPT"
}

@test "firewall: installs iptables-persistent non-interactively when missing" {
  export SHIM_IPTABLES_FIXTURE="$FIXTURES_DIR/iptables-oracle.rules"
  remove_shim netfilter-persistent
  run_installer
  assert_status 0
  grep -q "iptables-persistent iptables-persistent/autosave_v4 boolean true" "$SHIM_STATE/debconf"
  assert_called "apt-get -o DPkg::Lock::Timeout=300 install -y -q iptables-persistent"
  assert_called "netfilter-persistent save"
}

@test "firewall: no blocking rule means nothing to open" {
  run_installer
  assert_status 0
  assert_contains "Ports 80, 443 and 51820/udp are open in the OS firewall (already done)"
  refute_called "iptables -I"
  refute_called "netfilter-persistent"
}

@test "firewall: active ufw gets only the missing rules" {
  export SHIM_UFW=active
  printf '%-26s ALLOW       Anywhere\n' 80/tcp >"$SHIM_STATE/ufw_rules"
  run_installer
  assert_status 0
  assert_contains "Opening ports 80 and 443 in the OS firewall (ufw)"
  refute_called "ufw allow 80/tcp"
  assert_called "ufw allow 443/tcp"
  assert_called "ufw allow 51820/udp"
  refute_called "iptables -S"
}

@test "firewall: running firewalld gets permanent ports and a reload" {
  export SHIM_FIREWALLD=running
  run_installer
  assert_status 0
  assert_called "firewall-cmd --permanent --add-port=80/tcp"
  assert_called "firewall-cmd --permanent --add-port=443/tcp"
  assert_called "firewall-cmd --permanent --add-port=51820/udp"
  assert_called "firewall-cmd --reload"
  refute_called "iptables -S"

  : >"$SHIM_STATE/calls.log"
  run_installer
  assert_status 0
  assert_contains "open in firewalld (already done)"
  refute_called "--add-port"
  refute_called "firewall-cmd --reload"
}

# ---------------------------------------------------------------------------
# Provider detection and the cloud firewall card
# ---------------------------------------------------------------------------

provider_case() {
  export SHIM_PROVIDER=$1
  run_installer
  assert_status 0
  assert_contains "$2"
  assert_called "https://cp.test/install/fix/PORT_BLOCKED/$1/cloud"
  assert_contains "CARD[$1] Open inbound TCP 80 and 443."
}

@test "provider: oracle" {
  provider_case oracle "Detected provider: Oracle Cloud"
  assert_called "-H Authorization: Bearer Oracle http://md.test/opc/v2/instance/"
}

@test "provider: aws (IMDSv2 token then instance-id)" {
  provider_case aws "Detected provider: AWS"
  assert_called "-X PUT -H X-aws-ec2-metadata-token-ttl-seconds: 60 http://md.test/latest/api/token"
  assert_called "-H X-aws-ec2-metadata-token: AQAEAtoken== http://md.test/latest/meta-data/instance-id"
}

@test "provider: gcp" {
  provider_case gcp "Detected provider: Google Cloud"
  assert_called "-H Metadata-Flavor: Google http://gcp.test/computeMetadata/v1/instance/id"
}

@test "provider: azure" {
  provider_case azure "Detected provider: Azure"
  assert_called "-H Metadata: true http://md.test/metadata/instance?api-version=2021-02-01"
}

@test "provider: hetzner" {
  provider_case hetzner "Detected provider: Hetzner"
}

@test "provider: digitalocean" {
  provider_case digitalocean "Detected provider: DigitalOcean"
}

@test "provider: other, and every probe is bounded to 2 seconds" {
  provider_case other "No cloud provider detected"
  # Six probe URLs (AWS counts twice only when a token comes back).
  [ "$(grep -c -- '^curl -fsS -m 2 --noproxy \* ' "$SHIM_STATE/calls.log")" = 6 ]
}

@test "provider: probes stop at the first hit (oracle before aws)" {
  export SHIM_PROVIDER=oracle
  run_installer
  assert_status 0
  refute_called "latest/api/token"
}

@test "provider: a failed card fetch prints the generic instruction" {
  export SHIM_CARD_FAIL=1
  run_installer
  assert_status 0
  assert_contains "Open inbound TCP 80 and 443 in your provider's firewall"
}

# ---------------------------------------------------------------------------
# Download and verification
# ---------------------------------------------------------------------------

@test "verify: a good prehashed (ED) signature installs the agent" {
  run_installer
  assert_status 0
  assert_contains "verified its checksum and signature"
  cmp "$LUMEN_ROOT/usr/local/bin/lumen-agent" "$SHIM_RELEASE_DIR/lumen-agent-linux-amd64"
  [ "$(stat -c %a "$LUMEN_ROOT/usr/local/bin/lumen-agent")" = 755 ]
  grep -q "minisign signature verified (algorithm ED" "$LUMEN_ROOT/var/log/lumen-agent-install.log"
}

@test "verify: a legacy (Ed) signature is accepted" {
  export SHIM_RELEASE_DIR="$BATS_FILE_TMPDIR/release-legacy"
  run_installer
  assert_status 0
  grep -q "minisign signature verified (algorithm Ed," "$LUMEN_ROOT/var/log/lumen-agent-install.log"
}

@test "verify: a signature made by the real minisign tool is accepted" {
  if ! command -v minisign >/dev/null 2>&1; then
    skip "minisign is not installed"
  fi
  local dir="$BATS_TEST_TMPDIR/release-minisign"
  mkdir -p "$dir"
  minisign -G -W -p "$dir/key.pub" -s "$dir/key.sec" >/dev/null
  cp "$BATS_FILE_TMPDIR/release-good/lumen-agent-linux-amd64" "$dir/"
  (cd "$dir" && sha256sum lumen-agent-linux-amd64 >lumen-agent-linux-amd64.sha256)
  minisign -S -W -s "$dir/key.sec" -m "$dir/lumen-agent-linux-amd64" -t "lumen-agent 0.2.0" >/dev/null
  LUMEN_RELEASE_PUBKEY=$(sed -n 2p "$dir/key.pub")
  export LUMEN_RELEASE_PUBKEY SHIM_RELEASE_DIR="$dir"
  run_installer
  assert_status 0
  cmp "$LUMEN_ROOT/usr/local/bin/lumen-agent" "$dir/lumen-agent-linux-amd64"
}

@test "verify: a tampered binary (checksum mismatch) exits 3 and installs nothing" {
  export SHIM_RELEASE_DIR="$BATS_FILE_TMPDIR/release-tampered"
  run_installer
  assert_status 3
  assert_contains "The downloaded agent failed verification, so nothing was installed."
  assert_contains "SHA-256 checksum doesn't match"
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent" ]
  refute_called "lumen-agent join"
}

@test "verify: a bad signature exits 3" {
  export SHIM_RELEASE_DIR="$BATS_FILE_TMPDIR/release-badsig"
  run_installer
  assert_status 3
  assert_contains "The signature doesn't match the file."
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent" ]
}

@test "verify: a signature from another key exits 3" {
  export SHIM_RELEASE_DIR="$BATS_FILE_TMPDIR/release-otherkey"
  run_installer
  assert_status 3
  assert_contains "signed with a different key"
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent" ]
}

@test "verify: an altered trusted comment exits 3" {
  export SHIM_RELEASE_DIR="$BATS_FILE_TMPDIR/release-badcomment"
  run_installer
  assert_status 3
  assert_contains "trusted comment was altered"
}

@test "verify: a malformed checksum file exits 3" {
  local dir="$BATS_TEST_TMPDIR/release-badsha"
  cp -r "$BATS_FILE_TMPDIR/release-good" "$dir"
  echo "deadbeef  ../../etc/passwd" >"$dir/lumen-agent-linux-amd64.sha256"
  export SHIM_RELEASE_DIR="$dir"
  run_installer
  assert_status 3
  assert_contains "checksum file is malformed"
}

@test "verify: an unreachable download exits 5" {
  export SHIM_RELEASE_DIR="$BATS_TEST_TMPDIR/does-not-exist"
  run_installer
  assert_status 5
  assert_contains "Couldn't download the agent checksum from https://cp.test."
}

# ---------------------------------------------------------------------------
# Install, join, service, wait
# ---------------------------------------------------------------------------

@test "install: upgrades keep the previous binary as lumen-agent.prev" {
  printf 'old agent\n' >"$LUMEN_ROOT/usr/local/bin/lumen-agent"
  run_installer
  assert_status 0
  [ "$(cat "$LUMEN_ROOT/usr/local/bin/lumen-agent.prev")" = "old agent" ]
  cmp "$LUMEN_ROOT/usr/local/bin/lumen-agent" "$SHIM_RELEASE_DIR/lumen-agent-linux-amd64"
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent.new" ]
}

@test "install: agent.env, directories and permissions" {
  printf -- '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n' >"$BATS_TEST_TMPDIR/ca.pem"
  run_installer --ca-file "$BATS_TEST_TMPDIR/ca.pem" --public-ip 203.0.113.10
  assert_status 0
  [ "$(stat -c %a "$LUMEN_ROOT/var/lib/lumen/agent")" = 700 ]
  [ "$(stat -c %a "$LUMEN_ROOT/etc/lumen/agent.env")" = 600 ]
  [ "$(stat -c %a "$LUMEN_ROOT/etc/lumen/ca.pem")" = 644 ]
  cmp "$BATS_TEST_TMPDIR/ca.pem" "$LUMEN_ROOT/etc/lumen/ca.pem"
  grep -qx "LUMEN_CONTROL_PLANE=https://cp.test" "$LUMEN_ROOT/etc/lumen/agent.env"
  grep -qx "LUMEN_CA_FILE=/etc/lumen/ca.pem" "$LUMEN_ROOT/etc/lumen/agent.env"
  grep -qx "LUMEN_PUBLIC_IP=203.0.113.10" "$LUMEN_ROOT/etc/lumen/agent.env"
  assert_called "lumen-agent join --control-plane https://cp.test --token $TOKEN --ca-file $LUMEN_ROOT/etc/lumen/ca.pem"
  assert_called "--cacert $BATS_TEST_TMPDIR/ca.pem"

  # A later run without the flags keeps the saved CA and public IP.
  run_installer
  assert_status 0
  grep -qx "LUMEN_CA_FILE=/etc/lumen/ca.pem" "$LUMEN_ROOT/etc/lumen/agent.env"
  grep -qx "LUMEN_PUBLIC_IP=203.0.113.10" "$LUMEN_ROOT/etc/lumen/agent.env"
  assert_contains "Agent files and settings are in place (already done)"
}

@test "join: skipped when the server already joined" {
  mkdir -p "$LUMEN_ROOT/var/lib/lumen/agent"
  echo cred >"$LUMEN_ROOT/var/lib/lumen/agent/credential"
  NO_DEFAULT_ARGS=1 run_installer --control-plane "$CP"
  assert_status 0
  assert_contains "Already joined as web-1 (srv_0123)"
  refute_called "lumen-agent join"
  assert_called "lumen-agent status --check-credential"
}

@test "join: an expired or used token exits 4 with the fix" {
  export SHIM_JOIN_RC=3
  run_installer
  assert_status 4
  assert_contains "This join command has expired or was already used."
  assert_contains "Create a new one in Lumen: Servers → Add server."
  refute_called "systemctl enable --now lumen-agent"
}

@test "join: an interrupted earlier join says the token was probably used" {
  mkdir -p "$LUMEN_ROOT/var/lib/lumen/agent"
  echo '{}' >"$LUMEN_ROOT/var/lib/lumen/agent/identity.json"
  export SHIM_JOIN_RC=3
  run_installer
  assert_status 4
  assert_contains "stopped partway through joining, so this join command was probably already used"
}

@test "join: no token and not joined exits 2 asking for a fresh command" {
  NO_DEFAULT_ARGS=1 run_installer --control-plane "$CP"
  assert_status 2
  assert_contains "hasn't joined Lumen yet"
  assert_contains "Servers -> Add server"
}

@test "join: an unreachable control plane exits 5" {
  export SHIM_JOIN_RC=4
  run_installer
  assert_status 5
  assert_contains "can't reach Lumen at https://cp.test"
}

@test "join: a revoked credential re-joins with the new token" {
  mkdir -p "$LUMEN_ROOT/var/lib/lumen/agent"
  echo cred >"$LUMEN_ROOT/var/lib/lumen/agent/credential"
  export SHIM_CRED_VALID=0
  run_installer
  assert_status 0
  assert_contains "The saved credential is no longer valid"
  assert_called "lumen-agent join"
}

@test "service: the unit file matches the spec and is enabled" {
  run_installer
  assert_status 0
  expected=$(cat <<'EOF'
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
)
  [ "$(cat "$LUMEN_ROOT/etc/systemd/system/lumen-agent.service")" = "$expected" ]
  [ "$(stat -c %a "$LUMEN_ROOT/etc/systemd/system/lumen-agent.service")" = 644 ]
  assert_called "systemctl daemon-reload"
  assert_called "systemctl enable --now lumen-agent"
}

@test "wait: online prints the checklist, the browser line and the elapsed time" {
  run_installer
  assert_status 0
  assert_contains "✔ Connected"
  assert_contains "✔ Docker ready"
  assert_contains "✔ Proxy running"
  assert_contains "This server is online. Go back to your browser."
  [[ "$output" =~ Finished\ in\ [0-9]+s\. ]]
}

@test "wait: a timeout prints the agent log and the reinstall command" {
  export SHIM_WAIT_RC=1
  run_installer
  assert_status 1
  assert_contains "This server didn't come online within 90 seconds."
  assert_contains "agent log line 20"
  assert_called "journalctl -u lumen-agent --no-pager -n 20"
  assert_contains "curl -fsSL https://cp.test/install/agent.sh | sudo sh -s -- --control-plane https://cp.test"
  refute_contains "$TOKEN"
}

@test "log: timestamped, appended, and never contains the join token" {
  run_installer
  assert_status 0
  log="$LUMEN_ROOT/var/log/lumen-agent-install.log"
  grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z == step 1/8: Checking your server' "$log"
  grep -q -- "--token <redacted>" "$log"
  run grep -c "$TOKEN" "$log"
  [ "$output" = 0 ]
  [ "$(stat -c %a "$log")" = 600 ]
  first=$(wc -l <"$log")
  run_installer
  [ "$(wc -l <"$log")" -gt "$first" ]
}

# ---------------------------------------------------------------------------
# Idempotency: a second run changes nothing
# ---------------------------------------------------------------------------

@test "idempotency: a second run reports already done for every step and mutates nothing" {
  remove_shim docker
  rm -f "$SHIM_STATE/docker_version"
  export SHIM_IPTABLES_FIXTURE="$FIXTURES_DIR/iptables-oracle.rules"
  export SHIM_PROVIDER=oracle
  run_installer
  assert_status 0
  assert_called "apt-get -o DPkg::Lock::Timeout=300 install -y -q docker-ce"
  assert_called "iptables -I INPUT 5"
  assert_called "lumen-agent join"

  : >"$SHIM_STATE/calls.log"
  run_installer
  assert_status 0

  # Steps 1-7 each report "already done"; step 8 reports online.
  for n in 1 2 3 4 5 6 7; do
    section=$(printf '%s\n' "$output" | awk -v s="[$n/8]" '
      index($0, s) == 1 { on = 1; next }
      /^\[[0-9]\/8\]/ { on = 0 }
      on')
    if [[ "$section" != *"(already done)"* ]]; then
      printf 'step %s did not report already done:\n%s\n--- full output ---\n%s\n' "$n" "$section" "$output" >&2
      false
    fi
  done
  assert_contains "curl, tar, openssl and CA certificates are installed (already done)"
  assert_contains "Docker 27.3.1 is running (already done)"
  assert_contains "Ports 80, 443 and 51820/udp are open in the OS firewall (already done)"
  assert_contains "Lumen agent 0.2.0 (amd64) is installed and matches the release (already done)"
  assert_contains "Agent files and settings are in place (already done)"
  assert_contains "Already joined as web-1 (srv_0123) (already done)"
  assert_contains "The lumen-agent service is enabled and running (already done)"
  assert_contains "This server is online. Go back to your browser."

  refute_called "apt-get"
  refute_called "dnf"
  refute_called "iptables -I"
  refute_called "iptables -A"
  refute_called "ufw allow"
  refute_called "netfilter-persistent"
  refute_called "systemctl daemon-reload"
  refute_called "systemctl enable"
  refute_called "systemctl restart"
  refute_called "lumen-agent join"
  refute_called "lumen-agent-linux-amd64.minisig"
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent.prev" ]
  # Only the checksum is fetched; the binary itself is not downloaded again.
  run grep -c -E '/agent/download/0\.2\.0/lumen-agent-linux-amd64$' "$SHIM_STATE/calls.log"
  [ "$output" = 0 ]
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------

@test "uninstall: removes the service, proxy, binaries, settings and data; second run is a no-op" {
  run_installer
  assert_status 0
  touch "$LUMEN_ROOT/usr/local/bin/lumen-agent.prev"
  export SHIM_PROXY_CONTAINERS="c0ffee"

  run_uninstaller --yes
  assert_status 0
  assert_called "systemctl disable --now lumen-agent"
  assert_called "systemctl daemon-reload"
  assert_called "docker ps -aq --filter label=lumen.role=proxy"
  assert_called "docker rm -f c0ffee"
  [ ! -e "$LUMEN_ROOT/etc/systemd/system/lumen-agent.service" ]
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent" ]
  [ ! -e "$LUMEN_ROOT/usr/local/bin/lumen-agent.prev" ]
  [ ! -e "$LUMEN_ROOT/etc/lumen" ]
  [ ! -e "$LUMEN_ROOT/var/lib/lumen" ]

  unset SHIM_PROXY_CONTAINERS
  : >"$SHIM_STATE/calls.log"
  run_uninstaller --yes
  assert_status 0
  assert_contains "isn't installed on this server (already done)"
  refute_called "systemctl disable"
}

@test "uninstall: --keep-data keeps /var/lib/lumen" {
  run_installer
  assert_status 0
  run_uninstaller --yes --keep-data
  assert_status 0
  [ -f "$LUMEN_ROOT/var/lib/lumen/agent/credential" ]
  [ ! -e "$LUMEN_ROOT/etc/lumen" ]
  assert_contains "Kept /var/lib/lumen"
}

@test "uninstall: without --yes and without a terminal it refuses" {
  run_installer
  assert_status 0
  run setsid -w env PATH="$SHIM_BIN:$SYSBIN" "$TEST_SH" "$UNINSTALLER" </dev/null
  [ "$status" -eq 2 ]
  [[ "$output" == *"Run the command again with --yes"* ]]
  [ -e "$LUMEN_ROOT/usr/local/bin/lumen-agent" ]
}
