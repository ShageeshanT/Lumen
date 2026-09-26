# Phase 11 — Self-host installer and setup wizard

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 (installer, `lumen-admin`, update + rollback, control-plane backups) → Opus 5.5 (setup wizard UI, Instance admin pages) → each reviewed by the other |
| **Depends on** | Phase 2 (agent install script, join tokens, port check), Phase 4 (auth, instance_settings, audit log), Phase 5 (app shell, settings layout, error cards), Phase 6 (GitHub App manifest endpoint), Phase 7 (domains, automatic HTTPS), Phase 9 (backup destinations + S3 client) |
| **Unblocks** | Phase 12 (multi-server installs use the same installer and firewall logic), Phase 16 (cloud provisioning runs this installer through cloud-init), Phase 18 (install matrix, upgrade tests, release pipeline) |
| **Spec sections** | SPEC Part E (E1–E6), C7.1, C7.22, C7.26, B12 (setup takeover protection, supply chain), B9 (IP-based wildcard fallback), E2/E3/E4/E5, D12, J6 (`PORT_BLOCKED`, `AGENT_OFFLINE`, `DISK_FULL`) |
| **Estimated sessions** | 6 focused sessions: (1) `install.sh` preflight + Docker + firewall, (2) config, compose, start, final output, local agent pre-join, (3) setup token API + wizard steps 0–2, (4) wizard steps 3–5 + finish + Instance admin pages, (5) `lumen-admin` update/rollback/uninstall + in-app Updates, (6) control-plane backup/restore + provider guides + stopwatch and rollback tests |

## 1. Goal
A person who has never used Lumen pastes one `curl … | sh` command into a fresh 2 vCPU / 2 GB VM, opens the printed URL, types the 6-word setup code, and has their first app live on HTTPS in under 10 minutes without reading docs.

## 2. Why this phase exists
Every other phase assumes a running control plane. Until now that control plane was started by hand in a developer environment. This phase is the front door for real users, and the front door decides whether anyone ever sees the canvas. Three things drive the design:

- **Beginners run everything on one free-tier VM.** The installer must work on the cheapest Oracle ARM instance and the cheapest x86 box, keep the control plane under 512 MB idle, and never assume a second machine.
- **Most real-world failures live in firewalls and OS differences** (SPEC 0.4). Oracle's Ubuntu images ship with iptables `REJECT` rules that silently block 80/443 even when the cloud security list is open. The installer has to detect and fix that, and when it cannot (cloud firewall), it has to say exactly which console page to open.
- **The first minutes decide trust.** A setup wizard that gets stuck, prints a stack trace, or lets a stranger claim the instance (setup takeover) kills the product. The setup code is the only thing standing between "I ran a script" and "someone else owns my dashboard", so it is treated as a credential: rate-limited, constant-time compared, single-use.

Updates and control-plane backups live here too, because "how do I upgrade without losing my apps" and "my VM died, how do I get my dashboard back" are the two questions every self-hoster asks in week two.

## 3. Scope
### In scope
- `deploy/install.sh`: the one-command control-plane install (SPEC E2 steps 1–7), idempotent on re-run
- Provider detection through cloud metadata endpoints (Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, generic)
- OS firewall handling for ufw, firewalld and raw iptables (including Oracle Ubuntu `REJECT` rules) with persistence
- `/opt/lumen/` layout: `docker-compose.yml`, `.env` with generated secrets, `caddy/`, `backups/`, `releases/`
- Images pinned by digest for caddy, web, api, workers, postgres, optional registry
- Local agent pre-joined on the control-plane host (SPEC B1: "The control plane host also runs an agent")
- The final terminal block: URL, 6-word setup code, `.env` warning, log path
- Setup token issuance, verification, rate limiting, single use, and takeover protection (SPEC B12)
- First-run setup wizard, steps 0–5 plus finish (SPEC C7.1), every step finishable later from Instance settings
- Instance admin pages (SPEC C7.22): Overview, Users, Workspaces, Registration, Domain & TLS, GitHub App, Email, Control-plane backups, Updates, System logs
- `lumen-admin` host command: `status`, `update`, `rollback`, `backup`, `restore`, `uninstall`, `logs`, `setup-code`
- Update channels (stable, beta) with a release manifest and changelog shown before updating; in-app one-click update with automatic rollback (SPEC E3)
- Control-plane nightly backup (`pg_dump` + `.env` encrypted with a user-supplied passphrase) and restore on a new VM with agent reconnection (SPEC E4)
- `lumen-admin uninstall` and `lumen-agent uninstall` (SPEC E5)
- Provider guides (SPEC E6) as docs pages and in-app fix cards
- The stopwatch usability test protocol and the update-rollback test

### Out of scope
- Agent install script internals, join flow, port checks (Phase 2 owns `deploy/agent-install.sh`; this phase calls it)
- Automatic HTTPS and DNS checking logic (Phase 7 owns it; this phase reuses the DNS record card and the live checker)
- Backup destination CRUD and the S3/restic client (Phase 9; this phase reuses them for control-plane backups)
- GitHub App manifest flow implementation (Phase 6; this phase embeds its button)
- Cloud provisioning through provider APIs (Phase 16)
- Signed release artifacts, SBOM, the release workflow itself (Phase 18; this phase defines the manifest format it consumes)
- The docs site build (Phase 18; this phase writes the provider guide content as Markdown)

## 4. Work breakdown

### 4.1 Installer skeleton, logging, and re-run safety
- **What:** Create `deploy/install.sh` as POSIX `sh` (no bashisms; Debian's `dash` must run it). Top of file: `set -eu`, a `main` function invoked at the very end so a partially downloaded script never executes. Every step logs to `/var/log/lumen-install.log` (mode 0600) with an ISO-8601 timestamp; the terminal shows only the step lines. Implement `step "Checking your server"`, `ok "Docker 28.1 found"`, `warn "…"`, `fail "…"` helpers that print `✓`, `!`, `✗` prefixed lines (ASCII fallback `[ok]`, `[!!]`, `[xx]` when `LANG` lacks UTF-8 or `LUMEN_ASCII=1`). Detect an existing install (`/opt/lumen/.env` present) and switch to "verify and repair" mode: never regenerate secrets, never restart healthy containers.
- **Files:** `deploy/install.sh`, `deploy/lib/log.sh` (inlined into `install.sh` by `deploy/build.sh` so the published script is one file), `deploy/build.sh`, `deploy/README.md`
- **Done when:** `sh -n deploy/install.sh` passes; `shellcheck -s sh` passes with zero warnings; running the script twice on the same VM produces `✓ Lumen is already installed and healthy. Nothing to do.` and exits 0 in under 5 seconds.

### 4.2 Preflight (SPEC E2 step 1)
- **What:** Checks, in order, each with a plain-language failure and fix:
  1. Root or passwordless sudo → `✗ Run this as root or with sudo: sudo sh -c "$(curl -fsSL …)"`
  2. OS and version from `/etc/os-release`: Tier 1 Ubuntu 22.04 / 24.04, Debian 12; Tier 2 RHEL-family 9 (AlmaLinux, Rocky, Oracle Linux 9). Anything else → `✗ Lumen supports Ubuntu 22.04/24.04, Debian 12 and RHEL-family 9. Found: Fedora 40.` with `LUMEN_FORCE_OS=1` documented as an escape hatch.
  3. Architecture `uname -m` in `x86_64`, `aarch64` → `✗ Lumen runs on amd64 and arm64 servers. Found: armv7l.`
  4. RAM ≥ 2 GB (`/proc/meminfo` MemTotal ≥ 1900000 kB to allow for kernel reservation), disk ≥ 20 GB free on `/opt` (`df -Pk /opt`), with a warning (not failure) at 2 GB RAM: `! 2 GB of RAM is the minimum. Apps and builds share it with the dashboard.`
  5. Ports 80 and 443 free (`ss -ltn`) unless the listener is a Lumen container → `✗ Port 80 is used by nginx (pid 1234). Stop it or install Lumen on a fresh server.`
  6. Existing Docker detection: `docker version --format '{{.Server.Version}}'` ≥ 24 is reused; older prints `! Docker 20.10 is older than we test with. Continuing.`; Podman-only systems fail with a message.
  7. Outbound HTTPS to the release host and to `ghcr.io` (or the configured image registry) with a 5 s timeout → `✗ Your server can't reach the internet over HTTPS. Check the outbound firewall or proxy.`
  8. Time sync: `timedatectl show -p NTPSynchronized` false → warning about certificates.
- **Files:** `deploy/install.sh` (`preflight` function), `deploy/lib/preflight.sh`
- **Done when:** each check has a unit test in `deploy/tests/preflight.bats` (bats-core, MIT) using stubbed commands; a VM with 1 GB RAM fails with the exact RAM message.

### 4.3 Docker Engine install (SPEC E2 step 2)
- **What:** When Docker is missing: add the official Docker apt/dnf repository for the detected OS, install `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`, enable and start `docker.service`, verify `docker compose version` ≥ 2.20. Pin nothing, but log the installed version. On RHEL-family 9 also ensure `iptables-nft` compatibility and disable Podman's `podman-docker` shim if present.
- **Files:** `deploy/lib/docker.sh`
- **Done when:** fresh Ubuntu 24.04 arm64 and Debian 12 amd64 VMs end with `✓ Docker 28.x installed`; re-run prints `✓ Docker 28.x found`.

### 4.4 Provider detection through metadata endpoints
- **What:** `detect_provider` tries each endpoint with `curl -s -m 2` and sets `LUMEN_PROVIDER` to the first match:
  - Oracle: `curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/` returns JSON with `"shape"`
  - AWS (IMDSv2): `TOKEN=$(curl -X PUT -H "X-aws-ec2-metadata-token-ttl-seconds: 60" http://169.254.169.254/latest/api/token)` then `curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id`
  - GCP: `curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/id`
  - Azure: `curl -H "Metadata: true" "http://169.254.169.254/metadata/instance?api-version=2021-02-01"`
  - Hetzner: `curl http://169.254.169.254/hetzner/v1/metadata` (YAML with `instance-id`)
  - DigitalOcean: `curl http://169.254.169.254/metadata/v1/id`
  - Otherwise `generic`. `LUMEN_PROVIDER=hetzner` in the environment overrides detection.
  The public IP comes from the metadata endpoint when available, otherwise from `curl -4 https://api.ipify.org` with `https://ifconfig.me` as fallback, and finally the default route interface address with a warning `! Couldn't confirm your public IP. Using 10.0.0.5. Set LUMEN_PUBLIC_IP if this is wrong.`
- **Files:** `deploy/lib/provider.sh`, `packages/shared/src/providers/index.ts` (the same provider ids and display names used by the dashboard: `oracle`, `aws`, `gcp`, `azure`, `hetzner`, `digitalocean`, `other`)
- **Done when:** `deploy/tests/provider.bats` covers every endpoint with a stubbed `curl`; the log line `provider=oracle public_ip=…` appears on a real Oracle VM.

### 4.5 Firewall handling and persistence (SPEC E2 step 3)
- **What:** Open 80/tcp, 443/tcp and 51820/udp, in this precedence:
  1. **ufw active** (`ufw status | grep -q 'Status: active'`): `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw allow 51820/udp`; no reload needed.
  2. **firewalld active** (`firewall-cmd --state`): `firewall-cmd --permanent --add-service=http --add-service=https --add-port=51820/udp` then `--reload`.
  3. **Raw iptables with REJECT rules** (Oracle Ubuntu and Oracle Linux images): if `iptables -S INPUT` contains `-j REJECT --reject-with icmp-host-prohibited`, insert `-A INPUT -p tcp --dport 80 -j ACCEPT`, `443`, and `-p udp --dport 51820 -j ACCEPT` **before** the REJECT rule (`iptables -I INPUT <index>`), repeat for `ip6tables`, then persist: on Ubuntu/Debian write `/etc/iptables/rules.v4` and `.v6` through `netfilter-persistent save` (install `iptables-persistent` non-interactively with `DEBIAN_FRONTEND=noninteractive`); on RHEL-family use `iptables-save > /etc/sysconfig/iptables` with `iptables-services` enabled.
  4. **No firewall:** log `firewall=none` and move on.
  Print the cloud-firewall instruction for the detected provider immediately after, since the OS firewall is only half the story:
  ```
  ! Oracle also filters traffic in the cloud console.
    Open Networking → Virtual Cloud Networks → your VCN → Security Lists → Default
    and add ingress rules for TCP 80, TCP 443 (source 0.0.0.0/0).
    Lumen checks these ports again in a moment.
  ```
  Provider texts live in one place, `deploy/lib/firewall-hints.sh`, generated from `packages/shared/src/providers/fixes.ts` by `deploy/build.sh` so the terminal and the dashboard fix cards never drift.
- **Files:** `deploy/lib/firewall.sh`, `deploy/lib/firewall-hints.sh` (generated), `packages/shared/src/providers/fixes.ts`, `deploy/build.sh`
- **Done when:** a fresh Oracle Ubuntu 24.04 arm64 VM with the default `REJECT` rules ends with `iptables -S INPUT` showing the three ACCEPT rules above the REJECT, they survive a reboot, and `curl -I http://<ip>` from outside returns a Caddy response.

### 4.6 Write config (SPEC E2 step 4)
- **What:** Create `/opt/lumen/` (0750, root) with:
  - `.env` (0600) containing generated secrets, each generated with `head -c 32 /dev/urandom | base64 | tr -d '=+/' | cut -c1-43` unless noted:
    - `POSTGRES_PASSWORD` (43 chars)
    - `LUMEN_MASTER_KEY` (32 raw bytes, base64, the AES-256-GCM master key from SPEC B7)
    - `SESSION_SECRET` (64 hex chars)
    - `LUMEN_SETUP_TOKEN` (6 words, lowercase, hyphen-joined, from the EFF short wordlist embedded in the script: 1296 words, so ~62 bits)
    - `LUMEN_INSTANCE_ID` (UUID v4)
    - `LUMEN_PUBLIC_URL` (`https://<ip-with-dashes>.sslip.io` until the wizard sets a domain)
    - `LUMEN_BASE_DOMAIN` (empty until the wizard sets it)
    - `LUMEN_PROVIDER`, `LUMEN_PUBLIC_IP`, `LUMEN_UPDATE_CHANNEL=stable`, `LUMEN_VERSION=<installed>`, `LUMEN_TELEMETRY=off`
  - `docker-compose.yml` rendered from `deploy/compose/control-plane.yml.tmpl` (4.7)
  - `caddy/control-plane.json`: the Caddy routes for the dashboard host → `web:3000`, `/v1/*`, `/agent/*`, `/mcp`, `/healthz` → `api:4000`, with `X-Forwarded-*` handling
  - `releases/current` → symlink to `releases/<version>/` holding that version's compose file and manifest, so `lumen-admin rollback` is a symlink swap
  - `backups/` (0700)
  On re-run, never overwrite `.env`; render compose only if the template version changed and log the diff.
- **Files:** `deploy/lib/config.sh`, `deploy/compose/control-plane.yml.tmpl`, `deploy/caddy/control-plane.json.tmpl`, `deploy/wordlist.txt` (EFF short wordlist, CC-BY 3.0 attribution kept in `deploy/THIRD_PARTY.md`)
- **Done when:** the rendered `.env` passes `deploy/tests/config.bats` (every key present, permissions 0600, setup token matches `^([a-z]+-){5}[a-z]+$`), and a second run leaves `.env` byte-identical.

### 4.7 Compose file, pinned images, start, and health wait (SPEC E2 step 5–6)
- **What:** `control-plane.yml.tmpl` defines:
  - `caddy` — `caddy:2.<pinned>@sha256:<digest>`, ports `80:80`, `443:443`, `443:443/udp`, admin API bound to `127.0.0.1:2019` only (SPEC B12), volume `caddy_data`, labels `lumen.role=caddy lumen.managed=true`; loads `/opt/lumen/caddy/control-plane.json` at start
  - `postgres` — `postgres:16.<pinned>@sha256:<digest>`, volume `postgres_data`, `shm_size: 128m`, healthcheck `pg_isready`, no host port
  - `api` — `ghcr.io/<org>/lumen-api:<version>@sha256:<digest>`, `127.0.0.1:4000:4000`, depends on postgres healthy, runs `migrate` then `serve`, healthcheck `GET /healthz`
  - `workers` — same image, command `workers`, healthcheck `GET /healthz` on 4001
  - `web` — `ghcr.io/<org>/lumen-web:<version>@sha256:<digest>`, `127.0.0.1:3000:3000`
  - `registry` — `registry:2.<pinned>@sha256:<digest>`, under `profiles: [multi-server]`, listening only on the mesh IP once Phase 12 sets it
  Memory limits per service (`mem_limit`): caddy 64m, postgres 256m, api 160m, workers 128m, web 128m, so the sum stays below the 512 MB budget with headroom on a 2 GB box. `restart: unless-stopped` everywhere. All digests come from `deploy/releases/<version>.json` (the release manifest, written by Phase 18's pipeline; hand-written for now with the same schema: `{version, channel, published_at, images: {caddy: {ref, digest}, …}, agent: {version, urls: {"linux/amd64": …, "linux/arm64": …}, sha256: {…}, signature_url}, changelog_url, min_upgrade_from}`).
  Start with `docker compose --project-name lumen up -d --quiet-pull`, showing `… Pulling images (3/5)` by parsing `docker compose pull` progress. Then wait up to 180 s for `curl -sf http://127.0.0.1:4000/healthz` to return `{"status":"ok","version":"…"}`; print a dot every 2 s; on timeout print the last 30 lines of `docker compose logs api` and the message `✗ The dashboard didn't start in time. The log above usually says why. Full log: /var/log/lumen-install.log`.
- **Files:** `deploy/compose/control-plane.yml.tmpl`, `deploy/releases/<version>.json`, `deploy/lib/start.sh`
- **Done when:** on a 2 GB VM, `docker stats --no-stream` after 10 minutes idle shows web + api + workers + postgres + caddy under 512 MB combined; `docker compose config` shows every image with an `@sha256:` digest.

### 4.8 Local agent pre-join
- **What:** After the API is healthy, the installer mints a join token through a localhost-only bootstrap endpoint `POST http://127.0.0.1:4000/internal/setup/local-server` authenticated by `LUMEN_SETUP_TOKEN` (the endpoint refuses any non-loopback `remote_addr` and any call after setup completes). The response is a join token. The installer then runs the Phase 2 agent installer: `sh /opt/lumen/releases/current/agent-install.sh --token <join-token> --control-plane wss://127.0.0.1:4000/agent/v1 --name this-server --adopt-caddy`. `--adopt-caddy` tells the agent to use the already-running compose Caddy (container label `lumen.role=caddy`) through its admin API at `127.0.0.1:2019` instead of starting its own, and to treat the routes in `control-plane.json` as reserved. The agent's control-plane URL is switched to the public hostname by the wizard's domain step so a restored control plane on a new IP is reachable, but the local agent keeps the loopback address.
- **Files:** `apps/api/src/routes/internal/setup.ts`, `deploy/install.sh` (`join_local_agent`), agent flag in `apps/agent/cmd/lumen-agent/main.go` and `apps/agent/internal/caddy/adopt.go` (coordinate with Phase 2/3 owners; add to `docs/DECISIONS.md`)
- **Done when:** the Servers page after setup shows one server, `this-server`, online, with the provider chip from 4.4 and the port checks green; `systemctl status lumen-agent` is active; the endpoint returns 403 when called from a non-loopback address or after setup completion.

### 4.9 Final terminal block (SPEC E2 step 6)
- **What:** Print exactly this (width 60, box drawn with `─`, ASCII `-` fallback):
  ```

  ────────────────────────────────────────────────────────────
    Lumen is running.

    Open        https://203-0-113-10.sslip.io
    Setup code  apple-river-canyon-bright-ember-stone

    Keep /opt/lumen/.env safe. It holds your encryption key.
    Install log: /var/log/lumen-install.log
  ────────────────────────────────────────────────────────────

  ```
  When port 443 was detected blocked by the cloud firewall (4.5 hint printed and the outbound self-check `curl -m 5 -sI https://<host>` failed), the block gains one line under Open: `Port 443 looks blocked from the internet. Fix it in your cloud console, then open the link.` The setup code is also retrievable later with `lumen-admin setup-code` (which prints it only until setup completes, then prints `Setup is complete. There is no setup code anymore.`).
- **Files:** `deploy/lib/finish.sh`
- **Done when:** the block renders identically in `bash`, `dash`, and over `ssh` with `TERM=dumb`; the URL opens the wizard.

### 4.10 Setup token verification and takeover protection (SPEC B12)
- **What:**
  - On boot the API reads `LUMEN_SETUP_TOKEN`, stores `argon2id(token)` in `instance_settings.setup_token_hash` if `setup_completed_at` is null, and never logs the token.
  - `POST /v1/setup/verify {code}` normalizes input (trim, lowercase, spaces/underscores → hyphens), compares with `argon2.verify`, and on success returns a `setup_session` cookie (httpOnly, Secure, SameSite=Lax, 30 min) that every other `/v1/setup/*` route requires.
  - Rate limit: 5 failed attempts per IP per 15 minutes, then `429` with `retry_after`; 20 failed attempts total across all IPs locks setup and requires `lumen-admin setup-code --rotate` (prints a new code, resets counters). Every attempt is written to `audit_log` with action `setup.verify`, actor `anonymous`, ip.
  - `POST /v1/setup/complete` sets `setup_completed_at`, deletes `setup_token_hash`, invalidates `setup_session`, and writes `LUMEN_SETUP_TOKEN=` (empty) into `/opt/lumen/.env` through the local agent's `HostFileEdit` op restricted to that single key.
  - Middleware: while `setup_completed_at` is null, every non-setup route (web and API) redirects/returns `409 SETUP_REQUIRED`; after completion, `/setup/*` renders "Setup is complete" and links to `/login`.
  - The wizard state (which steps are done) lives in `instance_settings.setup_progress` (`jsonb`), so a closed tab resumes at the right step.
- **Files:** `apps/api/src/routes/setup.ts`, `apps/api/src/middleware/setup-gate.ts`, `apps/api/src/lib/setup-token.ts`, `packages/db/src/schema/instance-settings.ts`, `apps/web/middleware.ts` (setup gate), `packages/shared/src/errors/catalog.ts` (`SETUP_CODE_MISMATCH`, `SETUP_LOCKED`, `SETUP_REQUIRED`, `SETUP_ALREADY_COMPLETE`)
- **Done when:** Vitest covers normalization, constant-time verify, rate limit, lockout, single use; an e2e test proves that after completion the setup routes cannot create a second admin.

### 4.11 Setup wizard, steps 0–2 (SPEC C7.1)
- **What:** Route group `apps/web/app/(setup)/setup/[step]/page.tsx` with steps `verify`, `account`, `domain`, `github`, `email`, `backups`, `done`. A shared `SetupShell` renders the product mark, the stepper, the card, and the Back/Continue row.
  - **Step 0, Verify.** Title "Enter your setup code". Body "Paste the setup code shown in your terminal." One input (Geist Mono, autocomplete off, spellcheck off, `inputmode="text"`, `autocapitalize="none"`), a paste handler that normalizes, Continue disabled until 6 words are present. Errors under the field: mismatch → "That code doesn't match. It's in the last lines of the install output." · 429 → "Too many attempts. Try again in 14 minutes." (live countdown) · locked → "Setup is locked after too many attempts. Run `lumen-admin setup-code --rotate` on your server to get a new code."
  - **Step 1, Admin account.** Fields Name, Email, Password with a strength meter (`@zxcvbn-ts/core`, MIT; score ≥ 3 required; labels Weak / Fair / Good / Strong; the meter also lists the top suggestion from zxcvbn as helper text). "Continue with GitHub" is hidden here (SPEC C7.1: the app doesn't exist yet). Button "Create account". Creates the user with `is_instance_admin=true`, the first workspace (name from the user's name, "Shagee's workspace", slug from it), and signs the user in.
  - **Step 2, Your domain.** Two selectable cards:
    - **I have a domain** → inputs "Dashboard address" (placeholder `lumen.example.com`) and "Apps address" (auto-filled `*.apps.example.com` from the registrable domain, editable). Below, two DNS record cards (Phase 7 component): `A · lumen.example.com · 203.0.113.10` and `A · *.apps.example.com · 203.0.113.10`, each with copy buttons and a live check that polls `POST /v1/setup/domain/check` every 5 s (server-side lookups through 1.1.1.1 and 8.8.8.8 over DNS-over-HTTPS, never the VM's resolver, so cached negatives don't mislead). Button "Use this domain" enables when both are green; a ghost link "Continue with the temporary address, finish DNS later" is always available. On confirm the API writes `LUMEN_BASE_DOMAIN`, `LUMEN_PUBLIC_URL`, updates `caddy/control-plane.json` through the local agent, waits for the certificate (Caddy admin API `GET /pki/…` not needed: poll `https://lumen.example.com/healthz` from the API up to 90 s), shows "Getting your certificate…" with a progress bar, then navigates the browser to the new address with the session preserved (a one-time `transfer` token in the URL, exchanged for the cookie on the new origin, 60 s validity).
    - **Use a free temporary address** → shows `https://203-0-113-10.sslip.io` in a copy field and the note "Temporary addresses share certificate limits with everyone who uses this service. Add your own domain later from Instance settings → Domain & TLS." Before shipping, verify and record in `docs/DECISIONS.md` whether `sslip.io` is on the Public Suffix List and what Let's Encrypt limit applies; if the limit is shared, add `nip.io` as a second option and self-signed with a browser-warning explanation as the last resort.
- **Files:** `apps/web/app/(setup)/layout.tsx`, `apps/web/app/(setup)/setup/[step]/page.tsx`, `apps/web/components/setup/SetupShell.tsx`, `SetupStepper.tsx`, `VerifyStep.tsx`, `AccountStep.tsx`, `DomainStep.tsx`, `apps/api/src/routes/setup.ts` (`/account`, `/domain`, `/domain/check`, `/domain/apply`, `/progress`)
- **Done when:** Playwright walks steps 0–2 against a local control plane with a stubbed DNS checker; screenshots at 390 / 1024 / 1440 × dark / light for each step and each error state are reviewed against SPEC C14.

### 4.12 Setup wizard, steps 3–5 and finish
- **What:**
  - **Step 3, Connect GitHub.** One primary button "Create GitHub App" that posts the manifest (Phase 6 `POST /v1/github/manifest` with `redirect_url` pointing back to `/setup/github?state=…`). GitHub returns to the wizard; the success state shows a green check, "Connected as **lumen-shagee** (GitHub App)", and Continue. Failure states: manifest rejected → "GitHub didn't accept the app. Usually the dashboard address isn't reachable from the internet yet." with "Try again" and "Skip for now"; org permission needed → "Ask an organization owner to approve the app, then try again." Skip link: "I'll deploy Docker images for now".
  - **Step 4, Email (optional).** Fields Host, Port (default 587), Encryption (segmented STARTTLS / TLS / None), Username, Password (Secret field), From address (default `lumen@<base-domain>`), From name (default "Lumen"). "Send test email" sends to the admin's address and shows inline "Test email sent to you@example.com. Check your inbox." or the SMTP error translated ("The mail server refused the login. Check the username and password."). Buttons: "Save and continue", "Skip".
  - **Step 5, Backups (optional).** Fields Provider preset (segmented: Cloudflare R2 / Backblaze B2 / Oracle Object Storage / Amazon S3 / MinIO or other; preset fills the endpoint pattern and region hints), Endpoint, Region, Bucket, Access key, Secret key (Secret field), and a generated Restic password shown in a copy field with "Save this password somewhere safe. Backups can't be opened without it." "Test connection" writes and deletes a 1-byte object and reports "Connected. Bucket lumen-backups is writable." Buttons "Save and continue", "Skip". Saving creates the workspace's `backup_destinations` row and enables the nightly control-plane backup (4.16) using the same destination.
  - **Finish.** Calm success card: check icon, "You're ready." and one sentence "Your dashboard is set up. Anything you skipped is waiting in Instance settings." Primary button "Deploy your first app" → Home with the onboarding checklist (C7.3) pre-marked for completed items (server connected, GitHub connected if done).
- **Files:** `apps/web/components/setup/GithubStep.tsx`, `EmailStep.tsx`, `BackupsStep.tsx`, `DoneStep.tsx`, `apps/api/src/routes/setup.ts` (`/email`, `/email/test`, `/backups`, `/backups/test`, `/complete`), `apps/api/src/lib/mail/smtp.ts` (nodemailer, MIT)
- **Done when:** the full wizard runs end to end in Playwright with skip and non-skip paths; SMTP test against a local MailHog container succeeds; after finish, `/setup/*` shows "Setup is complete".

### 4.13 Instance admin pages (SPEC C7.22)
- **What:** Route group `apps/web/app/(app)/admin/…`, visible in the rail only to `is_instance_admin`, using the settings layout from Phase 5 (sticky left section nav, centered 1200 px content). Sections:
  - **Overview:** version + channel, "Update available" pill when the manifest has a newer version, control-plane health (each compose service: status, RAM, restarts), agent versions across servers (table with an "Update all" action), disk free on `/opt/lumen`, last control-plane backup time.
  - **Users:** table (avatar, name, email, workspaces count, 2FA on/off, last login, status), row actions Disable / Enable, Make instance admin / Remove admin, Reset 2FA (typed confirm of the email). Search.
  - **Workspaces:** table (name, members, projects, servers, created), row action "Open" (admin joins as viewer-observer, audited).
  - **Registration:** segmented Open / Invite-only / Closed with one sentence each; default Invite-only.
  - **Domain & TLS:** current dashboard address and apps base domain, DNS record cards with live checks, certificate status per host, "Change domain" (runs the step-2 flow), optional Cloudflare API token for DNS-01 (Phase 7 field).
  - **GitHub App:** status (app name, installation count), "Re-create app", "Check permissions" (calls GitHub and lists missing permissions with a fix link).
  - **Email:** the step-4 form plus "Send test email".
  - **Control-plane backups:** destination (from step 5 or pick one), schedule (default nightly 03:00 UTC), passphrase set/rotate (never displayed after save), "Back up now" with progress, backups list (time, size, status, "Download"), and the restore instructions block with the exact `lumen-admin restore` command.
  - **Updates:** current version, channel selector (stable / beta) with a warning on beta, "Check now", and when available: "Update to v1.4.0" card with the changelog rendered (Markdown → sanitized HTML through `rehype-sanitize`), "What happens" list (backup → pull → migrate → restart → health check → automatic rollback if unhealthy), and the button "Update now". After clicking, the full-screen maintenance state (C7.26) polls `/healthz` and returns to the Overview with "Updated to v1.4.0" or "Update failed. Lumen restored v1.3.2. Details below." with the log.
  - **System logs:** tabs api / workers / web / caddy / agent (this-server), last 500 lines through the local agent's `LogQuery` on the compose containers, live tail toggle, download.
- **Files:** `apps/web/app/(app)/admin/layout.tsx`, `overview/page.tsx`, `users/page.tsx`, `workspaces/page.tsx`, `registration/page.tsx`, `domain/page.tsx`, `github/page.tsx`, `email/page.tsx`, `backups/page.tsx`, `updates/page.tsx`, `logs/page.tsx`, `apps/api/src/routes/instance.ts` (all `/v1/instance/*` routes, guarded by `requireInstanceAdmin`)
- **Done when:** every route returns 403 for a non-admin with the permission-denied card; every page has screenshots at three widths × two themes; axe passes.

### 4.14 `lumen-admin` host command
- **What:** `deploy/lumen-admin.sh` installed to `/usr/local/bin/lumen-admin` (0755), POSIX `sh`, reads `/opt/lumen/.env`, subcommands:
  - `status` — versions, compose service health, disk, last backup, agent status
  - `update [--channel stable|beta] [--version X] [--yes]` — fetch manifest → verify its Ed25519 signature with the public key embedded in the script (Phase 18 signs; until then a `--insecure-manifest` flag exists only in dev builds) → show changelog and ask (unless `--yes`) → `backup` (4.16, local copy always, remote if configured) → write `releases/<new>/docker-compose.yml` → `docker compose pull` → run migrations `docker compose run --rm api migrate` → `up -d` → health wait 120 s on api, workers, web → on success flip `releases/current`, print "Updated to v1.4.0"; on failure run `rollback --auto`, print "Update failed. Restored v1.3.2. Log: …". The local agent updates itself after the control plane reports healthy (SPEC E3).
  - `rollback [--to <version>] [--auto]` — flip the symlink to the previous release, `up -d`, and if the failed update ran migrations, restore the pre-update database dump (`pg_restore --clean`) after a confirmation (auto mode skips the prompt).
  - `backup [--now]` — runs 4.16 immediately
  - `restore --from <path|s3-url> [--passphrase-file <file>]` — 4.16 restore
  - `uninstall [--keep-volumes]` — asks `Type "uninstall" to remove Lumen from this server:`; stops and removes compose services; removes `/usr/local/bin/lumen-admin`, systemd units; keeps `postgres_data`, `caddy_data` and `/var/lib/lumen/volumes` only with `--keep-volumes`; prints what was kept. Calls `lumen-agent uninstall --yes` for the local agent (Phase 2 script, same confirmation shape).
  - `logs [service] [-f]` — wraps `docker compose logs`
  - `setup-code [--rotate]` — 4.9 / 4.10
- **Files:** `deploy/lumen-admin.sh`, `deploy/lib/release.sh` (manifest fetch + verify), `deploy/tests/lumen-admin.bats`
- **Done when:** `shellcheck` clean; the update rollback test (4.19) passes; `uninstall` on a test VM leaves no `lumen*` containers, units or binaries and keeps volumes when asked.

### 4.15 In-app update trigger through the local agent
- **What:** `POST /v1/instance/update {version}` enqueues a `ControlPlaneUpdate` op to the local agent (new protobuf message in `packages/protocol/proto/lumen/v1/ops.proto`: `ControlPlaneUpdate{op_id, version, channel}`), which executes `lumen-admin update --yes --version <v>` on the host and streams its output as `BuildEvent`-style log chunks into `instance_settings.last_update_log`. The web app switches to the maintenance screen when the WebSocket drops, polls `/healthz` every 2 s, and reloads when the version changes or the old version returns (rollback).
- **Files:** `packages/protocol/proto/lumen/v1/ops.proto`, `apps/agent/internal/ops/controlplane_update.go`, `apps/api/src/routes/instance.ts`, `apps/web/components/system/MaintenanceScreen.tsx`
- **Done when:** clicking "Update now" against a local manifest pointing at the same version prints the full `lumen-admin` transcript in the UI and returns to Overview.

### 4.16 Control-plane backup and restore (SPEC E4)
- **What:**
  - **Backup job** (`apps/api/src/workers/jobs/control-plane-backup.ts`, nightly at 03:00 UTC by default, also on demand): `pg_dump -Fc` through the postgres container → stream into a tar with `.env` → encrypt with AES-256-GCM, key derived with scrypt (N=2^15, r=8, p=1) from the passphrase, random 16-byte salt and 12-byte nonce in the header, format tag `LUMENBK1` → write to `/opt/lumen/backups/control-plane-<ISO>.lbk` (keep last 7 locally) → upload to the configured destination under `control-plane/<instance-id>/` using the Phase 9 S3 client (restic is not used here because the restic password itself lives in `.env`). Record in `instance_settings.last_backup` `{at, size, location, status}` and notify on failure through the `BACKUP_FAILED` rule.
  - **Restore** (`lumen-admin restore`): on a fresh VM after `install.sh` completes and before the wizard: downloads the archive (S3 credentials passed as flags or environment), decrypts with the passphrase, stops api/workers, `pg_restore --clean --if-exists`, replaces `.env` (keeping the new `LUMEN_PUBLIC_IP`), restarts, prints "Restored from 2026-09-25 03:00 UTC. Open https://… and sign in with your previous account." Setup is marked complete because the restored database says so.
  - **Agent reconnection:** agents dial the control plane by the URL stored in `/etc/lumen/agent.yaml`. If the dashboard hostname's DNS is repointed to the new IP, agents reconnect within their 30 s backoff. If the instance used the temporary IP address, the restore command prints the per-server fix: `lumen-agent set-control-plane wss://<new>/agent/v1` (Phase 2 CLI). The Servers page shows the offline banner until then.
- **Files:** `apps/api/src/workers/jobs/control-plane-backup.ts`, `apps/api/src/lib/backup/encrypt.ts`, `deploy/lumen-admin.sh` (`backup`, `restore`), `deploy/lib/restore.sh`, `docs/guides/restore-control-plane.md`
- **Done when:** the automated test backs up a control plane with 2 projects, installs a fresh control plane in a second VM, restores, and asserts projects, variables (decryptable), users, and that both agents reconnect within 60 s after `set-control-plane`.

### 4.17 Provider guides (SPEC E6)
- **What:** For each of Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean and generic: `docs/guides/providers/<provider>.md` with sections "Create a VM" (recommended free or cheap size, image Ubuntu 24.04, arm64 note for Oracle), "Open ports in the cloud firewall" (exact console path and rule values for TCP 80, 443 and UDP 51820), "OS firewall quirks" (Oracle iptables REJECT; GCP's default allow; AWS security groups only), "Attach a domain" (A / wildcard records), "Known limits" (Oracle free-tier idle reclamation, Hetzner's primary IP charge). Verify every console path against the provider's current UI while writing and add a `verified: 2026-09-26` front-matter field. The same content, cut to the fix-card size (≤ 5 steps, each ≤ 120 characters, with copyable commands), lives in `packages/shared/src/providers/fixes.ts` and is what the Phase 2 port-check card and the 4.5 terminal hint render.
- **Files:** `docs/guides/providers/{oracle,aws,gcp,azure,hetzner,digitalocean,generic}.md`, `packages/shared/src/providers/fixes.ts`, `packages/shared/src/providers/fixes.test.ts` (every provider has fix cards for `PORT_BLOCKED` on 80, 443, 51820)
- **Done when:** all seven guides exist with the front-matter, and the dashboard fix card for a blocked 443 on Oracle shows both the security-list step and the `iptables` step with copy buttons.

### 4.18 Stopwatch usability test protocol (SPEC 0.4, C15.6, Phase 11 AC)
- **What:** Written procedure in `docs/testing/stopwatch-test.md`:
  1. Recruit a person who has never used Lumen (and ideally never deployed anything).
  2. Give them: a fresh Ubuntu 24.04 VM (2 vCPU / 2 GB / 20 GB) with an SSH session already open, a GitHub account that has the `lumen-samples/express-hello` repo, the single line `curl -fsSL https://get.<domain>/install.sh | sh`, and the task card: "Get this app running on an HTTPS address you can open on your phone."
  3. Start the stopwatch when they press Enter on the curl command. Stop when the app page loads over HTTPS in their browser.
  4. The observer says nothing and logs every hesitation longer than 5 s with a timestamp and what the screen showed.
  5. Pass: under 10:00. Each hesitation becomes an issue in `docs/PROGRESS.md` "Found issues" with the screen and the copy shown.
  6. Run with at least 3 people before Phase 18; keep results in `docs/testing/stopwatch-results.md`.
- **Files:** `docs/testing/stopwatch-test.md`, `docs/testing/stopwatch-results.md`
- **Done when:** three recorded runs exist, the median is under 10:00, and every hesitation has a filed issue.

### 4.19 Update rollback test
- **What:** `e2e/install/update-rollback.sh` (run by the nightly VM harness from Phase 18, runnable locally with Multipass): install version N-1 from its manifest, deploy two sample apps, start a background `curl` loop against both (1 request/s, logging failures), publish a local manifest for version N whose `api` image is built to fail its healthcheck (`LUMEN_TEST_FAIL_HEALTH=1`), run `lumen-admin update --yes`, assert: exit code non-zero with "Restored v<N-1>", `releases/current` points at N-1, `lumen-admin status` healthy, database row count unchanged, the curl loop logged 0 failures, and the dashboard shows the "Update failed. Lumen restored v…" banner. A second run with a healthy N asserts the upgrade succeeds with 0 failed app requests and that the local agent reports version N afterwards.
- **Files:** `e2e/install/update-rollback.sh`, `e2e/install/lib/vm.sh`, `.github/workflows/nightly-install.yml` (job entry; Phase 18 owns the matrix)
- **Done when:** both scenarios pass on Ubuntu 24.04 amd64 and arm64.

## 5. Detail checklist

### Typography
- Wizard step title: page title class, 24 / 600, line-height 1.25, letter-spacing −0.01em, `text` token. One per step, never two headings on a step.
- Wizard step body: body 14 / 400, line-height 1.5, `text-secondary`, max width 440 px so lines stay under 75 characters.
- Stepper labels: label 13 / 500; current step `text`, done steps `text-secondary`, upcoming `text-muted`.
- Setup code input: Geist Mono 16 / 400, letter-spacing 0.02em, height 44 px (the one oversized input in the product, because the code is the whole step).
- Field labels: label 13 / 500 `text`; helper text: caption 12 / 400 `text-muted`; inline error: caption 12 / 400 `danger` with `circle-alert` 14 px.
- DNS record cards: type badge 12 / 600 uppercase tracking 0.04em; name and value in Geist Mono 13 / 400 with tabular numerals for IPs.
- Password strength labels: caption 12 / 500; meter segments 4 × 4 px tall with 4 px gaps.
- Admin tables: table cell 13 / 400, header label 12 / 500 uppercase tracking 0.04em `text-secondary`; version strings and IPs in Geist Mono 13.
- Changelog: body 14 / 400 with headings capped at section title 16 / 600 regardless of Markdown level; code spans Geist Mono 13 on `surface-hover` background, radius 4.
- Terminal output: fixed 60-column layout; labels padded to 12 characters (`Open        `, `Setup code  `) so values align.

### Spacing & layout
- Wizard card: max width 560 px, padding 32 px (24 px under 768), radius 14, `surface` with `border`, centered vertically with a 64 px top offset on tall viewports.
- Stepper: 6 steps, 24 px above the card, items separated by 16 px, connector lines 1 px `border` (done segments `accent`).
- Field stack: 16 px between fields, 8 px between label and input, 6 px between input and helper/error.
- Domain choice cards: two cards in a 2-column grid with 12 px gap (1 column under 640 px), 20 px padding, radius 10, selected state uses `accent-subtle` background and `border-strong` with a 16 px `check-circle-2` icon top-right.
- Action row: right-aligned, 8 px between Back (ghost) and Continue (primary); Skip is a ghost link on the left of the same row.
- Instance admin: settings layout, section nav 220 px sticky, content max 1200 px, section gaps 32 px, card padding 20 px.
- All values on the 4 px grid; no magic numbers in components (tokens only).

### Color & theme
- Wizard background: `bg`; the card `surface`; inputs `bg` inside `surface` with `border`, focus `border-strong` + 2 px accent ring at 2 px offset.
- Exactly one accent element per step: the Continue / primary button. Copy buttons and links use `text-secondary` and turn `accent` on hover only.
- Live check indicator: pending `text-muted` dot with `loader-2` spinning 14 px; found `success` with `check` 14 px; wrong value `warning` with `alert-triangle` 14 px and the resolved value shown ("Currently points to 198.51.100.7").
- Both themes verified with a contrast table (every text token on `surface`, `bg`, `accent-subtle`) ≥ 4.5:1 for text and ≥ 3:1 for icons and borders.
- Maintenance screen: `bg` full-screen, centered mark, `text-secondary` sentence, progress bar `accent` on `border`.

### Motion
- Step transitions: outgoing card fades to 0 and translates −8 px, incoming from +8 px, 200 ms `cubic-bezier(.2,.8,.2,1)`; Back reverses direction. Reduced motion: opacity only, 120 ms.
- Stepper connector fill: 200 ms width transition when a step completes; reduced motion: instant.
- Live check dot: `loader-2` rotates 1 s linear while checking; on success the icon swaps with a 120 ms scale 0.8 → 1 pop; reduced motion: swap without scale.
- Password strength meter: segment fill 120 ms ease-out.
- "Getting your certificate…" progress: indeterminate bar, 1.4 s loop, 30 % width; reduced motion: static bar with the text alone.
- Update maintenance screen: dots ellipsis animation 1.2 s; reduced motion: static "Updating…".
- No confetti, no bounce, anywhere in the wizard (SPEC C7.1 Finish: "confetti-free, calm success").

### Iconography & symbols
- Product mark at the top of the wizard: 24 px, monochrome `text`.
- Stepper: done `check` 14 px in a 20 px circle; current: 20 px circle with an 8 px `accent` dot; upcoming: 20 px circle `border`.
- Step icons in the domain cards: `globe` 20 px (own domain), `zap` 20 px (temporary address).
- GitHub step: `github` from `simple-icons` (CC0) 20 px, since Lucide has no brand marks; record in DECISIONS.md.
- Copy fields: `copy` 16 px → `check` 16 px for 1.5 s with the label "Copied".
- Secret fields: `eye` / `eye-off` 16 px.
- Instance admin rail entry: `shield` 20 px with tooltip "Instance admin".
- Admin overview health rows use the SPEC C4 status language: ● healthy (`success`), ◐ starting (`warning`, pulsing), ✕ unhealthy (`danger`), ■ stopped (`text-muted`).
- Update available pill: `arrow-up-circle` 14 px, `info` color, text "v1.4.0 available".
- Terminal: `✓`, `!`, `✗`, `…` with two-space indentation for continuation lines; ASCII fallback documented.

### Copy
- Step titles: "Enter your setup code" · "Create your admin account" · "Choose your address" · "Connect GitHub" · "Send email from Lumen" · "Back up your dashboard" · "You're ready."
- Buttons: "Continue" · "Create account" · "Use this domain" · "Use temporary address" · "Create GitHub App" · "Send test email" · "Test connection" · "Save and continue" · "Skip" · "Deploy your first app" · "Update now" · "Back up now" · "Change domain" · "Check now". Never "Submit", "OK", "Next".
- Verify mismatch: "That code doesn't match. It's in the last lines of the install output."
- Temporary address note: "Temporary addresses share certificate limits with everyone who uses this service. Add your own domain later from Instance settings → Domain & TLS."
- DNS pending: "Waiting for DNS. Changes usually show up within a few minutes." DNS wrong: "This record currently points to 198.51.100.7. Update it to 203.0.113.10."
- GitHub skip: "I'll deploy Docker images for now."
- Email test success: "Test email sent to you@example.com. Check your inbox." Failure: "The mail server refused the login. Check the username and password."
- Backups test success: "Connected. Bucket lumen-backups is writable." Restic password warning: "Save this password somewhere safe. Backups can't be opened without it."
- Finish: "Your dashboard is set up. Anything you skipped is waiting in Instance settings."
- Update card: "What happens: Lumen backs up its database, pulls v1.4.0, runs migrations, restarts, and checks its own health. If anything fails, it restores v1.3.2 on its own."
- Update failure banner: "Update failed. Lumen restored v1.3.2. Your apps kept running."
- Uninstall prompt: `This removes Lumen from this server. Your apps' containers stop. Type "uninstall" to continue:`
- No exclamation marks anywhere in this phase. "You're ready." is the one milestone and still ends with a period.

### States (empty · loading · error · success · partial)
- Verify: idle · checking (button shows a 16 px spinner, label stays "Continue") · mismatch · rate-limited with countdown · locked.
- Account: idle · weak password (Continue disabled, meter red) · email taken (only possible on resume: "This email already has an account. Sign in instead.") · creating.
- Domain: nothing chosen · own domain with records pending / one green / both green · certificate in progress (progress bar + "This takes up to a minute") · certificate failed (`TLS_FAILED` card with reason and "Try again" / "Use temporary address") · temporary chosen.
- GitHub: idle · redirecting (button disabled, "Opening GitHub…") · returned success · returned error · skipped (stepper shows a hollow check and "Skipped" caption).
- Email / Backups: idle · testing · test success · test failure · saved · skipped.
- Admin Overview loading: skeletons that match the final layout (three stat cards 96 px tall, a 5-row health table with 40 px rows).
- Admin Users empty: never empty (the admin exists); Workspaces list with one row is the minimum.
- Updates: up to date ("You're on v1.3.2, the latest stable release.") · checking · available · updating (maintenance screen) · failed with log · beta channel warning ("Beta releases can have rough edges. You can switch back at any time.").
- Backups: no destination ("Set up a backup destination" primary action linking to the form) · never run ("No backups yet.") · running with progress · failed with `BACKUP_FAILED` card · list.
- Partial: control plane healthy but local agent offline → banner on Overview "The agent on this server isn't responding. Updates and system logs are unavailable until it reconnects." with the `AGENT_OFFLINE` fix card.

### Keyboard & accessibility
- Wizard is a single `<form>` per step; Enter submits; Esc does nothing (no dismissing setup).
- Focus lands on the step's first input on every step change; the step title is an `<h1>` announced through `aria-live="polite"` on the stepper region ("Step 3 of 6, Connect GitHub").
- Stepper is a `<nav aria-label="Setup progress">` with an `<ol>`; done steps are links (Back is always allowed, SPEC C7.1).
- Copy buttons have `aria-label="Copy DNS value"` and announce "Copied" through a live region.
- Live check status uses text, not color alone: "Found", "Waiting", "Points elsewhere".
- Password strength meter has `role="meter"`, `aria-valuenow`, `aria-valuetext="Good"`.
- Radio-style domain cards are real `<input type="radio">` inside `<label>`, arrow keys move between them.
- Admin tables: sortable headers are buttons with `aria-sort`; row actions in a menu opened with Enter / Space, closed with Esc.
- Typed confirmations (Reset 2FA, uninstall) have the expected text in the label, and the confirm button stays disabled until the text matches.
- axe clean on every wizard step and admin page in both themes.

### Responsive
- ≥ 1280: wizard card 560 px centered; admin uses the full settings layout.
- 1024–1279: unchanged wizard; admin section nav collapses to a horizontal scrollable tab row.
- 768–1023: wizard card 100 % width with 24 px gutters; domain cards stack.
- < 768: stepper shows "Step 3 of 6" text with a thin progress bar instead of six labels; action row becomes full-width stacked buttons (Continue on top); DNS record cards stack their type/name/value vertically with the copy button at the end of each line; admin tables become cards with the primary column as the title; System logs viewer keeps the log viewer full-height.
- No hover-only affordances: copy buttons are always visible on touch devices.

### Performance
- The wizard route group ships without the canvas, charts or xterm bundles (`next/dynamic` boundaries in the app shell; verify with `next build` output that `(setup)` first-load JS is under 120 kB gzipped).
- DNS live check polls every 5 s and stops when the tab is hidden (`visibilitychange`).
- Installer downloads: images pulled in parallel by compose; total install target under 4 minutes on a 2 vCPU VM with a 100 Mbit link; measure and record.
- `install.sh` is a single file under 60 kB so it streams and parses fast through `curl | sh`.

### Security
- Setup token: argon2id hash at rest, constant-time verify, 5 attempts / 15 min / IP, lockout at 20, single use, removed from `.env` after completion, never logged, never in URLs.
- Setup session cookie is separate from the user session; both httpOnly, Secure, SameSite=Lax; CSRF token on every setup mutation.
- `/internal/setup/local-server` accepts loopback only and dies with setup.
- The origin transfer token (domain switch) is single-use, 60 s, bound to the user id.
- `.env` 0600 root; `/opt/lumen` 0750; backups 0700; encrypted backups use a fresh salt and nonce per archive and authenticate the header.
- Release manifest signature verified before any image pull; images referenced by digest only; `docker compose config` in CI asserts no tag-only references.
- Caddy admin API bound to `127.0.0.1:2019`; `api` and `web` bound to loopback; only Caddy publishes 80/443.
- Changelog Markdown sanitized (`rehype-sanitize`, allowlist) since it comes from the release host.
- `lumen-admin restore` refuses to run when setup has already completed unless `--force`, to prevent an attacker with shell access from swapping databases silently (it is logged either way).

### Data integrity & idempotency
- Every installer step is re-runnable: `.env` never regenerated, compose only rewritten when changed, firewall rules checked before insertion (no duplicates), agent join skipped when `lumen-agent` is active and registered.
- Update is transactional at the release-directory level: the old compose file, manifest and database dump stay until the new version passes health; rollback is a symlink flip plus `up -d`.
- Backups verify the archive after writing (decrypt header + checksum of the tar) before reporting success; a failed upload keeps the local copy and reports `BACKUP_FAILED`.
- `setup_progress` writes are idempotent per step; completing a step twice is a no-op.
- The local server row is created once (unique on `credential_hash`); re-running the installer never creates a second "this-server".

## 6. Acceptance criteria
- [ ] SPEC D12: "One-command control-plane install, setup wizard with a setup token, one-click updates, control-plane backups, uninstall script."
- [ ] SPEC Phase 11 AC: a fresh VM goes from the curl command to a first app live over HTTPS in < 10 minutes, measured with a stopwatch by someone who has never used it (4.18 protocol, median of 3 runs).
- [ ] SPEC Phase 11 AC: the update rollback test passes (4.19) on amd64 and arm64.
- [ ] `install.sh` succeeds on Ubuntu 22.04, Ubuntu 24.04, Debian 12 (amd64 + arm64) and RHEL-family 9 (amd64), and re-running it is idempotent (exit 0, no changes, under 5 s).
- [ ] On an Oracle Ubuntu VM with default iptables `REJECT` rules, ports 80/443 are reachable from the internet after the install and after a reboot.
- [ ] The final terminal block prints the URL and the 6-word setup code exactly as specified in 4.9; the URL opens the wizard.
- [ ] After 10 minutes idle on a 2 GB VM, web + api + workers + postgres + caddy use < 512 MB RAM combined (SPEC B14); the local agent uses < 50 MB.
- [ ] A wrong setup code shows "That code doesn't match. It's in the last lines of the install output."; six wrong codes show the rate-limit message; after completion, no setup route can create an admin (e2e proves it).
- [ ] Every wizard step can be skipped where the spec allows (GitHub, Email, Backups) and finished later from Instance admin; Back works on every step; closing the tab and reopening resumes the same step.
- [ ] The "I have a domain" path turns the DNS checks green within 60 s of the records propagating and lands the user on the new hostname with a valid certificate and an intact session.
- [ ] Instance admin: every C7.22 section exists, is restricted to instance admins, and passes the C14 checklist at 390 / 1024 / 1440 in both themes.
- [ ] `lumen-admin update` performs backup → pull → migrate → restart → health check and restores the previous version automatically when health fails, with app containers untouched (0 failed requests in the curl loop).
- [ ] Nightly control-plane backup produces an encrypted archive on the destination; `lumen-admin restore` on a new VM brings back users, projects and decryptable variables, and agents reconnect after the DNS or `set-control-plane` step.
- [ ] `lumen-admin uninstall` and `lumen-agent uninstall` confirm first, stop containers, and honor `--keep-volumes`.
- [ ] All seven provider guides exist with verified console paths, and the in-app fix card for a blocked port shows provider-specific steps.
- [ ] All errors in this phase render from the error catalog (`SETUP_CODE_MISMATCH`, `SETUP_LOCKED`, `SETUP_REQUIRED`, `SETUP_ALREADY_COMPLETE`, `PORT_BLOCKED`, `AGENT_OFFLINE`, `DISK_FULL`, `TLS_FAILED`, `DNS_NOT_POINTED`, `BACKUP_FAILED`).

## 7. Test plan
- **Unit:** bats-core for `install.sh` libraries (preflight, provider, firewall, config, release verify) with stubbed `curl`, `iptables`, `ufw`, `firewall-cmd`, `docker`; Vitest for setup-token normalization and verification, rate limiting and lockout, `setup_progress` transitions, backup encryption round-trip (tampered header rejected), changelog sanitization, DNS-over-HTTPS checker parsing.
- **Integration:** API tests with testcontainers Postgres: setup gate blocks non-setup routes; `/internal/setup/local-server` loopback-only; `POST /setup/complete` is single use; instance admin routes return 403 to non-admins; control-plane backup job writes to a MinIO container and the restore script reads it back.
- **E2E (Playwright):** full wizard happy path; every skip path; wrong code, rate limit; resume after reload; domain switch with a stubbed DNS checker and a local Caddy issuing an internal-CA certificate; Instance admin pages navigation; in-app update against a same-version manifest.
- **Visual regression:** every wizard step and state, every admin page, 3 widths × 2 themes; threshold 0.1 % pixels.
- **Accessibility (axe + keyboard pass):** axe on every step and page in CI; a manual keyboard pass: complete the wizard without a mouse.
- **Manual / on a real VM:** install matrix (Ubuntu 22.04/24.04, Debian 12, RHEL 9; amd64 + arm64, Oracle arm64 mandatory); reboot persistence of firewall rules; stopwatch runs (4.18); update rollback (4.19); backup → restore across two VMs (4.16); uninstall.

## 8. Evidence required to close
- `install.sh` transcript and `/var/log/lumen-install.log` from an Oracle arm64 VM and an x86 VM (Hetzner or DigitalOcean), including the final block, plus `iptables -S INPUT` before and after and after reboot.
- `docker stats --no-stream` output after 10 minutes idle on the 2 GB VM with the summed RAM.
- Timings: install duration, wizard duration, first deploy duration; the three stopwatch results with hesitation logs.
- Screenshots: wizard steps 0–5 and finish, each error/success state, Instance admin pages; 390 / 1024 / 1440 × dark / light, reviewed against C14 with notes on what was fixed.
- Test output: bats, Vitest, Playwright, axe reports; the update rollback script output for both scenarios; the backup → restore test output with agent reconnection timings.
- `shellcheck` output for `install.sh`, `lumen-admin.sh`, `lib/*.sh`.

## 9. Review
- Use SPEC H1 (code review) on the installer, `lumen-admin` and the setup API with a Fable 5.1 session that did not write them; probe: re-run idempotency, partial-failure recovery (killed mid-pull, mid-migration, disk full during backup), what happens when `.env` is lost, symlink flip atomicity, and every place a secret could reach a log.
- Use SPEC H2 (UI review) on the wizard and admin screenshots with the model that did not write them; probe: does a beginner know what to click on the domain step, does the temporary-address warning scare them off, is "Skip" discoverable but not dominant.
- Run the H3 subset for this phase: setup takeover, loopback endpoint abuse, manifest tampering, changelog XSS, backup archive tampering, origin-transfer token replay.

## 10. Risks & open questions
- **Risk:** Two Caddy instances on the control-plane host (compose Caddy and the agent's Caddy) fight over 80/443. → **Mitigation:** the agent's `--adopt-caddy` mode (4.8); decide with the Phase 2/3 owners and record in DECISIONS.md before session 2.
- **Risk:** IP-based wildcard DNS (`sslip.io`) shares Let's Encrypt rate limits with every other user, so the temporary address may fail to get a certificate. → **Mitigation:** verify PSL status, offer `nip.io` as a second option, and fall back to Caddy's internal CA with an explanatory page and a "Add your domain" nudge; document the limit in the wizard note.
- **Risk:** Oracle Ubuntu images vary in where the `REJECT` rule sits and whether `iptables-persistent` is installed. → **Mitigation:** locate the rule by pattern, insert by index, verify with `iptables -C` after, and test on the current Oracle Ubuntu 22.04 and 24.04 images for both shapes.
- **Risk:** `curl | sh` users on RHEL 9 hit SELinux denials for bind mounts. → **Mitigation:** label `/opt/lumen` and `/var/lib/lumen` with `container_file_t` when `getenforce` is Enforcing; test on Rocky 9.
- **Risk:** Migrations that are not backward compatible make automatic rollback restore a database dump, which loses deploys that happened during the update window. → **Mitigation:** update runs in maintenance mode (deploys paused, agents keep serving), and the window is under 2 minutes; document; Phase 18 adds the rule "migrations must be backward compatible for one version".
- **Risk:** The local agent updating the control plane (4.15) creates a dependency loop when the agent itself is broken. → **Mitigation:** `lumen-admin update` on the host always works without the agent; the UI says so when the agent is offline.
- **Open question:** Should the control-plane backup passphrase default to the master key (zero-config) with an option to set a separate one? Decide: default to a separate user-supplied passphrase (the master key is what the backup protects), and require it before the first backup; the owner decides, default stands if nobody does.
- **Open question:** Registration default: Invite-only (proposed) versus Closed. Default Invite-only unless the user says otherwise.
- **Open question:** Does the docs site host `install.sh` at `get.<domain>` or does GitHub Releases? Phase 18 decides; this phase assumes a static host serving `/install.sh` and `/releases/<channel>/manifest.json`.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: adopt-Caddy mode, temporary address provider and limits, manifest schema and signature scheme, backup archive format, registration default, `lumen-admin` as POSIX sh, bats-core, zxcvbn-ts, nodemailer, simple-icons for the GitHub mark, EFF wordlist attribution
- [ ] `docs/UI_DECISIONS.md` updated with wizard and admin screenshots and the stopwatch findings
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 11 — Self-host installer and setup wizard</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-11-installer-setup-wizard.md,
and these SPEC sections: Part E (E1–E6), C7.1, C7.22, C7.26, B12, B9 (IP-based wildcard fallback),
B14, D12, J6, and the Part H1/H2/H3 prompts.
</context>
<goal>A first-time user pastes one curl command into a fresh 2 vCPU / 2 GB VM, opens the printed URL, enters the 6-word setup code, and has their first app live on HTTPS in under 10 minutes without reading docs.</goal>
<scope>
- deploy/install.sh: preflight, Docker install, provider detection via metadata endpoints, OS firewall handling (ufw, firewalld, Oracle iptables REJECT rules) with persistence, /opt/lumen config with generated secrets, compose with digest-pinned images, start + health wait, local agent pre-join, final terminal block, /var/log/lumen-install.log
- Setup token issuance, verification, rate limiting, single use, takeover protection; setup gate middleware
- Setup wizard steps 0–5 + finish with every state, copy and motion from the phase doc §5
- Instance admin pages (Overview, Users, Workspaces, Registration, Domain & TLS, GitHub App, Email, Control-plane backups, Updates, System logs)
- lumen-admin: status, update (backup → pull → migrate → restart → health → auto-rollback), rollback, backup, restore, uninstall, logs, setup-code
- Update channels (stable, beta) with signed manifest and changelog; in-app update through the local agent with the maintenance screen
- Nightly control-plane backup (pg_dump + .env, passphrase-encrypted) and restore on a new VM with agent reconnection
- Provider guides (docs + fix cards) for Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, generic
- Stopwatch usability test protocol and the update rollback test
</scope>
<out_of_scope>
- Agent installer internals and port checks (Phase 2), automatic HTTPS internals (Phase 7), backup destination CRUD and S3 client (Phase 9), GitHub manifest implementation (Phase 6), cloud provisioning (Phase 16), signed release pipeline and docs site build (Phase 18)
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-11-installer-setup-wizard.md §6, including: fresh VM to first HTTPS app in < 10 minutes by a first-time user (median of 3 stopwatch runs); idempotent re-run of install.sh; Oracle iptables REJECT handled and persisted across reboot; control plane < 512 MB idle on a 2 GB VM; setup takeover prevented (rate limit, lockout, single use, e2e proof); update rollback test passes on amd64 and arm64 with 0 failed app requests; backup → restore across two VMs with agents reconnecting; uninstall honors --keep-volumes; all seven provider guides verified.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, the adopt-Caddy decision, the manifest schema, the backup archive format, risks, test plan, open questions. STOP and wait for approval.
2. Implement in small steps in the session order from the phase doc header; run shellcheck, bats, Vitest and Playwright after each step; test the installer on a real Oracle arm64 VM and an x86 VM before claiming any installer step done.
3. For UI: screenshots at 390/1024/1440 × dark/light × every wizard state and admin page; critique against SPEC C14 and the phase doc §5; fix before reporting.
4. Report: what works (with transcripts, timings, screenshots), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
