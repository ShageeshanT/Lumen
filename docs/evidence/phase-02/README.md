# Phase 02 evidence

Collected 2026-09-27 on the development machine. **No public cloud VM was
used.** Everything below ran against the harness in `e2e/vm/`:

| Piece | What it was |
|---|---|
| Control plane | The API bundled into one file (`e2e/vm/bundle-api.sh`) running in `node:24-bookworm-slim`, HTTPS on :4204 with a certificate from a throwaway test CA, `NODE_ENV=production`, Postgres 16 (the dev compose database), on a Docker network `lumen-p2` |
| "VMs" | Privileged `ubuntu:24.04` containers with systemd as PID 1 (`e2e/vm/host.Dockerfile`: curl, ca-certificates, iptables, sudo; **no Docker** — the installer installs Docker CE from download.docker.com). `/var/lib/docker` and `/var/lib/containerd` are volumes. Kernel: Docker Desktop's WSL2 kernel 6.6.87.2 on Windows 11, 8 vCPU, 7.6 GB |
| host1 | `lumen-p2-host1`, Ubuntu 24.04 amd64, no OS firewall rules |
| host2 | `lumen-p2-host2`, Ubuntu 24.04 amd64 with **Oracle's default Ubuntu INPUT rules** applied before install (`… -A INPUT -j REJECT --reject-with icmp-host-prohibited`) |
| host3 | `lumen-p2-host3`, Ubuntu 24.04 **arm64 under QEMU emulation** (not an Ampere VM) |
| Releases | `e2e/vm/build-releases.sh`: 0.2.0 and 0.2.1 real builds, 0.2.2 exits immediately, 0.2.3 passes the trial then crashes on start; all signed with a test minisign key (real `minisign -V` verifies them) |
| Outside probe | The control plane probes each host's address on the Docker network (not the public internet) |

The join command pasted into each host is exactly the `command` from
`POST /v1/servers/join-tokens`, plus `--cacert`/`--ca-file` for the test CA
(`e2e/vm/run-install.sh`). Tokens are redacted in transcripts.

## Files

| File | Shows |
|---|---|
| `install-ubuntu-24.04-amd64.txt` | Fresh host → online, 4m48s total (Docker's apt install 4m05s; agent start → "Proxy running" 41 s) |
| `install-ubuntu-24.04-amd64-oracle-iptables.txt` | Fresh host with Oracle's REJECT rule → ACCEPT rules inserted directly before the REJECT, persisted, online in 3m31s |
| `install-rerun-ubuntu-24.04-amd64.txt` | Re-running the same command, 6 s: steps 1–5 and 7 "already done"; step 6 wrongly printed "credential no longer valid … joined" because the credential check ran without the test CA (the agent's own `join` found the existing registration, so no new server was created). Fixed in 8ac7697; the next file shows the corrected output |
| `install-rerun-agent-upgrade.txt` | Re-run after a new agent build: binary replaced and verified, "Already joined … (already done)", unit rewritten (ExecStartPre guard), restarted, online in 2 s |
| `api-get-servers.txt` | `GET /v1/servers` with a fully green checklist for the joined hosts |
| `port-check-oracle-443-before-after.txt` | host2: 443 ACCEPT removed → `listening_not_reachable` with `PORT_BLOCKED.oracle.cloud` + `.os` fix cards and a red Port 443 item; rule re-added → `reachable` in one run |
| `offline-online.txt` | host1 cut off the network → `offline` 31 s later, back `online` 5 s after reconnecting; `/v1/ws` events with 56–125 ms latency |
| `notifications.txt` | In-app notification rows: AGENT_OFFLINE and DISK_FULL |
| `disk-full.txt` | `fallocate` leaving 1.5 GB free on `/var/lib/lumen` (a 2.6 GB tmpfs) → `disk_low` in 9 s with a DISK_FULL issue; back to false 8 s after cleanup |
| `proxy-recreated.txt` | `docker rm -f lumen-caddy` → recreated in 9 s, serving the 404 page |
| `self-update-good.txt` | 0.2.0 → 0.2.1: verified, trial-run, swapped, healthy, `succeeded` in ~4 s; proxy container not restarted |
| `self-update-bad-exits-immediately.txt` | 0.2.1 → 0.2.2: refused by the trial run, 0.2.1 keeps running, `failed` recorded |
| `self-update-bad-crashes-after-swap.txt` | 0.2.1 → 0.2.3: swapped, crashes on start five times, the ExecStartPre guard restores 0.2.1, `failed` recorded; proxy container not restarted |
| `self-update-first-attempt-trial-killed.txt` | The first real update attempt, which found the trial-run context bug (fixed in 8ac7697) |
| `revoke-rejoin.txt`, `rejoin-after-revoke.txt` | DELETE → agent drops its credential, keeps its identity; rejoining with a new token reuses the same public key (new server id). The first revoke was captured before the exit-78 fix and shows systemd restarting the service |
| `revoke-stays-stopped.txt` | After the fix: revoked agent exits 78 and systemd leaves it stopped |
| `audit-host1.txt`, `audit-host2-after-1h.txt` | `ss -tlnp` (only Caddy on :80, :443 and 127.0.0.1:2019; the 127.0.0.11 listener is Docker's embedded DNS of the test container), `MemoryCurrent` (8.6 MB after 65 min on host2), RSS, proxy container hardening, admin API refused from the network |
| `agent-cpu-memory-host2.txt` | 0.19 % of one core over 5 minutes (heartbeats + 10 s metrics sampling), goroutines steady at 13 |
| `go-tests-linux.txt` | Go test binaries run on WSL2 Ubuntu 24.04: 70 passed, 0 skipped |
| `buf.txt` | `buf lint`, `buf format`, `buf breaking` (clean against this branch; fails once against `main` by design) |
| `install-debian-12-amd64.txt` | Fresh Debian 12 host: every step passed, but the network was congested (Docker install 16 min, Caddy image pull 6 min), so the 90 s wait timed out before "Proxy running" and printed the agent log and the re-run command |
| `install-debian-12-amd64-rerun.txt` | The re-run a few minutes later: every step "already done", online, and the API checklist fully green |
| `install-ubuntu-24.04-arm64-qemu*.txt` | Emulated arm64 host: the first run timed out reaching download.docker.com (TLS handshakes take ~4 s under QEMU); the retry spent ~2 h in apt and Docker never answered under emulation. **No arm64 end-to-end result** |
| `arm64-binary-qemu.txt` | The arm64 agent binary runs under QEMU (`version`, `status`) |

## Not covered here (needs real cloud VMs)

- Reachability from the public internet, provider cloud firewalls (an Oracle
  security list, AWS security groups…), and metadata-based provider detection
  on real clouds (unit-tested with mocked metadata only).
- Paste-to-online under 3 minutes on a 1 vCPU VM.
- Native arm64 (Oracle Ampere A1) and `MemoryCurrent` after 1 h on arm64.
