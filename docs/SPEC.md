# Lumen — Complete Build Spec & Prompt Playbook

> **Lumen** is a working codename. Find-and-replace it with your real product name before launch.
> **What this is:** a self-hosted deployment platform with a best-in-class beginner UI. It deploys apps, databases and templates onto **any VM the user already owns** (Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, a home server), with full feature parity with modern managed PaaS products and an **original design**.
> **Who builds it:** you, working with **Claude Fable 5.1** and **Claude Opus 5.5**.

---

## Table of Contents

- **0.** How to use this file (read first)
- **Part A.** Master context → `CLAUDE.md` (copy-paste)
- **Part B.** Architecture
- **Part C.** UI/UX specification (the most important part)
- **Part D.** Complete feature checklist with acceptance criteria
- **Part E.** Self-hosting and installation
- **Part F.** Build phases with ready-to-paste prompts
- **Part G.** Testing and QA
- **Part H.** Review and audit prompts
- **Part I.** Prompting playbook (getting the most out of both models)
- **Part J.** Appendix: API, CLI, config schema, template schema, env vars, ports, error catalog, glossary

---

## 0. How to use this file

### 0.1 Setup (do once)
1. Create the repo. Save this whole file as `docs/SPEC.md`.
2. Copy **Part A** into `CLAUDE.md` at the repo root. It is the model's permanent memory for the project.
3. Create these empty files. The models will maintain them:
   - `docs/PROGRESS.md`: what's done, what's next, known issues
   - `docs/DECISIONS.md`: architecture decisions, one entry per decision (date, decision, why, alternatives rejected)
   - `docs/UI_DECISIONS.md`: design choices, with screenshots linked
4. Work through **Part F** phases **in order**.

### 0.2 The session loop (repeat for every task)
```
1. Fresh session → paste the phase prompt from Part F
2. Model reads CLAUDE.md + referenced SPEC sections → writes a PLAN → STOPS
3. You read the plan, push back, approve
4. Model implements → runs tests → takes screenshots (UI) → reports honestly
5. Switch to the OTHER model → paste the review prompt from Part H with the diff
6. Fix findings → update PROGRESS.md + DECISIONS.md → commit
```

### 0.3 Which model for what

| Work | Model | Why |
|---|---|---|
| Architecture, agent protocol, reconciliation engine, deploy engine, private networking mesh, security design, hardest debugging | **Claude Fable 5.1** | Top-tier model; use it where a wrong design is expensive to undo |
| Design direction, design system, page-by-page UI, CRUD features, tests, templates, CLI commands, docs | **Claude Opus 5.5** | Very strong at complex, high-volume implementation |
| Reviewing any code or UI | **Whichever model did NOT write it** | Fresh eyes; the work doesn't grade itself |
| Final security audit before launch | **Fable 5.1**, fresh session, no prior context | Independent, adversarial review |

If budget allows, move any task that keeps failing up to Fable 5.1.

### 0.4 Golden rules for you (the human)
- **The spec is the source of truth.** If you change your mind, update `SPEC.md` first, then prompt.
- **One phase per session.** Long, mixed sessions degrade quality. Start fresh and let `PROGRESS.md` carry memory.
- **Never accept "done" without proof:** test output, a screenshot, or a command you ran yourself.
- **Commit after every green step.** Cheap undo beats clever recovery.
- **Test on real VMs early**, including an Oracle ARM instance and a cheap x86 VM. Most real-world bugs live in firewalls and OS differences.

---

## Part A — Master context (`CLAUDE.md`)

Copy everything inside the block below into `CLAUDE.md`.

```markdown
# CLAUDE.md — Lumen

<role>
You are a principal engineer and product designer building Lumen, a self-hosted
deployment platform. You write production-grade code, you design interfaces with
taste and restraint, and you verify your own work before claiming it is done.
</role>

<product>
Lumen lets anyone deploy apps, databases, and templates onto VMs they already own
(Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, bare metal) through a dashboard so
simple a beginner succeeds on their first try. Users connect GitHub, paste one command
into their VM, and get: push-to-deploy, variables, RAM/CPU limits, logs, metrics,
domains with HTTPS, databases, volumes, backups, environments, PR previews, private
networking, replicas, templates, a CLI, an API, and an MCP server.

The north star: a beginner goes from "fresh VM" to "my app is live on HTTPS" in
under 10 minutes without reading docs.
</product>

<why_ui_matters>
The UI is the product. Competitors have the features; they lose on clarity. Every
screen must have one obvious next action, plain-language copy, smart defaults, live
status, and errors that explain the fix. When in doubt, remove, hide behind
"Advanced", or default it.
</why_ui_matters>

<originality>
Lumen has its own visual identity, defined in docs/SPEC.md Part C. Do not imitate
the visual design, layout details, copy, iconography, names, or branding of any
existing deployment platform. Build original designs from the design tokens and
principles in the spec.
</originality>

<tech_stack>
- Monorepo: pnpm workspaces + Turborepo
- Dashboard: Next.js (App Router) + TypeScript (strict) + Tailwind CSS + Radix UI
  primitives + TanStack Query + React Flow (@xyflow/react) for the canvas + Motion
  for animation + xterm.js for terminals + a lightweight chart lib (e.g. uPlot)
- Control plane API: TypeScript on Node (Hono) + Zod + OpenAPI generated from Zod
- Database: PostgreSQL + Drizzle ORM + migrations
- Jobs & realtime: Postgres-backed queue (pg-boss or graphile-worker) + Postgres
  LISTEN/NOTIFY → WebSocket fan-out. NO Redis (keeps the control plane light).
- Agent: Go, single static binary (linux/amd64 + linux/arm64), talks to Docker
  Engine API, Caddy admin API, WireGuard, restic
- Agent ↔ control plane protocol: Protobuf messages over a single outbound WebSocket
  (buf for codegen to Go + TS), versioned
- Builds: BuildKit + Railpack (zero-config) | Dockerfile | prebuilt image
- Edge proxy on each server: Caddy (automatic HTTPS, admin API for dynamic routes)
- Private network: WireGuard mesh managed by the agent + agent-embedded DNS
- Backups: restic to any S3-compatible storage
- CLI: Go, generated OpenAPI client
- Tests: Vitest, Go test, Playwright (e2e + visual regression), axe (a11y), k6 (load)
Verify current versions and licenses of every dependency before adding it; record
the choice in docs/DECISIONS.md.
</tech_stack>

<repo_layout>
apps/web          Next.js dashboard
apps/api          Control plane API + workers + MCP endpoint
apps/agent        Go agent
apps/cli          Go CLI
packages/protocol Protobuf definitions + generated code
packages/ui       Design system (tokens, components) + component gallery route
packages/db       Drizzle schema + migrations
packages/shared   Shared TS types, validation, error catalog
packages/templates Built-in templates (JSON)
deploy/           Installer script, docker-compose for self-host, systemd units
docs/             SPEC.md, PROGRESS.md, DECISIONS.md, UI_DECISIONS.md
e2e/              Playwright suites + VM test harness
</repo_layout>

<coding_standards>
- TypeScript strict, no `any`, no non-null assertions without a comment why.
- Go: standard layout, context everywhere, errors wrapped with %w, no panics in
  the agent's main loop.
- Every API route: Zod-validated input, RBAC check, audit log for mutations.
- All agent operations are idempotent and keyed by an operation ID.
- Secrets never logged; build/runtime logs are scrubbed of known secret values.
- User-facing errors come from packages/shared/errors (code, title, explanation,
  fix, action). Never show raw stack traces to users.
- No placeholder code, fake data, or TODOs in merged work unless tracked in
  PROGRESS.md "Known gaps".
</coding_standards>

<how_to_work>
1. Read the SPEC sections referenced in the task before writing code.
2. For any task bigger than a small fix: write a plan (files, data changes, risks,
   test strategy, open questions) and STOP for approval.
3. Implement in small, verifiable steps. Run the code. Run the tests.
4. For UI work: run the app, take Playwright screenshots at 1440px, 1024px and
   390px widths in dark and light themes, look at them critically, and fix what
   looks off before reporting.
5. Report honestly: what works (with evidence), what doesn't, what you skipped.
6. Update docs/PROGRESS.md and docs/DECISIONS.md at the end of every session.
7. If the spec is ambiguous or contradicts itself, ask; don't guess on anything
   expensive to undo (schemas, protocol, security).
</how_to_work>

<definition_of_done>
- Feature meets every acceptance criterion in SPEC Part D for its scope
- Unit + integration tests pass; e2e test added for user-visible flows
- UI: all states designed (empty, loading, error, success, partial), keyboard
  accessible, passes axe, screenshots reviewed in both themes and three widths
- Errors map to the error catalog with a user-facing fix
- Docs updated (user docs for features, DECISIONS.md for choices)
</definition_of_done>

<never>
- Never mount the Docker socket into user containers by default
- Never run user containers privileged
- Never store secrets unencrypted or return sealed variables to the client
- Never expose the Caddy admin API or agent ports publicly
- Never add a dependency without checking license + maintenance status
- Never mark a task complete without running it
</never>
```

---

## Part B — Architecture

### B1. System diagram

```
                         ┌──────────────────────────────────────────┐
  Browser ──HTTPS──▶     │           CONTROL PLANE (1 VM)           │
  CLI / MCP ──HTTPS──▶   │  Caddy ─▶ web (Next.js)  api (Hono)      │
  GitHub ──webhooks──▶   │           workers (queue)  Postgres      │
                         │           registry (optional, multi-srv) │
                         └───────────────▲──────────────────────────┘
                                         │ outbound WebSocket (protobuf, auth'd)
             ┌───────────────────────────┼───────────────────────────┐
   ┌─────────┴─────────┐       ┌─────────┴─────────┐       ┌─────────┴─────────┐
   │ SERVER (Oracle)   │       │ SERVER (AWS)      │       │ SERVER (GCP)      │
   │ lumen-agent (Go)  │◀─WG──▶│ lumen-agent       │◀─WG──▶│ lumen-agent       │
   │ Docker + BuildKit │ mesh  │ Docker + BuildKit │ mesh  │ Docker + BuildKit │
   │ Caddy (80/443)    │       │ Caddy             │       │ Caddy             │
   │ user containers   │       │ user containers   │       │ user containers   │
   └───────────────────┘       └───────────────────┘       └───────────────────┘
```

The control plane host also runs an agent, so a single VM can run everything.

### B2. Components

| Component | Responsibility |
|---|---|
| **web** | Dashboard. It talks **only** to the public API (dogfooding), so the CLI, MCP and API get every feature for free. |
| **api** | Auth, RBAC, projects/services/variables CRUD, desired-state computation, GitHub webhooks, agent gateway (WebSocket), realtime fan-out, OpenAPI, MCP endpoint. |
| **workers** | Deploy orchestration, PR environments, backups scheduling, notifications, cleanup, cert/domain checks, cron scheduling. |
| **Postgres** | All state: desired state, deployment history, build logs, metrics rollups. |
| **agent** | Reconciles desired state on its server: builds, containers, Caddy routes, volumes, WireGuard mesh, DNS, TCP proxies, log capture, metrics, exec/shell, DB queries, backups, self-update. |
| **registry** | Only needed for multi-server. Stores built images so replicas on other servers can pull over the mesh. |

### B3. Desired-state reconciliation (the core idea; get this right)
- The control plane never says "run this command". It publishes the **desired state** for each server: a versioned document listing every container spec, route, volume, mesh peer and DNS record that should exist there.
- The agent continuously reconciles actual state toward desired state, on a timer and whenever it receives a new version.
- Every spec has a content hash. Same hash means nothing to do, which makes the whole system idempotent and restart-safe.
- The agent reports **actual state** (per container: status, health, restarts, OOM flag, resource usage) back to the control plane.
- Imperative operations are separate messages with operation IDs and acks: builds, exec sessions, DB queries, backups, restores.
- **Failure rule:** if the control plane is unreachable, the agent keeps running the last desired state. Apps never go down because the dashboard is down.

### B4. Deployment lifecycle

```
QUEUED → INITIALIZING → BUILDING → PRE_DEPLOY → DEPLOYING → HEALTHCHECKING → ACTIVE
   │           │            │           │            │              │
   └──────────►└──► FAILED ◄┴───────────┴────────────┴──────────────┘
ACTIVE → (new deploy succeeds) → SUPERSEDED → REMOVED
ACTIVE → CRASHED (restart policy exhausted) | SLEEPING (idle) | STOPPED (user)
Any pre-ACTIVE state → CANCELLED (user) | SKIPPED (watch paths didn't match)
```

- **Zero-downtime swap:** start the new container, wait for the healthcheck (default: TCP connect on the detected port; the user can set an HTTP path), point Caddy at the new upstream, drain the old one (SIGTERM, then SIGKILL after the drain timeout, default 30s), remove it.
- **Services with volumes** cannot run two containers on one volume. The old container is stopped first, then the new one starts. Show a clear note: "Services with a volume have a few seconds of downtime during deploys."
- **Crash loops:** exponential backoff. After max retries, mark CRASHED and notify.
- **Superseding:** a newer deploy for the same service cancels queued or in-progress builds of older ones.

### B5. Agent protocol (protobuf over WebSocket)
- **Connection:** the agent dials `wss://<control-plane>/agent/v1` with its server credential. Heartbeat every 10s; offline after 30s of silence.
- **Handshake:** `AgentHello{server_id, agent_version, protocol_version, os, arch, cpu, memory, disk, docker_version, public_ip}` → `ControlHello{accepted, desired_state_version, config}`.
- **Messages** (each has `op_id` and `timestamp`):
  - `DesiredState{version, containers[], routes[], tcp_proxies[], volumes[], mesh_peers[], dns_records[], cron_jobs[]}`
  - `ActualState{version_applied, containers[{id, spec_hash, status, health, restarts, oom_killed, started_at}], errors[]}`
  - `BuildRequest` / `BuildEvent{phase, log_chunk, progress}` / `BuildResult{image_ref, digest, duration}`
  - `LogSubscribe{container_ids, since, filter}` / `LogChunk` / `LogQuery` / `LogQueryResult`
  - `MetricsBatch{container_samples[], host_sample}` (every 10s live, rolled up every 60s)
  - `ExecOpen{container, cmd, tty, cols, rows}` / `ExecData` / `ExecResize` / `ExecClose`
  - `DbQuery{volume/service, engine, query, params, read_only}` / `DbQueryResult`
  - `BackupRequest` / `BackupProgress` / `RestoreRequest`
  - `PortCheck{ports[]}` / `PortCheckResult`
  - `AgentUpdate{version, url, sha256, signature}`
  - `Ack{op_id}` / `OpError{op_id, code, message}`
- **Versioning:** the control plane supports agents at protocol N and N-1. Agents auto-update when told to.

### B6. Data model (Postgres; all tables have `id`, `created_at`, `updated_at`)
- **users**: email, name, avatar_url, password_hash?, github_user_id?, totp_secret_enc?, is_instance_admin
- **sessions, passkeys, email_verifications, password_resets**
- **workspaces**: name, slug · **workspace_members**: workspace_id, user_id, role(owner|admin|member|viewer) · **invites**: email, role, token_hash, expires_at
- **api_tokens**: owner (user|workspace|project), scope_environment_id?, name, token_hash, scopes[], last_used_at, expires_at
- **servers**: workspace_id, name, provider(oracle|aws|gcp|azure|hetzner|digitalocean|other), region_label, public_ip, mesh_ip, container_subnet, arch, os, cpu_cores, memory_mb, disk_gb, agent_version, status(pending|online|offline|draining), last_heartbeat_at, labels[], wg_public_key, credential_hash, monthly_cost?
- **server_join_tokens**: workspace_id, token_hash, expires_at, used_at
- **cloud_accounts**: workspace_id, provider, credentials_enc, default_region (for provisioning and resizing)
- **projects**: workspace_id, name, description, icon, canvas_layout(jsonb)
- **environments**: project_id, name, kind(production|staging|custom|preview), pr_number?, base_environment_id?, ephemeral, expires_at?
- **services**: project_id, name, icon, kind(web|worker|cron|database), template_id?
- **service_instances** (a service's config in one environment): service_id, environment_id, source_type(repo|image|local_upload), repo_full_name, branch, root_dir, watch_paths[], image, registry_credential_id?, builder(railpack|dockerfile|image), dockerfile_path, build_command, start_command, pre_deploy_command, healthcheck_path, healthcheck_timeout_s, restart_policy(always|on_failure|never), restart_max_retries, cron_schedule?, cpu_limit, memory_limit_mb, placement(jsonb: [{server_id, replicas}]), sleep_enabled, sleep_after_s, deploy_on_push, wait_for_ci, config_file_path, detected_port?, target_port?
- **variables**: project_id, environment_id, service_id? (null = shared), key, value_enc, sealed, updated_by
- **deployments**: service_instance_id, status, trigger(push|manual|rollback|config_change|variable_change|template|pr|cli|api|cron), commit_sha, commit_message, commit_author, branch, image_ref, image_digest, config_snapshot(jsonb), variables_snapshot_enc, server_ids[], started_at, build_finished_at, finished_at, error_code?, created_by
- **deployment_logs**: deployment_id, phase(build|deploy), seq, ts, line (partitioned by month, with retention)
- **domains**: service_instance_id, hostname, kind(generated|custom), target_port, dns_status, tls_status, last_checked_at
- **tcp_proxies**: service_instance_id, internal_port, public_port, server_id
- **volumes**: project_id, environment_id, service_instance_id?, name, mount_path, server_id, size_limit_mb?, used_bytes
- **backup_destinations**: workspace_id, kind(s3), endpoint, bucket, credentials_enc, restic_password_enc
- **backup_schedules**: volume_id, cron, retention(jsonb) · **backups**: volume_id, status, size_bytes, snapshot_id, started_at, finished_at
- **templates**: workspace_id? (null = built-in), slug, name, description, icon, category, definition(jsonb), version, published
- **github_app** (instance singleton): app_id, slug, client_id, client_secret_enc, private_key_enc, webhook_secret_enc
- **github_installations**: workspace_id, installation_id, account_login, account_type
- **registry_credentials**: workspace_id, registry, username, password_enc
- **webhooks_outgoing**: project_id, url, secret_enc, events[] · **webhook_deliveries**
- **notification_channels**: workspace_id, kind(email|discord|slack|webhook), config_enc · **notification_rules**: channel_id, project_id?, events[]
- **staged_changes**: project_id, environment_id, user_id, changes(jsonb)
- **cron_runs**: service_instance_id, started_at, finished_at, exit_code
- **metric_rollups**: container/service_instance, bucket_ts(1m), cpu, mem, net_rx, net_tx, disk (retention: 1m×7d, 1h×90d)
- **http_log_rollups**: service_instance_id, bucket_ts, requests, status_2xx/3xx/4xx/5xx, p50/p95/p99 latency
- **audit_log**: workspace_id, actor, action, target, metadata, ip
- **instance_settings**: key, value (base domain, SMTP, registration mode, update channel, telemetry opt-in)

### B7. Variables and secrets
- **Scopes:** service variables (per environment), shared variables (per project environment), platform variables (read-only, injected).
- **References:** `${{ postgres.DATABASE_URL }}`, `${{ shared.API_KEY }}`, `${{ api.LUMEN_PRIVATE_DOMAIN }}`. Resolved at deploy time. Cycles are detected and reported as an error. A reference to a missing key blocks the deploy with a clear message.
- **Generators** (templates and UI): `${{ secret(32) }}`, `${{ secret(16, "abc123") }}`, `${{ uuid() }}`, `${{ port() }}`.
- **Encryption:** AES-256-GCM envelope encryption. A master key lives in the control plane `.env`; each project has a data key encrypted by the master key; values are encrypted by data keys. Key rotation command included.
- **Sealed variables** are write-only: never returned to any client, only decrypted for injection.
- **Injection:** the agent receives resolved values at container create time, over the authenticated channel, and holds them only in memory.
- **Log scrubbing:** the agent replaces known secret values with `••••••` in build and runtime log streams.

### B8. Builds and images
- **Builder priority:** a `lumen.toml` setting wins, then a Dockerfile if present, otherwise Railpack auto-detect. Prebuilt images skip the build.
- **Build location:** the target server by default, or a designated "build server" label.
- **BuildKit cache** persists per service on the build server. Cleanup keeps the last 5 images per service; the rest are garbage-collected nightly.
- **Multi-server:** the build pushes to the control-plane registry over the mesh, and replica servers pull by digest.
- **Private registries** (GHCR, Docker Hub, ECR, GCR/Artifact Registry) via registry credentials.
- **Local upload** (`lumen up`): the CLI tars the directory (respecting `.gitignore` and `.lumenignore`), uploads it to the API, and the build server fetches it.
- **Port detection:** after start, the agent inspects listening sockets inside the container's network namespace. If the app listens on a port different from `PORT`, Lumen auto-sets `target_port` and tells the user: "Detected your app on port 3000. Routing traffic there."

### B9. Networking
- **Public HTTP(S):** Caddy on each server; the agent manages routes via the Caddy admin API on localhost only. Automatic HTTPS via Let's Encrypt (HTTP-01), with ZeroSSL as fallback.
- **Generated domains:** `<service>-<env>-<4char>.<base-domain>`. The base domain is set in the setup wizard (wildcard DNS `*.apps.example.com → server IP`). If the user has no domain, fall back to an IP-based wildcard DNS service (sslip.io-style). Verify its certificate rate-limit status before relying on it and document the limits.
- **Custom domains:** the user adds a hostname; Lumen shows the exact DNS record needed (A or CNAME), live-checks propagation, then issues the certificate. Optional DNS-01 via a Cloudflare API token for wildcard custom domains.
- **HTTP logs:** Caddy JSON access logs are parsed by the agent into per-service request logs (method, path, status, duration, bytes, client IP, user agent) and rollups.
- **TCP proxy:** a Go TCP proxy in the agent maps `server_ip:public_port` (range 20000–29999, configurable) to the container port. Used for databases, game servers and MQTT.
- **Private network:**
  - Each server gets a WireGuard interface `lumen0` and a mesh IP (`10.200.0.x`), plus a unique container subnet (`10.210.<n>.0/24`) routed over the mesh.
  - Each project environment gets its own Docker network; nftables rules allow traffic only within the same project environment.
  - The agent runs an embedded DNS resolver for `<service>.<environment>.lumen.internal` (plus the short form `<service>.lumen.internal` inside the same environment), and containers use it as resolver.
  - WireGuard needs UDP 51820 open **between servers only**. The installer checks this.

### B10. Storage, volumes, backups
- **Volumes** are bind directories at `/var/lib/lumen/volumes/<volume_id>` mounted at the user's `mount_path`. Usage is tracked (du or statfs). Warnings at 80% and 95% of the configured size limit and of host disk. Optional hard quota on XFS.
- **Backups:** restic to the workspace's S3-compatible destination (R2, B2, Oracle Object Storage, S3, MinIO).
  - Database services use a logical dump streamed into restic for consistency (pg_dump / mysqldump / mongodump / Redis RDB).
  - Raw volumes use a filesystem snapshot (brief pause option for consistency).
- **Restore:** to the same volume (with a confirmation that current data will be replaced) or to a new volume or service.
- **Moving a volume between servers** runs backup → restore → switch → keep the old copy for 24h.

### B11. Logs and metrics (lightweight by design)
- **Runtime logs** stay on the server: the agent tails Docker logs into local rotating segment files with a small index (default retention 7 days, configurable). Live tail streams through the control plane. Search queries fan out to the relevant agents and merge results.
- **Build and deploy logs** are stored in Postgres (they matter after a server dies).
- **Structured logs:** if a line is JSON, parse `level`, `msg`/`message`, and the other fields as filterable attributes.
- **Metrics:** the agent samples Docker stats plus host metrics every 10s, keeps 1h at full resolution locally for live charts, and pushes 1-minute rollups to Postgres.
- **Offline servers:** runtime logs aren't queryable. Show "Server offline — showing logs up to <time>" plus the cached tail.

### B12. Security model
- **Join flow:** a single-use join token (1h expiry) authorizes registration. The agent generates a keypair; the control plane issues a server credential, stored hashed and rotatable. All later traffic is authenticated per message.
- **The agent only dials out.** No inbound management ports. Public ports are 80/443, the TCP proxy range if used, and UDP 51820 between servers.
- **Containers:** unprivileged, capabilities dropped (except what the image needs via an allowlist), pids limit, memory and CPU limits always set, no Docker socket (advanced opt-in with a scary warning), optional read-only rootfs.
- **PR environments from forks** are disabled by default because fork code could read secrets.
- **Web security:** httpOnly SameSite cookies, CSRF protection, rate limits on auth, TOTP 2FA, passkeys, session management page, login audit.
- **Supply chain:** agent binaries are checksummed and signed, and the installer verifies them. Container images for platform components are pinned by digest.
- **Setup takeover protection:** the first-run setup wizard requires a one-time setup token printed in the installer's terminal output.
- **RBAC** is enforced in the API layer with a permissions matrix (Part D, Teams) and tested per route.

### B13. Platform-injected variables
`PORT`, `LUMEN_PROJECT_ID`, `LUMEN_PROJECT_NAME`, `LUMEN_ENVIRONMENT_ID`, `LUMEN_ENVIRONMENT_NAME`, `LUMEN_SERVICE_ID`, `LUMEN_SERVICE_NAME`, `LUMEN_DEPLOYMENT_ID`, `LUMEN_REPLICA_ID`, `LUMEN_SERVER_NAME`, `LUMEN_REGION`, `LUMEN_PUBLIC_DOMAIN`, `LUMEN_PRIVATE_DOMAIN`, `LUMEN_GIT_COMMIT_SHA`, `LUMEN_GIT_BRANCH`, `LUMEN_GIT_REPO`, `LUMEN_GIT_COMMIT_MESSAGE`, `LUMEN_GIT_AUTHOR`, `LUMEN_VOLUME_MOUNT_PATH` (if any), `LUMEN_TCP_PROXY_DOMAIN`, `LUMEN_TCP_PROXY_PORT` (if any).

### B14. Performance budgets (treat as acceptance criteria)

| Metric | Budget |
|---|---|
| Control plane idle RAM (web + api + workers + Postgres) | < 512 MB |
| Agent idle RAM | < 50 MB |
| Dashboard route transition | < 150 ms perceived (prefetch + skeletons) |
| Canvas with 100 services | 60 fps pan/zoom |
| Status change → visible in UI | < 1 s |
| Log line → visible in live tail | < 1 s |
| Node "hello world" deploy on 2 vCPU | < 90 s cold, < 30 s warm cache |
| API p95 (CRUD) | < 100 ms |

---

## Part C — UI/UX specification

### C1. North star
A beginner who has never deployed anything lands on the dashboard and **knows what to click next on every single screen**. Power users never feel slowed down.

### C2. Originality rule
Lumen's look is its own. Design from the tokens and principles below. Do not reference, recreate or imitate the visual design, layouts, copy, illustrations or branding of any existing platform. When prompting the models for UI, describe **feelings and goals** ("calm, precise, instantly understandable"), never "make it look like X".

### C3. Ten design principles
1. **Zero-config first.** A working deploy never requires opening Settings. Every field has a smart default.
2. **One obvious next action.** Every screen has exactly one primary button. Empty states are invitations, not dead ends.
3. **Progressive disclosure.** Basic fields are visible; everything else lives under "Advanced", collapsed.
4. **Everything is live.** Statuses, logs, metrics and deploy progress update in real time. There is no refresh button anywhere.
5. **Plain language.** "Public URL", not "ingress". "Memory", not "mem_limit". Jargon appears only in tooltips.
6. **Errors come with fixes.** Every error shows what happened, why, and a button that fixes it or shows exactly how.
7. **Safe by default.** Changes are staged, destructive actions need typed confirmation, and undo is offered where possible.
8. **Keyboard-first for power users.** ⌘K reaches everything. Every action has a shortcut or is reachable by the palette.
9. **Spatial memory.** Canvas positions persist. Things stay where the user put them.
10. **Fast feels simple.** Optimistic updates, skeletons instead of spinners, prefetching, no layout shift.

### C4. Design tokens (identity: "Signal", an instrument panel)

Chosen 2026-09-26 by the owner from their own reference images (Direction D in
`docs/design/directions/`). The source of truth for every value is
`packages/ui/src/tokens/*.css`; `docs/UI_DECISIONS.md` records why each one
changed from the original "calm graphite + aurora teal" proposal.

**Character:** a precise instrument. Near-black field with a fine grid, one
electric-blue signal, a blue-violet glow behind the focal object, square corners,
corner brackets, uppercase mono labels, pixel display titles. Everything else is
measured and labelled. Motion says the system is live.

**Dark theme (default)**

| Token | Value | Use |
|---|---|---|
| `bg` | `#050608` | App background |
| `bg-canvas` | `#040506` with an 8 px grid `#0F1318` and a 96 px major grid `#161B22`, plus a vignette | Canvas |
| `surface` | `#0A0C10` | Cards, panels |
| `surface-raised` | `#0F1217` | Popovers, menus, modals |
| `surface-hover` | `#151920` | Row/card hover |
| `border` | `#1E232B` | Default borders |
| `border-strong` | `#353C47` | Brackets, dashed groups, hover borders |
| `text` | `#E9ECF2` | Primary text |
| `text-secondary` | `#8C94A3` | Labels, meta |
| `text-muted` | `#545B67` | Placeholders, disabled, bracket glyphs only |
| `accent` | `#5B7CFF` | Signal: focus, selection, live data, links (non-text) |
| `accent-text` | `#7B93FF` | Accent-colored text |
| `accent-fill` / `accent-ink` | `#3D5AFE` / `#FFFFFF` | Filled accent surfaces (switch on, checkbox) |
| `glow-a` / `glow-b` | blue 22 %, violet 16 % | Light field behind the focal object |
| `success` / `-text` | `#2BD97C` | Active, healthy |
| `warning` / `-text` | `#F5B83D` | Building, deploying, warnings |
| `danger` / `-text` | `#FF4D5E` / `#FF6B78` | Failed, crashed, destructive |
| `info` / `-text` | `#5B9BFF` / `#7AB0FF` | Informational |
| `sleeping` / `-text` | `#6B7280` / `#9AA3B2` | Sleeping, stopped |

**Light theme ("blueprint paper")**: `bg #F3F4F6`, surface `#FFFFFF`, border
`#DCDFE5` / `#B5BBC6`, text `#07090D` / `#4E5663`, accent `#3D5AFE` (text
`#2A44D6`), status text tiers `#166534`, `#92400E`, `#B91C1C`, `#1D4ED8`, `#475569`.

Every `-text` token holds 4.5:1 and every base status color 3:1 on all four
surfaces in both themes (tested).

**Typography:** three voices, all SIL OFL.
- Geist Pixel Square for display, page and section titles (uppercase, +0.02em, line-height 1.1)
- Geist Mono for identifiers, values, logs and, in uppercase with +0.08em tracking at 11 px, for chrome: labels, buttons, tags, nav, section numbers
- Geist Sans for anything read as a sentence (messages, descriptions, helper text, errors); never uppercase
- Scale: 11 / 12 / 13 / **14 (base)** / 16 / 20 / 24 / 32. Weights 400 / 500 / 600. Tabular numerals for metrics and durations.

**Spacing and shape**
- Spacing: 4px grid (4, 8, 12, 16, 20, 24, 32, 48, 64)
- Radius: 2 (controls, cards, kbd), 4 (modals, panels), full only for avatars
- HUD corner brackets (`.hud`) frame focal boxes; they spread 3 px on hover
- Elevation: dark uses borders and an accent glow on the selected object only; light uses soft shadows

**Motion**
- 120ms ease-out for hovers and presses; 200ms `cubic-bezier(.2,.8,.2,1)` for panels and modals; springs for canvas node moves
- Entrance: each element reveals in 240ms with a 45ms stagger (a screen assembles in under 700ms); a page title may decode once in under 360ms
- Ambient: data flows along edges (1.4s loop), the glow breathes (9s), building markers blink like an LED (1.6s)
- Nothing else exceeds 300ms. Everything above stops under `prefers-reduced-motion` and the account preference; the spinner keeps turning

**Status language (always marker + color + text, never color alone)**, written as bracket tags `[ ■ ACTIVE ]` with a 6 px square marker
- ■ Active (success)
- ■ Building / Deploying (warning, marker blinks)
- ✕ Failed (danger)
- ⟳ Crashed, restarting (danger)
- ☾ Sleeping (sleeping)
- ■ Stopped (muted)
- … Queued (muted)

**Icons:** Lucide (ISC) at 14 / 16 / 20 px with stroke 1.5 and square caps and joins. Framework/language icons auto-detected per service (Node, Python, Go, Rust, Ruby, PHP, Java, .NET, Deno, Bun, static). Use an icon set whose license permits it, and record it in DECISIONS.md.

### C5. Component library (`packages/ui`, with a live gallery at `/dev/components`)
- **Buttons:** primary, secondary, ghost, danger; sizes sm/md; loading state; icon-only with tooltip
- **Form controls:**
  - Input, Textarea, Select, Combobox (searchable), Switch, Checkbox, Radio group, Segmented control
  - Slider with numeric input (RAM/CPU), Key-value editor
  - Copy field (click to copy, "Copied" feedback), Secret field (masked, reveal, copy)
- **Overlays:** Command palette (⌘K), Dropdown menu, Context menu, Popover, Tooltip, Modal, Confirm dialog (typed confirmation variant), Side panel/drawer (resizable), Sheet (mobile)
- **Navigation:** Tabs (underline, with counts), Breadcrumbs, Environment switcher, Workspace switcher
- **Feedback:** Toasts (with action + undo), Inline alert/banner (info/warn/danger with action button), Progress steps (deploy timeline), Skeletons, Empty state (icon, title, one sentence, primary action)
- **Status:** Status tag and marker (C4 status language), Badge, Avatar, Avatar stack, Kbd (shortcut hint)
- **Data display:** Data table (sortable, virtualized, row actions), Charts (line/area with synced crosshair, limit line), Code block / terminal (xterm), Diff viewer (for staged changes and config)
- **Specialized:**
  - **Log viewer:** virtualized, ANSI colors, JSON expand, level colors, search highlight, pause-on-scroll, "Jump to live"
  - **Canvas node, canvas group, edge**
  - **Stepper wizard**
  - **DNS record card:** type/name/value with copy buttons and a live check indicator
  - **Port check card:** per-port ✅/❌ with provider-specific fix

Every component supports both themes, keyboard use, visible focus rings (2px accent, 2px offset), and has gallery examples of every state.

### C6. App shell
- **Left rail (56px, icons with tooltips; expands on hover or pin to 220px):** Home, Projects, Servers, Templates, Observability (when inside a project), Settings. Workspace switcher at the top, avatar and help at the bottom.
- **Top bar (48px):** breadcrumbs (Workspace / Project / Service), environment switcher (colored dot + name, production is marked), ⌘K search button, deploy activity indicator (shows "2 deploying" and opens a popover with live progress), notifications bell, theme toggle.
- **Content:** full-bleed canvas on project pages; centered max-width 1200px on list and settings pages.
- **Inspector panel:** slides in from the right over the canvas, resizable 480–880px, remembers width, `Esc` closes, deep-linkable URL (`/p/:project/:env/s/:service/:tab`).
- **Staged changes bar:** floating at bottom center when changes are pending (C8.1).
- **Global banners:** server offline, instance update available, trial/cert problems. They are dismissible except critical ones.

### C7. Page-by-page specs
Each page must define: **purpose · layout · content · states (empty/loading/error/success/partial) · primary action · secondary actions · shortcuts · mobile behavior.**

#### C7.1 First-run setup wizard (self-hosted instance)
- **Step 0, Verify:** "Paste the setup code shown in your terminal." A 6-word code with an input and a Continue button. On error, show "That code doesn't match. It's in the last lines of the install output."
- **Step 1, Admin account:** name, email, password (strength meter) or "Continue with GitHub" (only after the app exists, so the default here is email).
- **Step 2, Your domain:** two choices as big cards.
  - "I have a domain" shows the exact wildcard DNS records to add, with copy buttons and a live checker that turns green.
  - "Use a free temporary address" uses an IP-based wildcard, with a note about limits.
- **Step 3, Connect GitHub:** one button, "Create GitHub App", starts the manifest flow. It returns with a success state and app name. Skippable ("I'll deploy Docker images for now").
- **Step 4, Email (optional):** SMTP form with a "Send test email" button. Skip.
- **Step 5, Backups (optional):** S3-compatible destination with a "Test connection" button. Skip.
- **Finish:** confetti-free, calm success. "You're ready. Deploy your first app →"
- A progress indicator is always visible. Back is always allowed. Every step can be finished later from Instance settings.

#### C7.2 Auth pages
Login, sign up (if open registration), accept invite, forgot/reset password, 2FA challenge, verify email. The layout is a centered card with the product mark and a single column. Errors appear inline under fields. "Continue with GitHub" appears when configured.

#### C7.3 Home
- Greeting plus an **onboarding checklist** (dismissible, progress ring): Connect a server, Connect GitHub, Deploy your first service, Add a database, Add a custom domain, Invite a teammate. Each item deep-links to the action.
- **Recent projects** (cards), **Recent deploys** (live list), **Servers health strip** (mini cards with CPU/RAM bars).
- **Empty (no servers):** a hero empty state, "Connect your first server — any VM from any cloud", with provider logos as a row of choices.

#### C7.4 Projects list
- Grid of project cards: name, icon, environment count, service status summary (e.g. "4 active · 1 failed"), a mini canvas thumbnail, last deploy time. Search, sort (recent/name), "New project" as the primary action.
- **Empty:** "Create your first project" with three quick starts (Deploy from GitHub, Deploy a template, Deploy a database).

#### C7.5 New project / "Add" flow (the most important flow)
- Opened by "New project", or by "Add" (⌘J / `+` button) on the canvas. It's a command-palette-style modal with large options:
  1. **GitHub repository** → searchable repo list (with "Configure GitHub access" if a repo is missing) → branch (default: repo default) → server (auto-picked if there's one) → **Deploy**. Detected framework and start command appear as a friendly preview ("Looks like a Next.js app. We'll build it automatically.").
  2. **Database:** Postgres / MySQL / Redis / MongoDB, one click each, auto-placed on the canvas with its volume.
  3. **Template:** opens the template gallery inline.
  4. **Docker image:** image input with autocomplete for popular images, plus an optional registry credential.
  5. **Empty service:** for configuring before the first deploy.
  6. **Cron job:** repo or image, plus a schedule builder (presets like "Every hour" or "Every day at 3:00", with a human-readable preview of the cron expression).
  7. **Import docker-compose.yml:** paste or upload; converts to services, variables and volumes, shows a preview of the resulting canvas, then Create.
  8. **Import .env:** into a chosen service.
- After creation, the canvas opens with the new node already deploying and the inspector open on the Deployments tab.

#### C7.6 Project canvas
- **Infinite canvas** with a dot grid, pan (drag/space+drag/trackpad), zoom (⌘ scroll, `⌘+`/`⌘-`, `⌘0` fit), minimap toggle, auto-layout button, snap-to-grid.
- **Service node (~260×120):**
  - Framework icon and name
  - Status (C4 status language)
  - Public URL (truncated, click to open)
  - Last deploy relative time plus commit message snippet
  - Replica count chip ("×3")
  - Server/region chip
  - Attached volume chip below the node (a visually connected sub-card with its mount path)
- **Edges:** subtle dashed lines from a service to the services it references via variables (for example, api → postgres), labeled on hover with the variable names.
- **Groups:** user-created labeled regions for organizing (drag nodes in and out, rename, color tag).
- **Interactions:**
  - Click a node to open the inspector; double-click to rename
  - Right-click context menu: Redeploy, Restart, View logs, Open URL, Duplicate, Move to group, Delete
  - Drag nodes; positions saved per environment
  - Multi-select with shift-drag, with bulk actions
- **Environment switcher** in the top bar switches the whole canvas (with a short crossfade).
- **Empty canvas:** a centered, large "Add your first service" with the four most common options as tiles.
- **Partial state:** if a server is offline, affected nodes show a warning ring and the tooltip "Server 'oracle-1' is offline".
- **Mobile:** the canvas becomes a **list view** of service cards with the same info. Tapping opens a full-screen sheet.

#### C7.7 Service inspector — header (always visible)
Icon, name (inline editable), status, public URL with copy/open buttons, primary action **Redeploy** (split button: Redeploy / Restart / Deploy specific commit), an overflow menu (Open shell, Stop, Sleep now, Duplicate, Delete), and a close button.

Tabs: **Deployments · Variables · Metrics · Logs · Settings**. Databases get **Data · Connect · Backups · Metrics · Logs · Settings**.

#### C7.8 Deployments tab
- The **active deployment** is pinned at the top as a highlighted card: commit message, short SHA (links to GitHub), author avatar, branch, trigger ("Pushed to main"), duration, server(s), and **View logs**.
- **History list:** status, commit, trigger, time, duration. Row menu: View logs, Rollback to this, Redeploy this commit, Copy image digest.
- **Deployment detail view** (opens within the inspector, with a back arrow):
  - **Timeline:** Queued → Building → Pre-deploy → Deploying → Health check → Live, with per-step durations and a live-ticking current step
  - **Tabs:** Build logs · Deploy logs · HTTP logs · Details (image digest, builder, detected framework, config snapshot as read-only, variable *keys* at deploy time)
  - **On failure:** an error card at the top from the error catalog: plain-language title, explanation, fix button (e.g. "Increase memory to 1 GB and redeploy"), and "Show raw error".
- **Rollback:** a confirm dialog explains that it restores the image and the settings from that deploy, with a checkbox "Also restore variables from that time" (unchecked by default).
- Watch-path skips show as a muted row: "Skipped — no changes in watched paths".

#### C7.9 Variables tab
- A table with columns **Name · Value · Source**.
  - Values are masked with a reveal (eye) button and click-to-copy.
  - References render as **chips** (e.g. `postgres.DATABASE_URL`) that show the resolved value on hover (masked).
  - Source shows "Service", "Shared", "Generated" or "Platform".
- **Add variable:** an inline row at the top. Typing `${{` opens the reference autocomplete (services, then their variables, plus shared).
- **Raw editor** toggle: `.env`-format textarea with validation and a diff preview before staging.
- **Suggestions banner:** "We found `.env.example` in your repo with 5 variables. Add them?" Opens a one-click add form with empty values highlighted.
- **Sealed** toggle per variable, with the explanation "Sealed values can't be viewed again, even by admins."
- **Platform variables:** a collapsible read-only section listing the B13 variables with example values.
- **Shared variables** link: "Manage shared variables for this environment".
- Every edit becomes a **staged change** (C8.1).

#### C7.10 Metrics tab
- Charts: CPU (with the limit line), Memory (with the limit line and OOM event markers), Network in/out, Disk (volume usage). For web services also Requests/min, error rate (5xx %) and p95 latency (from HTTP logs).
- Time range segmented control: 1h · 6h · 24h · 7d · 30d. Crosshair synced across all charts. Replica breakdown toggle. Deploy markers on the time axis (vertical ticks, hover shows the commit).
- **Smart hint:** if memory stays above 90% of the limit, show "Your app is close to its memory limit. Increase to 1 GB?" with a one-click staged change.

#### C7.11 Logs tab
- **Mode switch:** Runtime · HTTP · Build (latest).
- **Filter bar:** free text, `level:error`, `status:>=500`, `path:/api/*`, and attribute filters for JSON logs (`user_id:42`). Parsed into removable filter chips. Time range picker. Deployment selector (default: active).
- **Live tail** on by default. Scrolling up pauses it and shows a floating "Jump to live" button. Toggles for timestamps, wrap, and dense mode. Download (current filter, max 50k lines). Clicking a line copies it; JSON lines expand into a key-value tree.
- **Empty:** "No logs yet. Your app hasn't printed anything since this deploy started."

#### C7.12 Settings tab
Grouped sections with sticky section nav. Every field has a default, helper text, and "Managed by lumen.toml" lock if set in the config file.
- **Source:** repo and branch (or image), root directory, **watch paths** (glob list with examples), deploy on push toggle, wait for CI toggle, disconnect source
- **Build:** builder (Auto / Dockerfile / Image), Dockerfile path, custom build command, build-time variables note
- **Deploy:** start command, pre-deploy command (e.g. migrations), healthcheck path and timeout, restart policy and max retries, drain timeout
- **Networking:** public domains list (generated + custom, with DNS record cards and status), "Generate domain" button, "Add custom domain" button, target port (auto-detected value shown), TCP proxy enable (shows `host:port`), private address (`api.production.lumen.internal`, with copy)
- **Resources:** Memory slider (128 MB → server max, with steps), CPU slider (0.1 → server cores). Shows "Server 'oracle-1' has 18 GB free" and warns before exceeding. If the server is maxed: "Need more? Resize this server" (cloud integration) or "Move to another server".
- **Scaling and placement:** per-server replica steppers (e.g. oracle-1 ×2, aws-1 ×1), load-balancing note, "Volumes limit this service to 1 replica" note when applicable
- **Sleep when idle:** toggle and idle timeout ("Sleep after 10 minutes without requests. The first request wakes it in a few seconds.")
- **Cron:** schedule builder (for cron services)
- **Danger zone:** stop service, delete service (typed confirmation: service name), with a separate delete-volume checkbox

#### C7.13 Database service tabs
- **Data:**
  - Table/collection/key list on the left, a rows grid on the right (paginated, sortable, filterable)
  - Cell editing (staged, with "Apply 3 changes")
  - Add/delete rows (confirm)
  - A **Query console** (SQL for Postgres/MySQL, a Mongo shell subset, Redis commands) with results grid, history, and read-only mode on by default in production (toggle with a warning)
- **Connect:** private URL (for services in the project, marked "Recommended") and public URL (via TCP proxy, off by default: "Enable public access"). Each has copy buttons and snippets for psql/mysql/mongosh/redis-cli, Node, Python and Go. Plus a **"Connect from your laptop"** CLI snippet: `lumen connect postgres` opens a secure tunnel with no public exposure.
- **Backups:** schedule (off/daily/weekly with retention), "Back up now", list (time, size, status), restore (to this database with typed confirmation, or to a new database), download. Without a destination configured: "Set up a backup destination".
- **Metrics / Logs / Settings:** as for services, plus version and image tag, and config parameters (e.g. `max_connections`) in Advanced.

#### C7.14 Volume panel (click a volume chip)
Name, mount path (editable, staged), server, usage bar (used / limit / host free), size limit, backups (same as C7.13 Backups), "Move to another server" (wizard), Delete (typed confirmation). An attach/detach UI for volumes not bound to a service.

#### C7.15 Environments
- **Switcher dropdown:** environments list with color dots, "New environment", "Manage".
- **New environment:** name, then "Copy everything from production" (default) or "Start empty". Copy duplicates services, config and variables (option to exclude sealed ones), but never data.
- **Manage page:** list with service count, last activity, delete; **PR environments** settings (enable, base environment, auto-delete after merge/close, TTL, allow forks toggle defaulting to off with a warning).
- **Compare and sync:** pick two environments to see a diff of services, config and variable *keys* with per-item "Copy to →" and a bulk sync. Result goes to staged changes.

#### C7.16 Project settings
General (name, description, icon, transfer to another workspace, delete project) · Environments · Shared variables · Members (project-level access overrides) · Webhooks (URL, events, secret, delivery log with retry) · Notifications (rules for this project) · Tokens (project and environment-scoped API tokens) · Danger zone.

#### C7.17 Observability (project-level)
- **Log explorer:** across all services in the environment, with the same filter syntax plus `service:api`, saved queries, and a histogram of log volume over time (click a bar to zoom the time range).
- **Dashboard:** configurable widget grid (drag, resize) with widgets for service metrics, request rate, error rate, latency, recent deploys, server health, and a log query widget. Sensible default dashboard auto-created.
- **Deploy timeline:** all deploys across services on one time axis.

#### C7.18 Servers
- **List:** cards with name, provider logo, region label, status, CPU/RAM/disk bars, container count, agent version (with an update badge), and a monthly cost chip if set.
- **Add server wizard:**
  1. Name it and pick the provider (tiles). The provider choice tailors all firewall instructions.
  2. **Copy the command** (big copy field containing the one-time token; expiry countdown; "Regenerate").
  3. **Live checklist** as the agent reports in: Connected → Docker ready → Proxy running → Port 80 reachable → Port 443 reachable → Mesh ready (if multi-server). Each ❌ opens a **provider-specific fix card** (e.g. for Oracle, both the cloud security list step and the OS firewall step, with the exact commands to copy).
  4. Done, with a "Deploy something to this server" call to action.
- **Server detail:** live CPU/RAM/disk/network charts, containers list (service, status, resource use), labels, public IP, mesh IP, OS/arch, agent version with "Update agent", **Run port check**, **Drain** (move services off, then stop scheduling), "Remove server" (typed confirmation; blocked while services remain unless the user chooses to move them), cloud actions if linked (Resize, Reboot).
- **Offline state:** banner "Offline since 14:02. Your apps on this server keep running if the machine is up." plus troubleshooting steps.

#### C7.19 Templates
- **Gallery:** search, categories (Databases, Starters, AI, CMS, Analytics, Automation, Storage, Monitoring, Dev tools), and cards (icon, name, one-line description, service count, "Used by N" for your instance).
- **Template detail:** description, services mini-diagram, required inputs, and **Deploy**. The deploy form collects required variables (generated ones are pre-filled and marked "auto"), then creates a project or adds to the current one.
- **Create template from project:** pick services, mark variables as required/generated/fixed, set name, icon and description, preview the JSON, then publish (private to workspace, or instance-wide for admins). Also **Export/Import** template JSON.

#### C7.20 Workspace settings
General · Members & invites (invite by email or link, role select, pending invites) · Roles & permissions (read-only matrix view) · Cloud accounts (connect Oracle/AWS/GCP/Hetzner/DO credentials, with test connection) · Registry credentials · Notification channels (email, Discord, Slack, webhook, each with "Send test") · Backup destinations · Usage & cost (per server and per service estimated share, exportable CSV) · Audit log (filterable table) · Danger zone.

#### C7.21 Account settings
Profile · Security (password, 2FA setup with QR and recovery codes, passkeys, active sessions with revoke) · API tokens · Preferences (theme: system/dark/light; "Apply changes immediately" toggle, off by default; density; reduced motion; default landing page) · Notifications (personal email preferences) · Connected accounts (GitHub).

#### C7.22 Instance admin (self-host admins only)
Overview (version, update channel, control plane health and resource usage, agent versions across servers) · Users (list, disable, make admin, reset 2FA) · Workspaces · Registration (open/invite-only/closed) · Domain & TLS · GitHub App (status, re-create, permissions check) · Email (SMTP) · Control-plane backups (schedule to S3, backup now, restore instructions) · Updates ("Update to vX.Y" with changelog, one click) · System logs.

#### C7.23 Command palette (⌘K)
- Fuzzy search across projects, services, environments, servers, deployments (by SHA), templates, settings pages and docs.
- **Actions:** Deploy, Redeploy, Restart, Rollback, Add variable, Open logs, Open shell, Switch environment, Toggle theme, Create project, Add server, Invite member.
- **Context-aware:** inside a service, its actions come first. Recent items appear on open. Every action shows its shortcut.

#### C7.24 Notifications center
Bell popover with tabs All / Deploys / Alerts: items with icon, text, time, and deep link. Mark all read. Link to preferences.

#### C7.25 Web terminal (Open shell)
Bottom dock or full panel with xterm: choose replica, choose shell (`/bin/sh`, `/bin/bash` if present), copy/paste, resize, reconnect. Banner: "You're inside a live container. Changes are lost on redeploy."

#### C7.26 Global states catalog
- **Offline or reconnecting** to the control plane: a subtle top bar "Reconnecting…" and actions disabled with a tooltip.
- **Permission denied:** a friendly card naming the role needed and "Ask an admin".
- **404:** "This project doesn't exist or you don't have access" with links home.
- **Maintenance/update in progress:** full-screen calm message with progress.

### C8. Interaction patterns
1. **Staged changes.**
   - Config and variable edits collect in a floating bottom bar: "3 changes to 2 services · Discard · Review & deploy (⇧⏎)".
   - Review opens a diff modal grouped by service (old → new; variables show keys and "value changed"). An optional note becomes the deploy trigger description. Deploy applies the changes and redeploys only the affected services.
   - Staged changes persist across reloads, per user per environment. The "Apply immediately" preference skips staging.
2. **Optimistic updates** with rollback plus an error toast if the server rejects.
3. **Realtime everywhere** via a single multiplexed WebSocket; TanStack Query caches updated from server events.
4. **Toasts** go bottom-right, stack up to 3, include undo for reversible actions (delete variable, remove domain) with 8s timers.
5. **Confirmations:**
   - Reversible actions get none (undo instead).
   - Impactful actions get a simple confirm.
   - Destructive actions get typed confirmation of the resource name, with consequences listed.
6. **Deep links:** every tab, deployment, log filter and time range is in the URL.
7. **Drag and drop:** canvas nodes, dashboard widgets, `.env` files onto the Variables tab, and `docker-compose.yml` onto the canvas.
8. **Autosave** for non-deploying settings (names, descriptions, canvas layout) with a subtle "Saved" tick.

### C9. Copy and voice
- **Voice:** calm, friendly, precise, and brief. Use second person and active voice. No exclamation marks except on real milestones. No blame.
- **Numbers:** exact and human-formatted ("Deployed in 42s", "512 MB", "3 min ago").
- **Good vs. bad examples:**
  - ✅ "Deployed in 42s" · ❌ "Deployment operation completed successfully"
  - ✅ "Your app ran out of memory (512 MB). Give it 1 GB?" · ❌ "Container exited with code 137 (OOMKilled)"
  - ✅ "Port 443 is blocked on your Oracle server. Here's the 2-minute fix." · ❌ "TLS handshake failed: connection refused"
  - ✅ "No logs yet" · ❌ "No data available"
- **Buttons are verbs:** "Deploy", "Add domain", "Connect server". Never "Submit" or "OK".

### C10. Empty states and errors
- **Empty states** (every list or page needs one): icon, one-line title, one sentence of help, one primary action, optional docs link.
- **Errors** are rendered from `packages/shared/errors` (see Part J error catalog) as an error card: title, plain explanation, **fix action button**, collapsible raw details, and "Copy for support".

### C11. Accessibility (WCAG 2.2 AA)
- Contrast ≥ 4.5:1 for text (both themes)
- Visible focus rings; full keyboard navigation, including the canvas (Tab cycles nodes, Enter opens, arrow keys nudge a selected node, `/` focuses search)
- ARIA live regions announce deploy status changes
- Status is never conveyed by color alone
- Every chart has a text summary for screen readers
- Respects reduced motion
- Tested with axe in CI and a manual keyboard pass per page

### C12. Responsive and mobile
- **Breakpoints:** ≥1280 full; 1024–1279 (inspector overlays the canvas); 768–1023 (rail collapses, inspector full-width); <768 mobile.
- **Mobile:**
  - Bottom tab bar (Home, Projects, Deploys, Servers, More)
  - Canvas becomes a list
  - Inspector becomes a full-screen sheet with swipeable tabs
  - Logs are fully usable
  - Redeploy, rollback, restart and variable edits work
  - No hover-only affordances anywhere

### C13. Keyboard shortcuts
`⌘K` palette · `⌘J` or `N` add service · `G then H/P/S/T` go Home/Projects/Servers/Templates · `E` switch environment · `D` redeploy selected service · `L` logs · `V` variables · `M` metrics · `,` settings · `⇧⏎` apply staged changes · `Esc` close panel · `⌘0` fit canvas · `?` shortcut sheet.

### C14. UI quality bar (review against this on every screen)
- [ ] One primary action; its label is a verb
- [ ] Loading, empty, error, success and partial states all designed
- [ ] Copy follows C9; no jargon without a tooltip
- [ ] Works at 390px, 1024px and 1440px; dark and light
- [ ] Keyboard-only usable; focus visible; axe clean
- [ ] No layout shift on load; skeletons match the final layout
- [ ] Alignment on the 4px grid; consistent radius and spacing tokens only (no magic numbers)
- [ ] Realtime: nothing requires a manual refresh
- [ ] Every error offers a fix
- [ ] Feels calm: no more than one accent-colored element competing per view

### C15. UI workflow with the models (do it in this order)
1. **Direction** (Opus 5.5): ask for **3 distinct visual directions** as static HTML pages of the *project canvas + service inspector* using the C4 tokens as a starting point. Allow each direction to vary density, type pairing and accent usage. Pick one (or combine), then record it in `UI_DECISIONS.md`.
2. **Tokens and components** (Opus 5.5): build `packages/ui` and the `/dev/components` gallery with every state. Review screenshots before moving on.
3. **Shell and canvas** (Opus 5.5, reviewed by Fable 5.1): build these next. They set the feel for everything else.
4. **Pages one at a time, in C7 order.** For each: build, then Playwright screenshots (3 widths × 2 themes × key states), then self-critique against C14, then fix, then the other model reviews the screenshots with the Part H UI prompt.
5. **Give specific feedback**, not vibes. "The status pill and URL compete; make the URL text-secondary and 13px" beats "make it cleaner".
6. **Usability test:** hand the app to a beginner friend with the task "deploy this repo". Watch silently. Every hesitation is a bug to file.

---

## Part D — Complete feature checklist (with acceptance criteria)

Every item must meet its acceptance criteria (AC) plus the Definition of Done in `CLAUDE.md`.

### D1. Servers and agent
- [ ] **One-command join:** AC: fresh Ubuntu 22.04/24.04, Debian 12 (amd64 + arm64) goes from paste to "online" in < 3 min; re-running the command is safe.
- [ ] **Live join checklist and port checks** with provider-specific fixes (Oracle, AWS, GCP, Azure, Hetzner, DO, generic). AC: a blocked 443 is detected and the correct fix card is shown.
- [ ] **Heartbeat, offline detection, and alerts.** AC: offline shown within 30s; notification sent.
- [ ] **Agent self-update with rollback** if the new version fails its health check. AC: N-1 → N upgrade without app downtime.
- [ ] **Server labels, drain, and remove.** AC: drain moves stateless services to other servers.
- [ ] **Host metrics** and disk-full protection. AC: build refused with a clear error when disk < 2 GB free.
- [ ] **Docker cleanup** (images, build cache) on a schedule.

### D2. Deploying
- [ ] **Deploy from GitHub** (any branch), **Docker image** (public/private), **local directory** (CLI).
- [ ] **Zero-config builds** (Railpack), Dockerfile, custom build and start commands. AC: sample apps in Node, Python, Go, Ruby, PHP, Java, Rust, Deno, Bun and static sites all deploy with zero config.
- [ ] **Push-to-deploy**, deploy-on-push toggle, **watch paths**, **wait for CI**. AC: a push touching only unwatched paths produces a "Skipped" deployment.
- [ ] **Monorepo support** (root directory per service).
- [ ] **Pre-deploy command** (migrations). AC: a failing pre-deploy aborts the deploy and keeps the old one live.
- [ ] **Healthchecks and zero-downtime swap.** AC: a continuous curl during deploy sees 0 failed requests (stateless service).
- [ ] **Restart policies and crash-loop detection.**
- [ ] **Rollback, redeploy, restart, cancel, deploy a specific commit.**
- [ ] **Config as code** (`lumen.toml`). AC: fields set in the file show a lock in the UI.
- [ ] **Auto port detection.**
- [ ] **Build caching.** AC: second build of an unchanged Node app is > 2× faster.
- [ ] **Human-readable build failure explanations** for the top 20 failures (missing lockfile, wrong Node version, missing start script, and so on).

### D3. Variables
- [ ] Service, shared and platform variables; references with autocomplete; generators; sealed variables; raw `.env` editor; `.env.example` suggestions; import/export `.env`. AC: a reference cycle blocks the deploy with an error naming the cycle.
- [ ] **Staged changes** with a diff review, applied as a single deploy per affected service.
- [ ] **Secret scrubbing** in logs. AC: printing a sealed value in build output shows `••••••`.

### D4. Networking
- [ ] **Generated domains, custom domains, automatic HTTPS, DNS instructions** with a live checker, and wildcard via DNS-01 (optional). AC: a custom domain goes live with a valid cert within 2 min of DNS propagating.
- [ ] **TCP proxy.**
- [ ] **HTTP request logs and rollups.**
- [ ] **Private networking** on one server and across servers/clouds, with internal DNS and project isolation. AC: a service in project A cannot reach project B; `api.lumen.internal` resolves across servers.

### D5. Databases, volumes, backups
- [ ] **One-click Postgres, MySQL, Redis, MongoDB** with auto variables (`DATABASE_URL` etc.) and a volume.
- [ ] **Data browser, query console, connect tab, CLI tunnel.**
- [ ] **Volumes:** create, attach, resize limit, usage alerts, move between servers.
- [ ] **Scheduled and manual backups, restore (in place or new), download.** AC: restore round-trip verified in an automated test.
- [ ] **HA Postgres** (Patroni-based, 3 servers). Late phase.

### D6. Scaling
- [ ] RAM/CPU sliders (Docker limits) with server capacity awareness.
- [ ] Replicas per server, cross-server load balancing via the ingress server's Caddy.
- [ ] Placement across servers (the "regions" equivalent); multi-ingress with DNS guidance (advanced).
- [ ] **App sleeping** with wake-on-request. AC: the first request after sleep succeeds (held until healthy, within 30s).
- [ ] **Cloud integrations:** provision a new VM from the UI (cloud-init runs the join command), resize, reboot, delete, and pull pricing for cost estimates (Oracle, AWS, GCP, Hetzner, DO).

### D7. Environments
- [ ] Production plus custom environments; copy or empty creation; per-environment config and variables.
- [ ] **PR preview environments:** auto create/destroy, PR comment with URLs, fork safety, TTL.
- [ ] **Compare and sync environments.**

### D8. Observability
- [ ] Build, deploy, runtime and HTTP logs; live tail; filter syntax; JSON attributes; download; retention settings.
- [ ] Service and host metrics with deploy markers.
- [ ] Project observability dashboard with widgets and saved queries.
- [ ] **Notifications** (email, Discord, Slack, webhook) for deploy success/fail, crash, OOM, server offline, disk ≥ 90%, volume ≥ 90%, backup failed, cert failure.
- [ ] **Outgoing project webhooks** with HMAC signatures and a delivery log.

### D9. Templates
- [ ] Built-in templates (at least): Postgres, MySQL, Redis, MongoDB, MinIO, n8n, Uptime Kuma, Umami, Plausible, Ghost, WordPress, Directus, Strapi, Meilisearch, Metabase, Grafana + Prometheus, Next.js starter, Express starter, FastAPI starter, Django starter, Laravel starter.
- [ ] Template gallery, deploy form, create-from-project, import/export, and `docker-compose.yml` import. Verify each third-party app's license and self-hosting terms before bundling a template.

### D10. Developer surface
- [ ] **Public REST API** (OpenAPI docs page) with token scopes and rate limits.
- [ ] **CLI:** Part J2 commands, installable by a one-line script plus Homebrew and Scoop.
- [ ] **MCP server:** tools to list projects/services, deploy, redeploy, rollback, read logs, read metrics, set variables, add a database, deploy a template, add a domain. Scoped by token.
- [ ] **Web terminal / exec** into containers; `lumen shell` from the CLI.
- [ ] **`lumen run`:** run a local command with a service's variables injected.

### D11. Teams and security
- [ ] Workspaces, invites, roles:

| Permission | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| View projects/logs/metrics | ✅ | ✅ | ✅ | ✅ |
| Deploy/redeploy/rollback | ✅ | ✅ | ✅ | — |
| Edit variables (reveal sealed: nobody) | ✅ | ✅ | ✅ | — |
| Create/delete projects & services | ✅ | ✅ | ✅ | — |
| Manage servers, cloud accounts, backups destinations | ✅ | ✅ | — | — |
| Manage members & roles | ✅ | ✅ (not owners) | — | — |
| Delete workspace, transfer ownership | ✅ | — | — | — |

- [ ] 2FA (TOTP), passkeys, session management, audit log, per-project access overrides.
- [ ] SSO via OIDC (later).

### D12. Platform and self-hosting
- [ ] One-command control-plane install, setup wizard with a setup token, one-click updates, control-plane backups, uninstall script.
- [ ] Usage and cost estimates.
- [ ] Onboarding checklist, command palette, notifications center, keyboard shortcuts, dark/light themes, mobile-friendly UI.
- [ ] Docs site (getting started, per-provider server guides, every feature, API/CLI reference, troubleshooting driven by the error catalog).
- [ ] Optional **"Explain this error"** button that sends the error card plus the last 100 log lines to a Claude model using the workspace's own API key (off unless configured; show exactly what is sent).

---

## Part E — Self-hosting and installation

### E1. Requirements
- **Control plane (with apps on the same box):** 2 vCPU / 2 GB RAM / 20 GB disk minimum. Target control-plane idle < 512 MB.
- **Additional servers:** 1 vCPU / 1 GB RAM minimum.
- **OS:** Ubuntu 22.04/24.04, Debian 12 (Tier 1); RHEL-family 9 (Tier 2). amd64 + arm64.
- **Ports:** 80/443 TCP public; UDP 51820 between servers; TCP proxy range optional.

### E2. Control plane install
`curl -fsSL https://get.<yourdomain>/install.sh | sh`

The script does the following:
1. **Preflight:** root/sudo, OS/arch, RAM/disk, ports free, existing Docker detection. Print clear failures with fixes.
2. **Install:** Docker Engine (official repo) if missing, then enable and start it.
3. **Firewall:** detect ufw/firewalld/iptables (including Oracle Ubuntu images' default iptables REJECT rules), open 80/443 (and 51820/udp), and persist the rules. Print cloud-firewall instructions for the detected provider (metadata endpoint detection for Oracle/AWS/GCP/Azure).
4. **Write config:** `/opt/lumen/` with `docker-compose.yml` and `.env` containing generated secrets: DB password, master encryption key, session secret, setup token.
5. **Start:** pull images pinned by digest and start caddy, web, api, workers, postgres (and optionally the registry), plus the local agent pre-joined.
6. **Wait** for health, then print: the URL (IP-based HTTPS address), the **setup code**, and "Keep your `.env` safe — it holds your encryption key."
7. **Log** everything to `/var/log/lumen-install.log`.

### E3. Updates
- An in-app "Update" button (or `lumen-admin update`) pulls new images, backs up the database, runs migrations, restarts with a health check, and rolls back automatically on failure.
- Agents update themselves after the control plane does.
- Update channels: stable and beta. Changelog shown before updating.

### E4. Control-plane backup and restore
Nightly `pg_dump` plus `.env` (encrypted with a user-supplied passphrase) to the backup destination. A restore command rebuilds a control plane on a new VM; agents reconnect automatically via DNS or IP update.

### E5. Uninstall
`lumen-admin uninstall` (control plane) and `lumen-agent uninstall` (server). Both confirm first, stop containers, and optionally keep volumes.

### E6. Provider guides (docs plus in-app fix cards)
For each of Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean and generic: create a VM, open ports in the cloud firewall, the OS firewall quirks, recommended free or cheap sizes, and attaching a domain. Verify each provider's current UI steps and free-tier terms when writing; they change.

---

## Part F — Build phases with ready-to-paste prompts

### F0. Phase prompt template (every phase uses this shape)
```xml
<task>Phase N — {name}</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, and these SPEC sections: {list}.
</context>
<goal>{one-sentence outcome a user could observe}</goal>
<scope>{bullet list}</scope>
<out_of_scope>{bullet list: prevents scope creep}</out_of_scope>
<acceptance_criteria>{copied from Part D + specific tests}</acceptance_criteria>
<process>
1. Write a plan: files to create/change, data/protocol changes, risks, test plan,
   open questions. STOP and wait for my approval.
2. Implement in small steps; run code and tests after each step.
3. For UI: screenshots at 390/1024/1440 × dark/light × key states; critique against
   SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md.
</process>
```

### Phase 0 — Foundations · *Opus 5.5*
Scope: monorepo (pnpm, Turborepo), TS/Go tooling, lint/format, CI (GitHub Actions: lint, typecheck, test, build for amd64/arm64), `docker-compose.dev.yml` (Postgres), Drizzle setup, protobuf + buf codegen pipeline, `packages/shared/errors` skeleton, the docs files.
AC: `pnpm dev` starts web + api; `pnpm test` green; CI green; the agent builds for both architectures.

### Phase 1 — Design direction and design system · *Opus 5.5 → reviewed by Fable 5.1*
Scope: C15 steps 1–2. Three directions as static pages, then the chosen direction implemented as tokens (CSS variables, both themes) and every C5 component with all states in `/dev/components`.
Out of scope: real data, API.
AC: gallery screenshots for every component in both themes; axe clean; `UI_DECISIONS.md` written.

### Phase 2 — Agent core and server join · *Fable 5.1*
Scope: B5 connection and handshake, heartbeat, join-token flow (B12), `deploy/agent-install.sh` (preflight, Docker install, firewall handling, systemd unit, checksum verification), host metrics, port check, minimal API endpoints for servers and join tokens.
AC: D1 first three items on real Ubuntu amd64 and an Oracle arm64 VM; re-running the installer is idempotent.

### Phase 3 — Deploy engine on the agent · *Fable 5.1*
Scope: B3 reconciliation loop, B4 lifecycle, Docker container management with limits, Caddy route management, zero-downtime swap, healthchecks, restart policy, crash-loop backoff, Railpack/Dockerfile/image builds via BuildKit, build log streaming, runtime log capture (B11), port detection.
AC: deploy a sample repo and image to a real VM via a test API call; the zero-downtime curl test passes; killing the agent mid-deploy and restarting it converges correctly.

### Phase 4 — Control plane core · *Fable 5.1 (schema + security) → Opus 5.5 (CRUD)*
Scope: B6 schema and migrations, auth (email/password, sessions, verification, reset), workspaces, projects, environments, services, service instances, variables with B7 encryption, references and generators, deployments API, desired-state compiler, agent gateway, realtime WebSocket fan-out, OpenAPI docs, RBAC middleware, audit log, error catalog wiring.
AC: an end-to-end API test creates a project → service → variables → deploy, and it goes live on a VM; the RBAC test matrix passes.

### Phase 5 — App shell, projects, canvas, inspector · *Opus 5.5*
Scope: C6, C7.2–C7.8, C7.11 (runtime logs), C7.12 (Source/Build/Deploy/Resources), C7.23, C8.1–C8.6, all wired to the real API with realtime.
AC: a user can sign up, create a project, add an image service, watch it deploy live on the canvas, read logs, change RAM via staged changes, and redeploy, entirely in the UI; C14 checklist passes on each page.

### Phase 6 — GitHub integration · *Opus 5.5*
Scope: GitHub App manifest flow (instance-level), installations, repo picker, branch picker, push webhooks (HMAC verified), watch paths, wait for CI (check suites), commit metadata, deploy specific commit, "Configure GitHub access" link, Continue-with-GitHub login.
AC: D2 push-to-deploy and watch-path items; revoked access shows a clear error with a reconnect button.

### Phase 7 — Public networking · *Opus 5.5 → reviewed by Fable 5.1*
Scope: B9 generated domains, custom domains with DNS record cards and live checks, automatic HTTPS, target port, TCP proxy, HTTP logs, the Networking settings section, HTTP mode in the Logs tab.
AC: D4 first three items on a real domain.

### Phase 8 — Observability · *Opus 5.5*
Scope: C7.10 Metrics tab, C7.11 full filter syntax plus HTTP and Build modes, C7.17 observability page, deploy markers, smart memory hints, retention settings, notification channels and rules, outgoing webhooks.
AC: D8 all items; the log search fan-out works across 2 servers.

### Phase 9 — Databases, volumes, backups · *Fable 5.1 (backup/restore correctness) → Opus 5.5 (UI)*
Scope: database templates with auto variables, volumes (B10), C7.13, C7.14, restic backups (logical dumps for DBs), restore in place or to a new target, download, CLI tunnel groundwork, volume move wizard.
AC: D5 first four items; the automated backup → restore test passes for every engine.

### Phase 10 — Environments, staged changes polish, config as code · *Opus 5.5*
Scope: C7.15 fully, PR preview environments (with the PR comment), compare and sync, `lumen.toml` parsing with UI locks, `.env.example` suggestions, raw editor, `docker-compose.yml` import.
AC: D7 all items; D2 config-as-code item; D3 all items.

### Phase 11 — Self-host installer and setup wizard · *Fable 5.1 (installer/updates) → Opus 5.5 (wizard UI)*
Scope: Part E fully, C7.1, C7.22, update and rollback flow, control-plane backups.
AC: a fresh VM goes from the curl command to a first app live over HTTPS in < 10 minutes, measured with a stopwatch by someone who has never used it; the update rollback test passes.

### Phase 12 — Multi-server and private networking · *Fable 5.1*
Scope: WireGuard mesh, container subnet routing, embedded DNS, nftables project isolation, registry for cross-server images, placement and replicas, cross-server load balancing, drain.
AC: D4 private networking; D6 replicas and placement; the isolation test passes; killing one server keeps replicas on others serving traffic.

### Phase 13 — Templates · *Opus 5.5 (parallelizable)*
Scope: template schema (Part J4), gallery, deploy form, create-from-project, import/export, and all D9 built-in templates (each tested by deploying it).
Tip: run multiple sessions in parallel, a few templates each, with the same template spec.

### Phase 14 — CLI, API, MCP, terminal · *Opus 5.5*
Scope: CLI (Part J2), install scripts, API token scopes and rate limits, API docs page, MCP server, web terminal (C7.25), `lumen shell`, `lumen run`, `lumen connect`.
AC: D10 all items; a Claude model connected to the MCP server can deploy a template and read its logs.

### Phase 15 — Teams and security features · *Opus 5.5 → audited by Fable 5.1*
Scope: invites, roles (D11 matrix), per-project overrides, 2FA, passkeys, sessions page, audit log UI, C7.20, C7.21.
AC: D11 items; the permission test matrix covers every route.

### Phase 16 — Cron, sleeping, cost, cloud integrations · *Fable 5.1 (sleep/wake) → Opus 5.5 (the rest)*
Scope: cron services and run history, app sleeping with wake-on-request, usage and cost view, cloud account connections (provision/resize/reboot/delete via cloud-init join), the optional "Explain this error" feature.
AC: D6 sleep and cloud items; a server created from the UI on at least 2 providers joins automatically.

### Phase 17 — HA Postgres · *Fable 5.1*
Scope: a Patroni-based 3-node Postgres template across servers, with a failover test, connection routing, backups and UI status.
AC: killing the primary fails over and the app reconnects with < 30s of errors.

### Phase 18 — Hardening and launch · *Fable 5.1 (audit), Opus 5.5 (fixes and docs)*
Scope: full security audit (Part H3), performance budget verification (B14), chaos tests (Part G), accessibility pass, docs site, landing page, demo video script, release pipeline (signed agent binaries, image digests, changelog).
AC: all Part G suites green; zero critical or high audit findings open.

---

## Part G — Testing and QA
- **Unit:** Vitest (TS) and Go test. Cover the desired-state compiler, variable resolution (references, cycles, generators), the permission matrix, cron parsing, the filter syntax parser, and error mapping.
- **Integration:**
  - Agent against real Docker (in CI on a privileged runner or a VM)
  - API against real Postgres (testcontainers)
  - Protocol compatibility tests N vs. N-1
- **E2E (Playwright):** a harness that spins up a control plane plus 2 Ubuntu VMs (Multipass/Lima locally; cloud VMs nightly). Suites: onboarding, deploy from GitHub (a test repo), variables and staged changes, domains, databases and backups, environments and PR previews, templates, teams and RBAC, mobile viewport.
- **Visual regression:** Playwright screenshots of every page and state, both themes, 3 widths. The diff threshold fails CI.
- **Accessibility:** axe on every page in CI, plus a manual keyboard checklist per release.
- **Load (k6):** 200 concurrent dashboard users; log tail with 50 services each printing 100 lines/s; 50 simultaneous deploys queued.
- **Chaos:** kill the agent mid-build and mid-swap; drop the control plane for 10 min (apps must stay up); fill the disk; reboot a server; revoke GitHub access; expire a certificate; corrupt a join token; clock skew.
- **Install matrix:** Ubuntu 22.04/24.04, Debian 12, RHEL-family 9, each on amd64 and arm64, nightly.
- **Upgrade tests:** install N-1, deploy apps, upgrade to N, and verify there was zero app downtime.

---

## Part H — Review and audit prompts

### H1. Code review (use the model that did NOT write the code)
```xml
<role>Senior reviewer. You did not write this code. Be direct and specific.</role>
<context>Read CLAUDE.md and SPEC sections {list}. The diff: {paste or point to branch}.</context>
<review_for>
1. Correctness vs. acceptance criteria (list any unmet AC)
2. Bugs, race conditions, idempotency and retry safety (agent/protocol code)
3. Security: authz on every route, secret handling, injection, SSRF, path traversal
4. Error handling: every user-facing failure maps to the error catalog
5. Tests: what's untested that should be
6. Simplicity: anything that could be deleted or simplified
</review_for>
<output>Findings table: severity (critical/high/medium/low), file:line, problem,
suggested fix. Then the 3 most important changes. No praise padding.</output>
```

### H2. UI review (attach screenshots)
```xml
<role>Principal product designer reviewing Lumen's UI for beginner clarity.</role>
<context>SPEC Part C (principles C3, tokens C4, quality bar C14, voice C9).
Screenshots attached: {page} at 390/1024/1440, dark/light, states: {list}.</context>
<task>
1. First impression: what does a beginner think they should click? Is that right?
2. Check every C14 item; list failures with the exact element.
3. Hierarchy, spacing, alignment, typography, color: specific fixes with token names
   and pixel values.
4. Copy: rewrite any line that violates C9.
5. Missing states or edge cases (long names, 0 items, 500 items, errors).
6. Originality check: flag anything that reads as imitating another product.
</task>
<output>Prioritized list of concrete changes, most impactful first.</output>
```

### H3. Security audit (Fable 5.1, fresh session)
```xml
<role>Independent security auditor. Assume attackers include: an anonymous internet
user, a low-privilege workspace member, a malicious container workload, a malicious
PR from a fork, and a compromised server in the mesh.</role>
<context>Read CLAUDE.md, SPEC B5, B7, B9, B12, D11 and the codebase.</context>
<task>Threat-model each attacker. For each: attack paths, whether current code
prevents them (cite code), and fixes. Cover: auth/session, RBAC bypass, secret
exposure (API, logs, builds, snapshots), agent credential theft and impersonation,
container escape vectors in our defaults, cross-project network access, webhook
forgery, SSRF via domains/webhooks/templates, installer supply chain, setup-wizard
takeover, DoS (log floods, build floods).</task>
<output>Findings with severity, evidence, and fix. Then a prioritized fix plan.</output>
```

### H4. Architecture fresh-eyes review (at the end of Phases 3, 4 and 12)
```xml
<role>Distributed systems reviewer with no prior context.</role>
<task>Read SPEC Part B and the implementation. Identify: state that can diverge
between control plane and agents, operations that aren't idempotent, failure modes
where apps go down because the control plane is down, unbounded growth (logs, images,
tables), and anything that won't survive 50 servers / 2,000 services.</task>
<output>Risks ranked by likelihood × impact, each with a concrete mitigation.</output>
```

---

## Part I — Prompting playbook

### I1. What makes these models perform at their best
1. **Give the why, not just the what.** "Keep the control plane under 512 MB *because beginners run everything on one free-tier VM*" lets the model make good calls you didn't anticipate.
2. **Put rich context up front, then instructions.** Use XML tags (`<context>`, `<task>`, `<constraints>`, `<output>`) so nothing blurs together.
3. **Define "done" precisely.** Acceptance criteria turn "looks finished" into "is finished".
4. **Plan, then build.** For anything non-trivial: "Write a plan and stop." Reviewing a plan costs 2 minutes; reviewing a wrong implementation costs hours.
5. **Make it verify itself.** "Run it. Show me the output. Take screenshots and critique them." Models are much better when they check their own work against evidence.
6. **Ask for options on taste decisions.** "Give me 3 distinct directions" beats "design it", then pick and refine.
7. **Show positive and negative examples.** The C9 copy examples are a pattern to reuse for code style, error messages, API design and more.
8. **One focused goal per session.** Carry memory through `PROGRESS.md` and `DECISIONS.md`, not an endless chat.
9. **Invite honesty.** "If something is unclear, contradicts the spec, or you couldn't finish, say so plainly." It prevents confident-sounding gaps.
10. **Cross-model review.** The model that didn't write it catches what the author can't see.

### I2. Reusable prompt snippets
- **Planning:** "Before coding, list your assumptions and the 3 riskiest parts of this task and how you'll de-risk each. Then stop."
- **Debugging:** "Write a failing test that reproduces this bug first. Then list 3 hypotheses ranked by likelihood, test each, and fix the confirmed cause. Don't patch symptoms."
- **UI iteration:** "Here are screenshots of the current page. Pretend you're a first-time user trying to {task}. Narrate where your eyes go and where you hesitate, then fix the top 5 issues."
- **Refactor safety:** "Refactor without changing behavior. Run the full test suite before and after and show both results."
- **Scope guard:** "If you notice something outside this task that needs fixing, add it to PROGRESS.md under 'Found issues' instead of fixing it now."
- **Parallel fan-out:** "Split this into independent chunks that can be built in parallel with no shared files. List each chunk with its own acceptance criteria."
- **Handoff:** "Summarize this session for the next one: what changed, decisions made, what's half-done, exact next step. Write it to PROGRESS.md."

### I3. Anti-patterns (avoid)
- ❌ "Build the whole platform." ✅ One phase, one goal, clear AC.
- ❌ "Make it look like [another product]." ✅ Describe feelings, goals and tokens (C2).
- ❌ Accepting "I've implemented X" without output. ✅ Demand evidence.
- ❌ Changing requirements mid-session silently. ✅ Update SPEC first, then tell the model.
- ❌ Pasting this entire file into every prompt. ✅ Reference sections; `CLAUDE.md` carries the essentials.
- ❌ Letting the model invent a new pattern per page. ✅ "Use only `packages/ui` components and tokens; propose new components separately."

### I4. When things go wrong
1. **Stop the session.** Don't argue in circles.
2. `git diff` to see what actually changed; revert to the last green commit if needed.
3. **New session:** "Here's the goal, here's what was tried (summary), here's the failure output. Diagnose before changing anything."
4. If it fails twice on the same problem, escalate to Fable 5.1 with the full failure history.

---

## Part J — Appendix

### J1. REST API (prefix `/v1`, JSON, token or session auth)
- **auth:** `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/2fa/verify` · `GET /me`
- **workspaces:** `GET/POST /workspaces` · `GET/PATCH/DELETE /workspaces/:id` · `GET/POST /workspaces/:id/members` · `POST /workspaces/:id/invites`
- **servers:** `GET/POST /servers` · `POST /servers/join-tokens` · `GET/PATCH/DELETE /servers/:id` · `POST /servers/:id/drain` · `POST /servers/:id/port-check` · `POST /servers/:id/agent-update`
- **projects:** `GET/POST /projects` · `GET/PATCH/DELETE /projects/:id` · `PUT /projects/:id/canvas`
- **environments:** `GET/POST /projects/:id/environments` · `PATCH/DELETE /environments/:id` · `POST /environments/:id/sync`
- **services:** `GET/POST /environments/:id/services` · `GET/PATCH/DELETE /services/:id` (env-scoped config via `?environment=`)
- **variables:** `GET/PUT/DELETE /services/:id/variables` · `GET/PUT /environments/:id/shared-variables`
- **staged changes:** `GET/PUT/DELETE /environments/:id/staged` · `POST /environments/:id/staged/apply`
- **deployments:** `GET /services/:id/deployments` · `POST /services/:id/deploy` · `GET /deployments/:id` · `POST /deployments/:id/rollback|cancel|redeploy` · `GET /deployments/:id/logs`
- **logs/metrics:** `GET /services/:id/logs` · `GET /environments/:id/logs` · `GET /services/:id/metrics` · `GET /services/:id/http-logs`
- **domains:** `GET/POST /services/:id/domains` · `DELETE /domains/:id` · `POST /domains/:id/check` · `POST /services/:id/tcp-proxy`
- **volumes & backups:** `GET/POST /volumes` · `PATCH/DELETE /volumes/:id` · `POST /volumes/:id/move` · `GET/POST /volumes/:id/backups` · `POST /backups/:id/restore`
- **templates:** `GET /templates` · `GET /templates/:slug` · `POST /templates/:slug/deploy` · `POST /templates` · `POST /import/compose`
- **integrations:** `POST /github/manifest` · `GET /github/installations` · `GET /github/repos` · `POST /webhooks/github`
- **notifications & webhooks:** CRUD on `/notification-channels`, `/notification-rules`, `/projects/:id/webhooks`
- **tokens:** `GET/POST/DELETE /tokens` · **audit:** `GET /workspaces/:id/audit-log`
- **realtime:** `GET /v1/ws` (multiplexed subscriptions) · **agent:** `GET /agent/v1` (WebSocket) · **MCP:** `/mcp`

### J2. CLI
`lumen login` · `lumen logout` · `lumen whoami` · `lumen init` · `lumen link` · `lumen unlink` · `lumen status` · `lumen up [--detach]` · `lumen deploy [--service]` · `lumen redeploy` · `lumen rollback [deployment]` · `lumen down` · `lumen logs [--build|--http] [--filter] [--follow]` · `lumen variables [list|set|unset|import|export]` · `lumen run -- <cmd>` · `lumen shell [--replica]` · `lumen connect <db-service>` · `lumen domain [list|add|remove]` · `lumen environment [list|new|use|delete]` · `lumen service [list|use|create]` · `lumen volume [list|backup|restore]` · `lumen server [list|add|remove]` · `lumen template deploy <slug>` · `lumen open` · `lumen docs` · `lumen completion` · `lumen upgrade`

### J3. `lumen.toml` schema (example)
```toml
[build]
builder = "auto"            # auto | dockerfile | image
dockerfile = "Dockerfile"
command = "npm run build"
watch = ["apps/api/**", "packages/shared/**"]

[deploy]
start = "node dist/server.js"
pre_deploy = "npm run migrate"
healthcheck_path = "/health"
healthcheck_timeout = 120   # seconds
restart = "on_failure"      # always | on_failure | never
restart_max_retries = 10
drain_timeout = 30
sleep_when_idle = false
cron = ""                   # e.g. "0 3 * * *" makes this a cron service

[resources]
memory = "512MB"
cpu = 1.0

[[placement]]
server = "oracle-1"
replicas = 2

[environments.staging.resources]
memory = "256MB"
```

### J4. Template definition (JSON)
```json
{
  "slug": "node-postgres-starter",
  "name": "Node API + Postgres",
  "description": "An Express API connected to Postgres.",
  "icon": "nodejs",
  "category": "starters",
  "version": 1,
  "services": [
    {
      "key": "postgres",
      "name": "Postgres",
      "source": { "image": "postgres:16" },
      "volume": { "mountPath": "/var/lib/postgresql/data" },
      "variables": {
        "POSTGRES_USER": "app",
        "POSTGRES_PASSWORD": "${{ secret(32) }}",
        "POSTGRES_DB": "app",
        "DATABASE_URL": "postgres://app:${{ self.POSTGRES_PASSWORD }}@${{ self.LUMEN_PRIVATE_DOMAIN }}:5432/app"
      }
    },
    {
      "key": "api",
      "name": "API",
      "source": { "repo": "your-org/express-starter", "branch": "main" },
      "domain": { "generate": true },
      "variables": {
        "DATABASE_URL": "${{ postgres.DATABASE_URL }}",
        "JWT_SECRET": { "required": true, "description": "Any long random string" }
      }
    }
  ]
}
```

### J5. Ports

| Port | Where | Purpose |
|---|---|---|
| 80, 443 TCP | Every server, public | App traffic, ACME |
| 20000–29999 TCP | Servers with TCP proxies | Public DB/game ports (opt-in) |
| 51820 UDP | Between servers only | WireGuard mesh |
| 2019 TCP | localhost only | Caddy admin API |
| 53 UDP/TCP | Container networks only | Agent embedded DNS |

### J6. Error catalog (starter set; each entry has a code, title, explanation, fix and action)

| Code | Title shown to user | Fix action |
|---|---|---|
| `PORT_BLOCKED` | "Port 443 is blocked on your server" | Provider-specific fix card |
| `AGENT_OFFLINE` | "Server 'x' isn't responding" | Troubleshooting steps + reinstall command |
| `DISK_FULL` | "Your server is almost out of disk space" | Clean up images/build cache button |
| `OOM_KILLED` | "Your app ran out of memory" | Increase memory (staged) |
| `CRASH_LOOP` | "Your app keeps crashing on start" | Jump to the last error lines in logs |
| `HEALTHCHECK_TIMEOUT` | "Your app didn't respond in time" | Check port / set healthcheck path |
| `NO_START_COMMAND` | "We couldn't figure out how to start your app" | Set start command |
| `BUILD_LOCKFILE_MISSING` | "No lockfile found" | Explain and link to docs |
| `BUILD_FAILED_GENERIC` | "Your build failed" | Highlight the first error line |
| `PRE_DEPLOY_FAILED` | "Your pre-deploy command failed. Your previous version is still live." | View logs |
| `VARIABLE_REF_MISSING` | "A variable references something that doesn't exist" | Jump to the variable |
| `VARIABLE_REF_CYCLE` | "Variables reference each other in a loop" | Show the cycle |
| `DNS_NOT_POINTED` | "Your domain doesn't point here yet" | Show the DNS record + recheck |
| `TLS_FAILED` | "We couldn't get a certificate for your domain" | Reason + recheck |
| `IMAGE_PULL_AUTH` | "We couldn't pull this private image" | Add registry credentials |
| `GITHUB_ACCESS_REVOKED` | "We lost access to this repository" | Reconnect GitHub |
| `SERVER_CAPACITY` | "This server doesn't have enough memory for that" | Move/resize suggestions |
| `VOLUME_FULL` | "Your volume is almost full" | Increase limit / clean up |
| `BACKUP_FAILED` | "Your backup didn't complete" | Test destination / retry |
| `MESH_UNREACHABLE` | "Your servers can't reach each other privately" | Open UDP 51820 guide |

### J7. Glossary (use these words in the UI)
- **Project:** a group of services that work together
- **Environment:** a copy of a project's setup (production, staging, previews)
- **Service:** one app, worker, cron job or database
- **Deployment:** one version of a service, built and running
- **Server:** a VM you connected
- **Variable:** a setting or secret your app reads at runtime
- **Volume:** a disk that survives redeploys
- **Template:** a ready-made set of services
- **Staged changes:** edits waiting to be deployed

---

*End of spec. Keep this file updated as the product evolves: it is the single source of truth for you and both models.*
