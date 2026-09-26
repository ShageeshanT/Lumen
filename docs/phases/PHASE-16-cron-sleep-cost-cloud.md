# Phase 16 — Cron, sleeping, cost, cloud integrations

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 (sleep / wake path in the agent and Caddy, cron execution on the agent) → Opus 5.5 (schedule builder, cron history UI, usage & cost, cloud accounts and provisioning UI, "Explain this error") → each reviewed by the other |
| **Depends on** | Phase 3 (agent reconciliation, container lifecycle, Caddy routes, healthchecks), Phase 4 (service_instances fields `cron_schedule`, `sleep_enabled`, `sleep_after_s`; desired-state compiler; workers queue), Phase 5 (inspector Settings tab, staged changes, Add flow), Phase 7 (HTTP logs feed idle detection), Phase 8 (metrics rollups feed cost shares; notification rules), Phase 11 (installer used by cloud-init), Phase 15 (workspace settings placeholders for Cloud accounts and Usage & cost; encrypted credential storage) |
| **Unblocks** | Phase 18 (chaos tests for sleep/wake, launch feature completeness) |
| **Spec sections** | SPEC D6 (sleeping, cloud integrations), D12 (usage and cost, "Explain this error"), B4 (SLEEPING state), B5 (`cron_jobs[]` in DesiredState), B6 (`cron_runs`, `cloud_accounts`, `servers.monthly_cost`), B9 (Caddy routes), B13, C7.5 item 6 (Cron job option), C7.7 (Sleep now), C7.12 (Resources "Resize this server", Scaling, Sleep when idle, Cron), C7.18 (cloud actions Resize, Reboot), C7.20 (Cloud accounts, Usage & cost), C4 (☾ Sleeping), J6, J3 (`sleep_when_idle`, `cron`) |
| **Estimated sessions** | 6 focused sessions: (1) cron scheduling on the control plane + agent RunOnce op + cron_runs, (2) schedule builder + cron history UI + Add flow option, (3) sleep / wake: idle detection, waker, Caddy hold route, ☾ state, (4) usage & cost view + CSV, (5) cloud accounts + provision via cloud-init + resize/reboot/delete + pricing, (6) "Explain this error" + polish + chaos test for wake |

## 1. Goal
A user schedules a nightly job with a plain-language schedule builder, lets an idle staging app go to sleep and wake on its first request within 30 seconds, sees what each service costs per month, and creates a new server on Oracle or Hetzner from the dashboard that joins Lumen on its own.

## 2. Why this phase exists
These four features are what turn "I can deploy" into "I can run this for a year without thinking about it":

- **Cron** replaces the worker-with-a-sleep-loop that beginners write. It needs a builder that speaks human ("Every day at 3:00") and a run history that shows exit codes, because a silent cron is the most common cause of "why didn't my backup run".
- **Sleeping** is how a free-tier VM hosts five side projects instead of one. The tricky part is the wake path: the first request has to be held, not dropped, and the whole thing has to finish within 30 seconds or people think the site is down.
- **Cost** is the question every self-hoster asks their teammate: "what does this project cost us?". The number is an estimate from the server's monthly price, but it has to be honest about being an estimate.
- **Cloud integrations** collapse "create a VM in the console, copy the command, ssh, paste" into one click, and unlock "Resize this server" from the Resources slider, which is the natural answer when an app outgrows its box.

"Explain this error" is small but strategic: with the workspace's own Claude API key, the error card plus the last 100 log lines become a plain-language diagnosis. It stays off unless configured and shows exactly what is sent, because trust matters more than the feature.

## 3. Scope
### In scope
- Cron services: `cron_schedule` on the service instance, control-plane scheduler, agent `RunOnce` op, `cron_runs` history, overlap policy, timezone display, schedule builder with presets and a human-readable preview, Add-flow "Cron job" option (C7.5 item 6), Settings → Cron section, run history in the inspector
- App sleeping: idle detection from HTTP logs, sleep transition, ☾ Sleeping status, Caddy hold route, waker in the agent, wake within 30 s, "Sleep now" action, Settings → Sleep when idle section, notifications
- Usage & cost: `servers.monthly_cost` input, per-service and per-project estimated shares, workspace Usage & cost page, CSV export, cost chip on server cards (C7.18)
- Cloud accounts (C7.20): connect Oracle, AWS, GCP, Hetzner, DigitalOcean with encrypted credentials and "Test connection"
- Provision a new VM from the UI with cloud-init running the join command; Resize, Reboot, Delete for linked servers (C7.18 cloud actions); pricing pull for estimates
- "Resize this server" and "Move to another server" affordances from the Resources section (C7.12)
- Optional "Explain this error" (D12) with the workspace's Claude API key, payload preview, model selection
- `lumen.toml` fields `sleep_when_idle` and `cron` honored with UI locks (Phase 10 parser, this phase's fields)

### Out of scope
- Azure provisioning (SPEC D6 lists Oracle, AWS, GCP, Hetzner, DO; Azure stays a manual-join provider)
- Cron for databases (not a service kind that supports it; the UI hides the option)
- Replica scaling and placement (Phase 12); the cost view reads placement, does not change it
- Metered billing or invoices (Lumen is self-hosted; cost is an estimate, never a charge)
- HA Postgres (Phase 17)
- The AI feature beyond error explanation (no chat, no code generation)

## 4. Work breakdown

### 4.1 Cron schema, parsing and scheduler
- **What:** `service_instances.cron_schedule` (5-field cron, UTC) and `cron_overlap` (`skip | allow`, default `skip`) already exist or are added; `cron_runs` (`service_instance_id`, `scheduled_for`, `started_at`, `finished_at`, `exit_code`, `status` in `queued | running | succeeded | failed | skipped | timed_out`, `server_id`, `log_ref`, `trigger` in `schedule | manual`). Parsing with `cron-parser` (MIT) and preview text with `cronstrue` (MIT), both wrapped in `packages/shared/src/cron/` so the API and web share validation (5 fields only, no seconds, no `@yearly` aliases; `*/n` allowed; reject intervals under 1 minute). The scheduler is a pg-boss singleton job `cron.tick` every 30 s that selects instances whose next run (computed from `cron_schedule` and the last `scheduled_for`) is due, inserts a `cron_runs` row with `status=queued` (unique on `service_instance_id + scheduled_for` so two ticks cannot double-enqueue), and enqueues `cron.run`. `cron.run` checks overlap (a `running` row for the same instance → mark `skipped` with reason `previous_run_still_running` when policy is `skip`), then sends the agent a `RunOnce` op. Missed schedules while the control plane was down are not backfilled (one `skipped` row with reason `missed_while_offline` per missed slot, capped at 10).
- **Files:** `packages/db/src/schema/cron-runs.ts`, `packages/db/migrations/00xx_cron_runs.sql`, `packages/shared/src/cron/parse.ts`, `packages/shared/src/cron/describe.ts`, `packages/shared/src/cron/*.test.ts`, `apps/api/src/workers/jobs/cron-tick.ts`, `apps/api/src/workers/jobs/cron-run.ts`
- **Done when:** unit tests cover `0 3 * * *`, `*/15 * * * *`, `0 0 1 * *`, `30 2 * * 1-5`, invalid strings, and the "no double enqueue" constraint; a 1-minute schedule on a test instance produces one run per minute for 5 minutes with no duplicates.

### 4.2 Agent `RunOnce` op and cron execution
- **What:** New protobuf messages `RunOnce{op_id, service_instance_id, run_id, image_ref, command[], env (resolved), limits, timeout_s, network, volumes[]}` and `RunOnceResult{op_id, run_id, exit_code, started_at, finished_at, timed_out, oom_killed}`. The agent creates a container with the same spec as the service (image, variables, limits, network, volumes, secret scrubbing) but with `restart=no`, a label `lumen.cron_run=<run_id>`, runs it, streams its output through the existing `LogChunk` path tagged with the run id (stored in `deployment_logs` under phase `cron` with the run id as the partition key), enforces `timeout_s` (default 1 h, settable under Advanced up to 24 h; on timeout `docker stop` then `kill`, status `timed_out`), and removes the container after reporting. The `DesiredState.cron_jobs[]` field carries only the schedule metadata for display in `lumen-agent status`; execution is control-plane driven so history and overlap live in one place (record the decision).
- **Files:** `packages/protocol/proto/lumen/v1/ops.proto`, `apps/agent/internal/ops/run_once.go`, `apps/agent/internal/ops/run_once_test.go`, `apps/api/src/gateway/handlers/run-once-result.ts`
- **Done when:** an integration test against real Docker runs `sh -c 'echo hi; exit 3'` and records exit code 3 with the log line; a 5-second timeout kills a `sleep 60` command and records `timed_out`.

### 4.3 Schedule builder and cron UI
- **What:**
  - `ScheduleBuilder` component (`packages/ui`): segmented presets "Every hour" (`0 * * * *`), "Every day" (time picker, default 03:00 → `0 3 * * *`), "Every week" (day + time), "Every month" (day-of-month + time), "Custom" (a Geist Mono input with 5 fields, live validation, field hints on focus: "minute · hour · day · month · weekday"). Under the builder, the preview line in body 14 `text-secondary`: "Runs every day at 03:00 UTC (08:30 your time). Next run in 6 h 12 min." computed from `cronstrue` plus the browser timezone; when the next run is under a minute away: "Next run in under a minute."
  - Add flow item 6 (C7.5): "Cron job" tile → repo or image source (reusing the Phase 5/6 pickers) → the builder → Create. The created node shows a `clock` 16 px badge and "Runs daily 03:00 UTC" as its meta line instead of a public URL.
  - Settings → Cron section (C7.12): the builder, Overlap policy (segmented "Skip if still running" / "Run anyway" with the caption "Skipping keeps two copies from writing at once."), Timeout (number input in minutes, default 60), "Run now" button (creates a `trigger=manual` run), and a `lumen.toml` lock when `deploy.cron` is set.
  - Inspector → Deployments tab for cron services gains a "Runs" sub-tab: table with Scheduled (relative + tooltip ISO), Status (SPEC C4 language: ● Succeeded, ✕ Failed with exit code, ■ Skipped with reason, ⟳ Timed out, ◐ Running with elapsed ticking), Duration, Server, "View logs" (opens the log viewer scoped to the run). Row menu: "Run again", "Copy run id". Filter by status. Empty: "No runs yet. The first one starts at 03:00 UTC." Failed runs raise a notification through the `deploy_failed`-style rule `cron_failed`.
- **Files:** `packages/ui/src/components/ScheduleBuilder.tsx`, `packages/ui/src/components/ScheduleBuilder.stories.tsx` (gallery entry), `apps/web/components/add-flow/CronJobOption.tsx`, `apps/web/components/inspector/settings/CronSection.tsx`, `apps/web/components/inspector/deployments/CronRunsTable.tsx`, `apps/api/src/routes/services.ts` (`POST /services/:id/cron/run`), `apps/api/src/routes/cron-runs.ts` (`GET /services/:id/cron-runs`)
- **Done when:** the builder produces the expected expression for every preset in unit tests; e2e creates a cron job with "Every hour", sees the preview, runs it now, and sees the run with its log.

### 4.4 Idle detection and the sleep transition
- **What:** For instances with `sleep_enabled=true`, the agent tracks `last_request_at` per route from the Caddy access log stream it already parses (Phase 7), including requests that returned errors (any request counts as activity). Every 30 s, instances idle for longer than `sleep_after_s` (default 600, minimum 60, maximum 86 400) and currently ACTIVE are transitioned: (1) swap the Caddy route upstream to the local waker (4.5) so no request is lost, (2) `docker stop` with the drain timeout, (3) report `ActualState` with `status=SLEEPING` and `slept_at`; the control plane sets the deployment status to `SLEEPING` (SPEC B4) and emits the realtime event so the node shows ☾ within 1 s. Constraints: services with a TCP proxy, cron services and databases cannot sleep (the Settings switch is disabled with the reason); services with replicas > 1 sleep only when every replica is idle (Phase 12 placement) and wake all replicas on demand. "Sleep now" (C7.7 overflow menu) sends an imperative `SleepNow{op_id}` op that runs the same transition regardless of idleness.
- **Files:** `apps/agent/internal/sleep/tracker.go`, `apps/agent/internal/sleep/transition.go`, `apps/agent/internal/sleep/*_test.go`, `packages/protocol/proto/lumen/v1/ops.proto` (`SleepNow`, `ActualState.slept_at`), `apps/api/src/gateway/handlers/actual-state.ts` (SLEEPING mapping), `apps/api/src/routes/services.ts` (`POST /services/:id/sleep`)
- **Done when:** a test service with `sleep_after_s=60` receiving no traffic shows ☾ Sleeping in the UI within 90 s of the last request; a request during the 30 s tick window is never dropped (a curl loop at 1 req/s across the transition logs 0 failures).

### 4.5 Waker and the Caddy hold route
- **What:** The agent runs a `waker` HTTP listener on `127.0.0.1:<port>` (one listener, multiplexed by the `X-Lumen-Instance` header the Caddy route injects). Caddy's route for a sleeping instance reverse-proxies to the waker with `flush_interval -1` and a 45 s upstream timeout. On the first request the waker: (1) checks a per-instance singleflight so concurrent requests share one wake, (2) `docker start` the stopped container, (3) polls the healthcheck (TCP connect on `target_port`, or the HTTP path if set) every 250 ms up to 30 s, (4) rewrites the Caddy route back to the container upstream, (5) proxies the held request (and every other held one) to the container and returns the real response. On timeout it returns `503` with a small static HTML page in Lumen's identity ("Waking up. This app was asleep and is starting now. Refresh in a few seconds.") and keeps trying in the background; the control plane records a `WAKE_TIMEOUT` error on the deployment and shows the `HEALTHCHECK_TIMEOUT`-style card with the fix "Set a healthcheck path" / "Increase memory". Requests with `Accept: application/json` receive `{"error":"waking","retry_after":3}` instead of HTML. The wake also records `woke_at` and the wake latency in `ActualState` so the Metrics tab can show "Woke in 4.2 s" markers.
- **Files:** `apps/agent/internal/sleep/waker.go`, `apps/agent/internal/sleep/waker_test.go`, `apps/agent/internal/caddy/routes.go` (hold route builder), `apps/agent/internal/sleep/waking.html` (embedded), `packages/shared/src/errors/catalog.ts` (`WAKE_TIMEOUT`)
- **Done when:** the integration test puts a Node hello-world to sleep, fires 20 concurrent requests, and asserts one container start, 20 × 200 responses, and a first-byte time under 30 s (target under 5 s warm); the chaos test that kills the container mid-wake still returns a 503 page rather than a Caddy error.

### 4.6 Sleep settings and status UI
- **What:** Settings → Sleep when idle (C7.12): a Switch "Sleep when idle", idle timeout select (5 / 10 / 30 / 60 minutes / 6 hours / custom minutes), the sentence "Sleep after 10 minutes without requests. The first request wakes it in a few seconds.", a note when disabled by constraint ("Services with a TCP proxy stay awake so their port keeps working."), and the `lumen.toml` lock for `deploy.sleep_when_idle`. Canvas node and inspector header show ☾ Sleeping in `sleeping` color with the meta "Asleep since 14:02 · wakes on request"; the inspector primary action stays Redeploy; the overflow gains "Wake now" while sleeping (sends a wake through the same path with a synthetic request). Metrics tab: sleep periods drawn as a hatched band; wake markers labeled with latency. Notifications: `app_slept` and `app_woke` events exist but are off by default in rules (they are noisy).
- **Files:** `apps/web/components/inspector/settings/SleepSection.tsx`, `apps/web/components/canvas/ServiceNode.tsx` (sleeping state), `apps/web/components/inspector/InspectorHeader.tsx`, `apps/web/components/inspector/metrics/SleepBands.tsx`, `apps/api/src/routes/services.ts` (`POST /services/:id/wake`)
- **Done when:** screenshots show ☾ in both themes on the node, list view and inspector; the switch toggles through staged changes (C8.1) and the lock appears when set from `lumen.toml`.

### 4.7 Usage & cost model and page
- **What:**
  - `servers.monthly_cost` (numeric, currency code in `instance_settings.currency`, default USD) editable from Server detail ("Monthly cost", helper "What you pay your cloud for this machine. Lumen uses it for estimates.") and auto-filled from provider pricing (4.10) for linked servers with a "from Hetzner pricing" caption.
  - Share model (`packages/shared/src/cost/share.ts`): for each server, each container's weight = 0.5 × (`cpu_limit` / server cores) + 0.5 × (`memory_limit_mb` / server memory); shares are normalized across containers on that server so a server's shares sum to its cost; unallocated capacity shows as "Unused" per server. Toggle "By limits" (default) / "By usage" where usage weights come from the 30-day average of `metric_rollups` CPU and memory. Sleeping services count their limits at 10 % under "By usage".
  - Workspace → Usage & cost page (replaces the Phase 15 placeholder): summary cards (Total monthly cost, Servers, Estimated unused), a table by project → service (expandable rows) with columns Service, Server(s), Memory limit, CPU limit, Share (%) and Estimated cost (tabular, 2 decimals, currency-formatted with `Intl.NumberFormat`), sort by cost, the "By limits / By usage" segmented control, period selector (This month / Last 30 days for usage mode), "Export CSV" (columns: workspace, project, environment, service, server, memory_limit_mb, cpu_limit, weight, share_pct, estimated_cost, currency, mode, generated_at). A banner when any server has no cost: "2 servers have no monthly cost set, so their services show as —. Set costs on the Servers page."
  - Server cards (C7.18) show a `receipt` 14 px cost chip "$6.50/mo" when set.
- **Files:** `packages/shared/src/cost/share.ts`, `packages/shared/src/cost/share.test.ts`, `apps/api/src/routes/usage.ts` (`GET /workspaces/:id/usage`, `GET /workspaces/:id/usage.csv`), `apps/web/app/(app)/w/[workspace]/settings/usage/page.tsx`, `apps/web/components/usage/UsageTable.tsx`, `apps/web/components/servers/ServerCard.tsx` (cost chip), `apps/web/components/servers/ServerDetail.tsx` (cost field)
- **Done when:** share tests cover a server with two services (60 % / 40 %), one with none (100 % unused), and a service placed on two servers; the CSV opens in Excel with correct decimals; the page passes C14 at three widths.

### 4.8 Cloud accounts: credentials and test connection
- **What:** `cloud_accounts` (`workspace_id`, `provider`, `name`, `credentials_enc` (B7 envelope), `default_region`, `last_tested_at`, `last_test_ok`). Per-provider credential forms with the exact fields and helper links to where to create them:
  - **Oracle:** tenancy OCID, user OCID, region, fingerprint, private key (PEM textarea, Secret), compartment OCID; SDK `oci-sdk` (UPL-1.0 / Apache-2.0); test = list availability domains.
  - **AWS:** access key id, secret access key, default region; `@aws-sdk/client-ec2` and `@aws-sdk/client-pricing` (Apache-2.0); test = `DescribeRegions`.
  - **GCP:** service account JSON (Secret textarea), project id, default zone; `@google-cloud/compute` (Apache-2.0); test = list zones.
  - **Hetzner:** API token; thin REST client in `apps/api/src/lib/cloud/hetzner.ts` (no official TS SDK); test = `GET /v1/locations`.
  - **DigitalOcean:** API token; thin REST client `digitalocean.ts`; test = `GET /v2/account`.
  Each form has "Test connection" with the result line ("Connected. 3 regions available.") and a permission checklist per provider (the minimum IAM/policy the key needs, with a copyable policy JSON for AWS and GCP). Credentials are never returned after save (write-only, like sealed variables); the list shows provider, name, region, last test, "used by N servers".
- **Files:** `packages/db/src/schema/cloud-accounts.ts`, `apps/api/src/lib/cloud/{provider.ts,oracle.ts,aws.ts,gcp.ts,hetzner.ts,digitalocean.ts}` (one interface: `testConnection`, `listRegions`, `listSizes`, `listImages`, `createServer`, `resizeServer`, `rebootServer`, `deleteServer`, `getPricing`), `apps/api/src/routes/cloud-accounts.ts`, `apps/web/app/(app)/w/[workspace]/settings/cloud/page.tsx`, `apps/web/components/cloud/CloudAccountForm.tsx`
- **Done when:** each provider's `testConnection` succeeds against a real account in a recorded manual test, and the unit tests use recorded HTTP fixtures (nock) for the two REST clients.

### 4.9 Provision a server from the UI
- **What:** Servers → "Add server" wizard (Phase 2) gains a first choice: "Create a new server with a connected cloud account" versus "Connect a server I already have". The create path: pick account → region (default from the account) → size (list with vCPU, RAM, disk, monthly price from 4.10; recommended tiers marked "Good for the control plane" / "Cheapest") → image (Ubuntu 24.04 LTS fixed, arm64 for Oracle Ampere shapes) → name → optional SSH public key → "Create server". The API creates the `servers` row (`status=pending`, provider, region_label, monthly_cost from pricing), mints a join token, renders cloud-init:
  ```yaml
  #cloud-config
  package_update: true
  runcmd:
    - curl -fsSL https://<dashboard>/install/agent.sh | sh -s -- --token <join-token> --control-plane wss://<dashboard>/agent/v1 --name <name>
  ```
  and calls `createServer`. It also opens the provider firewall for TCP 80, 443 and UDP 51820 through the API where the provider supports it (AWS security group, GCP firewall rule, Hetzner firewall, DO cloud firewall, Oracle security list ingress rules) and records what it did. The wizard then shows the Phase 2 live checklist (Connected → Docker ready → Proxy running → Port 80 → Port 443 → Mesh ready) with a leading step "Server created by Hetzner (id 12345678)" and the expected total time ("Usually 2–4 minutes"). Failures map to `CLOUD_CREATE_FAILED` with the provider's message translated ("Hetzner says: not enough capacity in fsn1. Try another region.").
- **Files:** `apps/api/src/routes/servers.ts` (`POST /servers/provision`), `apps/api/src/lib/cloud/cloud-init.ts`, `apps/api/src/lib/cloud/firewall.ts`, `apps/web/components/servers/AddServerWizard.tsx` (new first step), `apps/web/components/servers/ProvisionForm.tsx`, `packages/shared/src/errors/catalog.ts` (`CLOUD_CREATE_FAILED`, `CLOUD_AUTH_FAILED`, `CLOUD_QUOTA`)
- **Done when:** a server created from the UI on Hetzner and on Oracle (the Phase 16 AC minimum of 2 providers) reaches "online" with all checks green without any manual step; the recorded time is under 5 minutes.

### 4.10 Resize, reboot, delete, and pricing
- **What:** Server detail (C7.18) cloud actions for linked servers: **Resize** (dialog listing sizes with price delta "+$4.00/mo", warning "Your apps on this server stop for about a minute while it resizes."; the agent drains nothing, the control plane marks the server `draining` during the operation so no deploys start, then waits for the heartbeat and updates `cpu_cores` / `memory_mb` / `monthly_cost`), **Reboot** (simple confirm; the same `draining` window), **Delete** (typed confirm of the server name; blocked while services remain unless "Move them first" is chosen, which opens the drain flow; deletes the cloud instance and the `servers` row; keeps the row as "deleted" in the audit metadata). **Pricing:** `getPricing(region)` per provider (AWS Pricing API `GetProducts` for EC2 on-demand Linux; GCP Cloud Billing Catalog SKUs; Hetzner `GET /v1/server_types` prices; DO `GET /v2/sizes`; Oracle has no public pricing API, so a maintained table in `apps/api/src/lib/cloud/oracle-pricing.json` with `verified_at`) cached 24 h in `instance_settings.pricing_cache`. The Resources section (C7.12) "Need more? Resize this server" appears when a slider would exceed free capacity and the server is linked; otherwise "Move to another server" (opens the placement editor) and, when no cloud account exists, "Connect a cloud account to resize from here".
- **Files:** `apps/api/src/routes/servers.ts` (`POST /servers/:id/resize|reboot`, `DELETE` extension), `apps/api/src/lib/cloud/pricing.ts`, `apps/api/src/lib/cloud/oracle-pricing.json`, `apps/web/components/servers/ResizeDialog.tsx`, `apps/web/components/inspector/settings/ResourcesSection.tsx` (capacity affordances)
- **Done when:** a Hetzner test server resizes from cx22 to cx32 and the detail page shows the new cores, memory and cost within 3 minutes; pricing for each provider loads with a recorded fixture and the live call is verified manually once.

### 4.11 "Explain this error"
- **What:** Workspace settings → General gains an "AI assistance" card: a Secret field for an Anthropic API key (write-only, B7 envelope), a model select (`claude-fable-5-1` default, `claude-opus-5-5`), a Switch "Show 'Explain this error' on error cards", and the sentence "Lumen sends the error details and the last 100 log lines to Anthropic using your key. Nothing is sent unless you click Explain." Error cards (C10) gain a ghost button "Explain this error" when enabled. Clicking opens a side panel: first a "What we'll send" preview (the error code, title, explanation, config snapshot keys, the last 100 scrubbed log lines) with the byte count and a "Send" button; then the streamed answer rendered as sanitized Markdown with a caption "Answer from claude-fable-5-1. It can be wrong. Check before applying fixes." and "Copy". The API calls the Anthropic Messages API server-side with a system prompt that constrains the answer to a diagnosis and concrete next steps under 200 words, `max_tokens: 600`, streaming SSE to the client. Secrets are scrubbed again server-side (the same scrubber as logs) before sending. Usage is audited (`ai.explain`, with the error code, never the content). Rate limit 20 / hour / workspace.
- **Files:** `apps/api/src/routes/ai.ts` (`POST /projects/:id/ai/explain`), `apps/api/src/lib/ai/anthropic.ts` (`@anthropic-ai/sdk`, MIT), `apps/api/src/lib/ai/prompt.ts`, `apps/web/components/errors/ExplainErrorPanel.tsx`, `packages/ui/src/components/ErrorCard.tsx` (optional action slot), `apps/web/app/(app)/w/[workspace]/settings/general/page.tsx` (AI card)
- **Done when:** with a test key the panel streams an answer for a `CRASH_LOOP` error; without a key the button is absent; the preview matches the request body byte for byte (asserted in an integration test).

### 4.12 Config-as-code fields and chaos test
- **What:** `lumen.toml` `deploy.cron` and `deploy.sleep_when_idle` (J3) map to the instance fields with the Phase 10 lock UI. Chaos test `e2e/chaos/sleep-wake.spec.ts`: sleep a service, kill the agent, send a request (expect the Caddy hold route to time out with the friendly 503 since the waker is gone), restart the agent, assert the next request wakes within 30 s. A second scenario stops the control plane for 10 minutes and asserts sleeping and waking keep working (agent-local behavior).
- **Files:** `packages/shared/src/config/lumen-toml.ts` (fields), `e2e/chaos/sleep-wake.spec.ts`
- **Done when:** both scenarios pass on the VM harness.

## 5. Detail checklist

### Typography
- Schedule builder preview: body 14 / 400 `text-secondary`; the next-run part in `text` 500 ("Next run in 6 h 12 min") with tabular numerals.
- Custom cron input: Geist Mono 14 / 400, five fields visually separated by 12 px gaps, field hint captions 12 / 400 `text-muted` under each.
- Cron runs table: table cell 13 / 400; durations and exit codes tabular; run ids Geist Mono 12.
- Sleep sentence: body 14 / 400 `text-secondary` under the switch; constraint notes caption 12 / 400 `text-muted`.
- Node meta while sleeping: meta 13 / 400 `sleeping` color "Asleep since 14:02".
- Usage summary cards: value 24 / 600 tabular with the currency symbol at 16 / 500 `text-secondary` before it; label 13 / 500 `text-secondary` above.
- Usage table: costs right-aligned, 2 decimals, tabular; share column with a 4 px tall inline bar (64 px wide) after the percentage.
- Cloud size list: name 14 / 500, specs meta 13 / 400 `text-secondary` ("2 vCPU · 4 GB · 40 GB"), price 14 / 500 tabular right-aligned, recommended tag caption 12 / 500 `accent`.
- Explain panel: preview in Geist Mono 12 / 400 on `bg` with a 1 px `border`, max height 240 px scroll; answer body 14 / 400 line-height 1.6 with headings capped at card title 14 / 600.
- Waking page (served by the waker): system font stack (no web fonts from a sleeping app), title 20 / 600, body 14 / 400, both themes through `prefers-color-scheme`.

### Spacing & layout
- Schedule builder: segmented control full width, 16 px to the parameter row (time picker 96 px wide, day select 140 px), 12 px to the preview line, 8 px to the timezone caption.
- Cron section in Settings: builder → 24 px → overlap policy → 16 px → timeout → 24 px → "Run now" (secondary) right-aligned.
- Runs table: 40 px rows, status column 140 px, duration 88 px, server 120 px, actions 48 px.
- Sleep section: switch row 44 px tall, timeout select 160 px wide inline to the right of the switch on ≥ 768, stacked under it below.
- Usage page: three summary cards in a 3-column grid (16 px gap), 24 px to the controls row (segmented + period + Export), 16 px to the table; expandable project rows indent services by 24 px with a 1 px `border` guide line.
- Cloud account form: two-column at ≥ 1024 (16 px gap), Secret textareas 120 px tall, "Test connection" left of Save in the footer.
- Provision form: region and size as selectable lists in cards (radius 10, 12 px padding, 8 px gap), max 4 columns at 1440, 2 at 1024, 1 at 390.
- Explain panel: 480 px side panel (C6 inspector rules), preview card 16 px padding, "Send" primary right-aligned under it, answer area 24 px padding.
- Everything on the 4 px grid.

### Color & theme
- ☾ Sleeping uses the `sleeping` token (#64748B) for the glyph, the status text and the node's meta line; the node border stays `border` (no ring: sleeping is not a problem state).
- Sleep bands on charts: `sleeping` at 12 % alpha with a 45° hatch (SVG pattern) so it reads without color; wake markers `info`.
- Cron statuses follow C4: Succeeded `success`, Failed `danger`, Skipped `text-muted`, Timed out `danger`, Running `warning` pulsing.
- Usage bars: `accent` at 60 % alpha on `border`; "Unused" rows in `text-muted` with a dashed bar outline.
- Cloud provider marks: monochrome `text-secondary` at rest (from `simple-icons`, CC0), never brand colors, so the page stays calm; recommended size tag is the page's only accent besides the primary button.
- Explain button on error cards: ghost, `text-secondary`, with a `sparkles` 14 px icon; the answer caption in `text-muted`.
- Waking page: `bg` and `text` tokens inlined for both schemes.
- Contrast verified for `sleeping` text on `surface` in both themes (dark: #64748B on #14171B is below 4.5:1 for small text, so sleeping meta text uses `text-secondary` and only the glyph and status pill use `sleeping`; record this in UI_DECISIONS.md).

### Motion
- Node transition to ☾: the status glyph cross-fades 200 ms and the meta line swaps with a 120 ms fade; no movement.
- Wake in progress (after "Wake now" or a request arrives): the ☾ glyph is replaced by ◐ pulsing (1.6 s ease-in-out opacity 1 → 0.5) until ACTIVE; reduced motion: static ◐.
- Cron "Running" elapsed counter ticks every second in tabular numerals with no layout shift (fixed width).
- Schedule preview updates on every keystroke with a 120 ms fade of the changed text only; the next-run countdown re-renders once a minute.
- Usage table expand: rows slide open 200 ms `cubic-bezier(.2,.8,.2,1)`; reduced motion: instant.
- Provision wizard steps reuse the Phase 2 checklist animations (check pops 120 ms).
- Explain panel: slides in from the right 200 ms (C6); streamed text appears without per-token animation (plain append) to stay calm; a 3-dot "thinking" indicator 1.2 s loop before the first token; reduced motion: static "Thinking…".
- Waking page: a single 2 px progress bar sweeping 1.4 s; reduced motion: static text.

### Iconography & symbols
- Cron service node badge: `clock` 16 px; cron runs: `play` 16 px for "Run now", `rotate-cw` 16 px for "Run again".
- Sleeping: ☾ glyph rendered as Lucide `moon` 16 px (the C4 symbol), status pill "Sleeping"; "Sleep now" menu item `moon` 16, "Wake now" `sun` 16.
- Usage: `receipt` 16 px on the cost chip and page; `download` 16 px on Export CSV; `pie-chart` 16 px in the section nav.
- Cloud: `cloud` 16 px nav; provider marks 20 px monochrome; `plus-circle` 16 px "Create server"; Resize `maximize-2` 16, Reboot `power` 16, Delete `trash-2` 16 in `danger`.
- Explain: `sparkles` 14 px on the button, `send` 16 px on Send, `copy` 16 px on the answer.
- Constraint notes use `info` 14 px in `text-muted`, never a warning triangle (nothing is wrong).

### Copy
- Cron presets: "Every hour" · "Every day" · "Every week" · "Every month" · "Custom". Preview: "Runs every day at 03:00 UTC (08:30 your time). Next run in 6 h 12 min." Timezone caption: "Schedules use UTC so they don't shift with daylight saving."
- Invalid custom: "That's not a valid schedule. Use five fields: minute hour day month weekday." Too frequent: "Schedules run at most once a minute."
- Overlap: "Skip if still running" / "Run anyway" with "Skipping keeps two copies from writing at once."
- Runs empty: "No runs yet. The first one starts at 03:00 UTC." Skipped reasons: "Skipped — previous run still running" · "Skipped — Lumen was offline at the time".
- Timed out: "Timed out after 60 min. Raise the timeout under Advanced or make the job faster."
- Sleep switch: "Sleep when idle" · "Sleep after 10 minutes without requests. The first request wakes it in a few seconds." · constraint "Services with a TCP proxy stay awake so their port keeps working." · databases: "Databases don't sleep."
- Sleep now confirm (impactful, simple confirm): "Put api to sleep? It wakes on the next request." Button "Sleep now".
- Node meta: "Asleep since 14:02 · wakes on request". Wake marker tooltip: "Woke in 4.2 s".
- Waking page: title "Waking up" · body "This app was asleep and is starting now. Refresh in a few seconds."
- Wake timeout card (`WAKE_TIMEOUT`): "Your app didn't wake in time" · "It started but didn't answer on port 3000 within 30 seconds." · fix buttons "Set a healthcheck path", "Increase memory".
- Usage: "Estimates come from the monthly cost you set on each server, split by the memory and CPU limits of what runs there." · banner "2 servers have no monthly cost set, so their services show as —. Set costs on the Servers page." · toggle labels "By limits" / "By usage".
- Cloud account test: "Connected. 3 regions available." · auth failure `CLOUD_AUTH_FAILED`: "Hetzner didn't accept this token" · "Check that the token has read and write access." 
- Provision: "Create a new server" / "Connect a server I already have" · size tags "Good for the control plane", "Cheapest" · progress "Usually 2–4 minutes" · failure "Hetzner says: not enough capacity in fsn1. Try another region."
- Resize: "Resize oracle-1 to 4 vCPU · 24 GB (+$0.00/mo)?" · "Your apps on this server stop for about a minute while it resizes." Button "Resize server".
- Delete linked server: "Delete hetzner-1 at Hetzner? This destroys the machine and everything on it." Typed: the server name. Blocked: "3 services still run here. Move them first."
- Resources affordances: "Need more? Resize this server" · "Move to another server" · "Connect a cloud account to resize from here".
- Explain: settings sentence as in 4.11 · button "Explain this error" · preview title "What we'll send" · "Send" · caption "Answer from claude-fable-5-1. It can be wrong. Check before applying fixes." · rate limited: "You've used 20 explanations this hour. Try again later."
- No exclamation marks anywhere; buttons are verbs.

### States (empty · loading · error · success · partial)
- Cron runs: empty · loading (5 skeleton rows) · list · running row with live elapsed · failed row with exit code and "View logs" · skipped rows muted · timed out with the fix sentence.
- Schedule builder: valid · invalid (danger border + message) · locked by `lumen.toml` (fields disabled, lock icon, "Managed by lumen.toml").
- Sleep: enabled · disabled · disabled-by-constraint (switch disabled with the reason) · sleeping (node, header, list) · waking (◐) · wake failed (error card) · agent offline while sleeping ("Server 'oracle-1' is offline. This app can't wake until it's back.").
- Usage: no servers ("Connect a server to see costs") · servers without cost (banner + — cells) · full · loading (3 card skeletons + 8 row skeletons) · CSV generating (button spinner).
- Cloud accounts: empty ("Connect a cloud account to create and resize servers from Lumen.", button "Connect account") · form · testing · test ok · test failed (catalog card) · list · in use (delete blocked).
- Provision: choosing · sizes loading (card skeletons) · pricing unavailable ("Prices aren't available right now. You can still create the server.") · creating (checklist) · created and joining · failed (`CLOUD_CREATE_FAILED` card with retry) · quota (`CLOUD_QUOTA`: "Your account hit its server limit in this region. Ask the provider to raise it or pick another region.").
- Resize / Reboot: confirm · in progress (server card shows ◐ "Resizing", deploys paused note) · done (toast "oracle-1 resized to 4 vCPU · 24 GB") · failed.
- Explain: disabled (button absent) · preview · sending (dots) · streaming · done · error (key invalid → "Anthropic rejected the API key. Update it in workspace settings.") · rate limited.

### Keyboard & accessibility
- Schedule builder: segmented control is a radio group with arrow keys; the custom input has `aria-describedby` pointing at the preview line so screen readers hear the human-readable schedule; the preview is `aria-live="polite"`.
- Runs table: sortable headers with `aria-sort`; status text present ("Failed, exit code 3"), never color-only.
- Sleep switch: `role="switch"` with `aria-checked`; the constraint reason is the switch's `aria-describedby`.
- Sleeping status announced through the C11 live region: "api is sleeping" and "api woke up".
- Usage table: expandable rows are buttons with `aria-expanded`; share bars have visually hidden text "62 percent".
- Provision size cards: real radios in labels; price and specs in the accessible name.
- Typed confirmations per C8.5.
- Explain panel: focus moves to the preview heading on open, Esc closes (not while streaming without a confirm), the streamed region is `aria-live="polite"` with `aria-busy` during streaming.
- Waking page: `<h1>` present, `<meta http-equiv="refresh" content="5">` so it retries on its own for users who don't refresh; `lang` set.
- axe clean on every new surface in both themes; manual keyboard pass: create a cron job, run it, enable sleep, put it to sleep, export CSV, connect a cloud account without a mouse.

### Responsive
- ≥ 1280: as specified.
- 1024–1279: usage summary cards 3-up remain; provision size grid 2 columns; Explain panel overlays the inspector.
- 768–1023: usage cards 2-up then 1; runs table drops the Server column (available in the row sheet); size grid 2 columns.
- < 768: schedule builder segmented control wraps into two rows; runs become cards (status, scheduled, duration, "View logs"); usage table becomes a per-service card list with cost as the title; cloud forms single column; provision lists single column; Explain panel is a full-screen sheet; the sleeping node in the mobile list shows ☾ and "Asleep · wakes on request".
- Waking page: fluid, 24 px gutters, readable at 320 px.

### Performance
- Cron tick is one indexed query on `(sleep_enabled, cron_schedule) WHERE cron_schedule IS NOT NULL` with `next_run_at` materialized on the instance and updated after each enqueue, so 2 000 services cost one index scan per 30 s.
- Idle tracking in the agent is an in-memory map updated from the access-log stream; no per-request disk writes.
- Wake path target: under 5 s for a warm Node container (container start ~1 s + healthcheck); measured and recorded; hard limit 30 s.
- Waker holds at most 200 concurrent requests per instance; beyond that it returns the 503 page immediately (prevents memory growth during a thundering herd).
- Usage computation is one query over placements joined with servers and a 30-day rollup aggregate; cached 5 minutes per workspace.
- Pricing cached 24 h; provider list calls have 10 s timeouts and never block page render (skeletons).
- Explain streams through SSE with backpressure; the last-100-lines fetch uses the existing log index.

### Security
- Cloud credentials: B7 envelope encryption, write-only, never returned; test-connection results stored without payloads; provider calls made server-side with 10 s timeouts and no user-controlled URLs (SSRF-safe: endpoints are constants per provider).
- cloud-init join token is single-use with a 1 h expiry (B12); the rendered cloud-init is stored hashed only; the token never appears in the UI or logs.
- Firewall automation opens only 80, 443 and 51820/udp and records exactly what it created so Delete can remove it.
- Resize/Reboot/Delete require `servers.manage` (admin+), typed confirmation for Delete, and are audited with provider ids.
- Waker listens on loopback only and trusts only the `X-Lumen-Instance` header Caddy sets (Caddy strips client-supplied copies).
- Cron `RunOnce` containers inherit every hardening default (no socket, capabilities dropped, limits, pids limit) and secret scrubbing.
- Explain: the API key is write-only; the payload is scrubbed twice; the preview is the exact body; the feature is off by default; audit rows carry the error code only; rate limited per workspace.
- Usage CSV export is scoped by `audit.view`-level permission (admin+) since it reveals fleet-wide layout; the page itself is visible to members.

### Data integrity & idempotency
- `cron_runs` unique on `(service_instance_id, scheduled_for)`; `RunOnce` is keyed by `run_id`, and a duplicate op for the same run id is acknowledged without a second container.
- Sleep transitions are idempotent: a `SleepNow` for an already-sleeping instance acks; a wake for an active instance acks; the Caddy route rewrite compares the current config hash before writing.
- Cost shares always sum to the server's cost (tested), and unset costs propagate as `null`, never `0`.
- Provisioning writes the `servers` row before calling the provider, and reconciles on failure (marks `failed` with the provider error; a retry reuses the row and mints a fresh token).
- Resize updates capacity fields only after the agent's post-resize `AgentHello` reports the new values.

## 6. Acceptance criteria
- [ ] SPEC D6: "App sleeping with wake-on-request. AC: the first request after sleep succeeds (held until healthy, within 30s)."
- [ ] SPEC D6: "Cloud integrations: provision a new VM from the UI (cloud-init runs the join command), resize, reboot, delete, and pull pricing for cost estimates (Oracle, AWS, GCP, Hetzner, DO)."
- [ ] SPEC Phase 16 AC: a server created from the UI on at least 2 providers joins automatically (Hetzner and Oracle recorded; the other three verified with test accounts where available).
- [ ] SPEC D12: usage and cost estimates; the optional "Explain this error" shows exactly what is sent and stays off unless configured.
- [ ] Cron: a service with `0 * * * *` runs once per hour with no duplicates across control-plane restarts; overlap policy `skip` produces a skipped row; `timeout` kills and records; "Run now" works; failed runs notify.
- [ ] Schedule builder presets produce the documented expressions; the preview and next-run text are correct for UTC and the browser timezone; invalid input is rejected with the documented message.
- [ ] Sleep: an idle service sleeps after `sleep_after_s` and shows ☾ within 1 s of the transition; 20 concurrent first requests share one wake and all succeed; wake latency under 30 s (target 5 s) is recorded; TCP-proxy, cron and database services cannot enable sleep.
- [ ] Usage & cost page and CSV match the share model tests; server cards show the cost chip.
- [ ] Cloud accounts for all five providers store credentials write-only and pass "Test connection"; the minimum permissions checklist is shown per provider.
- [ ] Resize and reboot on a linked server work with the `draining` window and update capacity and cost; delete is blocked while services remain and removes provider firewall rules it created.
- [ ] Resources section shows "Resize this server" / "Move to another server" / "Connect a cloud account" according to state.
- [ ] `lumen.toml` `deploy.cron` and `deploy.sleep_when_idle` lock the UI fields.
- [ ] Chaos: sleep/wake survives an agent restart and a 10-minute control-plane outage.
- [ ] All new surfaces pass C14 at 390 / 1024 / 1440 × dark / light; axe clean; errors from the catalog (`WAKE_TIMEOUT`, `CLOUD_CREATE_FAILED`, `CLOUD_AUTH_FAILED`, `CLOUD_QUOTA`, `HEALTHCHECK_TIMEOUT`, `SERVER_CAPACITY`).

## 7. Test plan
- **Unit:** cron parse/describe/next-run; builder preset → expression; share model; cloud-init rendering; pricing cache; Explain payload builder and scrubber; waker singleflight and hold-queue limits (Go).
- **Integration:** cron tick idempotency across two concurrent workers; `RunOnce` against real Docker (exit code, timeout, OOM); sleep transition with a Caddy container (route swap, hold, wake); cloud clients with recorded fixtures (nock for Hetzner/DO, SDK mocks for AWS/GCP/OCI); usage endpoint against seeded placements; Explain SSE stream with a mocked Anthropic endpoint.
- **E2E (Playwright):** create a cron job through the Add flow, run now, see the run and its logs; enable sleep, wait for ☾ (short `sleep_after_s`), visit the URL and see the app after a wake; usage page toggle and CSV download; connect a cloud account with fixtures, provision (against a fake provider server in the harness), see the checklist; Resources affordances; Explain panel preview and stream.
- **Visual regression:** every new component and state in §5, 3 widths × 2 themes.
- **Accessibility (axe + keyboard pass):** axe on every new surface; the keyboard script in §5.
- **Manual / on a real VM:** real provisioning on Hetzner and Oracle (Ampere arm64) from the UI with timings; real resize on Hetzner; wake latency measurements for Node, Python and Go hello-worlds; a real Explain call with a test key.

## 8. Evidence required to close
- Cron: the runs table screenshot after 3 hours with one run per hour, the duplicate-prevention test output, the timeout test output.
- Sleep: the concurrent-wake test output (1 start, 20 × 200), wake latency table per runtime, the curl-loop log across a sleep transition showing 0 failures, the chaos test output.
- Usage: share model test output, a CSV sample, screenshots.
- Cloud: screen recordings or step screenshots of provisioning on Hetzner and Oracle with the checklist going green and the elapsed time; resize before/after capacity; the provider firewall rules created; test-connection results for all five providers.
- Explain: the preview vs request-body equality test output; a screenshot of a streamed answer.
- Screenshots for every new surface at 390 / 1024 / 1440 × dark / light with C14 notes; axe reports.

## 9. Review
- SPEC H1 with Fable 5.1 on the scheduler, `RunOnce`, sleep tracker, waker and Caddy route code; probe: double execution across worker restarts, held-request memory growth, route swap races between sleep and a concurrent deploy, wake during a deploy, timezone bugs (DST), and what happens when `docker start` fails.
- SPEC H1 with the other model on cloud clients; probe: credential leakage in errors, SSRF, firewall cleanup on delete, retry storms on provider 5xx.
- SPEC H2 on the builder, runs table, sleep states, usage page, provision wizard and Explain panel; probe: does a beginner understand "By limits" versus "By usage", is the waking page reassuring, does the provider form explain where to get the keys.
- SPEC H3 subset: malicious container sending fake `X-Lumen-Instance` headers to the waker, a member triggering provider actions, Explain payload exfiltration of secrets.

## 10. Risks & open questions
- **Risk:** Wake latency exceeds 30 s for heavy runtimes (JVM, large Python apps). → **Mitigation:** the friendly 503 page with auto-refresh, the `WAKE_TIMEOUT` card suggesting a healthcheck path and memory, and documentation that sleep suits light services; measure and publish the latency table.
- **Risk:** Idle detection misses non-HTTP activity (websocket long-lived connections without requests). → **Mitigation:** count open upstream connections from Caddy's admin metrics as activity; an instance with any open connection never sleeps.
- **Risk:** Provider APIs change or rate-limit pricing calls. → **Mitigation:** 24 h cache, graceful "prices unavailable" state, fixtures with `verified_at` dates, Oracle static table reviewed each release.
- **Risk:** Cost estimates are read as bills. → **Mitigation:** the word "Estimated" on every number, the explanatory sentence, and no currency conversion.
- **Risk:** cloud-init fails silently when the image lacks `curl`. → **Mitigation:** `packages: [curl]` in cloud-init and a fallback `wget` line; the pending server row shows "Waiting for the server to call home (usually 2–4 minutes)" with a "Show the join command" fallback after 10 minutes.
- **Open question:** Should cron runs write to `deployment_logs` (Postgres, retained) or agent-local logs? Default: Postgres under phase `cron`, capped at 5 000 lines per run, because cron output matters after a server dies and runs are short.
- **Open question:** Default sleep timeout 10 minutes versus 30. Default 10 (SPEC C7.12 example), user can change.
- **Open question:** Whether members may create servers through cloud accounts. Default: admin+ (`servers.manage`), matching D11.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: control-plane-driven cron with agent `RunOnce`, `cron-parser` + `cronstrue`, overlap default, waker design and hold limits, sleeping text color exception, share model weights, cloud SDK choices and licenses (`oci-sdk`, `@aws-sdk/*`, `@google-cloud/compute`, thin Hetzner/DO clients), Oracle static pricing, `@anthropic-ai/sdk` and the Explain prompt
- [ ] `docs/UI_DECISIONS.md` updated with screenshots of the builder, runs table, sleeping states, usage page, provision wizard and Explain panel
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 16 — Cron, sleeping, cost, cloud integrations</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-16-cron-sleep-cost-cloud.md,
and these SPEC sections: D6, D12, B4, B5 (cron_jobs, ops), B6 (cron_runs, cloud_accounts, servers.monthly_cost),
B9, B13, C4, C7.5 (item 6), C7.7, C7.12 (Resources, Scaling, Sleep when idle, Cron), C7.18, C7.20, C8, C9, C14, J3, J6, Part H1/H2/H3.
</context>
<goal>A user schedules a nightly job with a plain-language builder, lets an idle app sleep and wake on its first request within 30 seconds, sees estimated monthly cost per service, and creates a server on Oracle or Hetzner from the dashboard that joins on its own.</goal>
<scope>
- Cron: cron_runs schema, control-plane scheduler (idempotent tick), agent RunOnce op with timeout and scrubbing, overlap policy, schedule builder with presets and human-readable preview, Add-flow option, Settings → Cron, runs history in the inspector, failure notifications
- Sleeping: idle detection from HTTP logs, sleep transition, ☾ status everywhere, Caddy hold route + agent waker with singleflight and 30 s bound, friendly waking page, Sleep now / Wake now, Settings → Sleep when idle with constraints, metrics sleep bands and wake markers, chaos tests
- Usage & cost: servers.monthly_cost, share model (by limits / by usage), workspace Usage & cost page, CSV export, server cost chips
- Cloud accounts for Oracle, AWS, GCP, Hetzner, DigitalOcean (encrypted write-only credentials, test connection, permission checklists); provision from the UI with cloud-init join and firewall automation; resize / reboot / delete; pricing with cache; Resources-section affordances
- Optional "Explain this error" with workspace key, exact payload preview, streaming, audit, rate limit
- lumen.toml deploy.cron and deploy.sleep_when_idle locks
</scope>
<out_of_scope>
- Azure provisioning, replicas/placement (Phase 12), HA Postgres (Phase 17), billing/invoicing, any AI feature beyond error explanation
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-16-cron-sleep-cost-cloud.md §6, including: first request after sleep succeeds within 30 s with 20 concurrent requests sharing one wake; a server created from the UI on Hetzner and Oracle joins automatically; cron runs once per schedule with no duplicates across restarts; usage shares sum to server cost; cloud credentials write-only and tested for all five providers; Explain preview equals the sent body and is off by default; chaos tests for agent restart and 10-minute control-plane outage pass; C14 at 390/1024/1440 × dark/light on every new surface.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, protocol additions (RunOnce, SleepNow, ActualState fields), schema changes (cron_runs, cloud_accounts, monthly_cost, next_run_at), the waker design, risks, test plan, open questions. STOP and wait for approval.
2. Implement in the session order from the phase doc header; run Go tests, Vitest and Playwright after each step; measure wake latency on a real VM before claiming sleep done.
3. For UI: screenshots at 390/1024/1440 × dark/light × every state in §5; critique against SPEC C14 and §5; fix before reporting.
4. Report: what works (with test output, latency tables, provisioning recordings), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
