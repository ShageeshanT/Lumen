# Phase 02 — pending doc updates

Written by the Phase 02 session (2026-09-27) for the owner to merge into
`docs/DECISIONS.md`, `docs/SPEC_QUESTIONS.md` and `docs/PROGRESS.md`. Decision
numbers are `00XX` placeholders: renumber after the entries other sessions
added. Evidence lives in `docs/evidence/phase-02/` (see its README).

---

## Decisions (DECISIONS.md format)

## 00XX · 2026-09-27 · Protocol v1 baseline replaces the Phase 00 placeholder
**Decision:** The agent protocol is rebuilt to PHASE-02 §4.1: one proto file per
concern (`common`, `envelope`, `hello`, `heartbeat`, `metrics`, `portcheck`,
`update`) and the envelope with `protocol_version`, `server_id`, `seq`,
`timestamp_ms`, `payload`, `signature` and the `body` oneof (10–21). This breaks
the Phase 00 placeholder (`agent.proto`), which never shipped. CI's `buf breaking`
step now compares against `main` only once `main` has `envelope.proto`, so this
branch establishes the v1 baseline and every later change is checked.
**Why:** The phase document fixes the exact fields; keeping the placeholder's
field numbers would have forced a second envelope design.
**Rejected:** keeping `agent.proto` and appending (field 1/2 types differ); a
`v2` package for the first real protocol.

## 00XX · 2026-09-27 · Envelope signing: body-only payload, both directions
**Decision:** The sender serializes an `Envelope` that carries only `body` and puts
those bytes in the outer envelope's `payload`; the outer `body` stays unset.
The Ed25519 signature covers `protocol_version (u32) || len(server_id) (u16) ||
server_id || seq (u64) || timestamp_ms (i64) || payload`, big-endian (the
length prefix makes the concatenation unambiguous). Agents sign with the
identity key registered at join; the control plane signs with an instance key
(`AGENT_SIGNING_KEY`, a base64 seed; development generates one into
`STATE_DIR/agent-signing.key`), whose public half the join response returns.
Seal/Open live next to the generated code in Go (`envelope.go`) and TypeScript
(`src/envelope.ts`); fixtures prove both produce identical bytes.
**Why:** Signing the transmitted bytes needs no deterministic cross-language
re-serialization; signing both directions means a compromised proxy can't
inject commands (PHASE-02 §5). Resolves the §10 open question in favour of the
default.
**Rejected:** TLS + bearer only (weaker); signing a re-serialized oneof.

## 00XX · 2026-09-27 · Protocol fields added beyond the §4.1 list
**Decision:** `AgentHello.provider` (16) and `region_label` (17) — detection runs
on the agent; `AgentConfig.rotated_credential` (7) — how rotation reaches the
agent; `HostSample.self` (15, `AgentSelf{agent_rss_bytes, goroutines,
send_queue_len, reconnects_total}`) — required by §5 Observability; and
`HostSample.disk_low` (16) — the agent is authoritative for the build refusal in
Phase 03.
**Why:** Each is needed by a §4–§5 requirement that the message list omits.

## 00XX · 2026-09-27 · Minisign "ED" signatures, verified with openssl in the installer
**Decision:** Releases carry a `.sha256` (sha256sum format) and a standard
minisign `.minisig` (prehashed "ED": Ed25519 over BLAKE2b-512, plus the global
signature over the trusted comment). The agent verifies with
`internal/minisign` (golang.org/x/crypto/blake2b); the installer verifies both
signatures with `openssl pkeyutl -rawin` and coreutils only. The release key is
embedded in the agent at build time (`LUMEN_RELEASE_PUBKEY` → ldflags) and
substituted into the installer by the control plane (`AGENT_RELEASE_PUBKEY`).
`lumen-agent/cmd/lumen-release` generates keys and signs; its secret-key file
is unencrypted, so production keys stay offline or in a CI secret. Real
`minisign -V` verifies our signatures (evidence).
**Why:** One small Ed25519 key, a verifier that fits in a shell script with no
extra packages on a fresh VM. Resolves the §10 signature-tooling question.
**Rejected:** cosign/sigstore (heavier, needs network trust roots); GPG.

## 00XX · 2026-09-27 · SHA-256 for random secrets
**Decision:** Join tokens and server credentials are 32 random bytes (base64url)
stored as SHA-256 hex and compared in constant time.
**Why:** Brute force of a 256-bit random secret is infeasible, so a slow KDF
adds cost without security; argon2 stays for passwords (Phase 04).

## 00XX · 2026-09-27 · Reconnect, liveness and logging rules
**Decision:** Backoff 1 → 2 → 4 → 8 → 16 → 30 s cap, ±20 % jitter, reset after
60 s connected; one warn line per backoff step. After the ControlHello wait,
reads have no deadline: liveness is a ping every 10 s whose pong must arrive
within 30 s, plus 30 s write deadlines; the gateway closes sockets idle for 30 s
(pings count as activity).
**Why:** A per-read deadline closes the socket in coder/websocket when the
control plane legitimately says nothing (found on the first host install).

## 00XX · 2026-09-27 · Caddy bootstrap in Phase 02, hardened and pinned
**Decision:** `caddy:2-alpine@sha256:6aeddd44…cb2b` (Caddy 2.11.4, multi-arch
index), container `lumen-caddy`, host network, admin API `127.0.0.1:2019`,
`--cap-drop ALL --cap-add NET_BIND_SERVICE`, read-only root with `/config` and
`/data` mounts under `/var/lib/lumen/caddy`, pids 512, memory 256 MB,
`no-new-privileges`, restart always, label `lumen.role=proxy`. Base config: a
catch-all 404 page on `:80` and `:443`, a self-signed fallback certificate for
`:443` (tag `lumen-fallback`), `automatic_https` disabled on these two base
servers (Phase 03 enables certificates per route). A separate loop re-ensures
the container every heartbeat interval; probes never block heartbeats.
**Why:** The checklist needs "Proxy running" and the port check needs a
listener (resolves §10). Measured: a container removed by hand is back in 9 s.

## 00XX · 2026-09-27 · Queue bounds and rate limits
**Decision:** Agent → control plane queue 1,000 messages: metrics are dropped
first, then heartbeats; acks, errors and results are never dropped (kept even
past the limit) and are the only thing kept while offline. Control plane →
agent 256 in-flight per socket. Gateway: 200 msg/s and 2 MB/s per connection
(`4008 rate_limited`), 60 upgrade attempts per minute per address, join
10 attempts per minute per address (`AGENT_JOIN_RATE_LIMIT`), in-process limiters
(single API process until Phase 04, SPEC_QUESTIONS 20).

## 00XX · 2026-09-27 · Socket ownership in Postgres, commands over NOTIFY
**Decision:** Each API process keeps `server_id → socket` in memory and writes
`servers.gateway_node` / `gateway_connected_at` on connect. Commands for a
socket held elsewhere, replies for waiters elsewhere, and "claimed" notices
(which close an older connection on another process with `4001 superseded`)
travel on the `lumen_agent` NOTIFY channel. Realtime events use `lumen_events`.
**Why:** No Redis (SPEC B2); any replica can serve an API call for any server.
Only the single-process path is exercised by tests so far (see Known gaps).

## 00XX · 2026-09-27 · Clock skew is measured, corrected and surfaced
**Decision:** Every connection starts with the raw local clock, so the control
plane measures the real skew from AgentHello (stored in
`servers.clock_skew_ms`, shown as a CLOCK_SKEW issue over 5 minutes). The agent
then corrects its envelope timestamps with `server_time_ms`. The gateway rejects
envelopes outside −5 min / +1 min with `OpError{CLOCK_SKEW}` (replay window).
**Why:** §5 says a skewed server gets every message rejected; with correction the
server keeps working while the user is told to enable NTP. Deviation recorded
in SPEC questions.

## 00XX · 2026-09-27 · Self-update: trial run, health window, guard, probation
**Decision:** The agent verifies SHA-256 and signature, writes
`lumen-agent.new`, runs it as `run --trial <op_id>` (must connect, be accepted
and see Docker and Caddy healthy within 60 s), then swaps (`current → .prev`,
`.new → current`), records `state.update`, and exits 0. After the restart the
new binary must confirm health within 60 s or rolls back; three starts without
settling roll back; a ten-minute probation follows. The unit also runs
`ExecStartPre=-/usr/local/bin/lumen-agent.prev update-guard`: the previous
binary counts starts while an update is in progress and restores itself after
five, which covers a new binary that crashes before its own checks run.
**Why:** A binary that exits immediately can never roll itself back; the trial
and the guard close that hole (§9 review question). Verified on a systemd host:
good update, exit-immediately build, and crash-after-swap build.

## 00XX · 2026-09-27 · Revoked agents exit 78 and stay stopped
**Decision:** On Revoke the agent deletes its credential and exits 78
(EX_CONFIG); `run` without a credential also exits 78. The unit adds
`RestartPreventExitStatus=78` and `SuccessExitStatus=78` next to
`ConditionPathExists`.
**Why:** On the test host (systemd 255) `ConditionPathExists` did not stop
`Restart=always` from restarting the service after the credential was deleted.

## 00XX · 2026-09-27 · Phase 02 API shape
**Decision:** Server routes use snake_case bodies (0019) and prefixed ids
(`workspace_id: ws_…`, 0012) rather than the camelCase/UUID sketch in §4.11.
`POST /port-check` runs synchronously and returns 200 with the result (no job
queue until Phase 04); `POST /agent-update` returns 202 with `status: sent` and
the result lands on `servers.agent_update` and a `server.update` event. The
server object adds `os_version`, `kernel`, `hostname`, `docker_version`,
`disk_low`, `clock_skew_ms` and `issues` (catalog errors). Routes are guarded by
`LUMEN_ADMIN_TOKEN` (temporary instance-admin bearer, replaced in Phase 04) and
write `audit_log` rows. `/v1/ws` takes the token as the `auth.<token>`
subprotocol (browsers can't set headers) or a bearer header.

## 00XX · 2026-09-27 · Extra Phase 02 tables
**Decision:** Migration 0001 adds, beside `servers` and `server_join_tokens`:
`agent_ops` (24 h de-duplication, composite key `(server_id, op_id)` with the
op id stored as `<kind>:<op_id>` because replies reuse the request's op id),
`notifications` (in-app rows; Phase 08 delivers them), and `audit_log` (SPEC B6
columns). Phase 04 adds foreign keys to `workspaces` and must keep the columns.
**Why:** §5 and §6 require the de-dup table, the notification row and audit
entries; the phase's "two tables only" line predates those requirements.

## 00XX · 2026-09-27 · Automatic port check when the proxy is ready
**Decision:** The automatic check runs on the first heartbeat that reports Caddy
healthy while no result is stored (retried at most every five minutes), not on
the first heartbeat.
**Why:** On a fresh VM the proxy image is still pulling at first heartbeat; the
check would report `not_listening`.

## 00XX · 2026-09-27 · Detected provider wins over the wizard's choice
**Decision:** The join token records the provider the user picked; a provider
detected from the metadata service replaces it unless detection says `other`.

## 00XX · 2026-09-27 · Phase 02 dependencies
**Decision:** Licenses and maintenance checked on 2026-09-27.

| Package | Version | License | Role |
|---|---|---|---|
| github.com/coder/websocket | v1.8.15 | ISC | Agent WebSocket client (context-aware, no deps) |
| golang.org/x/crypto | v0.57.0 | BSD-3-Clause | BLAKE2b for minisign verification |
| ws (npm) | 8.21.3 | MIT | Gateway and `/v1/ws` servers (8.22.0 was one day old; the pnpm release-age guard applies) |
| @types/ws | 8.18.1 | MIT | Types |
| zod (in @lumen/shared) | 4.6.5 | MIT | Already in the catalog; shared request schemas |
| caddy:2-alpine | digest `6aeddd44…` | Apache-2.0 | Platform proxy image |

**Rejected:** gorilla/websocket (no context API); the Docker Go SDK (large; the
agent uses the Engine HTTP API directly); testcontainers (tests use schemas in
the shared dev Postgres instead).

## 00XX · 2026-09-27 · Host verification in systemd containers instead of Multipass
**Decision:** `e2e/vm/` runs the real installer against a bundled control plane
in a Linux container: `host.Dockerfile` is a privileged systemd Ubuntu 24.04
"VM" (no Docker preinstalled; the installer installs it), `/var/lib/docker` and
`/var/lib/containerd` are volumes (overlay can't stack on overlay), a test CA
signs the control plane certificate, and `scenarios.sh` drives port-block,
offline, disk-full, proxy removal, updates and the audit. `build-releases.sh`
signs real and deliberately broken builds.
**Why:** The development machine is Windows with Docker Desktop; Multipass is not
available. The harness exercises systemd, iptables, Docker installation and the
network path the port check uses.

---

## SPEC questions found (for SPEC_QUESTIONS.md)

| # | Area | Question | Default applied | Where |
|---|---|---|---|---|
| 42 | PHASE-02 §4.11 vs 0012/0019 | The Zod sketch uses camelCase fields and `workspaceId: uuid()`. | snake_case and `ws_…` ids. | DECISIONS 00XX API shape |
| 43 | PHASE-02 §5 clock skew | "Connection accepted but each message is rejected" conflicts with timestamp correction from `server_time_ms` (§4.4). | Correct and surface; reject only out-of-window envelopes. | DECISIONS 00XX clock skew |
| 44 | PHASE-02 §4.3 unit | `ConditionPathExists` alone doesn't keep a revoked agent stopped under `Restart=always`. | Exit 78 + `RestartPreventExitStatus`. | DECISIONS 00XX revoke |
| 45 | PHASE-02 §3 | "servers and server_join_tokens tables only" vs §5/§6 needing `agent_ops`, a notification row and audit entries. | Three small extra tables. | DECISIONS 00XX tables |
| 46 | PHASE-02 §4.6 | Port check "enqueues a job" but the queue is Phase 04. | Synchronous request returning the result. | DECISIONS 00XX API shape |
| 47 | D1 / §6 | "Offline within 30 s": the sweep runs every 5 s over a 30 s threshold, so detection lands 30–35 s after the last heartbeat (up to 45 s after the failure, heartbeats being 10 s apart). Measured 31 s after the network was cut. | Keep 30 s threshold + 5 s sweep; read the AC as "30 s of silence". | offline-online.txt |
| 48 | D1 / §4.8 | "Paste to online < 3 min" includes installing Docker; on the test host Docker's apt install alone took 3–4 min. | Needs measuring on real 1 vCPU VMs; §10's fallback (skip buildx) not applied yet. | install transcripts |
| 49 | PHASE-02 §4.1 vs §5 | `HostSample.self` is required by §5 but missing from §4.1's list. | Added (field 15). | DECISIONS 00XX fields |
| 50 | SPEC J1 | Lists `POST /servers`; Phase 02 has no such route (servers come from join). | Not implemented; Phase 16 (cloud provisioning) may own it. | — |
| 51 | PHASE-02 §4.8 files | `e2e/vm/agent-install.spec.ts` (Multipass) and `apps/api/test/servers.test.ts`. | Docker-based shell harness in `e2e/vm/`; API tests next to sources (Phase 0 convention). | DECISIONS 00XX harness |
| 52 | PHASE-02 §4.2 | `apps/agent/.goreleaser.yaml`. | Not added: `scripts/build-go.sh` + `lumen-release sign` produce the artifacts; goreleaser is a Phase 18 release-pipeline choice. | Known gaps |

---

## Progress (for PROGRESS.md)

### Done — 2026-09-27 — Phase 2 — Agent core and server join (branch `worktree-agent-ac9248c5c2d5f9d24`)
- Protocol v1: seven proto files, signed envelopes (Go + TS Seal/Open with
  byte-identical fixtures for all 13 message samples).
- `lumen-agent` (8.7 MB amd64 / 8.1 MB arm64, static): join with identity and
  credential, signed WebSocket with backoff/pings/queue, heartbeats, host
  metrics with `disk_low`, hardened Caddy bootstrap with a 404 page, port-check
  responder, provider detection (7 providers), self-update with trial run,
  health window, crash-loop rollback and an ExecStartPre guard, revocation,
  `status --wait-online/--check-credential`, `uninstall`, `lumen-release`.
- `deploy/agent-install.sh` + `agent-uninstall.sh` (POSIX sh, idempotent,
  Oracle-style iptables insertion before the first REJECT, openssl-verified
  minisign signatures) with 62 bats tests.
- Control plane: join endpoint, `/agent/v1` gateway (signature, seq, window,
  rate limits, 4001/4002/4008), socket registry, offline sweep with in-app
  notification and `server.offline`, metrics + DISK_FULL, update results,
  credential rotation, server routes (Zod, admin token, audit, OpenAPI),
  `/v1/ws` realtime over NOTIFY, installer/fix-card/download routes,
  `/internal/metrics`.
- Shared: PORT_BLOCKED / MESH_UNREACHABLE fix cards (7 providers × cloud/os),
  six new catalog codes, server schemas; DB migration 0001.
- User docs: `docs/user/servers/add-server.md` and seven provider guides.

### Test counts (2026-09-27)
- Vitest: protocol 26, shared 32, db 7, api 64 (Phase 02 total 129; repo total
  with web 5 and ui 143: 277), all passing.
- Go: 70 tests incl. subtests pass on Linux (WSL2 Ubuntu 24.04, 0 skipped);
  on Windows the same suites pass with two Linux-only tests skipped.
- bats: 62/62 (dash, WSL2 Ubuntu 24.04); shellcheck clean.
- `buf lint` clean; `buf breaking` clean against this branch's HEAD; fails once
  against `main` by design (placeholder replaced).
- golangci-lint: 0 issues for GOOS=windows and GOOS=linux.

### Known gaps
- No public cloud VM was available: public-internet reachability, metadata
  provider detection on real clouds, Oracle security-list behaviour, native
  Ampere arm64, and paste-to-online under 3 minutes on a 1 vCPU VM are
  unverified (see evidence README for what the container host did cover).
- Paste-to-online on the test host was 3m31s–4m48s, dominated by Docker's apt
  install (3–4 min over this network); the agent part took ~40 s.
- arm64: binaries build and run under QEMU; the installer on an emulated arm64
  host (see evidence) is the only arm64 end-to-end run.
- Dashboard pieces (add-server wizard, checklist, fix cards) are Phase 05; the
  API and events they need exist.
- `rolloutAgentUpdate` (one server at a time, stop on failure) has no route yet;
  Phase 11's instance-admin update page drives it.
- Cross-process command routing over NOTIFY is implemented but only exercised
  with one API process; credential rotation reconnects the agent only when this
  process holds its socket.
- The certificate fingerprint recorded at join is checked on re-join only, not
  on every connection.
- bats and the host harness don't run in CI yet.
- No goreleaser config (build script + `lumen-release` instead).

### Next
- Phase 03 (deploy engine) on top of this channel; cross-model review of
  Phase 02 (SPEC H1 + H4 on the registry); real-VM runs on Hetzner/DO amd64 and
  Oracle Ampere A1 to close the cloud-only criteria.
