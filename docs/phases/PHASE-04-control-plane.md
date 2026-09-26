# Phase 04 — Control plane core

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 (schema, encryption, RBAC, compiler, gateway, security) → Opus 5.5 (CRUD routes, OpenAPI, tests) → reviewed by the other |
| **Depends on** | Phase 00 (Hono/Drizzle/Zod skeleton, CI), Phase 02 (`servers`, `server_join_tokens`, gateway skeleton, envelope signing), Phase 03 (`DesiredState`/`Build*`/`Log*` contracts, dev driver to be replaced) |
| **Unblocks** | Phase 05 (every UI call goes through this API), Phase 06 (GitHub rows and deploy triggers), Phase 07–10, Phase 13–16 (all extend this schema and these services) |
| **Spec sections** | SPEC B2, B4, B5, B6, B7, B12 (web security, RBAC), B13, B14, D3, D11, J1, J6, J7 |
| **Estimated sessions** | 10 focused sessions (schema + migrations · auth + sessions + CSRF + rate limits · RBAC + audit · workspaces/projects/environments/services CRUD · variables + encryption + references · desired-state compiler · deployments state machine + workers · agent gateway generalisation · realtime fan-out + OpenAPI · end-to-end API deploy on a real VM) |

## 1. Goal
Through the public API alone, a user signs up, creates a workspace and project, adds a service with variables that reference a database service, triggers a deploy, and watches it go `ACTIVE` on a real server, while a viewer in the same workspace is refused every write with a friendly permission error.

## 2. Why this phase exists
The dashboard talks only to this API (B2, "dogfooding"), so the CLI, MCP server and API users get every feature for free only if the API is complete and honest. Three things in this phase are expensive to undo and therefore belong to Fable 5.1 (SPEC 0.3): the schema (every later phase adds columns, none should rename), the encryption design (values encrypted today must decrypt after key rotation in a year), and the RBAC model (a bypass is a security incident, not a bug). The desired-state compiler is the bridge between "what the user configured" and "what the agent enforces"; it is a pure function and must stay one so it can be tested exhaustively.

The performance budgets are part of the contract: the whole control plane idles under 512 MB because beginners run everything on one free-tier VM (B14), and CRUD p95 stays under 100 ms so the UI can be optimistic without lying.

## 3. Scope
### In scope
- `packages/db`: the full B6 schema as Drizzle tables (every table, including those used first by later phases), indexes, `deployment_logs` monthly partitions with retention, migrations, seed for development, the `project_keys`, `desired_states`, `project_members`, `agent_ops`, `rate_limits` and `notifications` support tables this design needs.
- Auth: email/password signup and login (argon2id), sessions (httpOnly, `Secure`, `SameSite=Lax` cookies, hashed session ids), email verification, password reset, logout, `GET /v1/me`, login audit, rate limits on every auth route, CSRF protection, API tokens (bearer) with scopes as the second principal type.
- Workspaces (create, read, update, delete), members (list, role change, remove), projects (CRUD, canvas layout `PUT`), environments (CRUD; production auto-created; `sync`, copy and PR kinds are Phase 10), services and service instances (CRUD with env-scoped config), variables (service and shared; encryption, sealed, references, generators, platform variables), staged changes (get, put, delete, apply), deployments (list, deploy, get, rollback, cancel, redeploy, logs), runtime logs and live metrics proxies to agents, audit log read.
- `packages/shared`: `LumenError` and the error catalog wiring, Zod schemas for every route, the permission matrix as a typed table, the reference/generator grammar and resolver.
- Desired-state compiler: environment → per-server `DesiredState` with `content_hash`, stored and versioned, pushed to agents through the gateway.
- Deployment lifecycle B4 on the control plane: state machine, superseding, `deployment_logs` persistence of `BuildEvent`/`DeployEvent` lines, workers on graphile-worker.
- Agent gateway generalised from Phase 02: all Phase 03 messages handled, N / N-1 protocol support, per-message verification, op de-duplication.
- Realtime: Postgres `LISTEN/NOTIFY` → `/v1/ws` multiplexed subscriptions with per-topic authorisation.
- OpenAPI generated from Zod, served at `/v1/docs`, exported to `packages/shared/openapi.json`.
- Audit log on every mutation.
- `lumen-admin rotate-master-key` and `rotate-project-key` commands.
- The end-to-end API test that deploys to a real VM, and the RBAC route × role matrix test.
### Out of scope
- All UI → Phase 05.
- GitHub App, repositories, webhooks, `push` trigger → Phase 06 (this phase deploys from an image or a git URL + token, exactly like Phase 03).
- Domains, TLS, TCP proxies, HTTP logs → Phase 07 (routes in the compiled state carry only generated placeholder hostnames for tests).
- Metric rollups, notification delivery, outgoing webhooks → Phase 08 (tables exist; workers do not).
- Volumes UI, backups → Phase 09 (volume rows and mounts compile; nothing creates backups).
- PR environments, compare/sync, `lumen.toml`, `.env.example`, compose import → Phase 10.
- Setup wizard, instance settings UI → Phase 11.
- Multi-server placement beyond a single `server_id` per instance → Phase 12 (the compiler handles `placement[]` generically; replica > 1 is tested in Phase 12).
- Templates → Phase 13; token rate limits per scope, MCP → Phase 14; invites, 2FA, passkeys, per-project override UI → Phase 15; cron, sleep → Phase 16.

## 4. Work breakdown

### 4.1 Schema and migrations
- **What:** Define every B6 table in Drizzle with `id uuid` (UUIDv7 generated in the API), `created_at timestamptz default now()`, `updated_at timestamptz` (trigger-maintained), and the indexes below. Migrations are SQL files generated by `drizzle-kit` and reviewed by hand; every migration is forward-only and idempotent (`IF NOT EXISTS`); a `schema_versions` row records the applied set.
- **Tables (columns beyond `id/created_at/updated_at`; `→` marks a foreign key with `ON DELETE` behaviour; `ux` unique index, `ix` index):**
  - `users`: `email citext ux`, `name`, `avatar_url?`, `password_hash?`, `github_user_id? ux`, `totp_secret_enc?`, `is_instance_admin bool`, `email_verified_at?`, `disabled_at?`, `last_login_at?`.
  - `sessions`: `user_id → users cascade`, `token_hash ux`, `expires_at`, `absolute_expires_at`, `ip inet`, `user_agent`, `last_seen_at`, `revoked_at?`; `ix(user_id)`, `ix(expires_at)`.
  - `passkeys`: `user_id →`, `credential_id ux`, `public_key`, `counter`, `transports[]`, `name`, `last_used_at?` (used in Phase 15).
  - `email_verifications`: `user_id →`, `token_hash ux`, `expires_at`, `used_at?`.
  - `password_resets`: `user_id →`, `token_hash ux`, `expires_at`, `used_at?`, `requested_ip`.
  - `workspaces`: `name`, `slug ux`, `owner_user_id →`, `deleted_at?`.
  - `workspace_members`: `workspace_id → cascade`, `user_id → cascade`, `role enum(owner|admin|member|viewer)`; `ux(workspace_id, user_id)`.
  - `invites`: `workspace_id →`, `email citext`, `role`, `token_hash ux`, `invited_by →`, `expires_at`, `accepted_at?`; `ix(workspace_id, email)`.
  - `project_members` (per-project overrides, D11/C7.16): `project_id → cascade`, `user_id → cascade`, `role`; `ux(project_id, user_id)`.
  - `api_tokens`: `owner_kind enum(user|workspace|project)`, `owner_id`, `scope_environment_id? →`, `name`, `token_hash ux`, `token_prefix` (first 8 chars for display), `scopes text[]`, `last_used_at?`, `expires_at?`, `created_by →`, `revoked_at?`; `ix(owner_kind, owner_id)`.
  - `servers`, `server_join_tokens`: unchanged from Phase 02.
  - `cloud_accounts`: `workspace_id →`, `provider`, `credentials_enc bytea`, `default_region`, `name`, `last_verified_at?`.
  - `projects`: `workspace_id → cascade`, `name`, `description?`, `icon`, `canvas_layout jsonb` (`{[environment_id]: {nodes: {[service_id]: {x, y}}, groups: [...]}}`), `deleted_at?`; `ix(workspace_id)`.
  - `project_keys`: `project_id → cascade ux`, `key_enc bytea`, `key_version int`, `master_key_version int`.
  - `environments`: `project_id → cascade`, `name`, `kind enum(production|staging|custom|preview)`, `pr_number?`, `base_environment_id? →`, `ephemeral bool`, `expires_at?`, `color`; `ux(project_id, name)`.
  - `services`: `project_id → cascade`, `name`, `icon`, `kind enum(web|worker|cron|database)`, `template_id? →`, `deleted_at?`; `ux(project_id, name) where deleted_at is null`.
  - `service_instances`: `service_id → cascade`, `environment_id → cascade`, `source_type enum(repo|image|local_upload)`, `repo_full_name?`, `branch?`, `root_dir default '/'`, `watch_paths text[]`, `image?`, `registry_credential_id? →`, `builder enum(railpack|dockerfile|image)`, `dockerfile_path?`, `build_command?`, `start_command?`, `pre_deploy_command?`, `healthcheck_path?`, `healthcheck_timeout_s int default 120`, `restart_policy enum(always|on_failure|never) default on_failure`, `restart_max_retries int default 10`, `cron_schedule?`, `cpu_limit numeric default 1.0`, `memory_limit_mb int default 512`, `placement jsonb default '[]'` (`[{server_id, replicas}]`), `sleep_enabled bool`, `sleep_after_s int default 600`, `deploy_on_push bool default true`, `wait_for_ci bool default false`, `config_file_path default 'lumen.toml'`, `detected_port?`, `target_port?`, `drain_timeout_s int default 30`, `security jsonb` (`{read_only_rootfs, cap_add[], docker_socket}`), `desired_status enum(running|stopped) default running`, `active_deployment_id? →`; `ux(service_id, environment_id)`.
  - `variables`: `project_id → cascade`, `environment_id → cascade`, `service_id? → cascade` (null = shared), `key`, `value_enc bytea`, `sealed bool`, `source enum(user|generated|template)`, `updated_by →`; `ux(environment_id, coalesce(service_id, '00000000-…'), key)`.
  - `staged_changes`: `project_id →`, `environment_id →`, `user_id →`, `changes jsonb` (`[{service_id?, kind: config|variable|volume, path, old, new}]`), `note?`; `ux(environment_id, user_id)`.
  - `deployments`: `service_instance_id → cascade`, `status enum(queued|initializing|building|pre_deploy|deploying|healthchecking|active|failed|superseded|removed|crashed|sleeping|stopped|cancelled|skipped)`, `trigger enum(push|manual|rollback|config_change|variable_change|template|pr|cli|api|cron)`, `trigger_note?`, `commit_sha?`, `commit_message?`, `commit_author?`, `branch?`, `image_ref?`, `image_digest?`, `config_snapshot jsonb`, `variables_snapshot_enc bytea`, `variable_keys text[]`, `server_ids uuid[]`, `build_id?`, `started_at?`, `build_finished_at?`, `finished_at?`, `error_code?`, `error_details jsonb?`, `rollback_of? →`, `created_by? →`; `ix(service_instance_id, created_at desc)`, `ix(status) where status in (queued, initializing, building, pre_deploy, deploying, healthchecking)`.
  - `deployment_logs` (partitioned by range on `ts`, monthly, partitions created 2 months ahead by a worker, dropped after 90 days): `deployment_id →`, `phase enum(build|deploy)`, `seq bigint`, `ts timestamptz`, `line text`, `level?`; primary key `(deployment_id, phase, seq, ts)`; `ix(deployment_id, ts)`.
  - `desired_states`: `server_id → cascade`, `version bigint`, `content_hash`, `document jsonb`, `applied_at?`, `applied_version_reported?`; `ux(server_id, version)`.
  - `agent_ops`: `server_id →`, `op_id ux`, `kind`, `status enum(sent|acked|errored|timeout)`, `error_code?`, `sent_at`, `finished_at?`; rows older than 24 h deleted hourly.
  - `domains`: `service_instance_id → cascade`, `hostname citext ux`, `kind enum(generated|custom)`, `target_port?`, `dns_status enum(pending|ok|wrong_target|missing)`, `tls_status enum(pending|issued|failed)`, `tls_error?`, `last_checked_at?`.
  - `tcp_proxies`: `service_instance_id → cascade`, `internal_port`, `public_port`, `server_id →`; `ux(server_id, public_port)`.
  - `volumes`: `project_id →`, `environment_id →`, `service_instance_id? →`, `name`, `mount_path`, `server_id →`, `size_limit_mb?`, `used_bytes bigint default 0`, `deleted_at?`; `ux(environment_id, name)`.
  - `backup_destinations`: `workspace_id →`, `kind enum(s3)`, `name`, `endpoint`, `bucket`, `region?`, `credentials_enc`, `restic_password_enc`, `last_tested_at?`.
  - `backup_schedules`: `volume_id → cascade`, `destination_id →`, `cron`, `retention jsonb` (`{keep_daily, keep_weekly, keep_monthly}`), `enabled`.
  - `backups`: `volume_id →`, `destination_id →`, `status enum(running|ok|failed)`, `size_bytes?`, `snapshot_id?`, `kind enum(scheduled|manual|pre_restore|move)`, `started_at`, `finished_at?`, `error?`.
  - `templates`: `workspace_id? →` (null = built-in), `slug`, `name`, `description`, `icon`, `category`, `definition jsonb`, `version int`, `published bool`, `created_by? →`; `ux(coalesce(workspace_id, '0000…'), slug)`.
  - `github_app` (singleton, `id = 1`): `app_id`, `slug`, `client_id`, `client_secret_enc`, `private_key_enc`, `webhook_secret_enc`, `html_url`.
  - `github_installations`: `workspace_id →`, `installation_id ux`, `account_login`, `account_type`, `suspended_at?`.
  - `registry_credentials`: `workspace_id →`, `registry`, `username`, `password_enc`, `name`.
  - `webhooks_outgoing`: `project_id → cascade`, `url`, `secret_enc`, `events text[]`, `enabled`; `webhook_deliveries`: `webhook_id → cascade`, `event`, `payload jsonb`, `status_code?`, `response_excerpt?`, `attempt int`, `next_retry_at?`, `delivered_at?`.
  - `notification_channels`: `workspace_id →`, `kind enum(email|discord|slack|webhook)`, `name`, `config_enc`, `last_tested_at?`; `notification_rules`: `channel_id → cascade`, `project_id? →`, `events text[]`, `enabled`.
  - `notifications` (in-app, C7.24): `user_id →`, `workspace_id →`, `kind enum(deploy|alert|system)`, `title`, `body`, `link`, `read_at?`; `ix(user_id, created_at desc)`.
  - `cron_runs`: `service_instance_id →`, `deployment_id? →`, `started_at`, `finished_at?`, `exit_code?`, `log_excerpt?`.
  - `metric_rollups`: `service_instance_id →`, `container_id`, `bucket_ts timestamptz`, `resolution enum(1m|1h)`, `cpu_avg`, `cpu_max`, `mem_avg`, `mem_max`, `net_rx`, `net_tx`, `disk_used`; `ux(container_id, resolution, bucket_ts)`; retention 1m × 7 d, 1h × 90 d (worker in Phase 08).
  - `http_log_rollups`: `service_instance_id →`, `bucket_ts`, `requests`, `status_2xx`, `status_3xx`, `status_4xx`, `status_5xx`, `p50_ms`, `p95_ms`, `p99_ms`; `ux(service_instance_id, bucket_ts)`.
  - `audit_log`: `workspace_id? →`, `actor_kind enum(user|token|system|agent)`, `actor_id?`, `action` (`<resource>.<verb>`), `target_kind`, `target_id`, `metadata jsonb`, `ip inet?`, `request_id`; `ix(workspace_id, created_at desc)`; append-only (no `updated_at`, `REVOKE UPDATE, DELETE` from the app role).
  - `rate_limits`: `key`, `window_start`, `count`; `pk(key, window_start)`; rows older than 1 h deleted by the cleanup worker.
  - `instance_settings`: `key pk`, `value jsonb`, `updated_by? →`.
- **Files:** `packages/db/src/schema/*.ts` (one file per table group), `packages/db/src/relations.ts`, `packages/db/migrations/0003_core.sql` … `0010_audit.sql`, `packages/db/src/partitions.ts` (create/drop monthly partitions), `packages/db/src/seed.ts`, `packages/db/README.md` (conventions: forward-only, no renames, add-then-backfill-then-constrain).
- **Done when:** `pnpm db:migrate` on an empty database and again on a migrated one both succeed; `drizzle-kit check` reports no drift; a Vitest against testcontainers inserts one row in every table; partition creation and drop are tested with a fake clock.

### 4.2 Errors, request context, validation
- **What:** Wire the error catalog into Hono so every failure is a `LumenError` with `code`, `title`, `explanation`, `fix`, `action` (J6) and never a stack trace.
- **Details:** `packages/shared/src/errors/index.ts` exports `class LumenError extends Error { code; status; title; explanation; fix; action; details }` and `catalog: Record<Code, Entry>`; `apps/api/src/middleware/error-handler.ts` maps thrown `LumenError` and `ZodError` (→ `VALIDATION_FAILED` with per-field messages) to `{ error: { code, title, explanation, fix, action, details, requestId } }`; unknown errors become `INTERNAL_ERROR` with the request id logged server-side; every request carries `X-Request-Id` (UUIDv7) in and out.
- **Files:** `packages/shared/src/errors/{index.ts,catalog/*.ts}`, `apps/api/src/middleware/{error-handler.ts,request-id.ts,validate.ts}`.
- **Done when:** a test throws every catalog code and asserts the JSON shape and status; a test that throws a raw `Error` asserts no stack or message leaks.

### 4.3 Auth: signup, login, sessions, verification, reset, CSRF, rate limits
- **What:** Implement B12 web security for password accounts.
- **Details:**
  - Passwords hashed with argon2id (`memoryCost 19456 KiB`, `timeCost 2`, `parallelism 1`, OWASP minimum; chosen over larger parameters to respect the 512 MB control-plane budget under concurrent logins); minimum 10 characters, checked against the top-100k breached list bundled in `packages/shared/src/auth/weak-passwords.txt`.
  - Session id: 32 random bytes, base64url; stored as SHA-256; cookie `lumen_session`, `HttpOnly`, `Secure` (except `localhost`), `SameSite=Lax`, `Path=/`, rolling expiry 30 days, absolute 90 days, `last_seen_at` updated at most once per 5 min.
  - CSRF: mutating requests (`POST/PUT/PATCH/DELETE`) with cookie auth must carry `X-Lumen-Request: 1` and an `Origin`/`Referer` matching the instance base URL; bearer-token requests are exempt; the `/v1/ws` upgrade checks `Origin`.
  - Email verification: 32-byte token hashed, 24 h expiry, single use; unverified users can log in but cannot create servers or deploy until verified when SMTP is configured (`instance_settings.require_email_verification`, default true when SMTP exists, false otherwise so single-user installs never get stuck).
  - Password reset: 1 h expiry, single use, identical response for unknown emails, all sessions revoked on success.
  - Rate limits (sliding window on `rate_limits`, keyed per route): login 10/min per IP and 5/min per email, signup 5/h per IP, reset request 3/h per email, verification resend 3/h per user; exceeded → `RATE_LIMITED` with `Retry-After`.
  - Login audit: every success and failure writes `audit_log` (`auth.login.success|failure`, ip, user agent) and `users.last_login_at`.
  - Registration mode from `instance_settings.registration` (`open|invite_only|closed`, default `invite_only` after the first admin exists).
  - API tokens: `lumen_<prefix>_<32 bytes base64url>`; stored hashed; `Authorization: Bearer`; scopes are strings from a fixed list (`read`, `deploy`, `variables:write`, `admin`); owner kind determines the principal's workspace/project; `last_used_at` updated at most once per minute.
- **Files:** `apps/api/src/routes/auth/{signup,login,logout,verify-email,reset-password,me}.ts`, `apps/api/src/services/auth/{password.ts,sessions.ts,tokens.ts,rate-limit.ts,csrf.ts}`, `apps/api/src/middleware/{auth.ts,csrf.ts,rate-limit.ts}`, `apps/api/src/services/email/{mailer.ts,templates/*.ts}` (plain, calm transactional emails; no-op transport when SMTP is unset), `packages/shared/src/schemas/auth.ts`.
- **Done when:** tests cover signup/login/logout, cookie flags, CSRF rejection, token auth, verification and reset (expired, reused), rate-limit `429`, and disabled users; `2FA verify` returns `501 NOT_IMPLEMENTED` with a catalog entry until Phase 15.

### 4.4 RBAC and audit
- **What:** Enforce the D11 matrix on every route and record every mutation.
- **Permission table (`packages/shared/src/rbac/matrix.ts`):**
  ```ts
  export const PERMISSIONS = ['project.view','deploy.write','variables.write','project.write','servers.manage','members.manage','workspace.delete'] as const;
  export const MATRIX: Record<Role, ReadonlySet<Permission>> = {
    owner:  new Set(['project.view','deploy.write','variables.write','project.write','servers.manage','members.manage','workspace.delete']),
    admin:  new Set(['project.view','deploy.write','variables.write','project.write','servers.manage','members.manage']), // cannot touch owners
    member: new Set(['project.view','deploy.write','variables.write','project.write']),
    viewer: new Set(['project.view']),
  };
  ```
  Sealed values are revealable by nobody (enforced in the variables service, not by a permission).
- **Resolution:** `requirePermission(perm, resolver)` where `resolver` maps route params to `{workspace_id, project_id?}` via one indexed query; effective role = `project_members.role` if present else `workspace_members.role`; instance admins bypass nothing inside workspaces they are not members of (they use `/admin` routes in Phase 11); tokens carry `scopes` which are intersected with the owner's role.
- **Audit:** `apps/api/src/middleware/audit.ts` runs after every successful mutating handler with `{action, target_kind, target_id, metadata}` set by the handler through `c.set('audit', …)`; metadata never contains variable values or tokens (a denylist test greps for `value`, `token`, `secret` keys).
- **Route × role matrix test:** `apps/api/test/rbac.matrix.test.ts` enumerates every registered route (from the Hono router) × 4 roles × token-with-`read`-scope and asserts the expected status from a checked-in table `apps/api/test/rbac.expected.json`; a new route without an entry fails the test.
- **Files:** `packages/shared/src/rbac/{matrix.ts,types.ts}`, `apps/api/src/middleware/{rbac.ts,audit.ts}`, `apps/api/src/services/rbac/resolve.ts`, `apps/api/test/rbac.*`.
- **Done when:** the matrix test passes for every route in this phase; `PERMISSION_DENIED` responses name the role needed ("You need the Member role to deploy. Ask an admin.").

### 4.5 Workspaces, projects, environments, services, service instances
- **What:** CRUD per J1 with Zod schemas and audit entries.
- **Details:** workspace creation makes the creator `owner` and seeds nothing else; project creation creates the `production` environment (`color = accent`) and an empty `canvas_layout`; `PUT /projects/:id/canvas` autosaves layout (no deploy, no staging); service creation requires `kind` and creates a `service_instances` row for every existing environment (copying defaults) and, for `kind = database`, delegates to the template engine of Phase 13 (until then, a fixed built-in definition for Postgres/MySQL/Redis/MongoDB lives in `packages/templates/builtin/databases/*.json` and is applied by this phase's `createDatabaseService`); deleting a service soft-deletes and compiles a desired state without its containers; `GET /services/:id?environment=<id>` returns the merged service + instance view; `PATCH /services/:id?environment=<id>` writes staged changes unless `?apply=immediately` (user preference, C8.1) in which case it writes directly and triggers a `config_change` deploy when a deploy-affecting field changed (fields listed in `packages/shared/src/config/deploy-affecting.ts`).
- **Files:** `apps/api/src/routes/{workspaces,projects,environments,services}/*.ts`, `apps/api/src/services/{workspaces,projects,environments,services}/*.ts`, `packages/shared/src/schemas/{workspaces,projects,environments,services}.ts`, `packages/templates/builtin/databases/{postgres,mysql,redis,mongodb}.json`.
- **Done when:** each route has success, validation, not-found (`404 NOT_FOUND` with the C7.26 copy) and RBAC tests; creating a service in a project with two environments yields two instances.

### 4.6 Variables: encryption, sealed, references, generators, platform
- **What:** Implement B7 end to end.
- **Encryption (`packages/shared/src/crypto/envelope.ts`, Node `crypto` only):**
  - Master key: `LUMEN_MASTER_KEY` (32 bytes, base64) from the control plane `.env`; `LUMEN_MASTER_KEY_PREVIOUS` accepted during rotation.
  - Project data key: 32 random bytes generated on project creation, wrapped with AES-256-GCM under the master key, stored in `project_keys` with `key_version` and `master_key_version`.
  - Value: AES-256-GCM with a fresh 12-byte nonce, AAD = `variable_id || key_version`; stored as `0x01 || key_version(2) || nonce(12) || ciphertext || tag(16)`.
  - `lumen-admin rotate-master-key` re-wraps every `project_keys` row (values untouched, seconds); `lumen-admin rotate-project-key <project>` generates a new data key and re-encrypts that project's values and snapshots in batches of 500 inside transactions, idempotent by `key_version`.
  - Decryption happens only in the compiler, the export endpoint for non-sealed values, and the `reveal` endpoint (`POST /v1/variables/:id/reveal`, audited).
- **API:** `GET /services/:id/variables?environment=` returns `{key, value: string | null (sealed), sealed, source, references: [...], resolved_preview?: masked}`; `PUT` upserts (batch); `DELETE`; `GET/PUT /environments/:id/shared-variables`; `POST /services/:id/variables/import` (`.env` text → staged changes); `GET …/export` (`.env` text, sealed values omitted with a comment line); all writes go through staged changes unless `apply=immediately`.
- **Reference grammar (`packages/shared/src/variables/grammar.ts`):** `${{ <target> }}` where `<target>` is `<service_name>.<KEY>` · `shared.<KEY>` · `self.<KEY>` · `<service_name>.<PLATFORM_VAR>` (B13 names, e.g. `api.LUMEN_PRIVATE_DOMAIN`); service names are matched case-sensitively within the project; unknown → `VARIABLE_REF_MISSING` naming the referencing variable and the missing target.
- **Generators:** `${{ secret(32) }}`, `${{ secret(16, "abc123") }}` (length 1–256, alphabet 2–256 chars, default alphabet `A–Za–z0–9`), `${{ uuid() }}`, `${{ port() }}` (20000–29999, unused on the target server); evaluated once at write time by the API (`source = generated`), stored encrypted, never re-evaluated.
- **Resolver (`packages/shared/src/variables/resolve.ts`, pure):** builds a graph of `(scope, key) → referenced (scope, key)`; DFS with colours; a back edge yields `VARIABLE_REF_CYCLE` with the path rendered `api.DATABASE_URL → postgres.DATABASE_URL → api.DATABASE_URL`; otherwise resolves in topological order with string substitution; platform variables are injected as leaves from the compiler's context.
- **Platform variables:** B13 list produced by the compiler per container: `PORT` (target port or 8080 default), `LUMEN_PROJECT_ID`, `LUMEN_PROJECT_NAME`, `LUMEN_ENVIRONMENT_ID`, `LUMEN_ENVIRONMENT_NAME`, `LUMEN_SERVICE_ID`, `LUMEN_SERVICE_NAME`, `LUMEN_DEPLOYMENT_ID`, `LUMEN_REPLICA_ID` (agent), `LUMEN_SERVER_NAME` (agent), `LUMEN_REGION`, `LUMEN_PUBLIC_DOMAIN`, `LUMEN_PRIVATE_DOMAIN` (`<service>.<environment>.lumen.internal`), `LUMEN_GIT_COMMIT_SHA`, `LUMEN_GIT_BRANCH`, `LUMEN_GIT_REPO`, `LUMEN_GIT_COMMIT_MESSAGE`, `LUMEN_GIT_AUTHOR`, `LUMEN_VOLUME_MOUNT_PATH` (agent), `LUMEN_TCP_PROXY_DOMAIN`, `LUMEN_TCP_PROXY_PORT`; user variables cannot shadow them (`VALIDATION_FAILED`).
- **Files:** `packages/shared/src/crypto/envelope.ts`, `packages/shared/src/variables/{grammar.ts,resolve.ts,generators.ts,platform.ts}`, `apps/api/src/routes/variables/*.ts`, `apps/api/src/services/variables/*.ts`, `apps/api/src/cli/lumen-admin/{rotate-master-key.ts,rotate-project-key.ts}`.
- **Done when:** property tests show encrypt→decrypt identity and AAD tampering failure; rotation tests decrypt every value after both rotations; resolver tests cover chains of 5, diamonds, self-references, cycles of 2 and 3 with the exact path string, missing targets, generators' ranges and alphabets; sealed values never appear in any response body (a test greps every variables response).

### 4.7 Desired-state compiler
- **What:** A pure function from the database view of an environment to one `DesiredState` per server.
- **Signature:** `compile(input: EnvironmentSnapshot): Map<serverId, DesiredStateDoc>` where `EnvironmentSnapshot` = project, environment, servers, service instances with their active or target deployment (image digest), decrypted and resolved variables, volumes, domains, tcp proxies, placement; loaded by `loadSnapshot(environmentId)` in one transaction.
- **Rules:** one `NetworkSpec` per environment per server; one `ContainerSpec` per instance × placement replica with `id = <service_instance_id>-r<n>` and `spec_hash = sha256(canonical JSON of the spec without env values || sha256(sorted env))` so a variable change changes the hash without exposing values; `RouteSpec` per instance with hostnames from `domains` (Phase 07) or, in this phase, the generated placeholder `<service>-<env>-<4char>.<base_domain>` from `instance_settings.base_domain`; `VolumeSpec` per volume on that server with `Mount`s on the owning container; `desired_status = stopped` → container spec kept with `STOPPED` so the agent stops it rather than deleting it; instances without a deployment yet compile to nothing; `content_hash = sha256(canonical document)`.
- **Storage and push:** `desired_states` gets a new row only when `content_hash` changes; `version = previous + 1`; the gateway sends `DesiredState` to the connected agent and re-sends on reconnect if `applied_version_reported < version`; `ActualState.version_applied` updates the row.
- **Files:** `apps/api/src/compiler/{compile.ts,snapshot.ts,hash.ts,canonical.ts,types.ts}`, `apps/api/src/compiler/compile.test.ts` with golden fixtures (`apps/api/src/compiler/fixtures/*.json`).
- **Done when:** golden tests cover: one service, service + database with references, two servers with placement `[{a,2},{b,1}]`, stopped service, volume mount, sealed variable (hash changes, value absent from the document diff output), and idempotency (same input → same hash twice).

### 4.8 Deployments: state machine, orchestration, logs
- **What:** The control-plane half of B4.
- **State machine (`apps/api/src/services/deployments/state-machine.ts`):**
  ```
  QUEUED → INITIALIZING → BUILDING → PRE_DEPLOY → DEPLOYING → HEALTHCHECKING → ACTIVE
  any pre-ACTIVE → FAILED (error_code) | CANCELLED (user or superseded) | SKIPPED (watch paths, Phase 06)
  ACTIVE → SUPERSEDED (newer ACTIVE) → REMOVED (agent reported old container removed)
  ACTIVE → CRASHED | SLEEPING (Phase 16) | STOPPED
  ```
  Transitions are a checked table; illegal transitions throw `INTERNAL_ERROR` and are logged with both states. Every transition sets timestamps (`started_at` on INITIALIZING, `build_finished_at`, `finished_at`) and emits `deployment.status`.
- **Orchestration worker (`deploy.orchestrate`, job key = deployment id, graphile-worker):** load instance → snapshot config and variables (`config_snapshot`, `variables_snapshot_enc`, `variable_keys`) → resolve references (`VARIABLE_REF_*` → FAILED before touching the agent) → choose the build server (`placement[0].server_id` or the server labelled `build`) → if `source_type = image`: skip to compile; else send `BuildRequest` and move to BUILDING → on `BuildResult` success set `image_digest`, compile and push desired state → subsequent `DeployEvent`s move PRE_DEPLOY → DEPLOYING → HEALTHCHECKING → ACTIVE; on ACTIVE set `service_instances.active_deployment_id`, mark the previous ACTIVE `SUPERSEDED`, and on `REMOVED_OLD` mark it `REMOVED`; `FAILED` carries `error_code` from the agent and `error_details.first_error_line_seq`.
- **Superseding:** `POST /services/:id/deploy` cancels any deployment of the same instance in `QUEUED|INITIALIZING|BUILDING` (`CANCELLED`, sends `BuildCancel`), and a deployment in `PRE_DEPLOY|DEPLOYING|HEALTHCHECKING` is superseded by pushing a desired state that references the new deployment (the agent cancels at its next checkpoint).
- **Endpoints:** `GET /services/:id/deployments` (cursor pagination, 50), `POST /services/:id/deploy` (`{trigger, note?, commit_sha?, image?}`), `GET /deployments/:id`, `POST /deployments/:id/cancel`, `POST /deployments/:id/redeploy` (same snapshot, new build), `POST /deployments/:id/rollback` (`{restore_variables: false}` default; reuses the recorded `image_digest`, `config_snapshot`, and optionally `variables_snapshot_enc`; trigger `rollback`, `rollback_of`), `GET /deployments/:id/logs?phase=build|deploy&after_seq=` (from `deployment_logs`), plus `POST /services/:id/restart` (`ContainerAction{RESTART}`) and `POST /services/:id/stop|start` (`desired_status`).
- **Log persistence:** the gateway handler inserts `BuildEvent.lines` and `DeployEvent` messages into `deployment_logs` in batches of up to 500 rows per 100 ms per deployment, then `NOTIFY`s `deployment:<id>:logs` with the seq range.
- **Files:** `apps/api/src/services/deployments/{state-machine.ts,orchestrate.ts,rollback.ts,supersede.ts}`, `apps/api/src/workers/{deploy-orchestrate.ts,deployment-logs-partitions.ts,cleanup.ts}`, `apps/api/src/routes/deployments/*.ts`, `apps/api/src/workers/runner.ts` (graphile-worker setup, concurrency 4, crontab file).
- **Done when:** the state-machine test enumerates every legal and illegal transition; the orchestration test (agent fake) runs image and git deploys to ACTIVE, a build failure to FAILED with the code, a superseded queued build to CANCELLED, and a rollback that restores the previous digest.

### 4.9 Agent gateway generalisation
- **What:** Replace the Phase 02 minimal handlers with the full dispatcher for every Phase 03 message.
- **Details:** `apps/api/src/gateway/dispatch.ts` switches on `Envelope.body` after signature, sequence and skew checks; `protocol_version` 1 supported now, and the dispatcher is written with a per-version decoder table so N-1 support is a table entry when version 2 arrives; `agent_ops` records every outbound imperative op and marks acks/errors/timeouts (60 s); `ActualState` updates `desired_states.applied_version_reported`, container states in an in-memory map mirrored to `service_instances.runtime_state jsonb` (status, health, restarts, detected ports, per container) and emits `service.status`; `MetricsBatch` samples update `servers.last_host_sample` and an in-memory 1 h ring per container for `GET /services/:id/metrics?range=1h` (rollups are Phase 08); `LogSubscribe`/`LogChunk` bridges to `/v1/ws` subscribers with per-subscriber backpressure (drop oldest, `truncated` flag); socket ownership across API replicas via `servers.gateway_instance_id` with a 15 s lease so a second replica can forward ops through `NOTIFY gateway_forward:<instance>`.
- **Files:** `apps/api/src/gateway/{dispatch.ts,decoders/v1.ts,ops.ts,handlers/*.ts,forward.ts}`, delete `apps/api/src/dev/agent-driver/` once `compile.test.ts` and the e2e test pass.
- **Done when:** a compatibility test runs the Phase 03 agent build against this gateway with recorded message sequences; the dev driver is removed; two API instances in the test both route an op to the one holding the socket.

### 4.10 Realtime fan-out
- **What:** One WebSocket per browser tab or CLI, many subscriptions.
- **Protocol (`/v1/ws`, authenticated by cookie or bearer):** client → `{"op":"subscribe","topics":["project:<id>","deployment:<id>:logs"]}` / `{"op":"unsubscribe",…}` / `{"op":"ping"}`; server → `{"topic","event","data","ts","seq"}` and `{"op":"subscribed","topics":[…]}` / `{"op":"error","code":"PERMISSION_DENIED","topic"}`; every subscribe is authorised by resolving the topic's workspace/project and checking `project.view`; topics: `workspace:<id>` (servers, members), `project:<id>` (services, environments, canvas), `environment:<id>` (variables keys, staged), `service:<id>` (status, runtime state), `deployment:<id>` (status), `deployment:<id>:logs`, `server:<id>` (status, checklist), `server:<id>:metrics`, `service:<id>:logs` (runtime tail, bridged to `LogSubscribe`), `user:<id>` (notifications).
- **Transport:** every API instance runs one `LISTEN lumen_events`; publishers call `notify('lumen_events', json)` with payloads ≤ 7,500 bytes; larger events send `{ref: <table>, id}` and subscribers fetch; delivery is at-most-once with `seq` so clients can detect gaps and refetch; per-socket send queue 1,000 messages, close `4008` when exceeded; heartbeats every 25 s.
- **Files:** `apps/api/src/realtime/{server.ts,topics.ts,authorize.ts,publish.ts,listener.ts}`, `packages/shared/src/realtime/events.ts` (typed event names and payloads shared with the web app).
- **Done when:** the latency test measures `deployment.status` write → client receipt < 1 s at p95 with 200 sockets (k6-ws); unauthorised topics are refused; a `NOTIFY` payload over the limit takes the `ref` path.

### 4.11 OpenAPI and docs page
- **What:** Generate the OpenAPI 3.1 document from the Zod route definitions (`@hono/zod-openapi`), serve it at `/v1/openapi.json`, render docs at `/v1/docs` (Scalar, MIT — verify at build time), and write `packages/shared/openapi.json` in CI so Phase 14 can generate the Go client.
- **Files:** `apps/api/src/openapi/{registry.ts,serve.ts}`, `apps/api/scripts/export-openapi.ts`, CI step `pnpm openapi:check` that fails when the committed document is stale.
- **Done when:** every route in this phase appears with request/response schemas and error responses; the document validates with `@redocly/cli lint`.

### 4.12 End-to-end API deploy and performance checks
- **What:** The phase's acceptance test and budgets.
- **Files:** `e2e/api/deploy-flow.spec.ts` (signup → workspace → project → server from Phase 02 harness → database service → web service with `${{ postgres.DATABASE_URL }}` → deploy → poll to ACTIVE → HTTP 200 via Caddy → rollback → viewer refused), `e2e/api/perf.k6.js` (CRUD p95 < 100 ms at 50 VUs), `deploy/docker-compose.dev.yml` memory readings.
- **Done when:** the flow passes against a Multipass VM and a real VM; p95 recorded; idle RSS of api + workers + web + Postgres recorded and < 512 MB.

## 5. Detail checklist

### Protocol design
- The gateway is the only writer of `desired_states` pushes; the compiler is the only producer; both are idempotent by `content_hash`.
- Every outbound imperative op is recorded before sending and resolved by exactly one of ack/result/error/timeout; retries reuse the same `op_id` so the agent de-duplicates.
- Decoders are versioned per `protocol_version`; adding version 2 must not touch version 1 handlers (a test pins the v1 decoder against recorded fixtures).
- Realtime events carry a monotonic `seq` per topic so the web client can refetch on gaps instead of trusting order.

### Security
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, session ids hashed at rest, rolling and absolute expiry, revocation list checked on every request (one indexed query, cached 5 s per session).
- CSRF header + origin check on all cookie-authenticated mutations and on the WebSocket upgrade.
- Rate limits on every auth route and on `POST /deploy` (60/min per workspace) and `reveal` (30/min per user).
- RBAC on every route (the matrix test fails on any unregistered route); tokens intersect scopes with role; per-project overrides resolved in the same query.
- Secrets: values encrypted with per-project data keys under a master key; sealed values never leave the server; `variables_snapshot_enc` follows the same envelope; the audit log, error details, realtime events and logs are all covered by a denylist test for value leakage.
- Password hashing parameters recorded; breached-password check; identical responses for unknown vs wrong password; constant-time comparisons for tokens.
- No raw SQL from user input; Drizzle parameterises everything; `hostname`, `image`, `repo_full_name` validated by strict regexes to block SSRF-style values before they reach agents or Phase 06/07 clients.
- Instance-admin routes are a separate router (`/admin`) that this phase only stubs; workspace routes never consult `is_instance_admin`.
- `audit_log` is append-only at the database role level.

### Data integrity & idempotency
- Migrations forward-only, no renames, `IF NOT EXISTS`; partitions created ahead of time so a missed worker run never loses log inserts (a default partition catches stragglers).
- `POST /deploy` is idempotent per `Idempotency-Key` header for 24 h (stored in `agent_ops`-style table `idempotency_keys`), returning the original deployment.
- Deployment transitions are checked; concurrent `BuildResult` and `cancel` resolve by row-level lock on the deployment.
- Staged changes are per user per environment and survive reloads; `apply` validates against the current state and reports conflicts (`STAGED_CONFLICT`) instead of overwriting.
- Compiler output is deterministic (canonical JSON, sorted keys, stable ordering by id) so hashes are reproducible across replicas.

### Failure modes
- Agent offline during deploy: the deployment stays in its state with a `waiting for server` note; `AGENT_OFFLINE` after 60 s without heartbeat, deployment `FAILED` after 15 min, and the desired state is delivered on reconnect.
- Worker crash mid-orchestration: graphile-worker retries the job (max 5, backoff); every step is resumable from the deployment row's state.
- Postgres restart: LISTEN reconnects with backoff; clients see `seq` gaps and refetch; sessions continue.
- Master key missing or wrong at boot: the API refuses to start with a clear message rather than serving with broken decryption.
- Compiler error for one environment does not block others; the error is attached to the deployment and shown as a catalog card.

### Observability
- Structured request logs (`request_id`, route, status, duration, principal kind) with 1 % sampling of successes and 100 % of errors; slow query log > 50 ms; worker job metrics (queued, running, failed by name); gateway and realtime metrics from Phase 02 extended with subscribers per topic.
- `/healthz` (process) and `/readyz` (database + LISTEN + worker heartbeat) for the installer and updater (Phase 11).

### Performance
- API p95 (CRUD) < 100 ms at 50 VUs (B14) with indexes covering every list route's filter and sort; N+1 queries forbidden (a test counts queries per route with a Drizzle logger and fails above a checked-in budget).
- Control plane idle < 512 MB total; api + workers target < 180 MB combined; Node flags `--max-old-space-size=256`.
- Status change → visible < 1 s: gateway handler → `NOTIFY` → socket in one hop; `deployment_logs` inserts batched so log floods do not delay status events (separate worker queue lanes).
- Compiler for 100 services < 200 ms; realtime fan-out 200 sockets × 10 events/s without backlog.

### Copy
- Every error in the catalog for this phase has C9 copy: `PERMISSION_DENIED` "You need the Member role to do that. Ask an admin.", `NOT_FOUND` "This project doesn't exist or you don't have access.", `VARIABLE_REF_CYCLE` "Variables reference each other in a loop: api.DATABASE_URL → postgres.DATABASE_URL → api.DATABASE_URL.", `VARIABLE_REF_MISSING` "`DATABASE_URL` references `postgres.DATABASE_URL`, which doesn't exist.", `RATE_LIMITED` "Too many attempts. Try again in 42 seconds.", `STAGED_CONFLICT` "Someone changed this while you were editing. Review the differences."

### States
- Deployment status vocabulary matches B4 exactly and the C4 status language mapping is exported from `packages/shared/src/status.ts` for the UI.

## 6. Acceptance criteria
- [ ] An end-to-end API test creates a project → service → variables → deploy, and it goes live on a VM. (Part F Phase 4 AC)
- [ ] The RBAC test matrix passes for every registered route × role × token scope. (Part F Phase 4 AC, D11)
- [ ] A reference cycle blocks the deploy with an error naming the cycle; a missing reference blocks with the missing target named. (D3)
- [ ] Service, shared and platform variables; generators; sealed variables; `.env` import/export through the API. (D3, UI parts in Phase 05/10)
- [ ] Sealed values are never returned by any endpoint, event, log or audit entry (denylist test).
- [ ] Master-key and project-key rotation succeed with every value decrypting afterwards.
- [ ] Every mutating route writes an audit entry; `audit_log` is append-only.
- [ ] Sessions: cookie flags, rolling/absolute expiry, revocation; CSRF enforced; auth rate limits return `429` with `Retry-After`.
- [ ] Deployment state machine: every legal transition tested, every illegal one rejected; superseding cancels older queued builds; rollback restores digest and config (variables optional).
- [ ] Compiler golden tests pass and output is deterministic.
- [ ] Realtime: `deployment.status` and `service.status` reach subscribed clients in < 1 s p95; unauthorised topics refused.
- [ ] OpenAPI document covers every route and lints clean; `/v1/docs` renders.
- [ ] API p95 (CRUD) < 100 ms; control plane idle < 512 MB.
- [ ] `deployment_logs` partitions are created ahead and dropped after 90 days.

## 7. Test plan
- **Unit:** envelope encryption (identity, AAD tampering, rotation), reference grammar and resolver (chains, diamonds, cycles with exact path strings, missing, generators), permission matrix, state machine table, compiler goldens, canonical JSON, rate-limit window arithmetic, error mapping.
- **Integration (testcontainers Postgres):** every route's success/validation/404/RBAC; auth flows including expiry and reuse; staged changes apply and conflict; orchestration with a fake agent; gateway dispatch with recorded Phase 03 sequences; partition worker with a fake clock; audit denylist; query-count budgets.
- **E2E (VM harness):** `e2e/api/deploy-flow.spec.ts` against a Multipass VM (Phase 02 installer) with image and git deploys, rollback, viewer refusal.
- **Visual regression:** none.
- **Accessibility:** none (the `/v1/docs` page is third-party; note its axe result in PROGRESS).
- **Manual / on a real VM:** the same flow on a real Ubuntu VM; k6 CRUD p95; memory readings after 30 min idle; `lumen-admin rotate-master-key` on a populated database.

## 8. Evidence required to close
- e2e flow transcript with the deployment reaching `ACTIVE` and the HTTP 200 through Caddy on a real VM.
- RBAC matrix test output listing every route.
- k6 summary (p95) and `docker stats` idle memory table for web, api, workers, Postgres.
- Rotation command output and the post-rotation decrypt test result.
- Realtime latency histogram (200 sockets).
- `pnpm openapi:check` and Redocly lint output.
- Vitest and integration outputs; migration run logs on empty and migrated databases.

## 9. Review
Fable 5.1 reviews the CRUD/OpenAPI work with SPEC H1; Opus 5.5 reviews the schema, crypto, RBAC and compiler with H1; then run SPEC H4 (required at the end of Phase 04). Probe: any route missing `requirePermission`; any code path decrypting a sealed value outside the compiler; token scope intersection; CSRF exemptions; idempotency of `POST /deploy` under retries; the compiler's hash including env values only via the sorted-hash trick; `NOTIFY` payload size handling; partition gaps; whether two API replicas can both push a desired state; N+1 queries on list routes.

## 10. Risks & open questions
- **Risk:** the schema is created in full now and later phases discover missing columns → **Mitigation:** additive migrations only; the README bans renames; each later phase lists its migrations.
- **Risk:** argon2id at OWASP-minimum parameters is weaker than the 64 MiB setting → **Mitigation:** parameters are constants in one file with a migration path (rehash on next login when parameters change); rate limits and breached-password checks compensate; decision recorded.
- **Risk:** graphile-worker's polling plus LISTEN adds idle load on a 2 GB VM → **Mitigation:** measure idle RSS and Postgres connections (cap pool at 8 for api, 4 for workers); pg-boss remains the documented alternative.
- **Risk:** `NOTIFY` payload limit truncates large events → **Mitigation:** the `ref` path with fetch, tested.
- **Open question:** B6 lacks `project_members`, `project_keys`, `desired_states`, `agent_ops`, `notifications`, `rate_limits`; default: add them here and record in DECISIONS as spec additions.
- **Open question:** `self.KEY` in references (J4 uses it in templates) is not in B7's list; default: support it in the grammar.
- **Open question:** queue choice — default graphile-worker (MIT, LISTEN/NOTIFY pickup under 100 ms for the status budget, `job_key` de-duplication, built-in crontab, small footprint); pg-boss (MIT, polling, richer scheduling/archival) rejected for latency; recorded in DECISIONS.
- **Open question:** whether `PATCH /services/:id` should stage by default at the API level or leave staging to the client; default: the API stages (so CLI and MCP get staging for free) with `apply=immediately` as the escape hatch matching the user preference in C7.21.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps; dev driver removed)
- [ ] `docs/DECISIONS.md` entries added: schema additions, UUIDv7, argon2id parameters, session and CSRF design, envelope encryption format and rotation, reference grammar incl. `self.`, generators evaluated at write time, graphile-worker, realtime topic scheme and `ref` overflow, Scalar for docs, staging at the API level
- [ ] `docs/UI_DECISIONS.md` unchanged (no UI)
- [ ] Cross-model review (H1 both directions) and architecture review (H4) done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 04 — Control plane core</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-04-control-plane.md,
and these SPEC sections: B2, B4, B5, B6, B7, B12, B13, B14, D3, D11, J1, J6, J7.
</context>
<goal>Through the API alone, a user signs up, creates a project, adds a database and a web service whose variables reference it, deploys, and sees it ACTIVE on a real server, while a viewer is refused every write.</goal>
<scope>
- Full B6 schema in Drizzle (+ project_members, project_keys, desired_states, agent_ops, notifications, rate_limits), forward-only migrations, monthly deployment_logs partitions with 90-day retention
- Auth: argon2id, hashed sessions with HttpOnly/Secure/SameSite=Lax cookies, verification, reset, CSRF header + origin, auth rate limits, login audit, API tokens with scopes
- RBAC middleware from the D11 matrix with per-project overrides; route × role matrix test; audit log on every mutation (append-only)
- CRUD: workspaces, members, projects (+ canvas PUT), environments, services + service instances, variables (service/shared/platform; AES-256-GCM envelope; sealed; references with cycle detection; generators), staged changes, deployments (deploy/cancel/redeploy/rollback/logs), restart/stop/start, runtime logs and live metrics proxies
- Desired-state compiler (pure, deterministic, content-hashed) → desired_states → gateway push
- Deployment state machine + graphile-worker orchestration + deployment_logs persistence; superseding
- Agent gateway dispatcher for all Phase 03 messages with versioned decoders and op tracking; remove the dev driver
- Realtime /v1/ws multiplexed topics over LISTEN/NOTIFY with per-topic authorisation
- OpenAPI from Zod at /v1/openapi.json + /v1/docs; committed packages/shared/openapi.json
- lumen-admin rotate-master-key / rotate-project-key
- e2e API deploy flow on a real VM; k6 p95; idle memory check
</scope>
<out_of_scope>
- Any UI (05); GitHub (06); domains/TLS/TCP/HTTP logs (07); rollups/notifications/webhooks workers (08); backups (09); PR envs/sync/lumen.toml/compose import (10); setup wizard (11); multi-server replicas (12); templates beyond built-in database definitions (13); MCP and token rate limits (14); invites/2FA/passkeys (15); cron/sleep (16)
</out_of_scope>
<acceptance_criteria>
See docs/phases/PHASE-04-control-plane.md §6: e2e API deploy to ACTIVE on a VM; RBAC matrix passes for every route; reference cycle and missing reference block deploys with named paths; sealed values never leave the server (denylist test); rotations succeed; audit on every mutation; cookie/CSRF/rate-limit behaviour; state machine and superseding; compiler goldens deterministic; realtime < 1s p95; OpenAPI complete and lint-clean; API p95 < 100 ms; control plane idle < 512 MB; partitions created/dropped.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, schema and protocol changes, risks (argon2 params vs RAM budget, queue choice, NOTIFY size), test plan, open questions (spec table additions, self. references, API-level staging). STOP and wait for approval.
2. Implement in small steps; run Vitest + testcontainers integration after each step; keep the RBAC matrix test green as routes are added.
3. Run the e2e API deploy flow on a Multipass VM, then a real VM; run k6 and record memory.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md; request H1 (both directions) and H4 reviews.
</process>
```
