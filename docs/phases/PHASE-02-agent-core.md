# Phase 02 — Agent core and server join

| | |
|---|---|
| **Status** | Implemented on branch `worktree-agent-ac9248c5c2d5f9d24` (2026-09-27); verified on systemd container hosts, awaiting real cloud VMs and cross-model review — see `docs/_pending/phase-02.md` and `docs/evidence/phase-02/` |
| **Owner model** | Fable 5.1 → reviewed by Opus 5.5 |
| **Depends on** | Phase 00 (monorepo, buf codegen pipeline, api skeleton, Drizzle setup, `packages/shared/errors` skeleton) |
| **Unblocks** | Phase 03 (deploy engine runs inside this agent), Phase 04 (agent gateway is generalised there), Phase 11 (installer reuses the same preflight/firewall/verify logic), Phase 12 (mesh peers ride on `DesiredState`) |
| **Spec sections** | SPEC B5, B12, B14, D1, E1, E2 (step 3 only), E6, J1 (servers), J5, J6 (`PORT_BLOCKED`, `AGENT_OFFLINE`, `DISK_FULL`) |
| **Estimated sessions** | 6 focused sessions (protocol + conn · join + credential · installer · port check + fix cards · host metrics + offline detection · self-update + real-VM verification) |

## 1. Goal
A user pastes one command into a fresh Ubuntu or Debian VM on any cloud and, within three minutes, sees the server turn **Online** in the dashboard with a green live checklist (Connected → Docker ready → Proxy running → Port 80 reachable → Port 443 reachable), and if a port is blocked they see the exact fix for their provider.

## 2. Why this phase exists
Everything Lumen does later (builds, containers, routes, mesh, backups) is an instruction carried over the channel this phase builds. If the connection, identity and update story are wrong, every later phase inherits the flaw and it is expensive to undo (protocol, credentials and the installer are all things a user has already run on their machine). The spec assigns this to Fable 5.1 for that reason (SPEC 0.3).

Beginners lose most of their time on firewalls and OS differences, not on code (SPEC 0.4). The join checklist and provider-specific fix cards are therefore not decoration: they are the difference between "it worked" and "I gave up". The agent must also be boring in the best sense: single static binary, dials out only, idle under 50 MB (B14), keeps working when the control plane is gone (B3 failure rule).

## 3. Scope
### In scope
- `packages/protocol`: the agent protocol envelope and every message used in this phase (`AgentHello`, `ControlHello`, `Heartbeat`, `HostSample`/`MetricsBatch`, `PortCheck`/`PortCheckResult`, `AgentUpdate`, `Ack`, `OpError`, `Revoke`), with buf codegen to Go and TS and the N / N-1 versioning rule.
- `apps/agent`: Go binary skeleton, outbound WebSocket connection with reconnect/backoff, handshake, heartbeat every 10s, local state on disk, join flow, identity keypair, per-message signing, host metrics sampling every 10s, port check responder, Caddy bootstrap (container running, admin API on `127.0.0.1:2019`), self-update with rollback, structured logging, `lumen-agent uninstall`.
- `deploy/agent-install.sh`: preflight, Docker Engine install from the official repository, firewall detection and rules (ufw / firewalld / raw iptables including Oracle Ubuntu's default `REJECT` rules), provider detection via metadata endpoints, binary download with SHA-256 and signature verification, systemd unit, idempotent re-run, install log.
- `apps/api`: minimal server endpoints for this phase (`POST /v1/servers/join-tokens`, `GET /v1/servers`, `GET/PATCH/DELETE /v1/servers/:id`, `POST /v1/servers/:id/port-check`, `POST /v1/servers/:id/agent-update`), the `/agent/v1` WebSocket gateway in its minimal form, offline detection worker, and the realtime events `server.status`, `server.checklist`, `server.metrics`.
- `packages/db`: the `servers` and `server_join_tokens` tables only (Phase 04 adds the rest of B6 and must not change these columns).
- `packages/shared`: error catalog entries `PORT_BLOCKED`, `AGENT_OFFLINE`, `DISK_FULL`, and the provider fix-card content for Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean and generic.
- Real-VM verification on Ubuntu 24.04 amd64 and an Oracle Ampere (arm64) instance.
### Out of scope
- Container, build, route and log management → Phase 03.
- Full B6 schema, auth, RBAC, audit log → Phase 04 (this phase uses the Phase 00 API skeleton with a temporary instance-admin token guard, replaced in Phase 04).
- Add-server wizard UI (C7.18) → Phase 05; this phase ships the API and realtime events it needs.
- Drain (moving services) → Phase 12; this phase implements `status = draining` as a flag only.
- WireGuard mesh, `Mesh ready` checklist item → Phase 12.
- Email/Discord/Slack delivery of the offline alert → Phase 08; this phase emits the event and writes the in-app notification row.
- Control-plane installer and setup wizard → Phase 11.

## 4. Work breakdown

### 4.1 Protocol definitions
- **What:** Define the wire protocol for this phase in protobuf, one file per concern, plus the envelope every message travels in.
- **Files:** `packages/protocol/proto/lumen/agent/v1/envelope.proto`, `hello.proto`, `heartbeat.proto`, `metrics.proto`, `portcheck.proto`, `update.proto`, `common.proto`, `packages/protocol/buf.yaml`, `packages/protocol/buf.gen.yaml`, generated output in `packages/protocol/gen/go/...` and `packages/protocol/gen/ts/...`, `packages/protocol/README.md`.
- **Messages (fields are exact; add nothing without a DECISIONS entry):**
  ```proto
  // common.proto
  message Meta { string op_id = 1; int64 timestamp_ms = 2; }            // every payload carries this
  message Ack { string op_id = 1; }
  message OpError { string op_id = 1; string code = 2; string message = 3; map<string,string> details = 4; }

  // envelope.proto
  message Envelope {
    uint32 protocol_version = 1;   // 1 for this phase
    string server_id = 2;
    uint64 seq = 3;                // strictly increasing per connection, per direction
    int64  timestamp_ms = 4;
    bytes  payload = 5;            // serialized `oneof` body below
    bytes  signature = 6;          // Ed25519 over (protocol_version || server_id || seq || timestamp_ms || payload)
    oneof body {                   // documented list of allowed payload types
      AgentHello agent_hello = 10; ControlHello control_hello = 11;
      Heartbeat heartbeat = 12; HeartbeatAck heartbeat_ack = 13;
      MetricsBatch metrics_batch = 14;
      PortCheck port_check = 15; PortCheckResult port_check_result = 16;
      AgentUpdate agent_update = 17; AgentUpdateResult agent_update_result = 18;
      Revoke revoke = 19;
      Ack ack = 20; OpError op_error = 21;
      // 30–99 reserved for Phase 03 (DesiredState, ActualState, Build*, Log*, Exec*), 100+ for Phase 09/12
    }
  }

  // hello.proto
  message AgentHello { string server_id = 1; string agent_version = 2; uint32 protocol_version = 3;
    string os = 4; string os_version = 5; string arch = 6; uint32 cpu_cores = 7; uint64 memory_bytes = 8;
    uint64 disk_bytes = 9; string docker_version = 10; string public_ip = 11; string hostname = 12;
    string kernel = 13; bool caddy_running = 14; repeated string capabilities = 15; }
  message ControlHello { bool accepted = 1; string reject_reason = 2; uint64 desired_state_version = 3;
    AgentConfig config = 4; uint32 negotiated_protocol_version = 5; int64 server_time_ms = 6; }
  message AgentConfig { uint32 heartbeat_interval_s = 1 /*10*/; uint32 metrics_interval_s = 2 /*10*/;
    uint32 log_retention_days = 3 /*7*/; string caddy_image = 4 /*pinned by digest*/;
    uint32 tcp_proxy_port_min = 5 /*20000*/; uint32 tcp_proxy_port_max = 6 /*29999*/; }

  // heartbeat.proto
  message Heartbeat { Meta meta = 1; uint64 desired_state_version_applied = 2; uint32 container_count = 3; bool docker_ok = 4; bool caddy_ok = 5; }
  message HeartbeatAck { string op_id = 1; int64 server_time_ms = 2; }

  // metrics.proto
  message HostSample { int64 ts_ms = 1; double cpu_percent = 2; double load1 = 3; double load5 = 4; double load15 = 5;
    uint64 mem_total = 6; uint64 mem_used = 7; uint64 mem_available = 8; uint64 swap_total = 9; uint64 swap_used = 10;
    repeated DiskSample disks = 11; repeated NetSample nets = 12; uint64 uptime_s = 13; uint32 container_count = 14; }
  message DiskSample { string mount = 1 /* "/", "/var/lib/lumen", "/var/lib/docker" */; uint64 total = 2; uint64 used = 3; uint64 free = 4; uint64 inodes_free = 5; }
  message NetSample { string iface = 1; uint64 rx_bytes = 2; uint64 tx_bytes = 3; }
  message MetricsBatch { Meta meta = 1; HostSample host_sample = 2; /* container_samples = 3 added in Phase 03 */ }

  // portcheck.proto
  message PortCheck { Meta meta = 1; repeated uint32 ports = 2; string nonce = 3; }
  message PortCheckResult { string op_id = 1; repeated PortState ports = 2; }
  message PortState { uint32 port = 1; bool listening = 2; string listener = 3 /* process or container name */; bool nonce_route_installed = 4; }

  // update.proto
  message AgentUpdate { Meta meta = 1; string version = 2; string url = 3; string sha256 = 4; string signature = 5; bool force = 6; }
  message AgentUpdateResult { string op_id = 1; bool success = 2; string running_version = 3; string error = 4; }
  message Revoke { Meta meta = 1; string reason = 2; }
  ```
- **Done when:** `pnpm --filter @lumen/protocol generate` (buf) produces Go and TS code without warnings, `buf lint` and `buf breaking --against .git#branch=main` pass in CI, and a Vitest test plus a Go test round-trip every message.

### 4.2 Agent binary skeleton and local state
- **What:** Create the Go module and the process skeleton: cobra-style subcommands `run`, `join`, `status`, `uninstall`, `version`; a structured logger (JSON to journald via stdout); a signal-aware root context; a local state store.
- **Files:** `apps/agent/go.mod`, `apps/agent/cmd/lumen-agent/main.go`, `apps/agent/internal/state/store.go` (`/var/lib/lumen/agent/state.json`, `identity.json`, `credential`, all `0600`, directory `0700`, atomic writes via temp file + rename), `apps/agent/internal/logs/logger.go` (the agent's own log; runtime log capture is Phase 03), `apps/agent/internal/buildinfo/version.go` (version, commit, protocol version injected with `-ldflags`), `apps/agent/Makefile`, `apps/agent/.goreleaser.yaml` (static build `CGO_ENABLED=0` for `linux/amd64` and `linux/arm64`).
- **Done when:** `make build` produces two static binaries under 20 MB each, `lumen-agent version` prints version/commit/protocol, `lumen-agent status` reads state without a control plane, and the binary starts and idles under 50 MB RSS measured by `systemctl show -p MemoryCurrent lumen-agent`.

### 4.3 Join flow and identity
- **What:** Implement `lumen-agent join --control-plane <url> --token <join-token>`: the agent generates an Ed25519 identity keypair, posts the public key and host facts to the control plane with the join token, receives `server_id` plus a server credential, and stores both. Re-running with a valid identity is a no-op; re-running with a new token after revocation re-joins.
- **Sequence:**
  1. Agent generates Ed25519 keypair → `identity.json` (`{server_id?, public_key, private_key}`), written before the network call so a crash cannot lose a key the control plane already knows.
  2. `POST https://<cp>/agent/v1/join` body `{join_token, public_key, host: {os, os_version, arch, cpu_cores, memory_bytes, disk_bytes, docker_version, public_ip, hostname, agent_version, protocol_version}}`.
  3. Control plane: hash the token (SHA-256) → look up `server_join_tokens` where `token_hash` matches, `expires_at > now()` (tokens live **1 hour**), `used_at IS NULL` → in one transaction set `used_at`, insert `servers` row (`status = pending`, `credential_hash`, identity public key, host facts) → generate credential: 32 random bytes, base64url → store `credential_hash = sha256(credential)` (SHA-256 is adequate for a 256-bit random secret; argon2 is for low-entropy passwords) → return `{server_id, credential, control_plane_ws_url, ca_fingerprint?}`.
  4. Agent stores `credential` (`0600`) and `server_id`; prints `Joined as <name> (<server_id>). Starting agent…`.
  5. Rotation: `POST /v1/servers/:id/rotate-credential` (instance admin) issues a new credential delivered over the existing authenticated socket as `ControlHello.config` on next reconnect; the old hash is kept valid for 5 minutes to cover the reconnect race, then dropped.
  6. Revocation: `DELETE /v1/servers/:id` sends `Revoke{reason}`; the agent deletes `credential`, keeps `identity.json`, stops, and `systemctl` keeps it stopped until a new join (the unit uses `ConditionPathExists=/var/lib/lumen/agent/credential`).
- **Files:** `apps/agent/internal/join/join.go`, `apps/agent/internal/join/identity.go`, `apps/api/src/routes/agent/join.ts`, `apps/api/src/services/servers/join-tokens.ts`, `packages/db/src/schema/servers.ts`, `packages/db/src/schema/server-join-tokens.ts`, migration `packages/db/migrations/0002_servers.sql`.
- **Done when:** the join integration test (real Postgres via testcontainers, agent binary in a subprocess) covers: fresh join, expired token, reused token, second join with an existing identity, revoke then rejoin.

### 4.4 Connection, handshake, heartbeat, offline detection
- **What:** The agent dials `wss://<cp>/agent/v1` with headers `Authorization: Bearer <server_id>.<credential>` and `X-Lumen-Protocol: 1`, sends `AgentHello`, waits for `ControlHello`, then heartbeats every **10 s**. The control plane marks a server `offline` after **30 s** without a heartbeat (worker sweep every 5 s over `last_heartbeat_at`), `online` on the next heartbeat, and publishes `server.status` events so the dashboard updates in under **1 s** (B14).
- **Connection rules:**
  - Reconnect with jittered exponential backoff: 1 s → 2 → 4 → 8 → 16 → 30 s cap, ±20 % jitter; reset after 60 s of stable connection.
  - One connection per server; a second connection with the same `server_id` closes the older one with close code `4001 superseded`.
  - Outbound send queue bounded at 1,000 messages; `MetricsBatch` is dropped first when full (it is resampled), `Ack`/`OpError` never dropped.
  - Read/write deadlines: 30 s; ping/pong frames every 10 s in addition to the application heartbeat so proxies do not idle-close.
  - Clock skew: `ControlHello.server_time_ms` and `HeartbeatAck.server_time_ms` let the agent compute an offset; timestamps in `Envelope` use corrected time; the gateway rejects messages older than 5 min or 1 min in the future with `OpError{code: CLOCK_SKEW}` and logs it.
- **Files:** `apps/agent/internal/conn/client.go`, `apps/agent/internal/conn/backoff.go`, `apps/agent/internal/conn/signer.go`, `apps/agent/internal/heartbeat/heartbeat.go`, `apps/api/src/gateway/agent-ws.ts`, `apps/api/src/gateway/verify.ts`, `apps/api/src/gateway/registry.ts` (in-memory map `server_id → socket`, plus a Postgres row so multiple API replicas know which one holds the socket), `apps/api/src/workers/server-offline-sweep.ts`, `apps/api/src/realtime/topics.ts`.
- **Done when:** killing the network (iptables drop on the test VM) shows `offline` in the API within 30 s, restoring it shows `online` within 10 s, and the `server.status` event is observed on `/v1/ws` in the e2e harness with a timestamp delta under 1 s from the DB update.

### 4.5 Caddy bootstrap
- **What:** On start, the agent ensures the platform Caddy container exists and runs: image pinned by digest from `AgentConfig.caddy_image`, host network, admin API bound to `127.0.0.1:2019` only, config and data directories at `/var/lib/lumen/caddy/{config,data}`, restart policy `always`, label `lumen.role=proxy`. The agent probes `GET http://127.0.0.1:2019/config/` every heartbeat and reports `caddy_ok`. Route management is Phase 03; this phase installs only the default catch-all route (a calm 404 page served by Caddy) and the port-check nonce route.
- **Files:** `apps/agent/internal/caddy/bootstrap.go`, `apps/agent/internal/caddy/admin.go` (thin client), `apps/agent/internal/docker/client.go` (Engine API client, version probe, `docker_ok`), `apps/agent/assets/caddy-default.json`, `apps/agent/assets/404.html`.
- **Done when:** on a fresh VM, `curl -I http://<ip>/` returns the Lumen 404 page within 20 s of the agent starting, `curl 127.0.0.1:2019/config/` works locally, and `curl <ip>:2019` from outside is refused.

### 4.6 Port check
- **What:** Prove from the outside that 80 and 443 reach Caddy, and if not, tell the user exactly why.
- **Flow:**
  1. `POST /v1/servers/:id/port-check` (also triggered automatically once at join and once when the server comes online after an install) enqueues a job and sends `PortCheck{ports: [80, 443], nonce}` to the agent.
  2. Agent replies `PortCheckResult` with, per port, whether something is listening (`/proc/net/tcp` and `tcp6`, state `0A`, resolving the owning process via `/proc/*/fd` when readable) and whether it installed a temporary Caddy route `GET /.lumen/portcheck/<nonce>` → `200 <nonce>` on that port (HTTPS uses Caddy's internal self-signed cert; the checker skips verification for this probe only).
  3. Worker probes from the control plane: TCP connect to `public_ip:port` with 5 s timeout, then HTTP(S) `GET /.lumen/portcheck/<nonce>`; success requires the nonce body.
  4. Result per port: `reachable` · `listening_not_reachable` (→ `PORT_BLOCKED`, cloud or OS firewall) · `not_listening` (→ proxy problem, restart Caddy automatically once, then report) · `timeout`. The route is removed by the agent 60 s after install.
  5. Stored on `servers.port_check` jsonb `{checked_at, ports: [{port, state, latency_ms}]}` and pushed as `server.checklist`.
  - When `servers.public_ip` equals the control plane's own public IP (single-VM setup), the probe still goes through the public IP; if it fails with `listening_not_reachable` but a loopback probe succeeds, the result is `reachable_hairpin_unknown` and the UI copy says "We couldn't verify from outside because the control plane runs on this same server. Open the URL in your browser to confirm."
- **Files:** `apps/agent/internal/portcheck/listeners.go`, `apps/agent/internal/portcheck/nonce_route.go`, `apps/api/src/workers/port-check.ts`, `apps/api/src/routes/servers/port-check.ts`, `packages/shared/src/errors/catalog/servers.ts`, `packages/shared/src/fixes/ports.ts`.
- **Done when:** on an Oracle VM with 443 not opened in the security list, the API returns `listening_not_reachable` for 443 with `fix: PORT_BLOCKED.oracle`, and after adding the ingress rule a recheck returns `reachable` within one run.

### 4.7 Provider detection and fix cards
- **What:** Detect the provider from the metadata service during install (and on each start, cached), store it on `servers.provider`, and ship fix-card content keyed by provider and layer.
- **Detection (2 s timeout each, in this order, first hit wins):** Oracle `GET http://169.254.169.254/opc/v2/instance/` with header `Authorization: Bearer Oracle` → AWS `PUT /latest/api/token` (IMDSv2) then `GET /latest/meta-data/instance-id` → GCP `GET http://metadata.google.internal/computeMetadata/v1/instance/id` with `Metadata-Flavor: Google` → Azure `GET http://169.254.169.254/metadata/instance?api-version=2021-02-01` with `Metadata: true` → Hetzner `GET http://169.254.169.254/hetzner/v1/metadata` → DigitalOcean `GET http://169.254.169.254/metadata/v1/id` → `other`. Also capture `region_label` where the endpoint gives it.
- **Fix-card content keys (`packages/shared/src/fixes/ports.ts`, each entry: `title`, `steps[]` with `{text, command?, link?}`, `estimated_minutes`):**
  - `PORT_BLOCKED.oracle.cloud` (VCN → Subnet → Security List → Ingress rule, source `0.0.0.0/0`, TCP 80 and 443; note about Network Security Groups when used), `PORT_BLOCKED.oracle.os` (the default Ubuntu image ships `iptables -A INPUT -j REJECT --reject-with icmp-host-prohibited`; commands: `sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT`, same for 443, `sudo netfilter-persistent save`).
  - `PORT_BLOCKED.aws.cloud` (Security Group inbound rules HTTP/HTTPS from `0.0.0.0/0` and `::/0`), `PORT_BLOCKED.aws.os` (ufw / firewalld commands).
  - `PORT_BLOCKED.gcp.cloud` (`gcloud compute firewall-rules create lumen-web --allow tcp:80,tcp:443 --target-tags lumen` and adding the tag, or the console path), `PORT_BLOCKED.gcp.os`.
  - `PORT_BLOCKED.azure.cloud` (NSG inbound security rule priority < 65000 for 80/443), `PORT_BLOCKED.azure.os`.
  - `PORT_BLOCKED.hetzner.cloud` (Cloud Firewall attached to the server: inbound TCP 80/443), `PORT_BLOCKED.hetzner.os`.
  - `PORT_BLOCKED.digitalocean.cloud` (Cloud Firewall inbound rules), `PORT_BLOCKED.digitalocean.os` (Marketplace images enable ufw: `sudo ufw allow 80,443/tcp`).
  - `PORT_BLOCKED.other.cloud` (generic "open inbound TCP 80 and 443 in your provider's firewall"), `PORT_BLOCKED.other.os` (detect and print for ufw, firewalld, iptables).
  - `MESH_UNREACHABLE.<provider>.cloud/os` for UDP 51820 are added here as content only; Phase 12 wires them.
- **Files:** `apps/agent/internal/provider/detect.go`, `deploy/agent-install.sh` (shares the same curl probes in shell), `packages/shared/src/fixes/ports.ts`, `packages/shared/src/fixes/index.ts`, a Vitest snapshot test that every provider × layer key exists for `PORT_BLOCKED` and `MESH_UNREACHABLE`.
- **Done when:** the detection test table (mocked metadata responses) resolves all seven providers, and `packages/shared` exports a typed `getFix(code, provider)` that never returns `undefined`.

### 4.8 Installer script
- **What:** `deploy/agent-install.sh`, served by the control plane at `GET /install/agent.sh`, run as `curl -fsSL https://<cp>/install/agent.sh | sudo sh -s -- --token <join-token> --control-plane https://<cp>`.
- **Steps (each step is a function; each is idempotent and logs to `/var/log/lumen-agent-install.log`):**
  1. **Preflight:** must be root (or re-exec with sudo); parse `/etc/os-release` (Tier 1: Ubuntu 22.04/24.04, Debian 12; Tier 2: RHEL-family 9; anything else → warn and continue with `--force`, otherwise exit 2); `uname -m` → `amd64`/`arm64` else exit 2; RAM ≥ 1 GB (E1) else exit 2; free disk on `/var/lib` ≥ 2 GB else exit 2 with `DISK_FULL` text, < 10 GB warns; `systemd` present; `curl`, `ca-certificates`, `tar` installed (install if missing); time synced (`timedatectl show -p NTPSynchronized`), warn if not; existing Docker detection (version ≥ 24 accepted, older → offer upgrade).
  2. **Docker Engine:** add the official Docker apt repo (Debian/Ubuntu) or dnf repo (RHEL-family), install `docker-ce docker-ce-cli containerd.io docker-buildx-plugin`, `systemctl enable --now docker`; skip when a usable Docker already runs.
  3. **Firewall:** detect in order: `ufw status` active → `ufw allow 80/tcp`, `443/tcp`, `51820/udp`; `firewall-cmd --state` running → `--permanent --add-port=80/tcp`, `--add-port=443/tcp`, `--add-port=51820/udp`, then `--reload`; otherwise inspect `iptables -S INPUT`: if a `REJECT` or `DROP` rule exists before any accept for 80/443 (Oracle Ubuntu default), insert `ACCEPT` rules for `80/tcp`, `443/tcp`, `51820/udp` directly before the first `REJECT` line and persist with `netfilter-persistent save` (installing `iptables-persistent` non-interactively) or `iptables-services` on RHEL. Do the same for `ip6tables`. Print the provider cloud-firewall instructions (same content as `PORT_BLOCKED.<provider>.cloud`) in a highlighted block.
  4. **Download and verify:** fetch `https://<cp>/agent/download/<version>/lumen-agent-linux-<arch>`, `...sha256`, `...sha256.minisig`; verify SHA-256; verify the minisign Ed25519 signature against the release public key embedded in the script (the control plane serves the script with its configured key); refuse to install on any mismatch, exit 3.
  5. **Install:** copy to `/usr/local/bin/lumen-agent` (`0755`), keep previous binary at `/usr/local/bin/lumen-agent.prev` for rollback; create `/var/lib/lumen/agent` (`0700`), `/etc/lumen/agent.env` (`0600`) with `LUMEN_CONTROL_PLANE=<url>`.
  6. **Join:** `lumen-agent join --control-plane <url> --token <token>`; if `/var/lib/lumen/agent/credential` already exists and `lumen-agent status --check-credential` reports valid, skip the join (prints "Already joined as <name>").
  7. **Service:** write `/etc/systemd/system/lumen-agent.service` (`After=network-online.target docker.service`, `Wants=network-online.target`, `Requires=docker.service`, `ConditionPathExists=/var/lib/lumen/agent/credential`, `EnvironmentFile=/etc/lumen/agent.env`, `ExecStart=/usr/local/bin/lumen-agent run`, `Restart=always`, `RestartSec=2`, `LimitNOFILE=65536`, `MemoryMax=256M` as a safety net, `NoNewPrivileges=no` because Docker access is needed), `systemctl daemon-reload`, `systemctl enable --now lumen-agent`.
  8. **Wait and report:** poll `lumen-agent status` for up to 90 s until it reports `online`; print `✔ Connected · ✔ Docker · ✔ Proxy` lines as they succeed, then "This server is online. Go back to your browser." On timeout print the last 20 lines of `journalctl -u lumen-agent` and the reinstall command.
- **Files:** `deploy/agent-install.sh`, `deploy/agent-uninstall.sh` (stop, disable, remove unit, optional `--keep-data`), `deploy/tests/install.bats` (bats tests with mocked commands), `apps/api/src/routes/install/agent-script.ts` (serves the script with the release key and version substituted), `e2e/vm/agent-install.spec.ts` (Multipass harness).
- **Done when:** a fresh Multipass Ubuntu 24.04 VM goes from command to `online` in under 3 minutes, running the command a second time changes nothing (`bats` asserts every step reports `already done`), and a tampered binary is refused.

### 4.9 Host metrics and disk-full protection
- **What:** Sample every 10 s and send `MetricsBatch{host_sample}`; the control plane stores the latest sample on `servers.last_host_sample` (jsonb) and publishes `server.metrics`; 1-minute rollups into `metric_rollups` are added in Phase 08. The agent sets `disk_low = free < 2 GB` on `/var/lib/lumen` or `/var/lib/docker`; Phase 03 refuses builds when it is set (`DISK_FULL`).
- **Files:** `apps/agent/internal/metrics/host.go` (read `/proc/stat`, `/proc/meminfo`, `/proc/loadavg`, `statfs`, `/proc/net/dev`; no cgo, no third-party collector), `apps/agent/internal/metrics/sampler.go`, `apps/api/src/gateway/handlers/metrics.ts`.
- **Done when:** the sampler adds under 0.5 % CPU on a 1 vCPU VM measured over 5 minutes, and a `fallocate` that drops free space under 2 GB flips `disk_low` within 10 s and raises the `DISK_FULL` notification row.

### 4.10 Self-update with rollback
- **What:** The control plane sends `AgentUpdate{version, url, sha256, signature}`; the agent downloads to `lumen-agent.new`, verifies the checksum and signature, renames current → `.prev`, `.new` → current, writes `state.update = {from, to, at}`, and exits 0 so systemd restarts it. On start, if `state.update` is set and the new binary fails its own health check (connect + `ControlHello.accepted` within 60 s, Docker and Caddy probes ok), it swaps `.prev` back, clears the flag, records `AgentUpdateResult{success: false}` on the next connection. Containers are untouched by the process restart, so apps stay up (D1).
- **Files:** `apps/agent/internal/update/update.go`, `apps/agent/internal/update/verify.go` (minisign verification, shared with the installer's key), `apps/api/src/routes/servers/agent-update.ts`, `apps/api/src/workers/agent-update-rollout.ts` (one server at a time per workspace, stop on first failure).
- **Done when:** an integration test upgrades a test build `v0.0.1` → `v0.0.2` (good) and `v0.0.1` → `v0.0.3` (binary that exits immediately) and the second case ends with `v0.0.1` running and a failed result recorded.

### 4.11 Minimal server API
- **What:** The endpoints the wizard and list need, validated with Zod, guarded by the Phase 00 instance-admin bearer token until Phase 04 replaces it with sessions and RBAC.
- **Schemas (`packages/shared/src/schemas/servers.ts`):**
  ```ts
  export const CreateJoinToken = z.object({ workspaceId: z.string().uuid(), name: z.string().min(1).max(64), provider: z.enum(['oracle','aws','gcp','azure','hetzner','digitalocean','other']), labels: z.array(z.string().max(32)).max(20).default([]) });
  export const JoinTokenResponse = z.object({ token: z.string(), expiresAt: z.string().datetime(), command: z.string() });
  export const PatchServer = z.object({ name: z.string().min(1).max(64).optional(), labels: z.array(z.string().max(32)).max(20).optional(), regionLabel: z.string().max(64).optional(), monthlyCost: z.number().min(0).nullable().optional(), status: z.enum(['draining']).optional() });
  export const PortCheckRequest = z.object({ ports: z.array(z.number().int().min(1).max(65535)).min(1).max(10).default([80, 443]) });
  export const Server = z.object({ id, workspaceId, name, provider, regionLabel, publicIp, arch, os, cpuCores, memoryMb, diskGb, agentVersion, status: z.enum(['pending','online','offline','draining']), lastHeartbeatAt, labels, checklist: z.object({ connected, dockerReady, proxyRunning, port80, port443, mesh: z.enum(['ok','failed','pending','n/a']) }), lastHostSample, portCheck, createdAt, updatedAt });
  ```
- **Routes:** `POST /v1/servers/join-tokens` (returns the token once, and the full paste-able command) · `GET /v1/servers` · `GET /v1/servers/:id` · `PATCH /v1/servers/:id` · `DELETE /v1/servers/:id` (409 `SERVER_HAS_SERVICES` once Phase 03 places services; typed-confirmation is a UI concern) · `POST /v1/servers/:id/port-check` · `POST /v1/servers/:id/agent-update` · `POST /v1/servers/:id/rotate-credential`.
- **Files:** `apps/api/src/routes/servers/*.ts`, `apps/api/src/services/servers/*.ts`, `apps/api/src/openapi/servers.ts`, `apps/api/test/servers.test.ts`.
- **Done when:** every route has a test for success, validation failure (400 with field errors) and unauthenticated (401), and the OpenAPI document includes them.

### 4.12 Real-VM verification and docs
- **What:** Run the whole flow on a real Ubuntu 24.04 amd64 VM (Hetzner or DigitalOcean) and an Oracle Ampere A1 arm64 VM; record timings; write the user docs for adding a server on each provider.
- **Files:** `docs/user/servers/add-server.md`, `docs/user/servers/providers/{oracle,aws,gcp,azure,hetzner,digitalocean,other}.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- **Done when:** both VMs show `online` with a fully green checklist; the Oracle VM initially shows the 443 fix card and turns green after the security-list change.

## 5. Detail checklist

### Protocol design
- Every message carries `Meta{op_id, timestamp_ms}` or an `op_id` field; `op_id` is a UUIDv7 generated by the sender; receivers de-duplicate on `(server_id, op_id)` for 24 h (Postgres table `agent_ops` on the control plane, in-memory LRU of 10,000 on the agent).
- Requests are answered with exactly one of `Ack`, a typed result, or `OpError`; the control plane times out unanswered requests at 60 s (`OpError{code: AGENT_TIMEOUT}` synthesised locally) and never leaves a job hanging.
- `protocol_version` is negotiated in the hello: the control plane accepts `N` and `N-1` (Phase 02 ships `N = 1`; the first breaking change bumps it and CI runs the compatibility suite against the previous tagged agent).
- Field numbers are never reused; removed fields are `reserved`; `buf breaking` runs in CI against `main`.
- Backpressure: bounded send queues on both sides (1,000 messages agent → control plane; 256 control plane → agent per socket); when the agent queue is full, metrics are dropped first, then log chunks (Phase 03), never acks/results; the gateway applies per-server rate limits (200 msg/s, 2 MB/s) and closes with code `4008 rate_limited` on abuse.
- Envelope `seq` must be strictly increasing per direction per connection; a gap or repeat is logged and the connection closed with `4002 bad_sequence`.
- Maximum message size 4 MB; larger payloads (log queries, build logs) must be chunked by their Phase 03 messages.

### Security
- The agent **only dials out**; no listening sockets other than Caddy's 80/443 (in the Caddy container) and the loopback admin API on 2019 (J5). `ss -tlnp` on a joined server must show nothing else owned by the agent.
- Join tokens: 32 random bytes, base64url, shown once, stored as SHA-256, expire in 1 h, single use (`used_at`), deletable; the join endpoint is rate limited to 10 attempts/min per IP and returns the same 401 for expired, used and unknown tokens.
- Server credential: 32 random bytes, stored hashed (SHA-256), rotatable, revocable; the agent stores it `0600` under a `0700` directory owned by root; never logged (the logger's redaction list includes it and the join token).
- Per-message authentication: every `Envelope` is Ed25519-signed by the agent identity key and verified against the public key stored at join; the control plane signs its envelopes with an instance key whose public half is delivered in the join response, so a compromised proxy cannot inject commands.
- WebSocket upgrade requires TLS; the agent pins nothing by default but records the control plane certificate fingerprint on first join and warns on change (`--trust-new-cert` to accept).
- Binaries: SHA-256 plus minisign signature verified by the installer and by self-update; the release public key ships inside the installer script and inside the agent binary.
- Caddy admin API bound to `127.0.0.1:2019` and never published; the port-check nonce route is unauthenticated by design but only echoes a random nonce and is removed after 60 s.
- Container defaults for the Caddy platform container: pinned by digest, `--cap-drop ALL --cap-add NET_BIND_SERVICE`, read-only rootfs with two writable mounts, `--pids-limit 512`, `--memory 256m`.
- Installer: refuses to run when piped from a non-HTTPS URL, verifies every download, never `chmod 777`, writes secrets with `umask 077`, prints the cloud firewall instructions instead of attempting cloud API calls.
- Metadata probes run with a 2 s timeout and never send credentials; IMDSv2 tokens are discarded after use.

### Data integrity & idempotency
- `identity.json` is written before the join request; `credential` is written atomically; a crash at any point leaves the agent either un-joined (retry safe) or joined (no duplicate `servers` rows because the token is single-use inside the same transaction).
- The installer's every step is a check-then-act function; re-running produces zero changes and prints "already done" per step.
- `servers.status` transitions are only `pending → online`, `online ↔ offline`, `online|offline → draining`, any → deleted; the sweep worker and the gateway both update `last_heartbeat_at` with `GREATEST(existing, new)` so out-of-order updates cannot move time backwards.
- Self-update keeps exactly one previous binary and clears the update flag only after a successful health check.

### Failure modes
- Control plane unreachable: the agent keeps running, logs at `warn` once per backoff step (not every attempt), and reconnects; nothing on the server changes (there is no desired state yet in this phase; Phase 03 relies on the same rule).
- Docker down: `docker_ok = false` in heartbeats; the checklist item "Docker ready" turns red with the fix "Run `sudo systemctl restart docker`"; the agent retries the probe every 10 s.
- Caddy container removed by hand: the agent recreates it within one heartbeat.
- Agent killed mid-join: identity persisted, token may be consumed; the installer's next run detects the missing credential and asks for a fresh token with a clear message.
- Time skew > 5 min: connection accepted but each message is rejected with `CLOCK_SKEW`; the checklist shows "Your server's clock is off by 7 minutes. Enable NTP: `sudo timedatectl set-ntp true`".
- Two servers behind the same public IP (NAT): allowed; port checks report per server and the docs explain that only one can own 80/443.

### Observability (of the agent and gateway themselves)
- Agent logs are JSON lines with `level`, `ts`, `msg`, `component`, `op_id`; `journalctl -u lumen-agent -o cat | jq` works.
- Agent exposes no metrics endpoint (dial-out only); instead `HostSample` carries `agent_rss_bytes`, `goroutines`, `send_queue_len`, `reconnects_total` in a `self` sub-message so the dashboard's instance admin page (Phase 11) can chart agent health.
- Gateway metrics (Prometheus text at `/internal/metrics`, loopback only): connected agents, messages per type, signature failures, rate-limit closes, heartbeat lag histogram.
- Every `OpError` code emitted by this phase is in the catalog: `AGENT_OFFLINE`, `PORT_BLOCKED`, `DISK_FULL`, plus internal codes `CLOCK_SKEW`, `AGENT_TIMEOUT`, `JOIN_TOKEN_INVALID`, `SIGNATURE_INVALID`, `UPDATE_VERIFY_FAILED`, `UPDATE_ROLLED_BACK`.

### Performance
- Agent idle RSS < 50 MB (B14): measured on both architectures after 1 h of heartbeats and metrics; no goroutine leaks (`runtime.NumGoroutine()` stable ±2).
- Status change → visible in UI < 1 s: heartbeat write → `NOTIFY` → fan-out measured in the e2e harness.
- Paste to online < 3 min on a 1 vCPU VM including Docker install (D1); the installer prints elapsed time at the end.
- Binary size < 20 MB static; startup to first `AgentHello` < 500 ms with Docker already running.
- Metrics sampling < 0.5 % CPU on 1 vCPU.

### Copy
- Installer output uses the C9 voice: "Installing Docker (about a minute)…", "Opening ports 80 and 443 in the OS firewall", "Port 443 is blocked on your Oracle server. Here's the 2-minute fix." Never raw stack traces; every failure line ends with what to do next.
- Checklist labels are exactly: Connected · Docker ready · Proxy running · Port 80 reachable · Port 443 reachable · Mesh ready (Mesh shows "Not needed yet" with one server).

### States (for the API consumers)
- Server states: `pending` (joined, no heartbeat yet), `online`, `offline` (with `offline_since`), `draining`; the API always returns the checklist object even when partially unknown (`pending` items) so the wizard can render skeletons.

## 6. Acceptance criteria
- [ ] **One-command join:** fresh Ubuntu 22.04/24.04, Debian 12 (amd64 + arm64) goes from paste to "online" in < 3 min; re-running the command is safe. (D1)
- [ ] **Live join checklist and port checks** with provider-specific fixes (Oracle, AWS, GCP, Azure, Hetzner, DO, generic). A blocked 443 is detected and the correct fix card is shown. (D1)
- [ ] **Heartbeat, offline detection, and alerts:** offline shown within 30 s; the in-app notification row and the `server.offline` event are emitted (external channel delivery is Phase 08). (D1)
- [ ] **Agent self-update with rollback:** the integration test upgrades good and bad builds; the bad build ends rolled back with no container restarts. (D1 item 4, N-1 → N without app downtime is re-verified in Phase 18)
- [ ] Every protocol message round-trips in Go and TS tests; `buf lint` and `buf breaking` pass.
- [ ] Every `Envelope` is signed and verified; an unsigned or wrongly signed message is rejected and counted.
- [ ] The join token is single-use, expires in 1 h, and its hash only is stored.
- [ ] The agent's only listening sockets are Caddy 80/443 and loopback 2019.
- [ ] Agent idle RSS < 50 MB on amd64 and arm64.
- [ ] A tampered agent binary is refused by both the installer and self-update.
- [ ] Status change → visible on `/v1/ws` in < 1 s.
- [ ] `DISK_FULL` is raised when free space < 2 GB.
- [ ] All new routes: Zod-validated, tested for 200/400/401, present in OpenAPI.

> **Status 2026-09-27 (container hosts, not cloud VMs):** met with evidence —
> port checks with Oracle fix cards (blocked 443 → card, reopened → reachable),
> offline + notification row + `server.offline`, self-update good/bad with no
> proxy restart, protocol round-trips, signed envelopes (bad signatures dropped
> and counted), single-use hashed 1 h tokens, listening sockets, idle RSS
> (amd64: 8.6 MB `MemoryCurrent` after 65 min), tampered binaries refused (bats
> + Go tests), `/v1/ws` latency 56–125 ms, DISK_FULL under 2 GB, routes tested.
> Partly met — one-command join works and re-runs safely on Ubuntu 24.04 amd64,
> and Debian 12 amd64, but took 3.5–4.8 min here (Docker's apt install) and
> wasn't run on Ubuntu 22.04 or arm64 (emulated arm64 failed under QEMU); `buf breaking` passes against this branch
> but fails once against `main` by design. Needs real cloud VMs — public
> reachability, provider detection, the Oracle security list, arm64 RSS.
> Details: `docs/evidence/phase-02/README.md`, `docs/_pending/phase-02.md`.

## 7. Test plan
- **Unit:** Go — backoff schedule, envelope signing/verification, sequence checks, `/proc` parsers with fixture files from real Ubuntu/Debian/RHEL hosts, port-listener detection, provider detection with a mocked metadata server, update verification. TS — Zod schemas, join-token hashing, offline sweep logic, fix-card completeness.
- **Integration:** agent binary as a subprocess against the API with testcontainers Postgres: join / expired / reused / revoke / rejoin; heartbeat and offline sweep with a fake clock; port check against a local Caddy; self-update good and bad builds.
- **E2E (Playwright, VM harness):** Multipass Ubuntu 24.04 and Debian 12: run the installer, assert `online` in the API and the `server.status` event on `/v1/ws`; run it twice; block 443 with `iptables` and assert `PORT_BLOCKED`.
- **Visual regression:** none (no UI in this phase).
- **Accessibility:** none.
- **Manual / on a real VM:** Ubuntu 24.04 amd64 on Hetzner or DigitalOcean; Oracle Ampere A1 arm64 with the default security list (443 closed) then opened; measure paste-to-online with a stopwatch; `ss -tlnp` audit; `systemctl show -p MemoryCurrent lumen-agent` after 1 h.

## 8. Evidence required to close
- Installer transcript from both real VMs with timestamps (paste-to-online duration visible).
- `ss -tlnp` output from a joined server.
- `MemoryCurrent` readings on amd64 and arm64 after 1 h.
- API responses for `POST /port-check` on Oracle before and after opening 443.
- Test output: Go tests, Vitest, bats, VM e2e, `buf lint`, `buf breaking`.
- A screen recording or log showing offline → online transitions with timestamps and the `/v1/ws` event latency.

## 9. Review
Use SPEC H1 with Opus 5.5. The reviewer should probe: replay and sequence handling in `apps/api/src/gateway/verify.ts`; every place a token or credential is logged or returned; the installer's iptables insertion position on Oracle images (the rule must land before the `REJECT`); idempotency of each installer step; the self-update rollback path when the new binary crashes after the health check passed; what happens when two API replicas both believe they hold the socket. Run SPEC H4 briefly on the gateway registry design.

## 10. Risks & open questions
- **Risk:** hairpin NAT makes the external port probe fail on single-VM installs → **Mitigation:** the `reachable_hairpin_unknown` state and copy in §4.6; Phase 11 can add an optional external checker endpoint later.
- **Risk:** Oracle Ubuntu images change their default iptables layout → **Mitigation:** the installer inserts before the first `REJECT`/`DROP` by rule inspection, not by fixed line number, and the e2e harness includes an Oracle-style ruleset fixture.
- **Risk:** IMDSv2/metadata differences across providers break detection → **Mitigation:** detection failures fall back to `other` with the generic card; the provider can be set in the wizard.
- **Risk:** Docker's official repository install takes longer than 3 min on 1 vCPU → **Mitigation:** measure; if needed, pre-pull nothing and install `docker-ce` only, deferring `buildx` to Phase 03.
- **Open question:** "authenticated per message" (B12) — the default is Ed25519 signing of every envelope on both directions as designed in §4.1; the alternative (rely on TLS + bearer only) is cheaper but weaker. Fable 5.1 decides in the plan step; the default stands if nobody objects.
- **Open question:** signature tooling — default minisign (single Ed25519 key, tiny verifier, easy to embed in shell); alternative cosign/sigstore (keyless, heavier). Recorded in DECISIONS.
- **Open question:** whether the Caddy bootstrap belongs here or in Phase 03. Default: here, because the join checklist needs "Proxy running" and the port check needs a listener.
- **Open question:** D1 says "notification sent" for offline; channels do not exist until Phase 08. Default: emit the event and the in-app row now; external delivery later.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: envelope signing design, minisign, SHA-256 for random secrets, backoff schedule, Caddy in Phase 02, queue bounds and rate limits, pg row for socket ownership
- [ ] `docs/UI_DECISIONS.md` unchanged (no UI)
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 02 — Agent core and server join</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-02-agent-core.md,
and these SPEC sections: B5, B12, B14, D1, E1, E2 step 3, E6, J1 (servers), J5, J6.
</context>
<goal>A user pastes one command into a fresh VM and within 3 minutes sees it Online with a green checklist, or sees the exact provider-specific fix for a blocked port.</goal>
<scope>
- Protocol: envelope with Ed25519 per-message signatures, AgentHello/ControlHello, Heartbeat, MetricsBatch(host), PortCheck, AgentUpdate, Revoke, Ack/OpError; buf codegen Go + TS; N/N-1 rule
- Agent: outbound WebSocket with jittered backoff, heartbeat 10s, local state, join flow, identity keypair, host metrics every 10s, port-check responder, Caddy bootstrap (admin API loopback 2019), self-update with rollback, uninstall
- Installer: preflight, Docker official repo, ufw/firewalld/iptables incl. Oracle REJECT rules, provider detection via metadata, SHA-256 + minisign verification, systemd unit Restart=always, idempotent re-run, install log
- API: join-token and server routes with Zod, /agent/v1 gateway, offline sweep (30s), realtime events server.status/checklist/metrics
- DB: servers, server_join_tokens
- Shared: PORT_BLOCKED, AGENT_OFFLINE, DISK_FULL, fix cards for 7 providers × cloud/os
</scope>
<out_of_scope>
- Containers, builds, routes, runtime logs (Phase 03); full schema/auth/RBAC (Phase 04); wizard UI (Phase 05); drain (Phase 12); mesh (Phase 12); notification channels (Phase 08); control-plane installer (Phase 11)
</out_of_scope>
<acceptance_criteria>
See docs/phases/PHASE-02-agent-core.md §6: paste-to-online < 3 min on Ubuntu 22.04/24.04 and Debian 12 (amd64 + arm64), idempotent re-run; blocked 443 → correct provider fix card; offline within 30s with event + in-app notification; self-update rollback test; signed envelopes; single-use 1h join tokens stored hashed; only Caddy 80/443 + loopback 2019 listening; agent idle RSS < 50 MB; tampered binary refused; status → UI < 1s; DISK_FULL at < 2 GB free; routes validated, tested, in OpenAPI.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, protocol and schema changes, risks, test plan,
   open questions (decide: per-message signing, minisign, Caddy bootstrap placement). STOP and wait for approval.
2. Implement in small steps; run Go tests, Vitest, bats and the Multipass e2e after each step.
3. Verify on a real Ubuntu amd64 VM and an Oracle arm64 VM; capture transcripts, ss -tlnp, MemoryCurrent.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md.
</process>
```
