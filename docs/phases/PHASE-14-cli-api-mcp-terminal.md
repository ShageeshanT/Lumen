# Phase 14 — CLI, API, MCP, terminal

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (token scopes, rate limits, tunnel and exec relay, MCP auth get a security pass) |
| **Depends on** | Phase 3 (agent `ExecOpen`/`ExecData`/`ExecResize`/`ExecClose`, build from an uploaded archive), Phase 4 (public API, OpenAPI from Zod, sessions, RBAC, audit), Phase 5 (inspector, overflow menu "Open shell"), Phase 8 (log streaming and metrics routes the CLI and MCP read), Phase 9 (tunnel relay endpoint for `lumen connect`, `lumen volume backup/restore` routes), Phase 13 (`POST /v1/templates/:slug/deploy` for `lumen template deploy` and the MCP tool) |
| **Unblocks** | Phase 15 (account API tokens page reuses the token components; per-project token overrides), Phase 16 (`lumen server add` with cloud provisioning), Phase 18 (release pipeline signs CLI binaries; docs site embeds the API reference) |
| **Spec sections** | SPEC B5 (`ExecOpen`, `ExecData`, `ExecResize`, `ExecClose`), B6 (`api_tokens`, `audit_log`), B7 (sealed variables), B8 (local upload `lumen up`, `.lumenignore`), B12 (web security, rate limits), B14 (API p95 < 100 ms), C4, C5 (Code block / terminal, Copy field, Secret field, Kbd), C7.21 (API tokens), C7.25, C8.6, C9, C10, C11, C12, C13, D10, J1, J2, J6 |
| **Estimated sessions** | 9 focused sessions: (1) API tokens + scopes + rate limits, (2) OpenAPI docs page + generated Go client, (3) CLI scaffold, config, login, link, (4) `up`, `deploy`, `logs`, `status`, `variables`, `run`, (5) `shell`, `connect`, tunnels, (6) remaining J2 commands, completion, upgrade, install scripts, (7) MCP server + the Claude deploy test, (8) web terminal, (9) screenshots, docs, review fixes |

## 1. Goal
A developer runs `lumen login`, `lumen link` and `lumen up` from a folder that is not in Git and sees it live on HTTPS; runs `lumen logs --follow`, `lumen shell` and `lumen connect postgres` without exposing anything publicly; creates a scoped API token and calls the documented REST API from a script; and points Claude at the instance's MCP endpoint so it can deploy a template and read its logs, while a user in the dashboard opens a live shell into any container with one click.

## 2. Why this phase exists
The dashboard is the front door, but power users, scripts and AI agents need the same capabilities without a browser, and the spec makes that cheap by design: the web app talks only to the public API (B2), so every feature already exists as an endpoint. This phase turns those endpoints into three more surfaces (CLI, documented REST API with scoped tokens, MCP) and adds the two interactive relays (exec and tunnel) that make "I can't SSH into my container" and "I can't reach my database from my laptop" stop being support tickets.

Scoped tokens and rate limits are the security backbone of everything here: a token that can read logs must not be able to set variables, a token scoped to a staging environment must not touch production, and an MCP client that goes into a loop must not take the control plane down. Those rules are cheap to get right now and expensive to retrofit, which is why the reviewer for this phase is Fable 5.1.

Feature parity target: a CLI with login, link, up, logs, variables, run, shell and connect; a documented API with token scopes; an MCP server that lets an AI assistant operate the platform, structurally comparable to mature platforms. Command names follow J2 and the product's own voice; no other product's command vocabulary or docs copy is reproduced.

## 3. Scope
### In scope
- API tokens (`api_tokens`): owner user / workspace / project, optional environment scope, named scopes, hashed storage, prefix display, `last_used_at`, expiry, revoke; token management UI in Account, Workspace and Project settings (C7.16 Tokens, C7.21 API tokens).
- Bearer authentication on every `/v1` route with scope enforcement layered on RBAC.
- Rate limits per token and per IP with standard headers and a `429` from the error catalog.
- OpenAPI document generated from Zod (Phase 4) completed for every J1 route, and a documentation page at `/docs/api`.
- Generated Go client from the OpenAPI document for the CLI.
- The Go CLI with every J2 command: `login`, `logout`, `whoami`, `init`, `link`, `unlink`, `status`, `up [--detach]`, `deploy [--service]`, `redeploy`, `rollback [deployment]`, `down`, `logs [--build|--http] [--filter] [--follow]`, `variables [list|set|unset|import|export]`, `run -- <cmd>`, `shell [--replica]`, `connect <db-service>`, `domain [list|add|remove]`, `environment [list|new|use|delete]`, `service [list|use|create]`, `volume [list|backup|restore]`, `server [list|add|remove]`, `template deploy <slug>`, `open`, `docs`, `completion`, `upgrade`; human output and `--json` on every read command.
- `lumen login` via the browser (localhost callback) with a `--token` fallback for headless machines; multi-instance profiles.
- Project linking (`.lumen/link.json`) and `lumen init` creating a project.
- `lumen up`: local directory archive respecting `.gitignore` and `.lumenignore`, upload endpoint, build-server fetch, deployment with `trigger = cli` and `source_type = local_upload`.
- `lumen run`: run a local command with the service's variables injected (non-sealed).
- `lumen shell` and `lumen connect <db>` over the API WebSocket relays (exec and tunnel) with no public exposure.
- Install scripts: `curl | sh` for Linux and macOS, Homebrew tap, Scoop bucket, Windows PowerShell installer; `lumen upgrade`; shell completion for bash, zsh, fish and PowerShell.
- MCP server at `/mcp` (Streamable HTTP transport) authenticated by API token, exposing tools to list projects and services, deploy, redeploy, rollback, read logs, read metrics, set variables, add a database, deploy a template and add a domain, each with a Zod input schema and a required scope; a documented test where a Claude model deploys a template and reads its logs.
- Web terminal (C7.25): "Open shell" from the inspector overflow menu and the command palette; xterm.js dock with replica and shell pickers, copy/paste, resize, reconnect, and the live-container banner.
- User docs for the CLI, the API and MCP setup.

### Out of scope
- Cloud provisioning behind `lumen server add` (Phase 16; this phase ships the command with the join-token flow only).
- Token rotation policies and SSO (Phase 15 for account security, later for SSO).
- The docs site build and hosting (Phase 18; this phase writes the markdown).
- Signed release binaries and the release pipeline (Phase 18; this phase ships a `goreleaser` config and unsigned dev builds).
- A TUI dashboard mode for the CLI.

## 4. Work breakdown

### 4.1 API tokens: schema, format, routes
- **What:** `api_tokens(id, owner_kind user|workspace|project, owner_id, scope_environment_id?, name, token_prefix, token_hash, scopes[], last_used_at, expires_at, created_by, revoked_at)`. Token format `lumen_<owner letter u|w|p>_<8-char prefix>_<32 bytes base64url>`; only the SHA-256 hash is stored; the prefix is shown in lists; the full token is shown exactly once in a Copy field after creation. Scopes (string enum): `read` (projects, services, deployments, logs, metrics, domains, volumes, templates), `deploy` (deploy, redeploy, rollback, cancel, staged apply), `variables:read`, `variables:write`, `services:write` (create, update, delete services and volumes, domains, TCP proxies), `servers:write`, `workspace:admin` (members, tokens, channels, destinations), `shell` (exec and tunnels). Routes: `GET/POST/DELETE /v1/tokens` with `?owner=` filtering, RBAC: user tokens by the user, workspace tokens by admins, project tokens by members. `last_used_at` is updated at most once per minute per token to avoid write amplification. Expiry choices in the UI: 7 days, 30 days, 90 days, 1 year, no expiry.
- **Files:** `packages/db/src/schema/api_tokens.ts` (extend Phase 4's table), `apps/api/src/auth/tokens.ts` (generate, hash, verify), `apps/api/src/auth/scopes.ts` (scope enum, route → scope map), `apps/api/src/routes/tokens.ts`, `apps/api/src/routes/tokens.test.ts`, `apps/api/src/auth/scopes.test.ts`.
- **Done when:** the scope map covers every J1 route (a test iterates the OpenAPI paths and fails on any route without a scope), a token with `read` only gets `403 TOKEN_SCOPE` on a deploy, and an environment-scoped token gets `403` on another environment.

### 4.2 Bearer auth middleware and audit
- **What:** The auth middleware accepts a session cookie or `Authorization: Bearer lumen_…`; a token resolves to an actor (`{kind: token, token_id, owner, scopes, environment_id?}`) and the effective RBAC role is the intersection of the owner's role and the token's scopes; every mutation's audit row records `actor_token_id` and the token name.
- **Files:** `apps/api/src/auth/middleware.ts`, `apps/api/src/auth/actor.ts`, `apps/api/src/audit/log.ts` (token fields), `apps/api/src/auth/middleware.test.ts`.
- **Done when:** the RBAC matrix test from Phase 4 runs a second time with token actors for every role × scope combination and passes.

### 4.3 Rate limits
- **What:** In-process sliding-window limiter (the control plane runs one API process; record the single-instance assumption and the Postgres-backed fallback design in DECISIONS.md). Buckets: `auth` 10 requests/min per IP on login, signup, reset and 2FA; `api` 600 requests/min per token or session (120/min per IP for unauthenticated routes); `deploy` 30 requests/min per token; `logs` 60 queries/min per token; `mcp` 120 tool calls/min per token; `upload` 10/hour per token. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (unix seconds) and a `429` with `Retry-After` and the catalog error `RATE_LIMITED` ("You're sending requests too quickly" / "Wait 12 seconds and try again"). The realtime WebSocket applies a message-rate cap of 100/s per connection.
- **Files:** `apps/api/src/ratelimit/limiter.ts`, `apps/api/src/ratelimit/buckets.ts`, `apps/api/src/ratelimit/middleware.ts`, `apps/api/src/ratelimit/limiter.test.ts` (with a mocked clock), `packages/shared/src/errors/catalog.ts` (`RATE_LIMITED`, `TOKEN_SCOPE`, `TOKEN_EXPIRED`).
- **Done when:** the limiter test proves the window math; an integration test hits the `api` bucket and sees the headers and the `429` body.

### 4.4 OpenAPI completeness and the docs page
- **What:** Audit every J1 route for a Zod request and response schema, an `operationId`, a summary in plain language, tags per resource, `x-scope` (required token scope) and example bodies. Serve `GET /v1/openapi.json`. Render `/docs/api` in the web app with Scalar API Reference (MIT; alternative Redoc, MIT), themed with Lumen tokens (dark and light), sidebar grouped by tag, a "Try it" panel that uses the current session or a pasted token, and a top card explaining authentication (`Authorization: Bearer`), scopes, rate limits and pagination. Version the document (`info.version` = API version, changelog link).
- **Files:** `apps/api/src/openapi/build.ts`, `apps/api/src/openapi/build.test.ts` (fails on any route missing schema, operationId, summary or `x-scope`), `apps/web/app/(app)/docs/api/page.tsx`, `apps/web/components/docs/ApiReference.tsx`, `apps/web/components/docs/api-theme.css`, `docs/user/api/authentication.md`, `docs/user/api/pagination.md`, `docs/user/api/errors.md`.
- **Done when:** the completeness test passes and `/docs/api` renders every route in both themes at 1440 and 390.

### 4.5 Generated Go client
- **What:** `oapi-codegen` (Apache-2.0) generates `apps/cli/internal/api/client.gen.go` from `openapi.json` in the monorepo build (`pnpm gen:client` → `go generate`); a thin wrapper adds auth headers, the instance base URL, `User-Agent: lumen-cli/<version> (<os>/<arch>)`, retries on `429` honoring `Retry-After` (max 3), and maps error bodies to the catalog's `code`, `title`, `fix`.
- **Files:** `apps/cli/internal/api/client.gen.go`, `apps/cli/internal/api/client.go`, `apps/cli/internal/api/errors.go`, `apps/cli/internal/api/client_test.go`, `apps/cli/oapi-codegen.yaml`, `turbo.json` (pipeline dependency from `apps/api#openapi` to `apps/cli#generate`).
- **Done when:** the CLI build fails if the OpenAPI document changed without regenerating (a CI diff check) and the error mapping test passes.

### 4.6 CLI scaffold, config, output
- **What:** Cobra (Apache-2.0) command tree at `apps/cli/cmd/lumen/main.go` with `internal/{api,auth,config,link,output,tunnel,upload,tui,update}`. Config at `$XDG_CONFIG_HOME/lumen/config.json` (macOS `~/Library/Application Support/lumen`, Windows `%APPDATA%\lumen`) with `profiles[]{name, instance_url, token}` and `current_profile`; the token file is `0600`; `LUMEN_TOKEN` and `LUMEN_INSTANCE` environment variables override. Output: human mode renders tables with aligned columns, status glyphs and colors only when stdout is a TTY and `NO_COLOR` is unset; `--json` prints the API response unchanged; `-q/--quiet` prints ids only. Global flags `--profile`, `--project`, `--environment`, `--service`, `--json`, `--quiet`, `--no-color`, `--yes` (skip confirmations). Exit codes: 0 success, 1 generic error, 2 usage, 3 auth, 4 not found, 5 permission, 6 rate limited, 7 deploy failed, 130 interrupted.
- **Files:** `apps/cli/cmd/lumen/main.go`, `apps/cli/internal/config/config.go`, `apps/cli/internal/config/config_test.go`, `apps/cli/internal/output/table.go`, `apps/cli/internal/output/json.go`, `apps/cli/internal/output/status.go` (C4 glyph mapping), `apps/cli/internal/output/table_test.go`, `apps/cli/internal/cmd/root.go`.
- **Done when:** `lumen --help` lists every J2 command with a one-line description in the product voice; `lumen status --json` on an unlinked directory exits 4 with the catalog error as JSON.

### 4.7 `login`, `logout`, `whoami`, profiles
- **What:** `lumen login [--instance URL] [--token]`: the CLI starts a listener on `127.0.0.1:<random port>`, prints and opens `<instance>/cli/auth?port=<port>&state=<random>&name=<hostname>`; the dashboard page (requires a session) shows "Sign in the CLI on 'Shagee's laptop'?" with the scopes it will get (a user token with `read deploy variables:read variables:write services:write shell`, 1-year expiry, named `CLI on <hostname>`) and an "Approve" button that creates the token and POSTs it to `http://127.0.0.1:<port>/callback?state=` (the CLI validates `state`, stores the token, prints "Signed in as shagee@example.com on https://lumen.example.com"). `--token` reads a token from a prompt or stdin for headless use. `logout` revokes the token server-side (`DELETE /v1/tokens/:id` by prefix) and removes it locally. `whoami` prints the user, instance and profile.
- **Files:** `apps/cli/internal/cmd/login.go`, `apps/cli/internal/cmd/logout.go`, `apps/cli/internal/cmd/whoami.go`, `apps/cli/internal/auth/browser.go`, `apps/cli/internal/auth/browser_test.go`, `apps/web/app/(app)/cli/auth/page.tsx`, `apps/web/components/cli/ApproveCliDialog.tsx`, `apps/api/src/routes/cli-auth.ts` (`POST /v1/cli/approve` creating the token with fixed scopes).
- **Done when:** e2e drives the browser approval and the CLI ends up authenticated; a mismatched `state` is rejected; `--token` works with a pasted token.

### 4.8 `init`, `link`, `unlink`, `status`, `open`, `docs`
- **What:** `.lumen/link.json` `{instance_url, project_id, environment_id, service_id?}` (gitignored by `lumen init` adding `.lumen/` to `.gitignore` with a confirmation). `init` creates a project (`--name`, defaults to the directory name) and links; `link` interactively picks workspace → project → environment → service with a fuzzy picker (`internal/tui/picker.go` using Bubble Tea, MIT) or non-interactively with flags; `unlink` removes the file; `status` prints the linked project, environment, service, active deployment (status glyph, commit, age), public URL and server; `open` opens the project canvas (or the service, or `--url` opens the public URL); `docs` opens the docs site.
- **Files:** `apps/cli/internal/link/link.go`, `apps/cli/internal/link/link_test.go`, `apps/cli/internal/cmd/{init,link,unlink,status,open,docs}.go`, `apps/cli/internal/tui/picker.go`.
- **Done when:** `lumen init && lumen status` in a fresh directory shows the project; `lumen link --project shop --environment staging --service api` links without prompts.

### 4.9 `up`: archive, upload, build from upload
- **What:** `lumen up [--detach] [--service]`: walk the directory honoring `.gitignore` (all nested ones, via `go-git`'s gitignore matcher, Apache-2.0) and `.lumenignore` (same syntax; `.lumen/`, `.git/`, `node_modules/` are always excluded unless `!` re-included), tar+gzip in a streaming pipe with a 500 MB limit (DECISIONS.md) and a progress bar (files, bytes, speed), `POST /v1/services/:id/uploads` (chunked body, `Content-Type: application/gzip`, `X-Lumen-Upload-Sha256`) stored at `/var/lib/lumen/uploads/<upload_id>.tgz` on the control plane with a 24h retention, then `POST /v1/services/:id/deploy {trigger: "cli", source: {upload_id}}`; the agent receives `BuildRequest{source: {upload_url, sha256}}` and fetches over its authenticated channel (an HTTPS URL with a one-time signed token valid 10 minutes), verifies the hash, extracts into the build context and builds with Railpack or the Dockerfile. Without `--detach` the CLI streams build then deploy logs and exits 0 on Active or 7 on failure with the error card rendered in the terminal (title, explanation, fix).
- **Files:** `apps/cli/internal/upload/archive.go`, `apps/cli/internal/upload/ignore.go`, `apps/cli/internal/upload/ignore_test.go` (vectors for nested ignores, negation, `.lumenignore` precedence), `apps/cli/internal/upload/upload.go`, `apps/cli/internal/cmd/up.go`, `apps/api/src/routes/services/uploads.ts`, `apps/api/src/uploads/store.ts`, `apps/api/src/uploads/signed-url.ts`, `apps/api/src/workers/uploads-retention.ts`, `apps/agent/internal/build/source_upload.go`, `apps/agent/internal/build/source_upload_test.go`, `packages/protocol/proto/lumen/v1/build.proto` (upload source).
- **Done when:** a Node hello-world directory without Git deploys and serves on its generated domain; a `.lumenignore` excluding `tests/` is honored (verified by listing the build context in the build log); a tampered archive fails the hash check with `BUILD_FAILED_GENERIC` and the explanation "The uploaded files didn't match. Run lumen up again."

### 4.10 `deploy`, `redeploy`, `rollback`, `down`, `logs`, `status` streaming
- **What:** `deploy [--service] [--commit SHA] [--detach]` triggers a deploy of the linked repo service and streams; `redeploy` re-deploys the active deployment; `rollback [deployment-id]` shows the last 10 deployments in a picker when no id is given and confirms ("Roll back api to a1b2c3d (Fix login redirect, 2 h ago)? [y/N]", with `--yes`); `down` stops the service (confirm); `logs [--build|--http] [--filter "level:error"] [--follow] [--since 1h] [--deployment id] [--lines 200]` streams from `GET /v1/services/:id/logs` and the realtime WebSocket, rendering timestamps in the local timezone, level colors, and JSON lines compacted (`--raw` for untouched lines); `--json` emits NDJSON.
- **Files:** `apps/cli/internal/cmd/{deploy,redeploy,rollback,down,logs}.go`, `apps/cli/internal/stream/deploy.go` (the shared build → deploy → healthcheck progress renderer with the C4 glyphs and per-step durations), `apps/cli/internal/stream/logs.go`, `apps/cli/internal/stream/ws.go` (the realtime client with reconnect and backoff 1s → 30s), `apps/cli/internal/stream/deploy_test.go`.
- **Done when:** `lumen deploy` shows the six lifecycle steps with live durations and exits with the right code; `lumen logs --follow --filter "level:error"` prints a new error line within 1s of the app printing it (B14).

### 4.11 `variables`, `run`
- **What:** `variables list` (table: Name, Value masked unless `--show`, Source), `variables set KEY=VALUE [KEY2=VALUE2…] [--sealed]` (stages and applies immediately with a redeploy unless `--no-deploy` stages only), `variables unset KEY`, `variables import .env` (parses dotenv with quotes and multiline, previews the diff, confirms), `variables export [--format dotenv|json]` (never includes sealed values; prints `KEY=` with a comment `# sealed` for them). `run -- <cmd>`: fetches the resolved non-sealed variables for the linked service and environment (`GET /v1/services/:id/variables?resolved=true`, requires `variables:read`), sets them in the child's environment along with `LUMEN_*` platform variables computed locally, executes the command with inherited stdio, and forwards signals; sealed keys are listed in a warning line "2 sealed variables weren't injected: STRIPE_KEY, JWT_SECRET".
- **Files:** `apps/cli/internal/cmd/variables.go`, `apps/cli/internal/cmd/run.go`, `apps/cli/internal/dotenv/parse.go`, `apps/cli/internal/dotenv/parse_test.go` (vectors for quotes, escapes, multiline, comments, export prefix), `apps/api/src/routes/services/variables.ts` (`?resolved=true` with sealed omission).
- **Done when:** `lumen run -- node -e "console.log(process.env.DATABASE_URL)"` prints the resolved private URL and the sealed warning; `variables import` round-trips a fixture `.env`.

### 4.12 `shell` and `connect`: exec and tunnel relays
- **What:** `shell [--replica N] [--shell /bin/bash] [-- cmd]`: `GET /v1/services/:id/exec` WebSocket (requires `shell` scope, audited with replica and shell) → agent `ExecOpen{container, cmd, tty, cols, rows}`; the CLI puts the terminal in raw mode (`golang.org/x/term`), forwards stdin/stdout as `ExecData` frames, sends `ExecResize` on `SIGWINCH`, and exits with the remote exit code; the default shell is `/bin/bash` when present else `/bin/sh` (probed by the agent). `connect <db-service> [--port 15432]`: `GET /v1/services/:id/tunnel` (Phase 9 relay) → a local listener on `127.0.0.1:<port>` (default = engine port + 10000), prints the ready-to-use local connection string with the password (from `variables:read`; sealed passwords are shown as `••••` with the note "Password is sealed. Get it from the person who set it."), and keeps running until `Ctrl+C`; multiple client connections multiplex over one WebSocket with a stream id per TCP connection. Both commands print the audit notice "This session is logged" once.
- **Files:** `apps/cli/internal/cmd/shell.go`, `apps/cli/internal/cmd/connect.go`, `apps/cli/internal/tunnel/exec.go`, `apps/cli/internal/tunnel/tcp.go`, `apps/cli/internal/tunnel/mux.go`, `apps/cli/internal/tunnel/mux_test.go`, `apps/api/src/routes/services/exec.ts`, `apps/api/src/gateway/exec-relay.ts`, `apps/api/src/gateway/tunnel-relay.ts` (multi-stream extension), `apps/agent/internal/exec/exec.go`, `apps/agent/internal/exec/exec_test.go`, `packages/protocol/proto/lumen/v1/exec.proto`.
- **Done when:** `lumen shell` runs `top` with correct resizing and exits cleanly; `lumen connect postgres` lets `psql` connect through the local port and the audit log shows both sessions; a viewer-role token gets `403`.

### 4.13 Remaining J2 commands
- **What:** `domain list|add <hostname>|remove <hostname>` (add prints the DNS record card as a table and polls `POST /v1/domains/:id/check` until green or `Ctrl+C`); `environment list|new <name> [--copy-from production|--empty]|use <name>|delete <name>`; `service list|use <name>|create --image X | --repo owner/name [--branch]`; `volume list|backup [--wait]|restore <backup-id> [--to-new]` (typed confirmation of the service name unless `--yes`); `server list|add [--name] [--provider]` (creates a join token and prints the one-line install command with the expiry) `|remove <name>` (typed confirmation); `template deploy <slug> [--new-project NAME | --here] [--input KEY=VALUE…]` (prompts for missing required inputs); `completion bash|zsh|fish|powershell`; `upgrade` (checks the release feed, downloads the matching asset, verifies SHA-256, replaces the binary atomically, prints the changelog excerpt).
- **Files:** `apps/cli/internal/cmd/{domain,environment,service,volume,server,template,completion,upgrade}.go`, `apps/cli/internal/update/update.go`, `apps/cli/internal/update/update_test.go`, `apps/cli/internal/output/dns_card.go`.
- **Done when:** every command has a Go test against a recorded API fixture and appears in `lumen --help`; `lumen domain add app.example.com` prints the record and turns green after the DNS fixture flips.

### 4.14 Install scripts and packaging
- **What:** `deploy/cli/install.sh` (detects OS and arch, downloads from the release URL, verifies SHA-256 against `checksums.txt`, installs to `/usr/local/bin` or `~/.local/bin` with a PATH hint, never uses `sudo` silently), `deploy/cli/install.ps1` (Windows, installs to `%LOCALAPPDATA%\Programs\lumen` and updates the user PATH), a Homebrew tap formula repository `homebrew-lumen` with `lumen.rb`, a Scoop bucket repository with `lumen.json`, and `apps/cli/.goreleaser.yaml` producing linux/darwin/windows × amd64/arm64 archives, checksums, and the tap and bucket updates (signing lands in Phase 18). Version embedded via `-ldflags`.
- **Files:** `deploy/cli/install.sh`, `deploy/cli/install.ps1`, `apps/cli/.goreleaser.yaml`, `apps/cli/internal/version/version.go`, the two packaging repositories, `docs/user/cli/install.md`.
- **Done when:** the install script works on Ubuntu 24.04 amd64, Debian 12 arm64, macOS arm64 and Windows 11 in the CI matrix and `lumen --version` prints the release version.

### 4.15 MCP server
- **What:** `POST /mcp` (Streamable HTTP transport from `@modelcontextprotocol/sdk`, MIT) authenticated by `Authorization: Bearer lumen_…`, rate-limited by the `mcp` bucket, audited per tool call. Tools (name · required scope · input schema summary · result):
  - `list_projects` · `read` · `{workspace?}` · projects with environments and service counts
  - `list_services` · `read` · `{project, environment?}` · services with status, public URL, active deployment
  - `get_service` · `read` · `{project, environment, service}` · config, domains, variables keys, last 5 deployments
  - `deploy` · `deploy` · `{project, environment, service, commit?}` · deployment id and a status URL
  - `redeploy` · `deploy` · `{project, environment, service}`
  - `rollback` · `deploy` · `{project, environment, service, deployment}`
  - `get_deployment` · `read` · `{deployment}` · status, timeline, error card if failed
  - `read_logs` · `read` · `{project, environment, service, mode runtime|build|http, filter?, since?, lines? (≤ 500)}` · lines (scrubbed)
  - `read_metrics` · `read` · `{project, environment, service, range 1h|6h|24h|7d|30d}` · the chart summary sentences plus a compact series
  - `set_variables` · `variables:write` · `{project, environment, service?, variables: {KEY: value}, sealed?: [KEY], deploy?: boolean}` · staged/applied result
  - `add_database` · `services:write` · `{project, environment, engine postgres|mysql|redis|mongodb, name?}` · the new service and its variable keys
  - `deploy_template` · `services:write` + `deploy` · `{slug, newProject?: {name} | project+environment, inputs?}` · created services and the canvas URL
  - `add_domain` · `services:write` · `{project, environment, service, hostname}` · the DNS record to add and a check URL
  Names in inputs resolve by slug or id; ambiguous names return a `needs_clarification` result listing candidates. Every tool result includes a `dashboard_url`. Resources: `lumen://projects/{id}` and `lumen://services/{id}` for read-only context. Prompts: `deploy-checklist` (guides an assistant through deploy → wait → read logs → report). Server metadata advertises the instance name and API version.
- **Files:** `apps/api/src/mcp/server.ts`, `apps/api/src/mcp/auth.ts`, `apps/api/src/mcp/tools/{list-projects,list-services,get-service,deploy,redeploy,rollback,get-deployment,read-logs,read-metrics,set-variables,add-database,deploy-template,add-domain}.ts`, `apps/api/src/mcp/resolve-names.ts`, `apps/api/src/mcp/resources.ts`, `apps/api/src/mcp/prompts.ts`, `apps/api/src/mcp/server.test.ts` (an in-process MCP client exercises every tool against the Phase 4 test harness), `docs/user/mcp/setup.md` (config snippets for Claude Desktop, Claude Code and a generic client, with the token creation steps).
- **Done when:** the in-process client test passes for every tool including scope denial; the documented end-to-end test (§4.16) passes.

### 4.16 The Claude deploy test
- **What:** A scripted, repeatable test: create a token with `read deploy services:write variables:write`, configure Claude Code with the instance's `/mcp` URL and the token, send the prompt "Deploy the uptime-kuma template into a new project called Monitoring, wait until it's live, then show me the last 20 log lines and the public URL", and assert from the audit log and the database that `deploy_template`, `get_deployment` (polling) and `read_logs` were called, the project exists with an Active service, and the final message contains the public URL and log lines. Record the transcript in the evidence.
- **Files:** `e2e/mcp/claude-deploy.md` (runbook with the exact prompt and expected tool sequence), `e2e/mcp/claude-deploy.spec.ts` (uses the Anthropic SDK with the MCP connector, model id from the `claude-api` skill; skipped when no API key is configured), `e2e/mcp/assert-audit.ts`.
- **Done when:** the spec passes against a real instance twice in a row and the transcript is attached.

### 4.17 Web terminal
- **What:** "Open shell" (inspector overflow menu, command palette, and the `S` shortcut inside a service per C13's pattern of single-letter actions) opens a bottom dock in the inspector (default 320px tall, resizable 200–600px, remembers height) or a full panel via an expand button. Header row: replica picker (Select, "Replica 1 of 3 · oracle-1"), shell picker (`/bin/bash` when present, `/bin/sh`), a Reconnect button, a "Copy session" button (copies the scrollback), expand/collapse, and close. Body: xterm.js (MIT) with `@xterm/addon-fit`, `@xterm/addon-web-links` (links open in a new tab with the C11 warning), `@xterm/addon-search`, themed with Lumen tokens (background `bg`, foreground `text`, cursor `accent`, selection `accent-subtle`, the ANSI palette mapped as in Phase 8), Geist Mono 13px with line-height 1.4 (dense is not offered here; a terminal needs its natural metrics). Banner above the body (dismissible per session): "You're inside a live container. Changes are lost on redeploy." Behavior: `ExecOpen` with the current `cols`/`rows`; `ExecResize` on dock resize (debounced 100ms) and window resize; paste via `⌘V`/`Ctrl+Shift+V` and the context menu; copy on selection with `⌘C`/`Ctrl+Shift+C`; `Ctrl+C` is sent to the process; on disconnect the body dims to 60% with "Disconnected · Reconnect" and Enter reconnects; on exit the footer shows "Session ended (exit 0)" with "Start a new session".
- **Files:** `apps/web/components/terminal/TerminalDock.tsx`, `apps/web/components/terminal/Terminal.tsx`, `apps/web/components/terminal/useExecSession.ts`, `apps/web/components/terminal/terminal-theme.ts`, `apps/web/components/terminal/ReplicaPicker.tsx`, `apps/web/components/terminal/ShellPicker.tsx`, `apps/web/components/terminal/LiveContainerBanner.tsx`, `apps/web/lib/realtime/exec.ts` (frames multiplexed over the single WebSocket, C8.3), `apps/web/components/terminal/Terminal.test.tsx`, `e2e/terminal/shell.spec.ts`.
- **Done when:** e2e opens a shell, runs `echo $LUMEN_SERVICE_NAME`, resizes the dock and sees `stty size` change, disconnects the agent and reconnects; screenshots exist at every width and theme.

### 4.18 Token management UI
- **What:** Account → API tokens (C7.21), Workspace settings → Tokens, Project settings → Tokens (C7.16) share `TokensSection`: a table (Name, Prefix in mono, Scopes as chips, Environment, Last used relative, Expires, Revoke), "Create token" opening a dialog (name, scopes as a checklist with one-line descriptions, environment select for project tokens, expiry select), then a one-time reveal card with the full token in a Copy field and the warning "Copy it now. We won't show it again.", and a "Use it" panel with snippets (`curl`, `lumen login --token`, MCP config JSON).
- **Files:** `apps/web/components/tokens/TokensSection.tsx`, `apps/web/components/tokens/CreateTokenDialog.tsx`, `apps/web/components/tokens/TokenRevealCard.tsx`, `apps/web/components/tokens/UseItPanel.tsx`, `apps/web/app/(app)/account/tokens/page.tsx`, `apps/web/app/(app)/w/[workspace]/settings/tokens/page.tsx`, `apps/web/app/(app)/p/[project]/settings/tokens/page.tsx`.
- **Done when:** a token created in the UI authenticates a `curl` from the snippet; revoking it produces `401 TOKEN_REVOKED` on the next call; screenshots exist for every state.

### 4.19 Screenshots, docs, review fixes
- **What:** Screenshot matrix for `/docs/api`, the token pages (empty, list, create dialog, reveal, revoke confirm), the CLI approval page, the web terminal (connecting, live, banner, resized, disconnected, ended, mobile); terminal recordings (asciinema or a GIF via the CLI test harness) of `lumen up`, `lumen logs --follow`, `lumen shell`, `lumen connect`; axe; C14 self-critique; user docs for every CLI command (`docs/user/cli/<command>.md` generated from Cobra with hand-written examples); Part H1 review by Fable 5.1 of tokens, scopes, rate limits, relays and MCP auth; Part H2 on screenshots.
- **Files:** `e2e/visual/developer-surface.spec.ts`, `e2e/a11y/developer-surface.spec.ts`, `docs/user/cli/*.md`, `docs/user/mcp/*.md`, `docs/user/api/*.md`, `docs/UI_DECISIONS.md`.
- **Done when:** every finding is fixed or tracked and every artifact is linked.

## 5. Detail checklist

### Typography
- CLI human output: tables use two-space column gaps, headers in dim (`\x1b[2m`) uppercase without bold (bold headers read as shouting in a terminal), status column with the C4 glyph then the word ("● Active"), ids in the last column, relative times right-aligned; long values truncated with `…` to the terminal width; `--json` output is stable-key-order JSON with 2-space indentation when stdout is a TTY and compact when piped.
- CLI deploy stream: one line per lifecycle step "◐ Building · 12s" updating in place on a TTY (carriage return) and appended when piped; the final line "● Live at https://api-production-a1b2.apps.example.com · 42s"; error cards render as a 2-line block "✕ Your app ran out of memory" / "  It used all of its 512 MB. Run: lumen service set --memory 1024" (the fix is a runnable command whenever one exists).
- API docs page: sidebar labels 13/500; route headings 16/600 with the method badge 11/600 uppercase mono; parameter tables table cell 13/400 with names in mono; description body 14/400; code samples 13/400 mono; the auth card title 16/600.
- Token pages: table cells 13/400, prefix in mono `lumen_u_a1b2c3d4…` text-secondary, scope chips 12/500 mono, relative time meta; reveal card token in a Copy field 13/400 mono with the warning body 14/400 on a `warning` tint; the dialog's scope descriptions caption 12/400.
- CLI approval page: title 24/600 ("Sign in the CLI?"), hostname in 14/500 mono, scopes list body 14/400 with mono keys, buttons md.
- Web terminal: Geist Mono 13px, line-height 1.4 (the terminal grid ignores the 4px rule by necessity; the dock's chrome keeps it); header controls button sm 13/500; banner body 13/400; footer status caption 12/400 mono ("Session ended (exit 0)").
- MCP docs: config JSON in 13/400 mono blocks with a copy button; tool table cells 13/400 with tool names in mono.

### Spacing & layout
- API docs page: full-bleed within the app shell (the reference needs width): sidebar 280px, content max-width 960px with 32px padding, "Try it" panel 400px docked right at ≥1440 and stacked below the route at smaller widths; route sections separated by 48px with a 1px `border`.
- Token pages: max-width 960px; table columns Name 200 · Prefix 200 · Scopes flexible · Environment 140 · Last used 120 · Expires 120 · Actions 48; row height 44px; the create dialog 560px wide with scopes in a 2-column checklist (12px row gap); the reveal card 16px padding with the Copy field full width and the "Use it" snippets below in tabs.
- CLI approval page: centered card 480px wide (C7.2 auth layout), 32px padding, the scopes list in a `surface` block with 12px padding, buttons right-aligned with 8px gap.
- Terminal dock: header 40px with 8px gaps between controls and 12px horizontal padding; banner 36px with 12px padding; body fills the dock with 8px padding inside the xterm container so glyphs never touch the border; footer 28px; the resize handle is a 4px bar with a 12px hit area at the top edge; the full-panel mode uses the inspector's full height minus the header.
- Terminal dock inside the inspector never overlaps the tab bar; when open, the tab content area shrinks and remembers scroll.
- All chrome measurements on the 4px grid; radii 6 (controls), 10 (cards), 14 (dialogs).

### Color & theme
- CLI colors (only on a TTY, disabled by `NO_COLOR` or `--no-color`): status glyphs use the C4 mapping to the closest ANSI colors (Active green, Building/Deploying yellow, Failed/Crashed red, Sleeping/Stopped/Queued dim); links underlined; the fix command in an error card is bright white; no background colors ever (they fight user terminal themes); truecolor is not assumed.
- API docs: the Scalar theme overridden with tokens: sidebar `surface`, content `bg`, method badges `success` (GET), `info` (POST), `warning` (PATCH/PUT), `danger` (DELETE) as text on 12% tints, code blocks `surface` with `border`; the only filled accent element is the "Send" button in Try it.
- Token pages: scope chips `surface-raised` with `border`; expired rows show the Expires cell in `danger` text; revoked rows are hidden by default with a "Show revoked" toggle (dim 60% when shown); the reveal card warning uses the `warning` tint; the primary "Create token" button is the single accent element.
- CLI approval: the Approve button is primary; Cancel ghost; the scopes block `surface`.
- Terminal: background `bg` (not `surface`, so the terminal reads as a distinct "deeper" layer), foreground `text`, cursor `accent` block with 50% alpha blink, selection `accent-subtle`, ANSI palette mapped as in Phase 8 with bright variants one step lighter; the banner uses the `info` tint; disconnected state dims the body to 60% and shows the reconnect prompt in `text`; the header uses `surface` with a `border` bottom.
- Both themes verified ≥ 4.5:1 for chrome text and ≥ 3:1 for every ANSI foreground on the terminal background (light theme uses a darker mapped palette so yellow stays readable).

### Motion
- CLI: progress bars and the in-place deploy stream update at most 10 times per second; spinners use the braille frame set at 80ms per frame; none of this applies when piped.
- API docs: sidebar navigation scrolls the content with `scroll-behavior: smooth` unless reduced motion; route sections do not animate; Try it responses fade in 120ms.
- Token reveal card: appears with a 200ms `cubic-bezier(.2,.8,.2,1)` fade and 8px rise after creation; the Copy field's "Copied" swap is the standard 120ms icon pop.
- CLI approval: the card fades in 200ms; after Approve the success state ("You can close this tab") cross-fades 200ms.
- Terminal dock: opens by expanding height from 0 to the remembered height over 200ms panel easing (the xterm instance mounts after the transition so `fit` measures the final size); closing reverses; resize follows the pointer; the full-panel toggle animates height over 200ms; the disconnected dim transitions 200ms; cursor blink 1s cycle (disabled under reduced motion, replaced by a steady block).
- All web motion collapses to instant under `prefers-reduced-motion`.

### Iconography & symbols
- CLI glyphs (UTF-8 terminals; ASCII fallback via `--ascii` or when the locale is not UTF-8): ● Active, ◐ Building/Deploying, ✕ Failed, ⟳ Crashed, ☾ Sleeping, ■ Stopped, … Queued; ASCII fallback `*`, `o`, `x`, `~`, `z`, `#`, `.`.
- API docs: method badges are text; the sidebar uses Lucide `ChevronRight` 14px for collapsible tags; `Key` 16px on the auth card; `Gauge` 16px on rate limits; `Copy` 14px on code blocks.
- Token pages: `KeyRound` 20px in the section header, `Copy` 14px, `Trash2` 14px Revoke, `TriangleAlert` 16px `warning` on the reveal card, `Clock` 12px before "Last used"; scope chips no icons.
- CLI approval: `TerminalSquare` 32px above the title; `Laptop` 16px before the hostname; `Check` 16px in the success state.
- Terminal: `TerminalSquare` 16px in the dock header and the inspector menu item; `Layers` 14px in the replica picker; `RefreshCw` 14px Reconnect; `Copy` 14px Copy session; `Maximize2` / `Minimize2` 14px expand/collapse; `X` 14px close; `Info` 14px in the banner; `PlugZap` 16px in the disconnected state.
- MCP docs: `Bot` 20px section icon; tool table uses `Lock` 12px before the required scope.
- Command palette entries: "Open shell" with `TerminalSquare` and the `S` Kbd hint; "Create API token" with `KeyRound`.

### Copy
- CLI help root: "Lumen deploys your apps to servers you own." then command groups "Get started" (login, init, link, up), "Deploy" (deploy, redeploy, rollback, down, status, logs), "Configure" (variables, domain, environment, service, volume, server, template), "Tools" (run, shell, connect, open, docs), "CLI" (whoami, logout, completion, upgrade); each one-liner is a verb phrase ("Deploy this folder", "Stream logs", "Open a shell in a running container").
- `login`: "Opening your browser to sign in…" / "Waiting for approval (press Ctrl+C to cancel)" / "Signed in as shagee@example.com on https://lumen.example.com" / headless hint "No browser? Run: lumen login --token".
- `init`: "Created project 'my-app' in workspace 'Personal'. Linked this folder." / `.gitignore` prompt "Add .lumen/ to .gitignore? [Y/n]".
- `link` picker titles: "Pick a workspace", "Pick a project", "Pick an environment", "Pick a service (optional)".
- `up`: "Packing 214 files (3.1 MB)…" / "Uploading ▰▰▰▰▰▱▱▱ 62% · 1.9 MB/s" / "◐ Building · 12s" / "● Live at https://… · 42s" / failure "✕ Your build failed" + "  The first error is on line 118 of the build log. Run: lumen logs --build".
- `logs` empty: "No logs yet. Your app hasn't printed anything since this deploy started."
- `rollback` confirm: "Roll back api to a1b2c3d (Fix login redirect, 2 h ago)? [y/N]"; `down` confirm "Stop api in production? [y/N]"; `volume restore` typed confirmation "Type the service name (postgres) to replace its data:".
- `run` warning: "2 sealed variables weren't injected: STRIPE_KEY, JWT_SECRET"; `connect`: "Tunnel open · connect with: postgres://app:••••@127.0.0.1:15432/app" / "Press Ctrl+C to close" / "This session is logged".
- `shell`: "Connected to api (replica 1 of 3 on oracle-1). Changes are lost on redeploy." then the prompt; on exit "Session ended (exit 0)".
- `server add`: "Run this on your server (expires in 59 min):" then the command in a box, then "Waiting for it to connect…" and the live checklist lines "✓ Connected", "✓ Docker ready", "✓ Proxy running", "✓ Port 80 reachable", "✕ Port 443 blocked — run: lumen docs firewall/oracle".
- `upgrade`: "Lumen CLI 1.4.0 → 1.5.0" / changelog excerpt / "Updated. Run lumen --version to check." / already current "You're on the latest version (1.5.0)".
- Rate limited: "You're sending requests too quickly. Wait 12 seconds and try again."; auth errors "Your token was revoked. Run: lumen login"; permission "This token can't deploy. It only has the read scope."
- API docs page: title "API reference"; auth card "Authenticate with a token" body "Send Authorization: Bearer lumen_… on every request. Create tokens in Account → API tokens."; rate limit card "Limits" body "600 requests per minute per token. Responses include X-RateLimit-Remaining."; Try it button "Send".
- Token pages: title "API tokens"; empty "No tokens yet. Create one to use the CLI, the API or MCP." primary "Create token"; dialog title "Create a token" fields "Name" (placeholder "CI deploy"), "What can it do?" (scopes), "Environment" ("All environments"), "Expires" ("30 days"); reveal card title "Copy your token" warning "Copy it now. We won't show it again."; "Use it" tabs "curl", "CLI", "MCP"; revoke confirm "Revoke 'CI deploy'? Anything using it stops working right away." primary "Revoke token"; toast "Token revoked · Undo" (undo re-activates within 8s).
- CLI approval: title "Sign in the CLI?" body "The Lumen CLI on **shagee-laptop** wants a token that can:" list "Read projects, logs and metrics", "Deploy and roll back", "Read and change variables", "Create and change services", "Open shells and tunnels" then "It expires in 1 year. You can revoke it any time in Account → API tokens." primary "Approve" ghost "Cancel"; success "Signed in. You can close this tab."; expired state "This sign-in request expired. Run lumen login again."
- Terminal: menu item "Open shell"; banner "You're inside a live container. Changes are lost on redeploy."; connecting "Connecting to api…"; disconnected "Disconnected · Reconnect"; ended "Session ended (exit 0)" with "Start a new session"; no-shell error "This image has no shell. Add /bin/sh to the image to use the terminal."; offline "Server 'oracle-1' is offline, so we can't open a shell right now."
- MCP docs: title "Connect an AI assistant" intro "Give Claude (or any MCP client) a token and it can deploy, roll back and read logs for you." then the config snippet and the safety note "Use a token with only the scopes you need. Every tool call is in your audit log."
- Voice per C9: second person, calm, verbs on buttons, no exclamation marks, numbers human-formatted.

### States (empty · loading · error · success · partial)
- CLI: every network call shows a spinner after 300ms on a TTY; every error is a catalog card with a fix command when one exists; `--json` errors are `{error: {code, title, explanation, fix}}` on stderr with the exit code; interrupted commands (`Ctrl+C`) clean up (close tunnels, revoke nothing) and exit 130.
- API docs: loading skeleton (sidebar bars, content blocks); if `openapi.json` fails to load, an error card with Retry; Try it responses show status, headers, body, timing.
- Token pages: empty; list; create dialog validation (name required, at least one scope); creating (loading button); reveal (one-time); revoke confirm; revoked toggle; expired rows.
- CLI approval: loading (validating the request), ready, approving, success, expired, wrong-user (signed in as someone else: "Signed in as … Switch account?"), cancelled ("Cancelled. The CLI wasn't signed in.").
- Terminal: connecting (spinner in the body, controls disabled), live, banner dismissed, resized, disconnected (dimmed with reconnect), ended (footer status), no-shell error, server-offline error, permission denied (viewer role: the menu item is disabled with the tooltip "Members can open shells").
- MCP: tool errors return structured content `{error: {code, title, fix}}` and `isError: true`; `needs_clarification` results list candidates; scope denial returns the `TOKEN_SCOPE` card.

### Keyboard & accessibility
- CLI: fully keyboard-driven by nature; pickers support arrow keys, type-ahead, Enter and Esc; `--yes` bypasses prompts for scripts; all prompts have a non-interactive flag; output is screen-reader friendly when piped (no in-place updates, no spinners).
- API docs: sidebar is a `nav` with a `tree`; route sections have ids for deep links (`/docs/api#deployments-create`); Try it fields are labelled; code blocks have "Copy" buttons with `aria-label`s naming the language.
- Token pages: the table has headers; scope chips are text; the reveal card's Copy field is focused on appearance and announced ("Your token is ready. Copy it now."); the revoke dialog traps focus.
- CLI approval: the Approve button is focused on load; Esc cancels; the scopes list is a real list.
- Terminal: xterm's accessibility mode (`screenReaderMode`) is on when a screen reader is detected or via a toggle in the header ("Screen reader mode"); the dock header controls are labelled buttons; `Esc` from the terminal does not close the dock (it is sent to the shell), the close button and `⌘⇧W` close it; focus moves into the terminal on open and back to the menu button on close; the banner is a `status` region.
- Command palette: "Open shell" has the `S` hint; the shortcut is suppressed while typing in inputs.
- Focus rings 2px `accent` 2px offset on all chrome; status never color-only (glyph + word in the CLI, icon + text in the web); axe clean on every web state; keyboard pass recorded.

### Responsive
- API docs: ≥1440 three columns (sidebar, content, Try it); 1024–1439 two columns with Try it stacked under each route; 768–1023 sidebar collapses into a `Menu` button sheet; <768 single column with the route list as a searchable sheet and code blocks horizontally scrollable.
- Token pages: table columns collapse below 1024 (Prefix and Environment move into a row expansion); <768 rows become cards; the create dialog and reveal card become sheets; the "Use it" snippets remain copyable.
- CLI approval page: the card is full-width with 16px gutters below 480px.
- Terminal: ≥1024 dock inside the inspector; 768–1023 the dock takes the full inspector width; <768 the terminal is a full-screen sheet with the header controls in an overflow menu (replica, shell, copy session, screen reader mode) and a visible on-screen "Ctrl", "Tab", "Esc" key row above the software keyboard (mobile keyboards lack them), the banner collapses to one line, and the sheet closes with the sheet's close button.
- No hover-only affordances anywhere in this phase's web UI.

### Performance
- API p95 for token-authenticated CRUD stays under 100 ms (B14); token verification is a single indexed lookup on `token_hash` with the hash computed in memory; `last_used_at` writes are debounced to once per minute.
- Rate limiter operations are O(1) per request with a bounded map (LRU of 100k keys).
- `lumen up` streams the archive without buffering it in memory; the upload uses a 1 MB chunk size with resume-on-retry for the last chunk; the 500 MB cap is enforced client-side before upload and server-side during.
- Log streaming in the CLI applies backpressure (drops to a "…skipped 1,204 lines, run without --follow to fetch them" notice only when the terminal cannot keep up).
- Exec and tunnel relays copy with 64 KB buffers; the web terminal batches `ExecData` frames per animation frame to keep 60 fps under a `yes`-style flood; the tunnel mux caps 32 concurrent streams per session.
- The MCP server reuses the API's service layer in-process (no HTTP hop) and returns at most 500 log lines and 720 metric points per call.
- The web terminal's xterm and addons load lazily on first "Open shell" (≤ 120 KB gzipped added to the inspector only when used).
- `/docs/api` loads the OpenAPI document once (cached with an ETag) and renders lazily per tag.

### Security
- Tokens: 256 bits of entropy, SHA-256 hashed at rest, prefix-only display, one-time reveal, revocation immediate (no cache), expiry enforced server-side, scopes intersected with RBAC on every route (a token can never exceed its owner's role), environment-scoped tokens rejected outside their environment, every token use audited on mutations, `last_used_at` visible for hygiene.
- The CLI stores tokens `0600`, never prints them, redacts them from `--json` output and from crash reports; `LUMEN_TOKEN` is honored for CI with a note about secret handling in the docs.
- Browser login: `state` bound to the listener, the callback accepts only `127.0.0.1`, the approval page requires an active session and shows the requesting hostname; the request expires after 10 minutes; the created token is named and scoped so users can revoke it individually.
- Upload: size-capped, hash-verified end to end, stored outside the web root, served to agents only via one-time signed URLs valid 10 minutes, deleted after 24 hours; archives are extracted with path traversal protection (no `..`, no absolute paths, no symlinks pointing outside the context) and a file-count cap (200k).
- Exec and tunnel: require the `shell` scope and member role, are audited (who, which container, replica, shell, start and end, bytes), idle out at 10 minutes, cap concurrency (8 per user), and never expose a public port; `lumen connect` binds `127.0.0.1` only.
- Sealed variables are never returned to `run`, `export`, MCP `get_service` or `connect`; the UI and CLI say so explicitly.
- MCP: bearer-only auth (no session cookies, so a browser cannot be tricked into calling it), tool inputs validated with Zod, name resolution never guesses across workspaces the token cannot see, every call audited with the tool name and arguments (secrets redacted), rate-limited by the `mcp` bucket, results scrubbed of secret values.
- Rate limits protect auth endpoints from credential stuffing and the API from runaway clients; the WebSocket message cap protects the realtime fan-out.
- The install script verifies checksums, refuses to run as root unless `--system` is passed, and prints what it will do before doing it; `lumen upgrade` verifies SHA-256 (and signatures once Phase 18 ships them) and swaps the binary atomically.
- The API reference's Try it panel never stores pasted tokens beyond the tab session (memory only, cleared on unload).

### Data integrity & idempotency
- `POST /v1/tokens` returns the full token exactly once; a retry creates a new token (the client is told to revoke unused ones) rather than re-revealing.
- `lumen up` uploads carry the archive SHA-256; the deploy request references the `upload_id`; re-running `up` with an identical archive is allowed (a new deployment, same content), and an `Idempotency-Key` derived from the archive hash and a client nonce prevents double deploys on network retries.
- The deploy stream reconnects and resumes from the last seen log sequence number; the CLI's exit code reflects the final deployment status fetched by id, never inferred from the stream.
- Tunnel and exec sessions are keyed by `op_id`; a reconnect opens a new session (a shell cannot be resumed) and the UI says so.
- Rate-limit counters reset cleanly on process restart (documented); the audit log, not the limiter, is the source of truth.
- `.lumen/link.json` is validated on every command; a link to a deleted project yields a `404` card with "Run lumen link to pick a new project".
- MCP `deploy_template` forwards the `Idempotency-Key` semantics of Phase 13 (derived from the tool call id) so an assistant retrying a timed-out call does not create two projects.
- The upload retention worker deletes only archives older than 24h that no queued or running deployment references.

## 6. Acceptance criteria
- [ ] Public REST API (OpenAPI docs page) with token scopes and rate limits (D10).
- [ ] CLI with every Part J2 command, installable by a one-line script plus Homebrew and Scoop (D10).
- [ ] MCP server with tools to list projects/services, deploy, redeploy, rollback, read logs, read metrics, set variables, add a database, deploy a template, add a domain, scoped by token (D10).
- [ ] Web terminal / exec into containers; `lumen shell` from the CLI (D10).
- [ ] `lumen run` runs a local command with a service's variables injected (D10).
- [ ] A Claude model connected to the MCP server can deploy a template and read its logs (Part F Phase 14 AC), evidenced by the transcript and audit rows.
- [ ] The OpenAPI completeness test passes: every route has schemas, an operationId, a summary and a scope.
- [ ] A `read`-only token is refused on every mutating route; an environment-scoped token is refused outside its environment; a revoked token gets `401` immediately.
- [ ] Rate-limit headers are present on every response and a `429` carries `Retry-After` and the `RATE_LIMITED` card.
- [ ] `lumen up` deploys a non-Git directory to HTTPS honoring `.gitignore` and `.lumenignore`; a tampered upload fails the hash check.
- [ ] `lumen logs --follow` shows a new line within 1s of the app printing it (B14).
- [ ] `lumen connect postgres` gives `psql` a working local port with no public exposure; `lumen shell` resizes correctly; both are audited.
- [ ] Sealed values never appear in `run`, `export`, `connect`, MCP results or the web terminal's variable listing.
- [ ] The install matrix (Ubuntu 24.04 amd64, Debian 12 arm64, macOS arm64, Windows 11) passes and `lumen upgrade` replaces the binary atomically.
- [ ] Every web page and state in this phase passes axe and the C14 checklist; screenshots reviewed at 390/1024/1440 × dark/light.
- [ ] API p95 for token-authenticated CRUD < 100 ms in the Phase 4 benchmark re-run.

## 7. Test plan
- **Unit:** token generation, hashing and prefix; scope map completeness; RBAC × scope intersection; limiter window math; OpenAPI completeness; Go client error mapping; ignore-file matching vectors; dotenv parsing vectors; table rendering and truncation; ASCII glyph fallback; tunnel mux framing; xterm theme mapping; MCP name resolution and clarification.
- **Integration:** every `/v1` route with token actors per scope; rate-limit headers and `429`; upload store, signed URL, retention; exec and tunnel relays with a fake agent (echo and resize); MCP in-process client for every tool including denial; CLI commands against a recorded API fixture server; browser login state validation.
- **E2E (Playwright + CLI harness):** create a token in the UI and use it with `curl`; browser `lumen login`; `init`, `link`, `up` from a Node directory; `logs --follow` latency; `variables import/export`; `run`; `shell` with `top` and resize; `connect postgres` with `psql`; `domain add` with the DNS fixture; `template deploy uptime-kuma`; `server add` printing the join command; the web terminal flow (open, run, resize, disconnect, reconnect, end); `/docs/api` renders and Try it works; revoke → `401`.
- **Visual regression:** `/docs/api`, token pages, CLI approval, web terminal states at 390/1024/1440 × dark/light; CLI output snapshots (TTY and piped) in the Go tests.
- **Accessibility (axe + keyboard pass):** axe on every web page; keyboard pass for the docs sidebar, token dialog, approval page and the terminal dock (including the screen-reader mode toggle).
- **Manual / on a real VM:** run the install script on a fresh Ubuntu VM and an Oracle ARM VM; `lumen up` a 200 MB directory over a slow link and confirm the progress bar and resume; open the web terminal from a phone.
- **The Claude deploy test:** §4.16, run twice.

## 8. Evidence required to close
- `pnpm test` and `go test ./...` output green, including the scope-completeness and OpenAPI-completeness tests.
- The Claude deploy transcript (tool calls, arguments with secrets redacted, final message) and the matching audit rows.
- Terminal recordings (asciinema casts or GIFs) of `lumen login`, `lumen up`, `lumen logs --follow`, `lumen shell` (with a resize), `lumen connect postgres` + `psql`, `lumen template deploy`, `lumen upgrade`.
- Screenshots (390/1024/1440 × dark/light) for `/docs/api` (overview, a route with Try it, mobile), token pages (empty, list, create dialog, reveal, revoke confirm, expired row), CLI approval (ready, success, expired, wrong user), web terminal (connecting, live with banner, banner dismissed, resized, full panel, disconnected, ended, no-shell error, mobile sheet with the key row) — linked from `docs/UI_DECISIONS.md`.
- The install matrix CI run link with all four targets green and `lumen --version` output from each.
- A `curl -i` capture showing the rate-limit headers and a `429` body.
- The audit log excerpt for a shell and a tunnel session.
- The Phase 4 API benchmark re-run showing p95 < 100 ms with token auth.
- Bundle analysis showing the lazily loaded terminal chunk size.

## 9. Review
- Part H1 (code review) with Fable 5.1 on `apps/api/src/auth/**`, `apps/api/src/ratelimit/**`, `apps/api/src/uploads/**`, `apps/api/src/gateway/{exec,tunnel}-relay.ts`, `apps/api/src/mcp/**`, `apps/cli/internal/{auth,upload,tunnel}/**`, `apps/agent/internal/{exec,build/source_upload}.go`: probe scope-vs-RBAC intersection edge cases (workspace token used on a project in another workspace), token revocation race with in-flight relays (must terminate the session), upload path traversal and zip-bomb behavior, signed URL replay, relay idle and concurrency caps, MCP argument logging redaction, the browser login callback binding, `--json` token redaction, and the limiter's behavior after restart.
- Part H2 (UI review) with Fable 5.1 on the screenshot matrix: probe whether the token reveal card makes the one-time nature unmistakable, whether the approval page tells a beginner exactly what they are granting, whether the terminal's banner is noticed but not annoying, whether `/docs/api` reads as calm and original (not a stock API-reference look), and mobile terminal usability.
- Part H4 carry-forward: relay scalability at 50 servers (relays are per API process; the design must allow moving them to a separate gateway process later), and upload storage growth on the control plane disk.

## 10. Risks & open questions
- **Risk:** In-process rate limiting breaks if the API is ever scaled to two processes → **Mitigation:** the limiter is behind an interface with a Postgres-backed implementation designed (not built) and recorded; the single-process assumption is documented in Instance admin.
- **Risk:** Browser login fails behind corporate proxies or in remote dev containers → **Mitigation:** `--token` fallback and a device-code style manual flow ("Open this URL, paste the code") added if the callback fails within 60s.
- **Risk:** `lumen up` on huge directories (monorepos with `node_modules` not ignored) → **Mitigation:** the always-excluded set, a pre-flight size summary with the top 5 largest directories and a confirm when over 100 MB.
- **Risk:** xterm.js and mobile keyboards interact poorly → **Mitigation:** the on-screen key row, `inputmode` tuning, and a documented "best on a laptop" note without blocking the feature.
- **Risk:** Exec relays hold WebSocket connections open on the API for long sessions → **Mitigation:** idle timeout, concurrency caps, and the gateway-process extraction path noted for H4.
- **Risk:** MCP clients call tools in tight loops → **Mitigation:** the `mcp` bucket at 120/min, `needs_clarification` results instead of guesses, and idempotency on `deploy_template`.
- **Risk:** Scoop and Homebrew repositories add release-time steps → **Mitigation:** goreleaser automates both; Phase 18 signs.
- **Open question:** Should `lumen up` be allowed on a service whose source is a GitHub repo (switching it to local upload)? Default: yes with a confirm "This service deploys from GitHub. Deploy this folder instead? Push-to-deploy stays on."
- **Open question:** Default token expiry for CLI login: 1 year (default) or 90 days? Default: 1 year, revocable, shown in Account → API tokens with last-used.
- **Open question:** Does the MCP server expose `read_metrics` as raw series or only summaries? Default: both, summaries first, capped series after.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: token format and scopes, rate-limit buckets and the single-process assumption, OpenAPI renderer, Go client generator, Cobra and Bubble Tea, ignore-file library, upload cap and retention, exec/tunnel caps, MCP SDK and transport, xterm addons, CLI exit codes, login token expiry
- [ ] `docs/UI_DECISIONS.md` updated with the screenshot matrix, terminal recordings and keyboard pass notes
- [ ] Cross-model review done (H1 on auth/relays/MCP/CLI, H2 on screenshots) and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 14 — CLI, API, MCP, terminal</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-14-cli-api-mcp-terminal.md,
and these SPEC sections: B5 (Exec*), B6 (api_tokens, audit_log), B7 (sealed variables), B8 (local
upload, .lumenignore), B12, B14, C4, C5 (Code block / terminal, Copy field, Secret field, Kbd), C7.16
(Tokens), C7.21 (API tokens), C7.25, C8.6, C9, C10, C11, C12, C13, D10, J1, J2, J6.
Load the claude-api skill before writing the MCP client test (§4.16) for the current model id and
MCP connector usage.
</context>
<goal>A developer can log in, link and deploy a local folder with the CLI, stream logs, open a shell
and tunnel to a database without public exposure, call the documented REST API with a scoped token,
and connect Claude to the MCP endpoint to deploy a template and read its logs; a dashboard user can
open a live shell into any container.</goal>
<scope>
- API tokens (owner kinds, environment scope, scopes, hashing, prefix, expiry, revoke), bearer middleware,
  scope × RBAC intersection, audit with token identity, token UI in Account / Workspace / Project settings
- Rate limits (auth, api, deploy, logs, mcp, upload buckets), headers, 429 + RATE_LIMITED card
- OpenAPI completeness test, /v1/openapi.json, /docs/api reference page themed with tokens
- Generated Go client (oapi-codegen) with retries and error mapping
- Go CLI (Cobra): every J2 command, profiles, --json, exit codes, browser login + --token, .lumen/link.json,
  lumen up (ignore rules, streaming archive, upload endpoint, signed fetch, hash check), deploy stream,
  logs --follow, variables incl. import/export, run, shell, connect (tunnel mux), domain/environment/
  service/volume/server/template commands, completion, upgrade
- Install scripts (sh, ps1), Homebrew tap, Scoop bucket, goreleaser config
- MCP server at /mcp (Streamable HTTP, bearer auth, 13 tools with Zod schemas and scopes, resources,
  prompts), the documented Claude deploy test
- Web terminal (C7.25): dock, replica/shell pickers, resize, copy/paste, reconnect, banner, mobile sheet
</scope>
<out_of_scope>
- Cloud provisioning in lumen server add (Phase 16), SSO and token rotation policies (Phase 15+),
  docs site build (Phase 18), signed binaries and release pipeline (Phase 18), a CLI TUI dashboard
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-14-cli-api-mcp-terminal.md §6, including: D10 all items; the Claude
MCP deploy-and-read-logs test with transcript and audit rows; OpenAPI and scope completeness tests;
read-only and environment-scoped token denials; rate-limit headers and 429; lumen up honoring
.gitignore/.lumenignore with hash verification; logs --follow < 1s; shell and connect audited with no
public exposure; sealed values never exposed; install matrix green; axe-clean screenshots at
390/1024/1440 × dark/light; API p95 < 100 ms with token auth.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, schema changes (api_tokens fields, uploads), protocol changes
   (BuildRequest upload source, Exec/Tunnel mux), the scope map, the rate-limit buckets, risks, test plan,
   open questions (up on repo services, login expiry, metrics shape in MCP). STOP and wait for approval.
2. Implement in small steps in the §4 order; run code and tests after each step; run the CLI against a
   real instance before marking a command done.
3. For UI: screenshots at 390/1024/1440 × dark/light × the states in §5; critique against SPEC C14;
   fix before reporting. For the CLI: TTY and piped output snapshots and terminal recordings.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
