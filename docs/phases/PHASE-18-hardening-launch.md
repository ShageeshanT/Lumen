# Phase 18 — Hardening and launch

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 (H3 security audit in a fresh session, H4 architecture review, B14 budget verification, chaos and load design) → Opus 5.5 (fixes, docs site, landing page, demo script, release pipeline, changelog) → each reviewed by the other; the audit is never fixed and re-audited by the same session |
| **Depends on** | Every earlier phase (0–17); in particular Phase 11 (installer, `lumen-admin`, manifest format), Phase 15 (permission matrix, web baseline), Phase 14 (OpenAPI document, CLI `docs` command), Phase 16–17 (chaos scenarios for sleep/wake and HA) |
| **Unblocks** | Launch (v1.0.0 tag), and the post-launch maintenance loop (nightly matrices, release cadence) |
| **Spec sections** | SPEC Part G (all suites), H3, H4, B14, C11, C14, C9, D12 (docs site, onboarding), E2 (install script hosting), E3 (update channels), B12 (supply chain), J1 (API reference), J2 (CLI reference), J6 (error catalog → troubleshooting), 0.4 (golden rules) |
| **Estimated sessions** | 8 focused sessions: (1) H3 audit (fresh Fable), (2) audit fixes + re-audit of fixes, (3) H4 review + fixes, (4) B14 measurements + performance fixes, (5) test suites: coverage gates, e2e harness, visual, axe, k6, chaos, install matrix, upgrade, (6) docs site + troubleshooting generation + provider guides, (7) landing page + demo script, (8) release pipeline + launch checklist + v1.0.0 |

## 1. Goal
Lumen v1.0.0 ships with zero open critical or high security findings, every Part G suite green in CI and nightly on real VMs, every B14 budget measured and met, a docs site and landing page live, and signed release artifacts that the installer verifies before running.

## 2. Why this phase exists
Every earlier phase proved its own feature works. This phase proves the product holds up against people and conditions that were not in the room: an anonymous attacker, a bored teammate with a viewer role, a malicious container, a forked PR, a compromised server, a full disk, a dead control plane, a clock that drifts, fifty deploys at once. SPEC 0.4 says never accept "done" without proof; this phase is where the proof is collected in one place and turned into launch gates.

Three principles shape the work:

- **The work does not grade itself.** The security audit runs in a fresh Fable 5.1 session with no prior context (SPEC 0.3, H3). Fixes are made by the other model, then the auditor re-checks only the fixes. The same separation applies to the architecture review.
- **Budgets are acceptance criteria, not aspirations.** SPEC B14 lists eight numbers. Each gets a measurement method, a tool, a file in the repo, and a CI or nightly job that fails when the number is missed. A budget nobody measures is a wish.
- **Launch is a checklist, not a feeling.** Docs, landing page, signed binaries, digest-pinned images, changelog, install script hosting, and the gate "zero critical or high findings open" are all written down and ticked with evidence before the tag is pushed.

The docs site matters more than usual because SPEC C3.5 promises plain language in the product and SPEC 0.4 expects most real bugs to be firewalls and OS differences; the troubleshooting pages generated from the error catalog (J6) are the second half of every "Errors come with fixes" card.

## 3. Scope
### In scope
- SPEC H3 security audit: threat model per attacker, findings with severity and evidence, prioritized fix plan, fix loop, re-audit of fixes, the "zero critical or high open" gate
- SPEC H4 architecture fresh-eyes review at the end of Phase 12's work: divergence, idempotency, control-plane-down failure modes, unbounded growth, 50 servers / 2 000 services
- SPEC B14 performance budgets: measurement method, tool, script and CI/nightly job per budget; performance fixes until every budget is met
- SPEC Part G suites: unit coverage targets and gates; integration (agent vs Docker, API vs Postgres, protocol N vs N-1); e2e harness (Multipass/Lima locally, cloud VMs nightly) with all eight suites plus mobile; visual regression with thresholds; axe in CI plus the manual keyboard checklist; k6 load scenarios; chaos tests with pass criteria; install matrix nightly; upgrade tests
- Accessibility pass (SPEC C11): contrast tables, focus, ARIA live regions, chart text summaries, reduced motion, manual keyboard checklist per page
- Docs site: tooling, structure, getting started, per-provider guides, every feature, API and CLI references generated from source, troubleshooting generated from the J6 catalog, search, versioning
- Landing page in Lumen's identity (SPEC C2 originality) with a design brief, sections and copy
- Demo video script outline (fresh VM to live app)
- Release pipeline: signed agent and CLI binaries, digest-pinned platform images, SBOM, changelog generation, version tagging, channel manifests (stable, beta), install script hosting, `lumen-admin update` end-to-end against a real published release
- Launch checklist and the launch itself (v1.0.0)

### Out of scope
- New product features (anything not in Phases 0–17 goes to `docs/PROGRESS.md` "After launch")
- SSO/OIDC (SPEC D11 "later")
- Read replicas / PgBouncer (Phase 17 follow-ups)
- Localization of the UI (English only at launch; the docs site is English only)
- Hosted/SaaS offering, billing, or telemetry beyond the opt-in flag already in `instance_settings`

## 4. Work breakdown

### 4.1 Security audit (SPEC H3), fresh session
- **What:** Start a new Fable 5.1 session with no prior context and paste the H3 prompt with the codebase at a tagged commit (`audit-1`). The auditor threat-models each attacker and runs the exact checks below, citing code for every "prevented" claim and writing findings to `docs/security/audit-2026-<date>.md` with severity (critical / high / medium / low), evidence (file:line, request transcript, or command output), and a fix. The checklist the auditor must cover, per attacker:
  - **Anonymous internet user:** setup takeover (`/v1/setup/*` after completion, loopback endpoint from outside, setup-code brute force at 5/15 min), registration mode bypass, login and reset enumeration, rate limits (login 10/15 min per IP, 5/15 min per email), session cookie flags, CSRF on every cookie-authenticated mutation, open redirect on `?next=`, CSP and headers, GitHub webhook HMAC (`X-Hub-Signature-256`) and replay, outgoing webhook SSRF (private ranges, metadata endpoint 169.254.169.254, DNS rebinding), custom-domain SSRF in DNS checks, template import SSRF (`source.image` pointing at internal registries), public TCP proxy range exposure, Caddy admin API reachability (loopback only), agent WebSocket without credential, TLS downgrade on `/agent/v1`.
  - **Low-privilege workspace member (viewer, then member):** every route in the Phase 15 matrix with IDOR variants (ids from another workspace), sealed variable reveal through any path (API, logs, config snapshot, staged diff, `lumen run`, MCP), override bypass via CLI, token scope escalation after demotion, audit log tampering, invite abuse (max uses, expiry), reading other projects' logs through the environment log endpoint, canvas layout PUT on a foreign project, template creation exposing another project's variables.
  - **Malicious container workload:** Docker socket absence, dropped capabilities and the allowlist, pids limit, memory and CPU limits always set, no privileged, read-only rootfs option, cross-project network reach (nftables), reaching the agent's waker, DNS, TCP proxy, Caddy admin, host metadata endpoints, mesh IPs of other projects, volume path traversal in `mount_path`, log flooding (100 lines/s x 50 services), build flooding, disk fill through volumes without limits, port detection abuse (binding 2019, 53, 51820).
  - **Malicious PR from a fork:** fork PR environments disabled by default, secrets never injected into fork builds when enabled, PR comment content injection, `lumen.toml` from a fork changing start commands, watch-path bypass, wait-for-CI spoofing.
  - **Compromised server in the mesh:** agent credential scope (one server cannot fetch another server's desired state or variables), registry access across servers, WireGuard peer impersonation, DNS poisoning of `lumen.internal`, replay of `ActualState` for other servers, `HttpProbe` reach, join token reuse, agent self-update signature verification, `ControlPlaneUpdate` op restricted to the local agent.
  - **Supply chain and operator errors:** installer download integrity (checksum + signature), manifest signature, image digests, `.env` permissions, backup archive tampering, changelog XSS, dependency licenses and known CVEs (`pnpm audit`, `govulncheck`), secrets in git history (`gitleaks`).
  - **DoS:** log floods, build floods, WebSocket subscription floods, k6 login flood, oversized `docker-compose.yml` import, oversized `.env` import, deep variable reference graphs.
- **Files:** `docs/security/audit-2026-<date>.md`, `docs/security/threat-model.md` (attackers, assets, trust boundaries as a text diagram), `.github/workflows/security.yml` (gitleaks, `pnpm audit --audit-level=high`, `govulncheck ./...`, `trivy image` on platform images)
- **Done when:** the audit document exists with every attacker section filled, every finding has severity + evidence + fix, and the security workflow is green.

### 4.2 Fix loop and re-audit
- **What:** The other model (Opus 5.5) fixes findings in severity order, one PR per finding, each with a regression test named after the finding id (`SEC-007`). Every fix is re-checked by the auditor session, or by a new fresh session given only the finding and the diff. Critical and high findings block the tag; medium findings need a fix or a dated exception in `docs/security/exceptions.md` with an owner and an expiry; low findings go to `docs/PROGRESS.md` "Known gaps".
- **Files:** fixes under `apps/**` and `packages/**`, `apps/api/test/security/sec-*.test.ts`, `apps/agent/internal/**/*_sec_test.go`, `docs/security/exceptions.md`
- **Done when:** the audit document shows every critical and high finding as "Fixed, verified by re-audit on <date>", and the regression tests run in CI.

### 4.3 Architecture fresh-eyes review (SPEC H4)
- **What:** A separate fresh session with the H4 prompt reads SPEC Part B and the implementation and reports risks ranked by likelihood x impact with mitigations. It must cover: state that can diverge between control plane and agents (desired versus actual after partial applies, lost `ActualState` messages), non-idempotent operations (every op keyed by `op_id`; verify retries and duplicate acks), failure modes where apps go down because the control plane is down (the agent keeps the last desired state; verified by the 10-minute outage chaos test), unbounded growth (`deployment_logs` monthly partitions and retention, `metric_rollups` 1m x 7d and 1h x 90d, `http_log_rollups`, images per service capped at 5 with nightly GC, build cache, `audit_log` 365 days, `cron_runs`, `webhook_deliveries`, `ha_cluster_status`, agent-local log segments 7 days), and what breaks at 50 servers / 2 000 services (desired-state document size per server, WebSocket fan-out to 200 dashboard sessions, `cron.tick` query cost, canvas with 100+ nodes, log search fan-out to 50 agents, Postgres connection count). Each risk becomes a merged fix with a test, or a documented limit with a measured number in `docs/limits.md`.
- **Files:** `docs/architecture/review-2026-<date>.md`, `docs/limits.md`, fixes across `apps/api/src/workers/jobs/retention-*.ts`, `packages/db/migrations/*` (partitions, indexes), `apps/agent/internal/reconcile/*`
- **Done when:** every risk rated high or above has a merged mitigation with a test, and `docs/limits.md` lists the tested ceilings for servers, services per server, log lines per second, concurrent deploys and dashboard sessions.

### 4.4 Performance budgets (SPEC B14): one method per budget
- **What:** One script or job per budget. Results go to `docs/testing/perf-results.md` with the date, hardware and numbers; CI or the nightly job fails when a budget is missed. Reference hardware: a 2 vCPU / 2 GB VM for the RAM budgets and a 2 vCPU / 4 GB VM (Hetzner CX22 or equivalent) for the rest.

  | Budget | Method | File | Runs |
  |---|---|---|---|
  | Control plane idle RAM < 512 MB | Sum of `docker stats --no-stream` memory for caddy, web, api, workers, postgres after 10 min idle | `e2e/perf/idle-ram.sh` | Nightly VM harness |
  | Agent idle RAM < 50 MB | `ps -o rss= -p $(pidof lumen-agent)` after 10 min with 20 containers running and 5 log streams open | `e2e/perf/agent-ram.sh` | Nightly VM harness |
  | Dashboard route transition < 150 ms perceived | Playwright: `performance.mark` on click to first paint of the destination skeleton; median of 20 transitions across Home, Projects, Canvas, each inspector tab; prefetch on; 4x CPU throttle | `e2e/perf/route-transition.spec.ts` | CI |
  | Canvas with 100 services at 60 fps pan/zoom | Playwright + CDP tracing during a scripted 5 s pan and 5 s zoom on the 100-service fixture; pass when 95 % of frames are under 16.7 ms | `e2e/perf/canvas-fps.spec.ts`, `e2e/fixtures/project-100.json` | CI |
  | Status change to visible in UI < 1 s | The harness injects an `ActualState` with a timestamp; the browser records the DOM mutation time; clocks synced by the harness; p95 over 50 events | `e2e/perf/status-latency.spec.ts` | Nightly VM harness |
  | Log line to visible in live tail < 1 s | A container prints `ts=<unix_ms>` lines at 10/s; the browser compares arrival time; p95 over 500 lines | `e2e/perf/log-latency.spec.ts` | Nightly VM harness |
  | Node hello-world deploy on 2 vCPU: < 90 s cold, < 30 s warm | `deployments.started_at` to `ACTIVE` for `lumen-samples/node-hello`, first deploy then a redeploy with cache | `e2e/perf/deploy-time.sh` | Nightly VM harness |
  | API p95 (CRUD) < 100 ms | k6 at 50 rps mixed CRUD (projects, services, variables, deployments list) for 5 min; p95 from the k6 summary | `e2e/load/api-crud.js` | Nightly VM harness |
- **Files:** as listed, plus `docs/testing/perf-results.md`, `.github/workflows/perf.yml`, `e2e/perf/README.md` (how to run locally)
- **Done when:** every row has a recorded passing result on the reference hardware and the jobs fail on regression (verified once by deliberately breaking prefetch and watching the transition job fail).

### 4.5 Unit coverage targets and CI gates
- **What:** Vitest coverage (v8) with per-package thresholds in each `vitest.config.ts`: `packages/shared` 90 % lines (desired-state compiler, variable resolution with references, cycles and generators, permission matrix, cron parsing, filter-syntax parser, error mapping, cost shares), `apps/api` 80 %, `apps/web` 70 % (components with logic; pure presentational files excluded by glob). Go: `go test -cover ./...` with 80 % on `internal/reconcile`, `internal/sleep`, `internal/caddy`, `internal/dns`, `internal/mesh`, `internal/ops`. Mutation smoke: Stryker (MIT) on `packages/shared/src/variables` and `packages/shared/src/permissions` with a 70 % mutation score, weekly.
- **Files:** `vitest.config.ts` per package, `.github/workflows/ci.yml` (coverage thresholds as required checks), `apps/agent/Makefile` (`cover` target with a threshold script), `stryker.config.json`, `.github/workflows/weekly.yml`
- **Done when:** CI fails below thresholds and the current numbers are above them, recorded in `docs/testing/coverage.md`.

### 4.6 Integration suites
- **What:** (1) Agent against real Docker on a privileged GitHub runner and in the VM harness: reconcile from empty to 20 containers, hash-stable no-op re-apply, kill mid-apply and converge, Caddy route swap, zero-downtime swap with a curl loop (0 failures), the single-replica rule for volumes, port detection, log capture and rotation, metrics sampling. (2) API against real Postgres with testcontainers: every route's happy path and catalog errors, migrations up and down, LISTEN/NOTIFY fan-out, queue jobs with retries, encryption round-trips and key rotation. (3) Protocol compatibility: build the agent at protocol N-1 (previous tag) against the current control plane, and the current agent against the N-1 control plane; both must handshake, apply desired state and stream logs; runs on every PR touching `packages/protocol`.
- **Files:** `apps/agent/internal/**/*_integration_test.go` (build tag `integration`), `apps/api/test/integration/**`, `e2e/protocol/compat.sh`, `.github/workflows/ci.yml` (jobs `agent-integration`, `api-integration`, `protocol-compat`)
- **Done when:** all three jobs are required checks on `main` and green.

### 4.7 E2E harness and suites (SPEC Part G)
- **What:** `e2e/harness/` brings up a control plane plus two Ubuntu 24.04 VMs: locally through Multipass (macOS, Windows, Linux) or Lima (macOS), nightly through cloud VMs (Hetzner amd64 and Oracle arm64) created by the Phase 16 provisioning code path. `pnpm e2e:up` installs the control plane with `deploy/install.sh`, joins both VMs with `agent-install.sh`, seeds a workspace, and writes `e2e/.harness.json` (URLs, tokens) for Playwright. Suites (one folder each under `e2e/suites/`): `onboarding` (setup wizard, first server, checklist), `deploy-github` (test repo `lumen-samples/node-hello` on a dedicated GitHub org with a test GitHub App, push-to-deploy, watch paths, wait for CI), `variables-staged` (references, generators, sealed, raw editor, staged diff, apply), `domains` (generated domain, custom domain against a test zone with DNS-01 through a Cloudflare test token, HTTPS), `databases-backups` (Postgres, MySQL, Redis, MongoDB one-click, data browser, query console, backup to MinIO, restore round-trip), `environments-previews` (new env by copy, PR preview create/destroy with the PR comment, compare and sync), `templates` (gallery, deploy `n8n` and `uptime-kuma`, create-from-project, import/export, compose import), `teams-rbac` (invites, roles, tokens, 2FA), `mobile` (390 px viewport across canvas list, inspector sheet, logs, redeploy, rollback, variable edit). Each suite runs in both themes.
- **Files:** `e2e/harness/{up.sh,down.sh,multipass.sh,lima.sh,cloud.sh}`, `e2e/playwright.config.ts` (projects: chromium-dark, chromium-light, mobile-390), `e2e/suites/**`, `.github/workflows/nightly-e2e.yml`, `e2e/README.md`
- **Done when:** `pnpm e2e` passes locally on Multipass and the nightly workflow passes on cloud VMs three nights in a row.

### 4.8 Visual regression
- **What:** Playwright `toHaveScreenshot` for every page and state listed in each phase's §5 (the union is the `e2e/visual/manifest.ts` list), at 390, 1024 and 1440 widths, dark and light, with animations disabled and clocks frozen (`page.clock`) so relative times are stable. Threshold: `maxDiffPixelRatio: 0.001` (0.1 %) and `threshold: 0.2` per pixel; fonts loaded from the repo (Geist, SIL OFL) so rendering is deterministic on the CI image (`mcr.microsoft.com/playwright` pinned). Baselines live in `e2e/visual/__screenshots__/` committed through Git LFS; updates require a PR label `visual-approved` and a reviewer looking at the diff report artifact.
- **Files:** `e2e/visual/manifest.ts`, `e2e/visual/*.spec.ts`, `e2e/visual/__screenshots__/**`, `.gitattributes` (LFS), `.github/workflows/ci.yml` (job `visual`, diff report artifact)
- **Done when:** the manifest covers every page and state, the job is a required check, and one deliberate 2 px spacing change fails it.

### 4.9 Accessibility (SPEC C11) in CI and by hand
- **What:** `@axe-core/playwright` on every page and dialog state in the visual manifest, both themes, failing on any `serious` or `critical` violation; contrast tables generated by `packages/ui/scripts/contrast.ts` for every text token on every surface token in both themes (all >= 4.5:1 for text, >= 3:1 for icons and borders) committed to `docs/design/contrast.md`; reduced-motion verification (`emulateMedia({reducedMotion: 'reduce'})` asserts no running animations through `getAnimations()`); ARIA live region checks for deploy status changes; every chart has a text summary (`aria-describedby`) asserted by a test. The manual keyboard checklist (§5 Keyboard & accessibility) is executed once per release by a person and recorded in `docs/testing/a11y-manual-<version>.md`.
- **Files:** `e2e/a11y/*.spec.ts`, `packages/ui/scripts/contrast.ts`, `docs/design/contrast.md`, `docs/testing/a11y-checklist.md`, `docs/testing/a11y-manual-<version>.md`
- **Done when:** axe is a required check, the contrast table has no failing cell, and the manual checklist for v1.0.0 is signed and dated.

### 4.10 Load tests (k6)
- **What:** Three scenarios in `e2e/load/`, each with thresholds that fail the run: (1) `dashboard-200.js`: 200 virtual users browsing Home, Projects, a canvas and an inspector with a live WebSocket subscription for 10 min; thresholds `http_req_duration p(95) < 300`, WebSocket message latency p95 < 1 s, control-plane RAM under 1 GB on the 4 GB harness VM. (2) `log-tail-50x100.js`: 50 services each printing 100 lines/s (a `lumen-samples/log-spammer` image) with 20 dashboards tailing; thresholds: no dropped lines in the agent segment files (line counters match), UI delivery p95 < 1 s, agent RAM under 200 MB. (3) `deploy-burst-50.js`: 50 deploys queued at once across 2 servers; thresholds: all reach `ACTIVE` or a catalog error within 15 min, no deployment stuck in `QUEUED`, API p95 < 100 ms during the burst, supersede logic cancels older builds for the same service.
- **Files:** `e2e/load/{dashboard-200.js,log-tail-50x100.js,deploy-burst-50.js}`, `e2e/load/README.md`, `.github/workflows/nightly-load.yml`, `docs/testing/load-results.md`
- **Done when:** all three pass on the nightly harness with results recorded, and the numbers feed `docs/limits.md`.

### 4.11 Chaos tests with pass criteria
- **What:** `e2e/chaos/` scripts against the harness, each with a written pass criterion:
  - Kill the agent mid-build: the deployment ends `FAILED` with `BUILD_FAILED_GENERIC` or resumes and completes after restart; no orphan BuildKit processes; the previous deployment stays `ACTIVE`.
  - Kill the agent mid-swap: after restart exactly one container per replica is running, Caddy points at a healthy one, the curl loop shows at most 1 s of failures.
  - Drop the control plane for 10 min: every app keeps answering (curl loop 0 failures), sleeping and waking keep working, agents reconnect within 60 s and the UI shows no stale status after 5 s.
  - Fill the disk to < 2 GB free: new builds refuse with `DISK_FULL` and the fix button; running apps continue; the cleanup action frees space.
  - Reboot a server: apps return within 90 s of boot without a deploy; the canvas shows the offline ring then clears.
  - Revoke GitHub access: the next push shows `GITHUB_ACCESS_REVOKED` with the reconnect button; nothing else breaks.
  - Expire a certificate (Caddy internal CA with a 1 h cert in the harness): renewal happens automatically; a forced failure shows `TLS_FAILED` with the reason.
  - Corrupt a join token: the installer prints the exact error and the fix (regenerate); no server row is created.
  - Clock skew of +10 min on one server: heartbeats still accepted (tolerance window), metrics buckets stay ordered, certificate issuance still works; skew of +2 h triggers the `CLOCK_SKEW` warning banner on the server page.
  - Partition the mesh (Phase 17): documented behavior holds.
- **Files:** `e2e/chaos/*.sh`, `e2e/chaos/README.md` (criteria table), `.github/workflows/nightly-chaos.yml`, `packages/shared/src/errors/catalog.ts` (`CLOCK_SKEW` if missing)
- **Done when:** every scenario passes nightly and the criteria table lists the measured recovery times.

### 4.12 Install matrix and upgrade tests
- **What:** Nightly matrix from `e2e/install/matrix.json`: Ubuntu 22.04, Ubuntu 24.04, Debian 12, Rocky Linux 9, each on amd64 (Hetzner) and arm64 (Oracle Ampere for Ubuntu and Oracle Linux 9 as the RHEL-family arm64 row). Each cell runs `deploy/install.sh`, asserts the final block, joins a second VM, deploys `node-hello`, checks HTTPS, re-runs the installer (idempotent, < 5 s), runs `lumen-admin uninstall --keep-volumes`, and reports duration. Upgrade test (SPEC Part G): install the previous tag N-1, deploy two apps with a curl loop, `lumen-admin update` to the release candidate, assert zero failed requests, agent auto-updated to N, database migrated, then run the Phase 11 rollback scenario against a deliberately broken N+1 manifest.
- **Files:** `e2e/install/matrix.json`, `e2e/install/run-cell.sh`, `e2e/install/upgrade.sh`, `.github/workflows/nightly-install.yml` (matrix strategy, provider secrets), `docs/testing/install-results.md`
- **Done when:** all eight cells and the upgrade test pass three nights in a row before the tag; the results table is in the docs.

### 4.13 Docs site
- **What:** `apps/docs` built with Astro Starlight (MIT): Markdown/MDX content, built-in Pagefind search, sidebar from the folder structure, dark and light themes wired to the Lumen tokens (a Starlight custom CSS layer, not a fork). Structure under `apps/docs/src/content/docs/`:
  - `getting-started/` — `install.md` (the curl command, requirements from E1: control plane 2 vCPU / 2 GB / 20 GB, additional servers 1 vCPU / 1 GB, ports 80/443, UDP 51820, optional 20000–29999), `first-deploy.md`, `add-a-domain.md`, `add-a-database.md`, `invite-your-team.md`
  - `servers/` — the seven provider guides from Phase 11 (`docs/guides/providers/*` moved here and kept as the single source), `firewalls.md`, `multi-server.md`, `offline-servers.md`
  - `deploying/` — one page per D2 item (GitHub, Docker image, local upload, builders, push-to-deploy and watch paths, monorepos, pre-deploy, healthchecks, rollback, `lumen.toml` reference from J3)
  - `variables/`, `networking/`, `databases/` (including `postgres-ha.md` from Phase 17), `volumes-backups/`, `environments/`, `observability/`, `templates/` (one page per built-in template with licence notes), `teams/`, `cli/` (generated), `api/` (generated), `mcp/`, `self-hosting/` (update, backups, restore, uninstall, instance admin), `troubleshooting/` (generated), `reference/` (ports J5, platform variables B13, glossary J7, limits from `docs/limits.md`)
  - **API reference:** the OpenAPI document exported by `apps/api` at build time (`pnpm --filter api openapi:export`) rendered with Scalar's Astro integration (MIT); every J1 route appears with its permission and scope from the Phase 15 annotations.
  - **CLI reference:** generated by `lumen docs --markdown ./apps/docs/src/content/docs/cli` from cobra's `GenMarkdownTree`, one page per J2 command, with the global flags page.
  - **Troubleshooting:** `packages/shared/scripts/gen-error-docs.ts` emits one page per J6 error code (title, explanation, fix, the same copy the error card shows, plus a "Details" section maintained by hand in `packages/shared/src/errors/docs/<CODE>.md`); the error card's "Learn more" links to `/troubleshooting/<code>`.
  - Versioning: the site is built per release tag; `docs.<domain>/` serves the latest stable, `/v1.0/` the pinned version; a banner on old versions.
  - Content rules: SPEC C9 voice, one primary action per page (a copyable command or a link), screenshots at 1440 dark with a light variant toggled by the theme, every screenshot regenerated by a Playwright script (`apps/docs/scripts/screenshots.ts`) so they never go stale.
- **Files:** `apps/docs/**`, `apps/docs/astro.config.mjs`, `apps/docs/src/styles/lumen.css`, `apps/docs/scripts/screenshots.ts`, `packages/shared/scripts/gen-error-docs.ts`, `packages/shared/src/errors/docs/*.md`, `apps/cli/cmd/docs.go`, `.github/workflows/docs.yml` (build, link check with `lychee`, deploy)
- **Done when:** every feature in Part D has a page, every J6 code has a troubleshooting page, the API and CLI references build from source in CI, `lychee` finds no broken links, Lighthouse accessibility and performance scores are >= 95 on the home and a reference page, and the site is live at the docs domain.

### 4.14 Landing page
- **What:** `apps/docs/src/pages/index.astro` (same site, root path) with a design brief in `docs/design/landing-brief.md` before any pixels: feeling "calm, precise, instantly understandable" (SPEC C2), Lumen's tokens and Geist, no comparison tables against named products, no borrowed layouts. Sections, in order: (1) hero: one sentence "Deploy apps and databases on servers you already own." with the install command in a copy field as the only primary action and a 12-second looping screen recording of the canvas (muted, `prefers-reduced-motion` shows a still); (2) "How it works" in three steps with the exact terminal block, the setup wizard step 0 and a canvas with a deploying node; (3) feature grid of twelve items in Part D order with one sentence each (no marketing adjectives); (4) "Any server" with the provider marks in monochrome and the requirements line; (5) "Yours to keep" (self-hosted, open licence, no telemetry by default); (6) "Get started" repeating the command and linking to the docs. Footer: docs, GitHub, changelog, licence. Meta: Open Graph image generated at build with the product mark; `<title>Lumen — deploy on your own servers</title>`.
- **Files:** `docs/design/landing-brief.md`, `apps/docs/src/pages/index.astro`, `apps/docs/src/components/landing/*.astro`, `apps/docs/public/og.png`, `apps/docs/scripts/record-hero.ts` (Playwright video → WebM/MP4)
- **Done when:** the brief is approved and recorded in `docs/UI_DECISIONS.md`, Lighthouse performance >= 95 on mobile, the page passes axe, and the H2 originality check finds nothing that reads as imitation.

### 4.15 Demo video script
- **What:** `docs/marketing/demo-script.md`, 90 seconds, screen recording only, no voice-over required (captions in the script), shot list: 0:00 fresh VM terminal, paste the command; 0:10 the final block with the setup code; 0:15 wizard step 0 and 1 (cut); 0:22 Home with the checklist; 0:26 Add → GitHub repository → `node-hello` → Deploy; 0:35 canvas node building with live logs in the inspector; 0:48 status flips to Active, click the public URL, the app loads over HTTPS; 0:55 Add → Database → Postgres, the volume chip appears; 1:02 Variables tab, type `${{` and pick `postgres.DATABASE_URL`, staged bar, Review & deploy; 1:15 Logs tab live tail; 1:20 Servers page with two servers and green checks; 1:25 end card with the install command. Rules: real timings (no sped-up builds unless captioned "sped up"), 1440 px dark theme, cursor visible, no music dependency.
- **Files:** `docs/marketing/demo-script.md`
- **Done when:** the script exists with the shot list and the recording checklist; the recording itself is a launch-day task tracked in 4.17.

### 4.16 Release pipeline
- **What:** `.github/workflows/release.yml` triggered by a `v*` tag:
  1. **Version and changelog:** conventional commits enforced by `commitlint` in CI; `git-cliff` (MIT/Apache-2.0) generates `CHANGELOG.md` and the release notes; the tag must match `apps/api/package.json`, `apps/web/package.json` and the Go `version` ldflag.
  2. **Binaries:** GoReleaser (MIT) builds `lumen-agent` for linux/amd64 and linux/arm64 (static, `CGO_ENABLED=0`, `-trimpath`) and `lumen` CLI for linux, darwin and windows on amd64 and arm64; produces `SHA256SUMS`; signs `SHA256SUMS` with an Ed25519 key held in GitHub secrets (`SHA256SUMS.sig`, verified by `install.sh` and `agent-install.sh` through `openssl pkeyutl -verify -pubin -rawin` with the public key embedded in the scripts) and additionally with cosign keyless (Sigstore, `cosign sign-blob`) for users who prefer transparency-log verification; Homebrew tap and Scoop bucket updated by GoReleaser.
  3. **Images:** `lumen-web`, `lumen-api` (also used for workers) built multi-arch with `docker buildx`, pushed to GHCR with immutable tags `v1.0.0` and digests recorded; signed with cosign keyless (`cosign sign`); SBOMs generated by `syft` (Apache-2.0) in SPDX and attached to the release and attested (`cosign attest`); `trivy` scan must show no critical CVEs or the release fails.
  4. **Manifest:** `releases/<channel>/manifest.json` (schema from Phase 11) written with every digest, agent URLs and checksums, the changelog URL and `min_upgrade_from`; signed with the Ed25519 key; published to the static release host along with `install.sh`, `agent-install.sh` and the binaries; stable is promoted from beta by re-signing the same manifest into the stable channel after the nightly suites pass on the beta build.
  5. **Verification job:** a fresh VM installs from the just-published stable manifest and runs the smoke suite; the release is marked "verified" in GitHub Releases only after this passes.
- **Files:** `.github/workflows/release.yml`, `.goreleaser.yaml`, `cliff.toml`, `commitlint.config.js`, `deploy/release/publish.sh`, `deploy/release/sign-manifest.sh`, `deploy/install.sh` and `deploy/agent-install.sh` (public key + verify step), `docs/self-hosting/releases.md` (how to verify by hand)
- **Done when:** `v1.0.0-rc.1` goes through the whole pipeline, a fresh VM installs it with signature verification succeeding, tampering with `SHA256SUMS` makes the installer refuse with "The download didn't pass its signature check. Try again, and if it keeps failing, tell us.", and `lumen-admin update` from `rc.1` to `rc.2` works on the harness.

### 4.17 Launch checklist and the gate
- **What:** `docs/LAUNCH.md`, ticked with links to evidence:
  - [ ] Audit: zero critical or high findings open; every medium fixed or excepted with expiry
  - [ ] H4 review: every high risk mitigated; `docs/limits.md` published
  - [ ] B14: all eight budgets passing on reference hardware, results dated within 7 days of the tag
  - [ ] Part G: unit thresholds, integration, protocol compat, e2e (local + nightly × 3), visual, axe, k6 × 3, chaos (all scenarios), install matrix (8 cells × 3 nights), upgrade test
  - [ ] Manual keyboard checklist signed for the release
  - [ ] Stopwatch test (Phase 11): median of 3 first-time users under 10 minutes on the release candidate
  - [ ] Docs site live, link check clean, every J6 code has a page, API and CLI references match the tag
  - [ ] Landing page live, Lighthouse and axe passing, originality check done
  - [ ] Release verified: signed binaries, signed manifest, digest-pinned images, SBOMs, changelog
  - [ ] `LICENSE`, `THIRD_PARTY.md` (every dependency with licence, including Geist OFL, Lucide ISC, simple-icons CC0, Spilo/etcd/HAProxy notes), `SECURITY.md` (reporting address, supported versions), `CONTRIBUTING.md`
  - [ ] `docs/PROGRESS.md` "After launch" list written; `docs/DECISIONS.md` complete
  - [ ] Demo video recorded from the script; social/announcement copy in C9 voice
  - [ ] Tag `v1.0.0` pushed; stable manifest promoted; GitHub Release marked verified
- **Files:** `docs/LAUNCH.md`, `LICENSE`, `THIRD_PARTY.md`, `SECURITY.md`, `CONTRIBUTING.md`
- **Done when:** every box is ticked with a link, and the person doing the launch has re-run the install command on a brand-new VM one last time.

## 5. Detail checklist

### Typography
- Docs site body: Geist Sans 16 / 400, line-height 1.6, measure 68–72 characters (content column 720 px); the one place in the product where body is 16 rather than 14, because reading pages are not dense UI.
- Docs headings: h1 32 / 600 letter-spacing −0.02em, h2 24 / 600 −0.01em, h3 20 / 600, h4 16 / 600; line-height 1.25; 48 px above h2, 32 px above h3, 16 px below each.
- Docs code: Geist Mono 14 / 400 in blocks with line-height 1.6, 13 / 400 inline on `surface-hover` with radius 4 and 2 px 6 px padding; copy button on every block; long commands never wrap (horizontal scroll with a 24 px fade).
- Docs sidebar: label 13 / 500; current page `text` with the `accent` 2 px left bar; groups caption 12 / 600 uppercase tracking 0.04em `text-muted`.
- Docs tables (ports, error catalog, permission matrix): table cell 14 / 400, header 13 / 500, tabular numerals for ports and sizes.
- Landing hero sentence: 40 / 600 at >= 1024 (32 at 390), letter-spacing −0.02em, line-height 1.15, max 18 words; sub-sentence 18 / 400 `text-secondary`.
- Landing install command: Geist Mono 15 / 400 in a 48 px tall copy field, never wraps below 390 px (font shrinks to 13 at < 400 px).
- Landing feature grid: card title 16 / 600, body 14 / 400 `text-secondary`.
- Terminal blocks on the landing page and docs use the exact Phase 11 output (60 columns, aligned labels) in a fixed-width block with the same glyphs.
- Troubleshooting pages: the error title is the h1 in the exact J6 wording; the "What happened" and "How to fix it" sections use h2; the fix command in a code block.
- Release notes: h2 per version, h3 per group (Added, Changed, Fixed, Security), body 14 / 400 in the in-app Updates page and 16 / 400 on the docs site.

### Spacing & layout
- Docs: sidebar 260 px, content 720 px, right-hand "On this page" 200 px at >= 1280; 32 px gutters; paragraph spacing 16 px; list item spacing 8 px; admonitions (`note`, `warning`) 16 px padding, radius 10, 3 px left bar.
- Landing: max width 1120 px, section vertical padding 96 px (64 at < 768), hero top padding 128 px (80 at < 768), grid 3 columns with 24 px gaps (2 at 1024, 1 at < 768), 4 px grid everywhere.
- Screenshots in docs: 1440 px captures shown at 100 % width of the content column with a 1 px `border` and radius 10; never scaled below 720 px (crop instead).
- Error cards in the product keep the C10 layout; the "Learn more" link sits after the fix button with 12 px gap.

### Color & theme
- Docs and landing use the exact C4 tokens through the Starlight custom CSS layer: `bg` #0D0F12 / #F7F7F5, `surface`, `border`, `text`, `text-secondary`, `accent` #14B8A6 dark / #0D9488 light; code blocks on `surface`; links `accent` with underline on hover only in body text; the one accent element per landing section rule holds (hero: the copy button).
- Syntax highlighting: a Lumen Shiki theme (`apps/docs/src/styles/shiki-lumen.json`) with five colors only (keyword `accent`, string `success`, number `warning`, comment `text-muted`, punctuation `text-secondary`) so blocks stay calm and pass 4.5:1 in both themes.
- The contrast table in `docs/design/contrast.md` is regenerated in CI; any new token combination must appear there.
- Provider marks on the landing page monochrome `text-secondary`; no brand colors.
- Status glyphs in docs screenshots match C4 exactly (● ◐ ✕ ⟳ ☾ ■ …), and the docs "Status" reference page lists them with their meaning and color.

### Motion
- Docs: no motion beyond the theme toggle cross-fade (120 ms) and the copy-button icon swap; sidebar expand/collapse 200 ms `cubic-bezier(.2,.8,.2,1)`; all disabled under reduced motion.
- Landing: hero video autoplays muted and loops; under reduced motion a still frame with a "Play" button replaces it; feature cards have a 120 ms hover lift of 1 px with the light-theme shadow only; nothing scroll-triggered, no parallax.
- Product: the release verifies every animation in the visual manifest is disabled by `prefers-reduced-motion` (4.9) and that no animation exceeds 200 ms except the building pulse (1.6 s loop) and the canvas springs.

### Iconography & symbols
- Docs sidebar groups use Lucide 16 px: getting started `rocket`, servers `server`, deploying `upload-cloud`, variables `braces`, networking `globe`, databases `database`, volumes `hard-drive`, environments `git-branch`, observability `activity`, templates `layout-template`, teams `users`, CLI `terminal`, API `code-2`, MCP `plug`, self-hosting `wrench`, troubleshooting `life-buoy`, reference `book-open`.
- Admonitions: note `info`, warning `alert-triangle`, danger `alert-octagon` 16 px in their semantic colors.
- Landing feature grid uses the same Lucide icons at 20 px as the product's rail and tabs so the product feels familiar before install.
- Terminal glyphs `✓ ! ✗ …` documented in the reference with their ASCII fallbacks `[ok] [!!] [xx] [..]`.
- The product mark is used at 24 px in the docs header and 32 px in the landing header; the favicon set (16, 32, 180, 512) and the OG image are generated from the same SVG in `packages/ui/src/brand/mark.svg`.

### Copy
- Docs voice (C9): second person, active, one idea per sentence, no exclamation marks; every page opens with one sentence saying what the reader will have at the end ("By the end you'll have a Postgres database your app can reach privately.").
- Every page has exactly one primary action near the top: a command to copy, a button in the product to click (named exactly as in the UI), or a link.
- Landing copy, verbatim: hero "Deploy apps and databases on servers you already own." · sub "Connect GitHub, paste one command into your VM, and ship with push-to-deploy, HTTPS, databases, backups and private networking." · install field label "Install on a fresh Ubuntu or Debian server" · step titles "Paste one command" · "Enter your setup code" · "Deploy from GitHub" · section "Any server, any cloud" · "Yours to keep" · final "Get started in ten minutes".
- Troubleshooting page template: h1 = J6 title; first paragraph = the catalog explanation; h2 "How to fix it" with the fix action in words plus the command; h2 "Why this happens"; h2 "Still stuck?" with "Copy for support" instructions.
- Installer signature failure: "The download didn't pass its signature check. Try again, and if it keeps failing, tell us." with the security contact from `SECURITY.md`.
- Release notes headings fixed: Added · Changed · Fixed · Security; entries start with a verb in past tense and name the screen or command.
- Security policy: "Report security problems to security@<domain>. We answer within 3 business days and credit reporters who want it."

### States (empty · loading · error · success · partial)
- Docs search: empty query shows recent pages; no results "Nothing matches. Try the error code, the command name, or the page title."; loading skeleton of three result rows.
- Docs 404: "This page moved or doesn't exist." with search focused and links to Getting started and Troubleshooting; the build's link check keeps this rare.
- Docs old-version banner: "You're reading docs for v1.0. The latest is v1.2." with a link.
- Landing: hero video failed to load shows the poster frame; install command copy shows "Copied" for 1.5 s; JavaScript disabled still renders the whole page (no client-only content).
- In-app Updates page states from Phase 11 verified against a real published release: up to date, available (with the generated changelog), updating, failed with rollback.
- Product-wide state audit: the visual manifest enumerates empty, loading, error, success and partial for every page from every phase's §5; the launch gate requires no missing entry (a script compares the manifest against the hand-maintained `docs/testing/state-inventory.md`).

### Keyboard & accessibility
The manual keyboard checklist (`docs/testing/a11y-checklist.md`) is executed once per release with a keyboard only, screen reader on for the starred items, in both themes:
- Setup wizard: complete all six steps; Shift+Tab reaches the stepper links; error messages announced*.
- Login, 2FA, invite accept, reset: submit with Enter; focus moves to the first invalid field on error*; "Continue with GitHub" reachable.
- Home: checklist items activate with Enter; recent deploys list navigable; server strip cards focusable with visible rings.
- Projects list: `/` focuses search; arrow keys move between cards; Enter opens; "New project" is first in tab order after search.
- Add flow (⌘J / N): type to filter; arrows and Enter; Esc closes and returns focus to the trigger*; every option reachable.
- Canvas: Tab cycles nodes in layout order; Enter opens the inspector; arrows nudge the selected node 8 px (Shift 32 px); ⌘0 fits; Delete asks; Shift+F10 opens the context menu; F2 renames a group*.
- Inspector: Esc closes; tabs with arrows; header actions in order (rename, copy URL, open URL, Redeploy split button, overflow, close); deployment rows and menus; rollback dialog typed confirm.
- Variables: add row with Enter; reference autocomplete with arrows; reveal toggles announce "Value shown"*; in the raw editor Tab inserts a tab and Esc leaves the editor.
- Metrics: time-range control with arrows; each chart's text summary read by the screen reader*; deploy markers focusable with tooltips.
- Logs: filter chips removable with Backspace; "Jump to live" reachable; Enter copies a line; Enter expands JSON; download button reachable.
- Settings tabs: section nav with arrows; every switch, slider (arrows change value, Home/End to bounds), select and combobox operable; the staged-changes bar reachable and ⇧⏎ applies.
- Database tabs: grid cell navigation with arrows, Enter edits, Esc cancels; ⌘⏎ runs a query; results grid navigable; Connect tab copy buttons.
- Volume panel, Environments manage, Compare & sync, Project settings, Observability dashboard (widget focus, arrows resize when a handle is focused), Servers list, detail and add wizard (checklist items announced as they turn green*), Templates gallery, detail and deploy form, Workspace settings, Account settings, Instance admin: full traversal with no trap and visible focus.
- Command palette: ⌘K, type, arrows, Enter, Esc; result count announced*.
- Notifications popover: tabs with arrows; items activate; "Mark all read".
- Web terminal: focus enters and leaves xterm with Esc then Tab (documented escape hatch); resize and reconnect buttons reachable.
- Global: "Skip to content" link first in tab order; `?` opens the shortcut sheet; the "Reconnecting…" bar announced*; every icon-only button has a tooltip and an `aria-label`; no hover-only affordance anywhere (touch pass on a phone).

Automated: axe serious and critical = 0 on every manifest entry; contrast table clean; reduced-motion assertion; chart summaries asserted; the ARIA live region for deploy status verified in Playwright by capturing announced text through an `aria-live` observer.

### Responsive
- Docs: sidebar becomes a drawer under 1024 (`menu` 20 px top-left), "On this page" collapses into a dropdown under 1280; tables scroll horizontally with a sticky first column; code blocks scroll; 16 px gutters at 390.
- Landing: hero stacks text over the video under 1024; grid 1 column under 768; the install copy field stays one line down to 360 px.
- Product: the release re-runs every phase's responsive checks through the visual manifest at 390 / 1024 / 1440, plus a 768 spot check on the canvas list view, the inspector sheet and the settings tab row.

### Performance
- Docs site: Lighthouse performance >= 95 and accessibility >= 95 on mobile for the home page, a getting-started page and an API reference page; Pagefind index under 2 MB; images as WebP with explicit dimensions (CLS < 0.05); fonts self-hosted with `font-display: swap`, subset to Latin.
- Landing hero video: <= 3 MB WebM with an MP4 fallback, `preload="metadata"`, poster image; total page weight under 1.5 MB.
- Product: the B14 table in 4.4 is the source of truth; bundle budgets enforced by a script over `@next/bundle-analyzer` output (`(app)` first-load JS under 220 kB gzipped, `(setup)` under 120 kB, `(auth)` under 90 kB); Lighthouse on the login page >= 90 performance.
- CI wall time: unit + lint + typecheck under 10 minutes; integration under 20; visual under 15; nightly suites publish results by 08:00 UTC.

### Security
- Everything in 4.1 fixed or excepted; the security workflow (gitleaks, `pnpm audit`, `govulncheck`, `trivy`) is a required check.
- Release artifacts: Ed25519-signed `SHA256SUMS` and manifest verified by the installers before use; cosign keyless signatures and SPDX SBOMs attached; images referenced by digest in the manifest and compose; provenance attestation (`cosign attest --type slsaprovenance`) for images and binaries.
- Docs site: static hosting with CSP `default-src 'self'` plus the search worker, no third-party scripts, no analytics by default; copy buttons use a bundled script with a nonce, no inline handlers.
- `SECURITY.md` with the reporting address, PGP fingerprint, supported versions (latest minor only) and the disclosure timeline; GitHub private security advisories enabled on the repo.
- CI secrets: the signing key and cloud credentials in GitHub environments with required reviewers; nightly jobs use least-privilege provider tokens scoped to a `lumen-ci` project; test VMs destroyed at job end with a sweeper job for leftovers.
- Dependency policy in `CONTRIBUTING.md`: licence allowlist (MIT, Apache-2.0, BSD-2/3, ISC, OFL, CC0, MPL-2.0 with notes), no copyleft in shipped binaries except the documented HAProxy image; `pnpm licenses list` and `go-licenses` checked in CI against `THIRD_PARTY.md`.

### Data integrity & idempotency
- Releases are reproducible: the same tag rebuilt yields identical binary checksums (`-trimpath`, pinned toolchains, `SOURCE_DATE_EPOCH`); verified once for `v1.0.0-rc.2`.
- The manifest is written atomically (upload to a temp key, then copy) so an installer never sees a partial file; the previous manifest stays at `manifest.<version>.json` for rollback.
- Docs generation is deterministic: API, CLI and troubleshooting pages are regenerated in CI and the job fails if they differ from the committed files.
- Result documents (`perf-results.md`, `load-results.md`, `install-results.md`, `ha-results.md`, `a11y-manual-<version>.md`) are append-only with dates so trends stay visible.
- The launch checklist links to immutable evidence (workflow run URLs, commit SHAs), never to "latest".

## 6. Acceptance criteria
- [ ] SPEC Phase 18 AC: "all Part G suites green; zero critical or high audit findings open."
- [ ] SPEC H3 audit completed in a fresh Fable 5.1 session covering every attacker and check in 4.1; every critical and high finding fixed with a regression test and verified by re-audit; mediums fixed or excepted with owner and expiry.
- [ ] SPEC H4 review completed; every high risk mitigated with a test; `docs/limits.md` published with measured ceilings.
- [ ] SPEC B14: all eight budgets measured by the 4.4 methods on reference hardware, passing, dated within 7 days of the tag, with regression jobs in place.
- [ ] SPEC Part G: unit thresholds enforced (shared 90 %, api 80 %, web 70 %, Go core packages 80 %); agent-vs-Docker, API-vs-Postgres and protocol N/N-1 suites required and green; e2e passes locally on Multipass and nightly on cloud VMs three nights in a row; visual regression covers the full manifest at 0.1 %; axe serious/critical = 0 everywhere; k6 scenarios (200 users; 50 x 100 lines/s; 50 deploys) pass their thresholds; every chaos scenario passes its criterion; install matrix (Ubuntu 22.04/24.04, Debian 12, RHEL-family 9 x amd64/arm64) and the upgrade test pass three nights in a row.
- [ ] SPEC C11: contrast table clean in both themes; reduced motion respected everywhere; chart summaries present; the manual keyboard checklist signed for v1.0.0.
- [ ] Docs site live with every Part D feature, every J6 error code, generated API and CLI references matching the tag, provider guides, clean link check, Lighthouse >= 95.
- [ ] Landing page live in Lumen's identity, brief recorded, Lighthouse >= 95 mobile, axe clean, originality check passed.
- [ ] Release pipeline: `v1.0.0-rc.*` through tag → changelog → signed binaries → signed images and SBOMs → signed manifest → fresh-VM verification; tampered `SHA256SUMS` is refused by the installer; `lumen-admin update` between two published candidates works.
- [ ] `LICENSE`, `THIRD_PARTY.md`, `SECURITY.md`, `CONTRIBUTING.md` present and accurate; licence checks in CI.
- [ ] Stopwatch test on the release candidate: median of 3 first-time users under 10 minutes.
- [ ] `docs/LAUNCH.md` fully ticked with evidence links; `v1.0.0` tagged, stable manifest promoted, GitHub Release marked verified.

## 7. Test plan
This phase owns the test system itself, so the plan is the inventory of suites and their gates.

- **Unit (Vitest, Go test):**
  - `packages/shared`: desired-state compiler (hash stability, ordering, placement), variable resolution (references, missing key → `VARIABLE_REF_MISSING`, cycles → `VARIABLE_REF_CYCLE` naming the cycle, generators `secret`, `uuid`, `port`), permission table vs D11, cron parse/describe, log filter syntax (`level:error`, `status:>=500`, `path:/api/*`, `user_id:42`, `service:api`), error catalog completeness (every code has title, explanation, fix, action), cost shares, `lumen.toml` parsing.
  - `apps/api`: route handlers with mocked services, RBAC middleware, audit hook, rate limiter, encryption envelope and rotation, GitHub webhook HMAC, OpenAPI generation snapshot.
  - `apps/web`: hooks and stores (staged changes, realtime cache updates, canvas layout persistence), formatting helpers (durations, bytes, relative time), the filter-chip parser, keyboard shortcut map (no duplicate bindings).
  - `apps/agent`: reconcile diffing, spec hashing, Caddy config builder, DNS records, mesh peer diffing, sleep tracker, waker singleflight, log segment index, secret scrubber (sealed values replaced by `••••••` across chunk boundaries).
  - Gates: thresholds in 4.5; Stryker weekly on variables and permissions.
- **Integration:** the three suites in 4.6, plus per-phase integration tests already merged, all required on `main`.
- **E2E (Playwright):** the nine suites in 4.7 in chromium-dark, chromium-light and mobile-390; run locally on Multipass before every release candidate and nightly on cloud VMs; flaky tests are quarantined by label and fixed within one release, never retried silently (retries = 0 in config).
- **Visual regression:** the manifest in 4.8, threshold 0.1 % pixels, LFS baselines, `visual-approved` label to update.
- **Accessibility (axe + keyboard pass):** 4.9 automated checks as required checks; the manual checklist in §5 executed and signed per release.
- **Load (k6):** 4.10 scenarios nightly with thresholds; results appended to `docs/testing/load-results.md`.
- **Chaos:** 4.11 scenarios nightly; criteria table in `e2e/chaos/README.md`; recovery times recorded.
- **Install matrix and upgrade:** 4.12 nightly; three consecutive green nights required before tagging.
- **Performance budgets:** 4.4 jobs in CI and nightly; results in `docs/testing/perf-results.md`.
- **Security automation:** gitleaks on every push; `pnpm audit --audit-level=high`, `govulncheck`, `trivy image` on every PR and nightly; licence checks against `THIRD_PARTY.md`.
- **Release verification:** 4.16 step 5 on a fresh VM per candidate; the signature-tamper test; `lumen-admin update` rc → rc.
- **Docs:** `lychee` link check, generated-file drift check, Lighthouse CI on three pages, axe on the docs home and a reference page.
- **Manual / on a real VM:** the stopwatch test (Phase 11 protocol) on the release candidate with three first-time users; passkeys on three platforms (Phase 15); provisioning on two providers (Phase 16); HA failover on three cloud VMs (Phase 17); one last install of the promoted stable manifest by the person launching.

## 8. Evidence required to close
- `docs/security/audit-2026-<date>.md` with every attacker section, every finding's severity, evidence and fix status, and the re-audit signatures; `docs/security/exceptions.md`; the security workflow run URL.
- `docs/architecture/review-2026-<date>.md` and `docs/limits.md` with measured ceilings and the workflow runs that produced them.
- `docs/testing/perf-results.md`: the eight B14 rows with numbers, hardware, dates and run URLs; the deliberate-regression run showing the job failing.
- `docs/testing/coverage.md` with per-package numbers and the CI threshold configuration; the weekly Stryker report.
- CI run URLs for `agent-integration`, `api-integration`, `protocol-compat`, `visual`, `a11y`; three consecutive nightly runs for e2e, load, chaos, install matrix and upgrade with their result tables.
- `docs/design/contrast.md` regenerated; `docs/testing/a11y-manual-v1.0.0.md` signed and dated; the screen-reader announcement captures.
- Docs site URL, `lychee` report, Lighthouse reports for three pages, the generated-file drift job output.
- Landing page URL, `docs/design/landing-brief.md`, Lighthouse and axe reports, the H2 originality review notes.
- Release: the `v1.0.0-rc.*` and `v1.0.0` workflow runs, `SHA256SUMS`, `SHA256SUMS.sig`, cosign verification transcripts (`cosign verify-blob`, `cosign verify`), SBOM files, the manifest JSON for stable and beta, the fresh-VM verification transcript, the tamper-refusal transcript, the reproducible-build checksum comparison.
- Stopwatch results for the release candidate (three runs with hesitation logs).
- `docs/LAUNCH.md` with every box linked to the items above.

## 9. Review
- **H3 (security audit):** run verbatim in a fresh Fable 5.1 session with no prior context, at the `audit-1` tag; the auditor must not see `docs/security/exceptions.md` until after writing findings. Re-audit of fixes by the same session or a second fresh session given only the finding and the diff. Probe beyond the 4.1 list: anything reachable through the MCP endpoint with a low-scope token, every place the agent trusts a header or label set by a container, every `fetch()` in the API whose URL derives from user input, every file path built from a user string (mount paths, dockerfile path, root directory, template icons), the Postgres role used by the app (no superuser, no `DELETE` on `audit_log`).
- **H4 (architecture):** a fresh session; probe the reconcile loop under duplicated or reordered messages, the desired-state version monotonicity, what a 30 s heartbeat gap does to in-flight ops, log retention under a 100 lines/s flood for 7 days on a 20 GB disk (must stay under the retention cap), and the queue's behavior with 50 concurrent deploys on 2 servers.
- **H1 (code review) on this phase's own code** by the model that did not write it: the harness scripts (VM cleanup on failure, secrets never echoed), the release workflow (no step can publish without the verification job), the docs generators (deterministic output), the perf scripts (measuring the right thing, not warm caches by accident).
- **H2 (UI review)** on the docs site, landing page and the in-app Updates page with a real changelog; probe: first impression of the landing hero (does a beginner know what to do first: copy the command), originality (nothing borrowed), docs page hierarchy at 390 px, syntax theme contrast.
- **Originality check (SPEC C2, H2 item 6)** on the landing page and docs styling specifically, recorded in `docs/UI_DECISIONS.md`.
- **Final sign-off:** the person launching reads `docs/LAUNCH.md` and re-runs the install on a brand-new VM; no model signs off the launch.

## 10. Risks & open questions
- **Risk:** The audit surfaces a critical finding in the agent protocol late, forcing a protocol bump. → **Mitigation:** the N/N-1 compatibility suite (4.6) makes a bump routine; budget one extra session; agents auto-update after the control plane.
- **Risk:** Nightly cloud VM suites are flaky because of provider capacity or DNS propagation. → **Mitigation:** two providers (Hetzner amd64, Oracle arm64) with automatic fallback regions, DNS checks through public resolvers, and a "three consecutive nights" gate rather than "every night ever".
- **Risk:** Visual regression baselines drift from font rendering differences across CI images. → **Mitigation:** pinned Playwright image, self-hosted fonts, frozen clocks, animations disabled; baselines only updated through the labeled review path.
- **Risk:** B14 budgets pass on the reference VM but fail on Oracle's free-tier ARM shape. → **Mitigation:** run the RAM budgets and the deploy-time budget on the Oracle arm64 VM too and record both; document the free-tier numbers in `docs/limits.md`.
- **Risk:** The Ed25519 signing key is lost or leaked. → **Mitigation:** key generated in CI's environment with required reviewers, backed up offline by the owner, rotation procedure documented (installers embed two public keys during a rotation window), cosign keyless as the second signature.
- **Risk:** Docs go stale the week after launch. → **Mitigation:** generated references and screenshots, the drift job, and the rule in `CONTRIBUTING.md` that a feature PR includes its docs page.
- **Risk:** Launch-day traffic to the release host. → **Mitigation:** static hosting behind a CDN; `install.sh` under 60 kB; images on GHCR.
- **Risk:** The stopwatch median lands at 11 minutes because of GitHub App creation friction. → **Mitigation:** the wizard's "I'll deploy Docker images for now" path is also timed; if GitHub is the bottleneck, the Getting started guide leads with a Docker-image first deploy and GitHub as step two, and the finding goes to Phase 6 polish.
- **Open question:** Release host and docs domain (`get.<domain>`, `docs.<domain>`, `releases.<domain>`) versus GitHub Pages + GitHub Releases. Default: a static bucket behind a CDN for `install.sh`, manifests and binaries (stable URLs, no rate limits), GitHub Releases as a mirror; the owner decides before session 8.
- **Open question:** Product name (SPEC: "Lumen is a working codename"). The rename touches the CLI binary name, the `lumen.toml` filename, platform variables (`LUMEN_*`), the internal domain (`lumen.internal`), the install paths and every doc. Default: keep "Lumen" for v1.0.0 unless the owner decides before session 6; a rename after launch is a breaking change for `LUMEN_*` variables and must ship with aliases.
- **Open question:** Telemetry opt-in prompt in the wizard versus off with no prompt. Default: off, no prompt (SPEC E2 `.env` `LUMEN_TELEMETRY=off`), a single sentence in Instance settings.
- **Open question:** Public bug bounty or private disclosure only at launch. Default: private disclosure through `SECURITY.md` and GitHub advisories; revisit after the first patch release.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / "After launch" list / known gaps with owners)
- [ ] `docs/DECISIONS.md` entries added: Starlight and Scalar, git-cliff and commitlint, GoReleaser, Ed25519 + cosign dual signing, syft SBOMs, Stryker, Git LFS for baselines, release host, product name decision, telemetry default, licence allowlist
- [ ] `docs/UI_DECISIONS.md` updated with the landing brief, docs styling, originality review and final screenshots
- [ ] Cross-model review done and findings fixed; `docs/LAUNCH.md` fully ticked
- [ ] Committed and pushed; `v1.0.0` tagged; stable manifest promoted; GitHub Release verified

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 18 — Hardening and launch</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-18-hardening-launch.md,
and these SPEC sections: Part G, H1, H2, H3, H4, B14, B12, C2, C9, C11, C14, D12, E2, E3, J1, J2, J5, J6, J7, 0.3 and 0.4.
This phase runs as eight separate sessions (see the phase doc header). Session 1 (the H3 audit) and
session 3 (the H4 review) must be FRESH Fable 5.1 sessions with no prior context: for those, paste only
the SPEC H3 or H4 prompt plus the tag to audit, not this prompt.
</context>
<goal>Lumen v1.0.0 ships with zero open critical or high security findings, every Part G suite green in CI and nightly on real VMs, every B14 budget measured and met, a docs site and landing page live, and signed release artifacts that the installer verifies before running.</goal>
<scope>
- H3 audit at the audit-1 tag covering every attacker and check in the phase doc §4.1; fix loop by the other model with regression tests; re-audit; exceptions file
- H4 architecture review; mitigations with tests; docs/limits.md with measured ceilings
- B14: one measurement method, script and CI/nightly job per budget (idle RAM 512 MB, agent 50 MB, route transition 150 ms, canvas 60 fps at 100 services, status < 1 s, log line < 1 s, Node deploy < 90 s cold / < 30 s warm, API p95 < 100 ms); perf-results.md
- Part G: coverage thresholds and gates; agent-vs-Docker, API-vs-Postgres and protocol N/N-1 suites; e2e harness (Multipass/Lima local, Hetzner + Oracle nightly) with the nine suites in three Playwright projects; visual regression manifest at 0.1 %; axe + contrast table + reduced-motion + chart summaries + the manual keyboard checklist; k6 (200 users; 50 x 100 lines/s; 50 deploys); chaos scenarios with criteria; install matrix (8 cells) and upgrade test
- Docs site (Astro Starlight): structure in §4.13, generated API (Scalar), CLI (cobra) and troubleshooting (J6) references, provider guides, versioning, screenshots by script, link check, Lighthouse
- Landing page from an approved brief in Lumen's identity; demo video script
- Release pipeline: commitlint + git-cliff, GoReleaser binaries for linux/amd64 + linux/arm64 (agent) and all CLI targets, Ed25519-signed SHA256SUMS + cosign keyless, multi-arch images with cosign signatures and syft SBOMs, signed channel manifests, fresh-VM verification, tamper refusal test, lumen-admin update between candidates
- LICENSE, THIRD_PARTY.md, SECURITY.md, CONTRIBUTING.md; docs/LAUNCH.md; the v1.0.0 tag
</scope>
<out_of_scope>
- Any new product feature, SSO/OIDC, read replicas or PgBouncer, UI localization, hosted offering or billing
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-18-hardening-launch.md §6, including: zero critical or high findings open with re-audit verification; all eight B14 budgets passing on reference hardware within 7 days of the tag; all Part G suites green with three consecutive nightly passes for e2e, load, chaos, install matrix and upgrade; contrast table clean and the manual keyboard checklist signed; docs site with every Part D feature and every J6 code, generated references matching the tag, link check clean, Lighthouse >= 95; landing page live and original; release candidates through the full signed pipeline with fresh-VM verification and tamper refusal; stopwatch median under 10 minutes on the candidate; docs/LAUNCH.md fully ticked and v1.0.0 tagged.
</acceptance_criteria>
<process>
1. Write a plan for the current session only (the phase spans eight): files to create/change, the suites or documents it produces, risks, open questions. STOP and wait for approval.
2. Implement in small steps; run every suite you touch; never mark a budget or suite as passing without the run URL or transcript.
3. For docs and landing work: screenshots at 390/1024/1440 × dark/light; critique against SPEC C14, C2 and the phase doc §5; fix before reporting.
4. Report: what works (with evidence links), what doesn't, deviations from spec, the next session's exact starting point.
5. Update docs/PROGRESS.md, docs/DECISIONS.md, docs/UI_DECISIONS.md and docs/LAUNCH.md.
</process>
```
