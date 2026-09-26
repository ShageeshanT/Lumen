# Phase 08 — Observability

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (log fan-out, retention and webhook signing get a Fable pass) |
| **Depends on** | Phase 3 (agent log capture, metrics sampling), Phase 4 (control plane, realtime fan-out, staged changes API), Phase 5 (inspector, runtime Logs tab, staged changes bar), Phase 7 (Caddy HTTP access logs and `http_log_rollups`) |
| **Unblocks** | Phase 9 (database Metrics/Logs tabs reuse these components), Phase 12 (fan-out across mesh servers is exercised for real), Phase 16 (cost view reads `metric_rollups`), Phase 18 (load and chaos suites target these paths) |
| **Spec sections** | SPEC B5 (`MetricsBatch`, `LogSubscribe`, `LogQuery`), B6 (`deployment_logs`, `metric_rollups`, `http_log_rollups`, `notification_channels`, `notification_rules`, `webhooks_outgoing`, `webhook_deliveries`), B11, B14, C4, C5 (Charts, Log viewer), C7.10, C7.11, C7.17, C7.24, C8.3, C8.4, C8.6, C9, C10, C11, C12, D8, J1 (logs/metrics, notifications & webhooks), J6 (`OOM_KILLED`, `CRASH_LOOP`) |
| **Estimated sessions** | 9 focused sessions: (1) metrics pipeline, (2) chart component, (3) Metrics tab, (4) filter parser + log viewer, (5) Logs tab modes + fan-out, (6) Observability page, (7) notifications + rules, (8) outgoing webhooks + notifications center, (9) screenshots, a11y, review fixes |

## 1. Goal
A user watching any service can see its CPU, memory, network, disk and HTTP health as live charts with deploy markers, search every log line across every server with a typed filter syntax, build a project dashboard from widgets, and get told on Discord, Slack, email or a webhook when a deploy fails, an app crashes or runs out of memory, a server goes offline, or a disk fills up.

## 2. Why this phase exists
Deploying is half the product; knowing what the app is doing afterwards is the other half. Beginners cannot read `docker stats` or grep container logs, and the spec's north-star user has never done either. Observability is where the "errors come with fixes" principle (C3.6) pays off: an OOM kill has to become "Your app ran out of memory (512 MB). Give it 1 GB?" with a one-click staged change, not "exit code 137".

The pipeline is deliberately light (B11): runtime logs stay on the server in rotating segment files, only 1-minute metric rollups reach Postgres, and there is no Redis, no ClickHouse and no Loki, because the control plane must idle under 512 MB on a free-tier VM (B14). Every design choice here trades query power for footprint, and that trade must be explicit in DECISIONS.md.

Feature parity target: a metrics tab with limit lines and deploy markers, a log explorer with removable filter chips, an observability dashboard with draggable widgets, and per-event notifications, structurally comparable to what mature managed platforms offer. The visual identity remains Lumen's own (C2, C4).

## 3. Scope
### In scope
- Metrics data path end to end: agent sampler (10s), 1h local full-resolution ring buffer for live charts, `MetricsBatch` upload, 1-minute rollups in Postgres with retention 1m × 7d and 1h × 90d, host samples.
- Chart library decision and one shared `TimeSeriesChart` component (synced crosshair, limit line, deploy markers, OOM markers, replica breakdown, screen-reader summary, skeleton).
- Service **Metrics** tab (C7.10) for web services, workers, cron and databases: CPU, Memory, Network in/out, Disk; plus Requests/min, 5xx %, p95 latency for web services from `http_log_rollups`.
- Smart memory hint (memory above 90% of limit → one-click staged change to the next slider step).
- Log filter syntax grammar and parser in `packages/shared` (free text, `level:`, `status:`, `path:`, `service:`, arbitrary JSON attribute keys, comparison operators, negation, quoting) with exhaustive unit tests.
- Log viewer component completion (C5): virtualized rows, ANSI colors, JSON expand into a key-value tree, level colors, search highlight, pause-on-scroll with "Jump to live", timestamps / wrap / dense toggles, download of the current filter up to 50k lines, click-to-copy.
- Service **Logs** tab modes Runtime · HTTP · Build (latest), filter bar rendering filter chips, time range picker, deployment selector, all state in the URL.
- Log query fan-out across every agent hosting a replica, merged by timestamp, with the offline partial state "Server offline — showing logs up to <time>" and the cached tail.
- Log retention settings (instance default 7 days; per-service override under Settings → Advanced).
- Project **Observability** page (C7.17): log explorer across services with histogram click-to-zoom and saved queries; widget dashboard with drag and resize, widget catalog, default dashboard auto-created; deploy timeline.
- Notification channels (email, Discord, Slack, webhook) with "Send test", per-event message templates, and notification rules (workspace-wide or per project) for every D8 event: deploy success, deploy fail, crash, OOM, server offline, disk ≥ 90%, volume ≥ 90%, backup failed, cert failure.
- Outgoing project webhooks with HMAC-SHA256 signatures, a delivery log and retry.
- Notifications center bell popover (C7.24) with tabs All / Deploys / Alerts, mark all read, deep links, link to preferences.
- Error cards `OOM_KILLED` and `CRASH_LOOP` wired to their fix actions.

### Out of scope
- HTTP access log capture from Caddy and `http_log_rollups` writes (Phase 7 owns capture; this phase reads them).
- Build log capture and `deployment_logs` writes (Phase 3 / Phase 4 own them; this phase renders the Build mode).
- Backup failure and certificate failure *detection* (Phase 9 and Phase 7 emit the events; this phase defines the event bus and delivers them).
- Personal email notification preferences page beyond the link from the bell (Phase 15, C7.21).
- Cost and usage view (Phase 16).
- Cross-server private networking; the fan-out is written for N servers but verified on 2 servers here and on the mesh in Phase 12.
- The optional "Explain this error" feature (Phase 16).

## 4. Work breakdown

### 4.1 Metrics sampler and local ring buffer (agent)
- **What:** Sample Docker stats (`cpu_percent`, `memory_usage`, `memory_limit`, `net_rx`, `net_tx`, `blkio`) per container and host metrics (`cpu`, `mem_used`, `mem_total`, `disk_used`, `disk_total`, `load1`) every 10s. Keep 1h at full resolution in an in-memory ring (360 samples per series). Emit `MetricsBatch{container_samples[], host_sample}` every 10s while any live subscriber exists, otherwise every 60s as a rollup.
- **Files:** `apps/agent/internal/metrics/sampler.go`, `apps/agent/internal/metrics/ring.go`, `apps/agent/internal/metrics/rollup.go`, `apps/agent/internal/metrics/sampler_test.go`, `packages/protocol/proto/lumen/v1/metrics.proto` (extend `MetricsBatch` with `interval_s` and `oom_events[]`).
- **Done when:** a Go test feeds fake stats and asserts a 360-sample ring, 1-minute rollups with min/max/avg, and that agent idle RAM stays under the 50 MB budget with 50 containers sampled.

### 4.2 Metrics ingestion, rollups and retention (API)
- **What:** Gateway handler writes 1-minute rollups to `metric_rollups(service_instance_id, replica_id, bucket_ts, cpu_avg, cpu_max, mem_avg, mem_max, mem_limit, net_rx, net_tx, disk_used, oom)`; a nightly worker compacts 1m rows older than 7d into 1h rows and deletes 1h rows older than 90d. Host samples go to `server_metric_rollups`.
- **Files:** `packages/db/src/schema/metric_rollups.ts`, `packages/db/src/schema/server_metric_rollups.ts`, `packages/db/migrations/00xx_metric_rollups.sql` (partition by month), `apps/api/src/gateway/handlers/metrics.ts`, `apps/api/src/workers/metrics-compact.ts`, `apps/api/src/workers/metrics-retention.ts`.
- **Done when:** integration test inserts 8 days of 1m rows, runs the worker, and asserts 7d of 1m rows remain plus 1h rows for the eighth day; a 91-day-old 1h row is gone.

### 4.3 Metrics query API and live subscription
- **What:** `GET /v1/services/:id/metrics?range=1h|6h|24h|7d|30d&replica=all|<id>&environment=` returns series at the right resolution (10s from the agent ring for 1h, 1m rows for 6h and 24h, 1h rows for 7d and 30d) plus deploy markers (`deployments.started_at`, `finished_at`, `commit_sha`, `commit_message`) and OOM events. The realtime WebSocket topic `metrics:<service_instance_id>` pushes each 10s sample.
- **Files:** `apps/api/src/routes/services/metrics.ts`, `apps/api/src/realtime/topics/metrics.ts`, `packages/shared/src/metrics/types.ts`, `apps/api/src/routes/services/metrics.test.ts`.
- **Done when:** the route is in OpenAPI, Zod-validated, RBAC-checked (viewer may read), returns the documented shape, and the WebSocket delivers a sample within 1s of the agent's send in the integration test.

### 4.4 Chart library decision and shared chart component
- **What:** Evaluate and record in DECISIONS.md: uPlot (MIT, about 45 KB min, canvas, handles 100k points, no React wrapper), Chart.js (MIT, canvas, 65 KB min, slower with many points), Recharts (MIT, SVG, layout shift with many points), visx (MIT, low-level, large build effort), Apache ECharts (Apache-2.0, 300 KB+). Default choice: uPlot with a thin React wrapper. Build `TimeSeriesChart` with: multi-series lines or areas, a horizontal dashed limit line, vertical deploy markers with a hover tooltip showing short SHA and commit message, OOM event markers as a filled danger dot on the memory series, synced crosshair across all charts on a page via a `ChartSyncProvider`, a text summary (`<p class="sr-only">`) generated per series ("CPU averaged 32% over the last hour, peaking at 71% at 14:02"), an `aria-label`, and a skeleton that matches the final layout.
- **Files:** `packages/ui/src/charts/TimeSeriesChart.tsx`, `packages/ui/src/charts/ChartSyncProvider.tsx`, `packages/ui/src/charts/useUplot.ts`, `packages/ui/src/charts/chart-theme.ts`, `packages/ui/src/charts/summary.ts`, `packages/ui/src/charts/TimeSeriesChart.stories.tsx` (gallery entries at `/dev/components#charts`), `packages/ui/src/charts/summary.test.ts`.
- **Done when:** the gallery shows the chart in both themes with every state (loading skeleton, empty, error, single replica, three replicas, with limit line, with deploy markers, with OOM markers) and the summary text is asserted in a unit test.

### 4.5 Metrics tab
- **What:** Implement C7.10 inside the inspector at `/p/:project/:env/s/:service/metrics?range=24h&replicas=split`. Charts in a two-column grid at ≥1280 (single column when the inspector is narrower than 640px): CPU (limit line at `cpu_limit`), Memory (limit line at `memory_limit_mb`, OOM markers), Network in/out (two series), Disk (volume used vs limit; hidden when no volume), and for web services Requests/min, Error rate (5xx %), p95 latency. Time range segmented control 1h · 6h · 24h · 7d · 30d. Replica breakdown toggle. Deploy markers on every chart.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/metrics/page.tsx`, `apps/web/components/metrics/MetricsTab.tsx`, `apps/web/components/metrics/TimeRangeControl.tsx`, `apps/web/components/metrics/ReplicaToggle.tsx`, `apps/web/components/metrics/MemoryHint.tsx`, `apps/web/lib/queries/metrics.ts`.
- **Done when:** the tab renders live data for a deployed service, the crosshair moves in sync across all charts, the URL updates on range change, and screenshots exist for 390/1024/1440 × dark/light × (loading, live, empty, server offline).

### 4.6 Smart memory hint → staged change
- **What:** If the last 5 minutes of memory samples all exceed 90% of `memory_limit_mb`, show an inline info banner above the Memory chart: "Your app is close to its memory limit. Increase to 1 GB?" where the proposed value is the next slider step above the current limit (128 → 256 → 512 → 1024 → 2048 → 4096 MB). The button stages `memory_limit_mb` via `PUT /v1/environments/:id/staged` and the staged changes bar appears.
- **Files:** `apps/web/components/metrics/MemoryHint.tsx`, `packages/shared/src/resources/steps.ts`, `packages/shared/src/resources/steps.test.ts`.
- **Done when:** a unit test covers the step ladder and the 90% × 5-minute rule; an e2e test drives a memory-hungry container and asserts the banner then the staged change.

### 4.7 Log filter syntax and parser
- **What:** Define the grammar in `packages/shared/src/logs/filter-grammar.md` and implement a hand-written tokenizer + parser producing an AST that both the web (chips) and the API/agent (matching) use.
  - Free text: bare words match substring case-insensitively across the raw line; `"quoted phrase"` matches exactly.
  - Key filters: `level:error`, `level:warn|error` (alternation), `status:500`, `status:>=500`, `status:4xx` (class shorthand), `path:/api/*` (glob), `method:POST`, `service:api`, `replica:2`, `deployment:abc123`, `<attr>:<value>` for any JSON attribute (`user_id:42`, `request_id:*`).
  - Operators: `=` (default), `>`, `>=`, `<`, `<=`, `!=`, `~` (regex, `path:~^/v1/.*`).
  - Negation: leading `-` (`-level:debug`, `-"health check"`).
  - Implicit AND between terms; `OR` keyword between groups; parentheses for grouping.
  - Errors: an unterminated quote or unknown operator produces a parse error with a character offset that the UI underlines.
- **Files:** `packages/shared/src/logs/filter.ts` (tokenize, parse, `matchLine(ast, line)`), `packages/shared/src/logs/filter-grammar.md`, `packages/shared/src/logs/filter.test.ts` (≥ 60 cases including every operator, negation, quoting, glob, regex, invalid input), Go port for agent-side matching `apps/agent/internal/logs/filter/filter.go` with the same test vectors loaded from `packages/shared/src/logs/filter-vectors.json`.
- **Done when:** TS and Go pass the identical vector file; `pnpm test` and `go test ./...` are green.

### 4.8 Log viewer component
- **What:** Complete `LogViewer` in `packages/ui`: rows virtualized with `@tanstack/react-virtual` (MIT), variable row height for wrapped and expanded JSON rows, ANSI escape rendering via `anser` (MIT) restricted to the 16 colors + bold/dim/underline mapped to theme tokens, JSON lines detected by leading `{` and valid parse, expand into a key-value tree with copy on each value, level badge coloring (`trace`/`debug` text-muted, `info` text-secondary, `warn` warning, `error`/`fatal` danger), search highlight with a `mark` element using `accent-subtle` background, pause-on-scroll (any upward scroll while live sets paused; "Jump to live" floating pill appears bottom-center with the count of new lines), toggles (timestamps, wrap, dense), download (client requests `GET …/logs?…&format=ndjson&limit=50000` and streams to a file named `<service>-<env>-<mode>-<from>-<to>.log`), click-to-copy a line (whole raw line; toast "Copied").
- **Files:** `packages/ui/src/log-viewer/LogViewer.tsx`, `packages/ui/src/log-viewer/LogRow.tsx`, `packages/ui/src/log-viewer/JsonTree.tsx`, `packages/ui/src/log-viewer/ansi.ts`, `packages/ui/src/log-viewer/useLiveTail.ts`, `packages/ui/src/log-viewer/JumpToLive.tsx`, `packages/ui/src/log-viewer/LogViewer.stories.tsx`, `packages/ui/src/log-viewer/ansi.test.ts`, `packages/ui/src/log-viewer/LogViewer.test.tsx`.
- **Done when:** the gallery shows 10,000 synthetic lines scrolling at 60 fps in a Playwright trace, a JSON row expands and collapses by keyboard, and ANSI output from a colored `npm install` renders correctly in both themes.

### 4.9 Logs tab modes, filter bar and URL state
- **What:** Extend the Phase 5 Runtime tab into the three modes: Runtime (agent segment files via `LogSubscribe` / `LogQuery`), HTTP (per-request rows from Phase 7 storage rendered with method, path, status, duration, bytes, client IP, user agent columns), Build (latest deployment's `deployment_logs` phase=build, with a deployment selector to view older builds). Filter bar: a single input with autocomplete for keys (`level:`, `status:`, `path:`, and JSON keys seen in the last 1,000 lines), each parsed term rendered as a removable chip, invalid syntax underlined with the parser's offset. Time range picker: presets Live · 15m · 1h · 6h · 24h · 7d · Custom (two datetime inputs). Deployment selector defaults to the active deployment. URL: `/p/:project/:env/s/:service/logs?mode=runtime&q=level%3Aerror%20-%22health%22&from=2026-09-26T10:00Z&to=…&deployment=<id>&live=1`.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/logs/page.tsx`, `apps/web/components/logs/LogsTab.tsx`, `apps/web/components/logs/ModeSwitch.tsx`, `apps/web/components/logs/FilterBar.tsx`, `apps/web/components/logs/FilterChip.tsx`, `apps/web/components/logs/TimeRangePicker.tsx`, `apps/web/components/logs/DeploymentSelector.tsx`, `apps/web/components/logs/HttpLogRow.tsx`, `apps/web/lib/url-state/logs.ts`, `apps/web/lib/url-state/logs.test.ts`.
- **Done when:** reloading any Logs URL restores mode, chips, range, deployment and live state exactly; an e2e test asserts each.

### 4.10 Log query fan-out and offline partial state
- **What:** `GET /v1/services/:id/logs` and `GET /v1/environments/:id/logs` resolve the set of servers hosting replicas of the target services, send `LogQuery{filter_ast, since, until, limit, cursor}` to each online agent in parallel with a 5s per-agent timeout, k-way merge the results by `(ts, server_seq)`, and page with an opaque cursor encoding per-server positions. For each offline server include `partial: [{server_id, name, last_seen_at}]` and the cached tail (the last 500 lines the control plane received via `LogChunk` before the server went silent, held in a bounded in-memory LRU keyed by container). Live tail multiplexes `LogSubscribe` per server into the `logs:<service_instance_id>` realtime topic.
- **Files:** `apps/api/src/logs/query.ts`, `apps/api/src/logs/merge.ts`, `apps/api/src/logs/cursor.ts`, `apps/api/src/logs/tail-cache.ts`, `apps/api/src/routes/services/logs.ts`, `apps/api/src/routes/environments/logs.ts`, `apps/api/src/logs/merge.test.ts`, `apps/agent/internal/logs/query.go`, `apps/agent/internal/logs/segments.go` (index lookup by time), `apps/agent/internal/logs/query_test.go`.
- **Done when:** an integration test with two fake agents returns a correctly interleaved page and a stable cursor; stopping one fake agent yields `partial` with the cached tail; the UI shows the banner "Server 'oracle-1' is offline. Showing logs up to 14:02." above the viewer.

### 4.11 Log retention settings
- **What:** Instance default retention (7 days) in `instance_settings.log_retention_days` editable in Instance admin → Overview; per-service override in Settings → Advanced ("Keep runtime logs for [7] days · Logs are stored on the server, not in Lumen's database."). The agent receives retention in `DesiredState.containers[].log_retention_days` and prunes segment files older than that on its hourly cleanup tick. Build and deploy logs in Postgres follow `deployment_logs` monthly partitions with a 90-day drop.
- **Files:** `packages/db/src/schema/instance_settings.ts` (add key), `packages/protocol/proto/lumen/v1/state.proto` (add field), `apps/api/src/desired-state/compile.ts`, `apps/agent/internal/logs/retention.go`, `apps/web/components/settings/AdvancedSection.tsx`, `apps/api/src/workers/deployment-logs-retention.ts`.
- **Done when:** a Go test with faked file mtimes prunes the right segments; the setting round-trips through the UI.

### 4.12 Observability page: log explorer
- **What:** `/p/:project/:env/observability/logs` — the same viewer and filter bar across all services in the environment, plus a `service:` chip, a service multi-select, a histogram of line counts per bucket (bucket = range / 60, min 10s) above the viewer rendered with `TimeSeriesChart` in bar mode; clicking a bar sets `from`/`to` to that bucket (zoom), with a "Reset range" link. Saved queries: name + query string + range, stored per user per project in `saved_log_queries`, listed in a dropdown left of the filter input, with rename and delete.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/observability/logs/page.tsx`, `apps/web/components/observability/LogExplorer.tsx`, `apps/web/components/observability/LogHistogram.tsx`, `apps/web/components/observability/SavedQueries.tsx`, `packages/db/src/schema/saved_log_queries.ts`, `apps/api/src/routes/projects/saved-queries.ts`, `apps/api/src/routes/environments/log-histogram.ts`.
- **Done when:** clicking a histogram bar narrows the range and the URL; a saved query restores query and range from the dropdown; e2e covers both.

### 4.13 Observability page: dashboard with widgets
- **What:** `/p/:project/:env/observability/dashboard` — a 12-column grid with `react-grid-layout` (MIT; record the decision, alternative `dnd-kit` + custom grid) at row height 48px, gap 16px. Widget catalog: Service metric (pick service + metric), Request rate, Error rate, Latency p95, Recent deploys (list), Server health (mini bars per server), Log query (saved query result, last 50 lines), Text/notes (markdown). Widget chrome: title (card title class), a drag handle (`GripVertical` 16px, shown on hover and always on touch), an overflow menu (Edit, Duplicate, Remove), and a resize handle bottom-right. Layout persisted per environment in `projects.canvas_layout.dashboard` (jsonb) via `PUT /v1/projects/:id/dashboard`. Default dashboard is created on first visit: one metric widget per service (CPU+Memory combined), Request rate and Error rate for web services, Recent deploys, Server health.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/observability/dashboard/page.tsx`, `apps/web/components/observability/Dashboard.tsx`, `apps/web/components/observability/WidgetFrame.tsx`, `apps/web/components/observability/widgets/{MetricWidget,RequestRateWidget,ErrorRateWidget,LatencyWidget,RecentDeploysWidget,ServerHealthWidget,LogQueryWidget,TextWidget}.tsx`, `apps/web/components/observability/AddWidgetDialog.tsx`, `apps/web/components/observability/default-dashboard.ts`, `apps/api/src/routes/projects/dashboard.ts`.
- **Done when:** drag, resize, add, remove and edit persist across reload; the default dashboard appears for a fresh project; keyboard users can move a focused widget with arrow keys (see §5).

### 4.14 Observability page: deploy timeline
- **What:** `/p/:project/:env/observability/deploys` — one horizontal time axis (same range control as Metrics) with one lane per service; each deployment is a bar from `started_at` to `finished_at` (or now) colored by status per C4, with the commit short SHA inside when the bar is wider than 64px; hover shows the deployment card; click opens the deployment detail in the inspector.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/observability/deploys/page.tsx`, `apps/web/components/observability/DeployTimeline.tsx`, `apps/api/src/routes/environments/deployments.ts` (`GET /v1/environments/:id/deployments?from&to`).
- **Done when:** 50 deployments across 6 services render without overlap and the page passes axe.

### 4.15 Event bus and alert detection
- **What:** A typed in-process event bus (`apps/api/src/events/bus.ts`) with a Postgres outbox table `events(id, kind, workspace_id, project_id, service_instance_id, payload, created_at)` so notification delivery survives restarts. Producers: deploy lifecycle (`deploy.succeeded`, `deploy.failed`), `ActualState` handler (`service.crashed` on CRASHED, `service.oom_killed` when `oom_killed` flips true), heartbeat monitor (`server.offline` after 30s silence, `server.online`), host sample handler (`server.disk_high` at ≥ 90% used, de-duplicated per server per 6h), volume usage handler (`volume.high` at ≥ 90% of limit or host disk, de-duplicated per volume per 6h), and hooks for Phase 9 (`backup.failed`) and Phase 7 (`cert.failed`).
- **Files:** `apps/api/src/events/bus.ts`, `apps/api/src/events/kinds.ts`, `packages/db/src/schema/events.ts`, `apps/api/src/events/producers/{deploy,actual-state,heartbeat,host,volume}.ts`, `apps/api/src/events/producers/*.test.ts`.
- **Done when:** each producer has a unit test proving the event fires exactly once for its trigger and de-duplication holds.

### 4.16 Notification channels, templates and rules
- **What:** CRUD for `notification_channels(kind email|discord|slack|webhook, config_enc, name)` and `notification_rules(channel_id, project_id?, events[])` under Workspace settings → Notification channels and Project settings → Notifications. Senders: email via the instance SMTP (Phase 11 config; if unset, show "Set up email in Instance settings"), Discord via webhook URL (embed with color per status), Slack via incoming webhook (Block Kit with a header, fields and a button), generic webhook (JSON body, same signature scheme as §4.17). One message template per event kind in `apps/api/src/notify/templates/*.ts` rendered to text, HTML, Discord embed and Slack blocks. "Send test" posts a `test` event through the real sender. A `notify` worker consumes the outbox, matches rules, and records `notification_deliveries(status, response_code, error, attempts)`.
- **Files:** `packages/db/src/schema/notification_channels.ts`, `packages/db/src/schema/notification_rules.ts`, `packages/db/src/schema/notification_deliveries.ts`, `apps/api/src/routes/notifications/{channels,rules}.ts`, `apps/api/src/notify/senders/{email,discord,slack,webhook}.ts`, `apps/api/src/notify/templates/{deploy-succeeded,deploy-failed,service-crashed,service-oom,server-offline,server-disk-high,volume-high,backup-failed,cert-failed,test}.ts`, `apps/api/src/workers/notify.ts`, `apps/web/app/(app)/w/[workspace]/settings/notifications/page.tsx`, `apps/web/components/notifications/{ChannelForm,ChannelList,RuleEditor,SendTestButton}.tsx`, `apps/api/src/notify/senders/*.test.ts` (with a mocked HTTP server).
- **Done when:** a deploy failure on a project with a Discord rule produces a delivery row and a captured HTTP request whose embed matches the snapshot; "Send test" works for all four kinds in the UI.

### 4.17 Outgoing project webhooks with signatures and delivery log
- **What:** `webhooks_outgoing(project_id, url, secret_enc, events[], enabled)` and `webhook_deliveries(webhook_id, event_id, attempt, status_code, duration_ms, request_body, response_excerpt, next_retry_at)`. Delivery: `POST url` with headers `Content-Type: application/json`, `User-Agent: Lumen-Webhooks/1`, `X-Lumen-Event: deploy.failed`, `X-Lumen-Delivery: <uuid>`, `X-Lumen-Timestamp: <unix seconds>`, `X-Lumen-Signature: sha256=<hex hmac-sha256 over "<timestamp>.<body>" with the secret>`; body `{id, kind, created_at, workspace, project, environment, service, deployment?, data}`. Retry on non-2xx or timeout (10s) with backoff 1m, 5m, 30m, 2h, 12h, then mark `failed`. SSRF guard: resolve the host and refuse private, loopback, link-local and metadata ranges (169.254.0.0/16, 10/8, 172.16/12, 192.168/16, fc00::/7, ::1) unless the instance admin allows it. UI: Project settings → Webhooks (list, add, edit, enable toggle, "Send test", delivery log table with status pill, time, duration, "Retry" and "View payload").
- **Files:** `packages/db/src/schema/webhooks_outgoing.ts`, `packages/db/src/schema/webhook_deliveries.ts`, `apps/api/src/routes/projects/webhooks.ts`, `apps/api/src/webhooks/sign.ts`, `apps/api/src/webhooks/deliver.ts`, `apps/api/src/webhooks/ssrf-guard.ts`, `apps/api/src/workers/webhook-deliver.ts`, `apps/api/src/webhooks/sign.test.ts`, `apps/api/src/webhooks/ssrf-guard.test.ts`, `apps/web/app/(app)/p/[project]/settings/webhooks/page.tsx`, `apps/web/components/webhooks/{WebhookForm,DeliveryLog,PayloadDrawer}.tsx`, `docs/user/webhooks.md` (signature verification snippets in Node, Python, Go).
- **Done when:** the signing test vector in the docs verifies in all three snippets; a delivery to a failing endpoint retries on the documented schedule in a clock-mocked test; SSRF tests reject each private range.

### 4.18 Notifications center (bell popover)
- **What:** `user_notifications(user_id, event_id, read_at, title, body, href, kind deploy|alert)` written by the notify worker for events in workspaces the user belongs to (respecting a per-user mute list added in Phase 15). Bell button in the top bar with an unread count badge; popover with tabs All / Deploys / Alerts, list rows (icon, text, relative time, deep link), "Mark all read", and "Notification preferences" link to `/account/notifications`. Realtime topic `user:<id>:notifications` pushes new rows and updates the badge.
- **Files:** `packages/db/src/schema/user_notifications.ts`, `apps/api/src/routes/me/notifications.ts`, `apps/api/src/realtime/topics/user-notifications.ts`, `apps/web/components/shell/NotificationsBell.tsx`, `apps/web/components/notifications/NotificationsPopover.tsx`, `apps/web/components/notifications/NotificationRow.tsx`.
- **Done when:** a deploy failure appears in the bell within 1s, clicking it deep-links to the failed deployment's detail, and the badge clears on "Mark all read".

### 4.19 Error cards `OOM_KILLED` and `CRASH_LOOP`
- **What:** Wire the two catalog entries: `OOM_KILLED` title "Your app ran out of memory", explanation "It used all of its 512 MB. Apps usually need more memory than their starting size." fix button "Give it 1 GB" (stages the next slider step and opens the staged bar) plus "Show raw error"; `CRASH_LOOP` title "Your app keeps crashing on start", explanation "It exited 5 times in 2 minutes, so we stopped restarting it." fix button "Show last error lines" (opens Logs tab filtered `level:error` on the crashed deployment scrolled to the final 50 lines). Both appear at the top of the deployment detail and as the inspector header status tooltip.
- **Files:** `packages/shared/src/errors/catalog.ts` (entries), `apps/web/components/errors/ErrorCard.tsx` (fix action registry), `apps/web/components/errors/actions/{increaseMemory,showLastErrorLines}.ts`.
- **Done when:** e2e runs a container with a 64 MB limit that allocates 128 MB and sees the OOM card with a working fix; a container that exits immediately shows the crash-loop card and the fix lands on the right log lines.

### 4.20 Screenshots, accessibility, review fixes
- **What:** Playwright screenshot matrix for Metrics, Logs (3 modes), Observability (3 sub-pages), Notifications settings, Webhooks settings, Bell popover, at 390/1024/1440 × dark/light × key states; axe on each; self-critique against C14; fix; then the Part H2 UI review by Fable 5.1 and the Part H1 code review of `apps/api/src/logs`, `apps/api/src/webhooks`, `apps/api/src/notify`.
- **Files:** `e2e/visual/observability.spec.ts`, `e2e/a11y/observability.spec.ts`, `docs/UI_DECISIONS.md`.
- **Done when:** all screenshots are linked from UI_DECISIONS.md and every review finding is fixed or tracked in PROGRESS.md.

## 5. Detail checklist

### Typography
- Chart title: card title (14/500, text). Chart unit suffix in the title ("Memory · MB"): meta (13/400, text-secondary), separated by a middle dot with 4px each side.
- Chart axis labels: caption (12/400, text-muted), Geist Mono, tabular numerals, right-aligned on the y-axis with 8px padding from the plot.
- Crosshair tooltip: label 13/500 for the series name, value 13/400 Geist Mono tabular, timestamp caption 12/400 text-secondary; values right-aligned in a 2-column grid.
- Big current-value readout above each chart (last sample): 20/600 tabular, unit in 13/400 text-secondary baseline-aligned; the limit next to it as "of 512 MB" in meta.
- Log lines: code/log line 13/400 Geist Mono, line-height 1.5 (20px rows); dense mode 12/400 with line-height 1.4 (17px rows, rounded to 16 on the grid → use 16px rows with 12/1.333). Timestamp column in text-muted, fixed width `ch`-based (`19ch` for `2026-09-26 14:02:11`), level badge 11/600 uppercase with 0.04em letter-spacing in a 40px-wide fixed column.
- HTTP log rows: method 12/600 mono uppercase in a 48px column, path 13/400 mono (truncate middle with title attribute), status 13/500 mono tabular colored by class, duration 13/400 mono tabular right-aligned in a 64px column, bytes 13/400 tabular in a 64px column, client IP and user agent in meta.
- Filter input: input (14/400); chips 13/500 with the key in text-secondary and the value in text ("level: **error**"); parse error hint caption 12/400 danger under the input.
- Time range segmented control: button sm (13/500); selected segment text, others text-secondary.
- Observability page title: page title (24/600); sub-tab labels 14/500; histogram axis captions 12/400 mono.
- Widget titles: card title (14/500); widget empty text body 14/400 text-secondary; Text widget renders markdown at body size with headings capped at 16/600.
- Notification channel cards: card title for the channel name, meta for the kind and the masked target ("discord.com/api/webhooks/…/•••"); rule editor event checkboxes with label (13/500) and a caption description.
- Webhook delivery log table: table cell (13/400), status pill 12/500, duration and time tabular.
- Bell popover rows: body 14/400 for the text with the subject in 14/500, relative time caption 12/400 text-muted right-aligned; tab labels 13/500 with counts in text-secondary tabular.
- Error cards: title 16/600, explanation body 14/400 text-secondary, raw error in code 12/400 mono inside a `surface` block with 12px padding.

### Spacing & layout
- Metrics tab: 24px page padding inside the inspector; chart cards on a 16px gap grid; each card 16px padding, header row 32px tall, plot area 160px tall (200px at ≥1440), legend row 24px tall below the plot; charts fill width.
- Time range control right-aligned in the tab header row (48px tall) with the replica toggle 16px to its left.
- Memory hint banner: 12px vertical / 16px horizontal padding, icon 16px with 8px gap, button right-aligned, 16px margin below.
- Logs tab: filter bar 48px tall with 8px between input and controls, chips inline inside the input area with 4px gaps and 6px horizontal chip padding; toolbar (mode switch left, toggles right) 40px tall; viewer fills the remaining height with 0 padding (rows have 12px horizontal padding); "Jump to live" pill 32px tall, centered, 16px from the bottom.
- Runtime log row: gutter 12px · timestamp `19ch` · 12px · level 40px · 12px · message flexible; dense mode reduces horizontal gaps to 8px.
- JSON tree: indent 16px per level, key in text-secondary, colon then value; copy icon 14px appears at row end on hover / focus.
- Observability page: max-width 1200px centered (list-page rule C6), page header 64px with title and sub-tabs (Logs · Dashboard · Deploys) as underline tabs; content 24px top margin.
- Log explorer histogram: 96px tall, 16px below the filter bar, 16px above the viewer; service multi-select 240px wide to the left of the filter input.
- Dashboard: 12 columns, row height 48px, 16px gap, 24px outer padding; minimum widget size 3 columns × 3 rows; metric widget 6×4 default; recent deploys 6×6; server health 4×3; log query 12×6.
- Deploy timeline: 40px lanes, service label column 200px, bars 24px tall with 8px vertical inset, radius 6.
- Notifications settings: two-column at ≥1024 (channels list 360px, editor flexible), stacked below.
- Webhook delivery log: table columns Status 96 · Event 160 · Time 140 · Duration 88 · Actions 120; row height 40px.
- Bell popover: 400px wide, max-height 560px, header 44px with tabs, rows 56px min with 12px vertical padding, footer 40px.
- All measurements sit on the 4px grid; no magic numbers outside the token scale (4, 8, 12, 16, 20, 24, 32, 48, 64).

### Color & theme
- Chart series colors, dark: primary series `accent` (#14B8A6), second series `info` (#3B82F6), third `#A78BFA` (add as `chart-3`), fourth `#F472B6` (`chart-4`); area fills at 12% alpha; light theme uses the light `accent` (#0D9488) and the same secondaries darkened one step. Record the two extra tokens in Phase 1's token file (`--chart-3`, `--chart-4`).
- Limit line: `text-muted` dashed 1px (4/4 dash), label "Limit 512 MB" in caption at the right end.
- Deploy markers: 1px `border-strong` vertical line full height with a 6px triangle at the top in `text-secondary`; hovered marker turns `accent`.
- OOM markers: 8px filled circle in `danger` on the memory series at the event timestamp, with a 2px `bg` ring so it reads on the line.
- Crosshair: 1px `border-strong`; tooltip background `surface-raised`, border `border`, radius 10, shadow per theme rule.
- Chart plot background: transparent over `surface`; gridlines `border` at 40% alpha, 4 horizontal lines, no vertical lines.
- Log levels: trace/debug `text-muted`, info `text-secondary`, warn `warning`, error/fatal `danger`; the level badge uses the color as text on a 12%-alpha tint of the same color; message text stays `text` so a wall of errors is not a wall of red.
- ANSI palette mapped to tokens: black → `text-muted`, red → `danger`, green → `success`, yellow → `warning`, blue → `info`, magenta → `chart-3`, cyan → `accent`, white → `text`; bright variants use the `-hover` or one-step-lighter shade; background colors are rendered at 20% alpha so they never break contrast.
- HTTP status colors: 2xx `success`, 3xx `info`, 4xx `warning`, 5xx `danger`; only the status text is colored, never the row.
- Search highlight `mark`: `accent-subtle` background, `text` color, radius 2, no underline.
- Histogram bars: `text-secondary` at 60% alpha; the bar under the cursor `accent`; bars inside the selected range full `text-secondary`.
- Widgets: `surface` background, `border` 1px, radius 10; the widget being dragged lifts to `surface-raised` with the theme shadow and a 2px `accent` outline; drop placeholder is `accent-subtle` with a dashed `accent` border.
- Notification kind icons use `text-secondary`; the unread badge on the bell is `accent` with `bg`-colored text, 16px circle, 11/600.
- Error cards: 1px `danger` border at 40% alpha, `surface` background, a 3px left accent bar in `danger`; the fix button is primary (the only `accent` element in the card).
- Offline banner (partial state): `warning` at 12% alpha background, `warning` icon, `text` copy.
- Both themes verified for ≥ 4.5:1 text contrast on every surface; chart series colors verified for ≥ 3:1 against the plot background (non-text rule).

### Motion
- Chart data updates: new samples are appended without animation (uPlot redraw), because animated lines make live data look laggy. The current-value readout uses a 120ms ease-out color flash on change only when the value crosses 90% of the limit (danger) or drops back under (success), not on every tick.
- Crosshair follows the pointer with no easing; the tooltip fades in over 120ms ease-out when it first appears and does not animate while moving.
- Time range change: the plot cross-fades old to new data over 200ms `cubic-bezier(.2,.8,.2,1)`; the skeleton shows only if the new data takes longer than 300ms.
- Deploy marker hover: triangle scales from 1 to 1.25 over 120ms ease-out.
- Memory hint banner: slides down 8px and fades in over 200ms panel easing; on click of the fix button the banner collapses (height to 0) over 200ms while the staged changes bar rises from the bottom.
- Log viewer live tail: new rows appear instantly at the bottom (no slide) and the viewport scrolls with `scrollTop = scrollHeight` synchronously to avoid jitter; when paused, the "Jump to live" pill fades and rises 8px over 200ms; pressing it scrolls with `behavior: instant` (a smooth scroll over thousands of rows stutters).
- JSON row expand: height animates over 200ms panel easing with content fading in over 120ms; collapse reverses.
- Filter chip add: pops from scale 0.96 to 1 over 120ms ease-out; chip remove fades over 120ms.
- Mode switch (Runtime · HTTP · Build): the selected indicator slides between segments over 200ms panel easing; the viewer content swaps with a 120ms cross-fade.
- Histogram click-to-zoom: bars re-layout with a 200ms width transition; the viewer reloads with the skeleton.
- Dashboard drag: the dragged widget follows the pointer with no lag; the placeholder moves between cells with 120ms ease-out; on drop the widget settles with a spring (stiffness 400, damping 30, mass 1) matching canvas node moves.
- Widget resize: live re-render; the resize handle grows from 12px to 16px on hover over 120ms.
- Bell badge count change: a 120ms scale pulse (1 → 1.15 → 1); the popover opens over 200ms panel easing sliding down 8px.
- Status pills in the delivery log for `retrying` pulse the dot at 1.6s per cycle like the C4 building pulse.
- Every animation above collapses to an instant state change under `prefers-reduced-motion: reduce`, including the pulsing dots (static half-filled glyph instead) and the spring (no overshoot).

### Iconography & symbols
- Metrics tab: `Cpu` (CPU), `MemoryStick` (Memory), `ArrowDownUp` (Network), `HardDrive` (Disk), `Activity` (Requests), `TriangleAlert` (Error rate), `Gauge` (Latency) — all 16px in the chart header at `text-secondary`.
- Time range control: no icons; the replica toggle uses `Layers` 14px with the label "Per replica".
- Deploy marker tooltip: `GitCommitHorizontal` 14px before the short SHA; `Rocket` 14px is *not* used (Lucide's rocket reads as a launch, the marker is a fact).
- OOM marker legend: the danger dot glyph plus "Out of memory".
- Memory hint banner: `Lightbulb` 16px in `info`.
- Logs tab mode switch: `Terminal` (Runtime), `Globe` (HTTP), `Hammer` (Build), 14px each with the label.
- Filter bar: `Filter` 16px leading icon in the input; chip remove uses `X` 12px; parse error uses `CircleAlert` 12px `danger`.
- Toggles: `Clock` (timestamps), `WrapText` (wrap), `Rows3` (dense) as 16px icon-only ghost buttons with tooltips; download `Download` 16px; copy feedback uses `Check` 14px in `success` for 1.2s.
- "Jump to live": `ArrowDown` 14px then the label "Jump to live · 42 new".
- Level badges are text only ("ERR", "WRN", "INF", "DBG", "TRC") so levels are never conveyed by color alone (C11); the full word appears in the tooltip.
- Offline banner: `WifiOff` 16px in `warning`.
- Observability sub-tabs: `ScrollText` (Logs), `LayoutDashboard` (Dashboard), `History` (Deploys), 16px.
- Saved queries: `Bookmark` 16px; saved item rows show `BookmarkCheck` 14px.
- Widget catalog icons: `LineChart` (metric), `Activity` (request rate), `TriangleAlert` (error rate), `Gauge` (latency), `Rocket` is again avoided; use `ListChecks` for recent deploys, `Server` for server health, `ScrollText` for log query, `Text` for notes. Drag handle `GripVertical` 16px; resize handle drawn as two 1px diagonal lines in `text-muted` (no icon).
- Deploy timeline bars carry the C4 status glyph at 12px at their left edge: ● Active, ◐ Building (pulsing), ✕ Failed, ⟳ Crashed, ☾ Sleeping, ■ Stopped, … Queued; the glyph always accompanies the color.
- Notification channel kinds: `Mail` (email), `MessageCircle` (Discord — do not use a third-party brand mark), `Hash` (Slack — likewise), `Webhook` (webhook), 20px in the channel card, 16px in lists.
- Rule editor event icons: `Rocket` is finally appropriate for deploy success (a milestone), `CircleX` deploy failed, `RotateCw` crash, `MemoryStick` OOM, `WifiOff` server offline, `HardDrive` disk, `Database` volume, `Archive` backup failed, `Lock` cert failure — 16px `text-secondary`.
- Webhook delivery status pills use the C4 language: ● Delivered (success), … Pending (muted), ⟳ Retrying (warning, pulsing), ✕ Failed (danger).
- Bell: `Bell` 20px in the top bar; `BellDot` is not used, the badge is a real count. Popover tab icons none; row icons reuse the event icons above at 16px.
- Error cards: `TriangleAlert` 20px `danger` at top-left; "Show raw error" uses `ChevronDown` 14px rotating 180° on expand; "Copy for support" uses `Copy` 14px.

### Copy
- Metrics tab header: "Metrics" · empty: "No metrics yet. Charts appear a minute after your app starts." · offline: "Server 'oracle-1' is offline. Showing metrics up to 14:02."
- Chart titles: "CPU", "Memory", "Network", "Disk", "Requests per minute", "Errors (5xx)", "Latency (p95)".
- Limit label: "Limit 512 MB" / "Limit 1 CPU"; deploy marker tooltip: "Deployed a1b2c3d · Fix login redirect · 3 min ago"; OOM marker: "Out of memory at 14:02".
- Memory hint: "Your app is close to its memory limit. Increase to 1 GB?" · button "Increase to 1 GB" · dismiss "Not now".
- Logs empty: "No logs yet. Your app hasn't printed anything since this deploy started." · HTTP empty: "No requests yet. Traffic appears here as soon as someone opens your app." · Build empty: "This deployment didn't build anything. It uses a prebuilt image."
- Paused pill: "Jump to live · 42 new"; download tooltip: "Download up to 50,000 lines matching this filter"; copy toast: "Copied".
- Filter parse error: "Unclosed quote at character 14" / "Unknown operator '=>' at character 8. Use =, !=, >, >=, <, <= or ~."
- Filter placeholder: "Search logs · try level:error or status:>=500".
- Offline partial banner: "Server 'oracle-1' is offline. Showing logs up to 14:02." with the link "What to do".
- Observability: page title "Observability"; sub-tabs "Logs", "Dashboard", "Deploys"; log explorer placeholder "Search all services · try service:api level:error"; histogram reset "Reset range"; saved queries button "Saved", empty "No saved queries. Save a filter you use often." · save dialog title "Save this query" · field "Name".
- Dashboard empty (never shown, default is created) but the add dialog: title "Add a widget", primary "Add widget"; widget menu items "Edit", "Duplicate", "Remove"; remove confirm none (undo toast "Widget removed · Undo").
- Deploy timeline empty: "No deploys in this range."
- Notification channels page: title "Notification channels" · empty: "No channels yet. Add one to get told when a deploy fails or an app crashes." primary "Add channel" · kinds "Email", "Discord", "Slack", "Webhook" · test button "Send test" · success toast "Test sent to #deploys" · failure inline: "We couldn't reach that URL (404). Check the webhook URL in Discord."
- Rules editor: heading "When should we notify?" · events labelled "Deploy succeeded", "Deploy failed", "App crashed", "App ran out of memory", "Server went offline", "Server disk over 90%", "Volume over 90%", "Backup failed", "Certificate failed" · scope "All projects" / "Only this project".
- Webhooks page: title "Webhooks" · empty: "No webhooks yet. Send deploy and alert events to your own systems." primary "Add webhook" · fields "URL", "Secret" (with "Generate"), "Events" · delivery log heading "Recent deliveries" · row actions "Retry", "View payload" · disabled banner "This webhook is paused. Deliveries are skipped."
- Bell popover: tabs "All", "Deploys", "Alerts" · empty: "You're all caught up." · footer "Mark all read" · link "Notification preferences" · row examples: "**api** deployed in 42s", "**worker** ran out of memory", "Server **oracle-1** went offline".
- Error cards (J6): `OOM_KILLED` "Your app ran out of memory" / "It used all of its 512 MB. Apps usually need more memory than their starting size." / "Give it 1 GB" · `CRASH_LOOP` "Your app keeps crashing on start" / "It exited 5 times in 2 minutes, so we stopped restarting it." / "Show last error lines".
- Voice rules (C9): second person, active, no exclamation marks, buttons are verbs, numbers human-formatted ("42s", "512 MB", "3 min ago"), no blame ("we couldn't reach" not "you entered an invalid URL").

### States (empty · loading · error · success · partial)
- Metrics tab: loading = skeleton grid of chart cards with a 160px plot block and a 20px readout bar; empty = the empty copy centered in each card with the icon at 24px `text-muted`; error = error card from the catalog (`AGENT_OFFLINE` when the server is offline, generic otherwise) above the grid, charts show the last cached data dimmed to 60%; success = live; partial = the offline banner and a `Clock` glyph on each chart header at the cutoff time.
- Log viewer: loading = 12 skeleton rows of varying width (40–90%) at row height; empty = centered copy; error = inline error card at the top with "Retry"; success = rows; partial = offline banner pinned above the rows with the cached tail rendered at 100% (never dimmed, it is real data).
- Filter bar: idle · focused (2px `accent` ring, 2px offset) · with chips · invalid (danger underline under the offending span, hint below) · autocomplete open (popover list of keys with a count of matching recent lines).
- Observability log explorer: histogram loading = 60 skeleton bars of random heights; empty range = flat baseline with "No logs in this range".
- Dashboard: first visit = default dashboard created silently, then a one-time toast "We set up a starter dashboard. Drag widgets to rearrange."; widget loading = skeleton matching the widget body; widget error = small inline error with "Retry"; widget empty = centered copy specific to its type ("No requests in this range").
- Deploy timeline: loading = lanes with a 24px skeleton bar per service; empty per §5 Copy.
- Notification channels: empty state (icon `Bell` 32px, title, sentence, primary action); form validation inline under fields; test in-flight = button loading spinner with the label "Sending…"; test success = toast; test failure = inline alert under the button with the reason.
- Webhook delivery log: empty = "No deliveries yet. They appear here after the first event."; each row's status pill; the payload drawer shows request headers, body (JSON pretty), response status and excerpt, and the signature string for verification.
- Bell: no unread = plain icon; unread = badge with count (99+ cap); popover loading = 4 skeleton rows; empty per tab.
- Error cards: collapsed raw details by default; "Copy for support" copies the code, title, deployment id, server name, and the last 50 raw log lines.

### Keyboard & accessibility
- Metrics: the time range control is a `radiogroup` navigable with arrow keys; `1`–`5` inside the tab select 1h/6h/24h/7d/30d; each chart is a `figure` with `aria-labelledby` its title and an `sr-only` summary sentence updated at most every 60s (to avoid live-region spam it is not a live region; the summary is read on focus); the crosshair can be driven by focusing the chart and pressing Left/Right (moves one sample), Home/End; deploy markers are focusable buttons announced as "Deployment a1b2c3d, Fix login redirect, 3 minutes ago".
- Logs: `/` focuses the filter input (C11); Enter applies; Backspace on an empty input removes the last chip; Left/Right at the input edges move focus between chips; Delete removes a focused chip. The viewer is a `role="log"` region with `aria-live="polite"` while live and `aria-live="off"` while paused; each row is a focusable `div` with Up/Down moving between rows, Enter expanding a JSON row, `c` copying the focused line, `j`/`k` as aliases. `Shift+G` jumps to live; `Space` toggles pause. The toggles are `aria-pressed` buttons.
- HTTP mode rows are a `table` with column headers, sortable by status and duration with `aria-sort`.
- Histogram: focusable bars in a `listbox` of time buckets; Enter zooms.
- Dashboard: `Tab` reaches each widget frame; with a frame focused, `Alt+Arrow` moves it one cell, `Alt+Shift+Arrow` resizes by one cell, `Delete` removes (with the undo toast), `Enter` opens its menu; changes are announced via a polite live region ("Moved CPU widget to column 7, row 3"). This keyboard path is required because drag-only reordering fails WCAG 2.2 2.5.7.
- Deploy timeline bars are buttons; arrow keys move between bars in a lane, Up/Down between lanes.
- Notification forms: every field has a visible label, helper text via `aria-describedby`, and errors via `aria-invalid` + `aria-errormessage`; "Send test" results are announced in a polite live region.
- Bell popover: opens with Enter/Space, traps focus, `Esc` closes and returns focus to the bell; tabs are a `tablist` with arrow navigation; rows are links.
- Focus rings everywhere: 2px `accent`, 2px offset, on all interactive elements including chart markers and log rows.
- Contrast: every text token on every surface ≥ 4.5:1 in both themes; chart series ≥ 3:1 on the plot background; level badges never rely on color alone (text abbreviations); status pills always icon + text.
- axe runs on every page and state in CI; a manual keyboard pass per page is recorded in UI_DECISIONS.md.

### Responsive
- ≥1280: Metrics two-column chart grid; Logs full toolbar; Observability dashboard 12 columns; deploy timeline with the 200px label column.
- 1024–1279: Metrics single column when the inspector is under 640px wide (it overlays the canvas per C12); Logs toolbar wraps the toggles under the filter bar; dashboard 8 columns (layouts are stored per breakpoint key `lg`/`md`/`sm`).
- 768–1023: inspector full-width; Metrics single column; HTTP log table hides user agent and bytes columns (available in the row expansion); dashboard 6 columns; deploy timeline label column 120px with truncated names.
- <768 (mobile): Metrics charts stack with a 120px plot height, the time range control becomes a full-width segmented control with 5 equal segments; Logs filter input full width with chips wrapping to a second row, toggles collapse into an overflow `Ellipsis` menu, the viewer uses dense mode by default and rows show the timestamp above the message (two-line rows); "Jump to live" sits above the bottom tab bar (C12); dashboard becomes a single column with widgets in stored order and drag disabled (reorder via the widget menu "Move up" / "Move down"); deploy timeline becomes a list grouped by service; notification and webhook settings stack; the bell popover becomes a full-screen sheet.
- No hover-only affordances: the widget drag handle, JSON copy icons and row actions are always visible on touch devices (`@media (hover: none)`).
- Log rows never cause horizontal page scroll: wrap is on by default under 768px.

### Performance
- Log viewer keeps at most 20,000 rows in memory for the live view (older rows are dropped from the top with a "Showing the latest 20,000 lines" caption); download bypasses the viewer and streams.
- Chart redraw ≤ 4ms per 10s sample for 7 charts (measured in a Playwright performance trace); crosshair sync uses a single `requestAnimationFrame` per pointer move.
- Metrics queries return ≤ 720 points per series (30d at 1h) so payloads stay under 100 KB per tab load.
- Log query fan-out completes within 2s p95 for 2 servers × 100k lines with an indexed time lookup in the agent's segment index; per-agent timeout 5s; the API returns partial results with a `timeouts[]` list rather than failing.
- Log line → visible in live tail < 1s (B14) measured end to end in e2e with a timestamped print.
- Status change → visible in UI < 1s for the bell and deploy timeline via the realtime WebSocket.
- Dashboard renders 12 widgets with 12 metric subscriptions multiplexed over the single WebSocket (C8.3); widgets off-screen pause their subscriptions.
- Notify and webhook workers process the outbox in batches of 100 with `FOR UPDATE SKIP LOCKED`; a single failing endpoint cannot block others.
- Control plane RAM stays under the 512 MB idle budget with metrics ingestion from 5 servers × 50 containers; verified with the Phase 18 load harness and spot-checked here.

### Security
- Log content is untrusted: rendered as text nodes only; ANSI parsing strips every escape other than SGR; JSON tree values are never interpreted as HTML; links in logs are not auto-linked (an attacker could print a phishing URL styled as a Lumen link).
- Secret scrubbing (B7) happens on the agent before any log leaves the server; the download path re-applies scrubbing for values known at download time.
- Metrics and logs routes enforce RBAC (viewer may read; nothing here mutates except saved queries, dashboard layout, retention, notification and webhook CRUD, which require member/admin per the D11 matrix) and every mutation writes the audit log.
- Webhook secrets and channel configs are encrypted with the project/workspace data key (B7) and never returned after creation (the UI shows the last 4 characters only); "Generate" produces 32 bytes base64url.
- Outgoing HTTP (webhooks, Discord, Slack) uses the SSRF guard, a 10s timeout, no redirects followed, response bodies capped at 4 KB in the delivery log, and TLS verification on.
- Signature scheme documented with a test vector; timestamps allow receivers to reject replays older than 5 minutes.
- Saved queries and dashboard layouts are validated with Zod (max query length 1,000 characters, max 40 widgets) to prevent stored-payload abuse.
- Notification emails use the instance SMTP with `List-Unsubscribe` headers pointing to the preferences page.

### Data integrity & idempotency
- Metric rollup writes use `ON CONFLICT (service_instance_id, replica_id, bucket_ts) DO UPDATE` so a re-sent batch never double-counts.
- Event outbox rows are created in the same transaction as the state change that caused them; workers mark `processed_at` and deliveries are keyed by `(event_id, channel_id)` and `(event_id, webhook_id)` with unique constraints so a restarted worker cannot notify twice.
- Webhook retries increment `attempt` and store `next_retry_at`; the worker claims rows with `next_retry_at <= now()` under `SKIP LOCKED`.
- Log cursors are opaque, versioned (`v1:` prefix) and validated; an invalid cursor returns a 400 from the error catalog rather than a 500.
- Agent segment files are append-only with a checksum trailer per segment; a truncated final segment (crash mid-write) is detected and its last partial line dropped, never rendered.
- The dashboard layout is written with optimistic concurrency (`updated_at` precondition); a conflict re-fetches and re-applies the local drag on top.
- Retention workers are idempotent and safe to run twice in a row.

## 6. Acceptance criteria
- [ ] Build, deploy, runtime and HTTP logs; live tail; filter syntax; JSON attributes; download; retention settings (D8).
- [ ] Service and host metrics with deploy markers (D8).
- [ ] Project observability dashboard with widgets and saved queries (D8).
- [ ] Notifications (email, Discord, Slack, webhook) for deploy success/fail, crash, OOM, server offline, disk ≥ 90%, volume ≥ 90%, backup failed, cert failure (D8).
- [ ] Outgoing project webhooks with HMAC signatures and a delivery log (D8).
- [ ] The log search fan-out works across 2 servers (Part F Phase 8 AC): a query for `level:error` against a service with one replica on each of two servers returns lines from both, correctly interleaved by timestamp.
- [ ] Log line → visible in live tail < 1s; status change → visible in UI < 1s (B14).
- [ ] Metrics retention: 1m rows kept 7 days, 1h rows kept 90 days; verified by the worker test.
- [ ] The filter parser passes the shared vector file in both TypeScript and Go.
- [ ] Download returns at most 50,000 lines and is refused above with the copy "Narrow the filter or time range to download".
- [ ] The memory hint appears after 5 minutes above 90% and its button creates a staged change visible in the staged changes bar.
- [ ] `OOM_KILLED` and `CRASH_LOOP` error cards render with working fix actions.
- [ ] Webhook signature verification snippets (Node, Python, Go) in the docs verify the published test vector.
- [ ] SSRF guard rejects every private, loopback, link-local and metadata range in tests.
- [ ] Every page and state in this phase passes axe and the C14 checklist; screenshots reviewed at 390/1024/1440 in both themes.
- [ ] Charts have screen-reader summaries and keyboard-driven crosshairs (C11).

## 7. Test plan
- **Unit:** filter tokenizer/parser/matcher (≥ 60 vectors, shared TS/Go); resource step ladder and the 90% × 5-minute rule; chart summary sentence generation; ANSI mapping; URL state encode/decode for logs and metrics; k-way merge and cursor encoding; HMAC signing; SSRF guard; message template rendering snapshots per event × sender.
- **Integration:** metrics ingestion → rollup → query at each range; compaction and retention workers with seeded data; event producers with a fake `ActualState` stream; notify worker with a mocked SMTP/HTTP server; webhook retry schedule with a mocked clock; log fan-out with two fake agents, one going offline mid-test.
- **E2E (Playwright):** deploy a sample app, print timestamped lines, assert tail latency < 1s; apply `level:error -"health"` and assert chip rendering and results; reload and assert URL state restored; run the OOM container and click the fix; crash-loop container and the "Show last error lines" action; observability histogram zoom; saved query round trip; dashboard drag/resize/persist and keyboard move; deploy timeline click opens detail; create a Discord channel against a mock endpoint, send test, add a rule, trigger a failed deploy, assert delivery; add a webhook, view delivery, retry; bell shows the failure and deep-links.
- **Visual regression:** every page and state in §5 at 390/1024/1440 × dark/light with the CI diff threshold.
- **Accessibility (axe + keyboard pass):** axe on each page; keyboard pass scripted for the chart crosshair, filter chips, log rows, dashboard widget move, bell popover focus trap.
- **Manual / on a real VM:** two Ubuntu servers, one service with a replica on each, generate 100 lines/s on both, search and tail; pull the network cable on one (or `systemctl stop lumen-agent`) and confirm the partial state and cached tail.

## 8. Evidence required to close
- `pnpm test` and `go test ./...` output showing the filter vectors and merge tests green.
- Playwright report with the tail-latency measurement (print timestamp vs DOM timestamp) under 1s across 20 runs.
- Screenshots (390/1024/1440 × dark/light) for: Metrics (loading, live, empty, offline), Logs Runtime (live, paused with new-line count, JSON expanded, invalid filter), Logs HTTP, Logs Build, Observability Logs (histogram, saved queries open), Dashboard (default, dragging, mobile), Deploy timeline, Notification channels (empty, form, test success, test failure), Webhooks (list, delivery log, payload drawer), Bell popover (unread, empty), OOM and crash-loop error cards — all linked from `docs/UI_DECISIONS.md`.
- The two-server fan-out run: the query URL, the API response excerpt showing interleaved `server_id`s, and the offline banner screenshot.
- The retention worker test output and a `psql` count before/after.
- A captured webhook delivery (headers and body) and the output of the three verification snippets.
- Bundle analysis showing the chart library and viewer add ≤ 90 KB gzipped to the service inspector route.
- Memory measurement of the API process under metrics ingestion (`ps`/`docker stats`) staying inside the 512 MB control-plane budget.

## 9. Review
- Use SPEC Part H1 (code review) with Fable 5.1 on `apps/api/src/logs/**`, `apps/api/src/webhooks/**`, `apps/api/src/notify/**`, `apps/agent/internal/logs/**`, `apps/agent/internal/metrics/**`. Probe: cursor stability when a server rejoins mid-pagination; merge behavior for identical timestamps; the outbox transaction boundary; retry claim races; SSRF guard against DNS rebinding (resolve once, connect to the resolved IP); secret scrubbing on the download path; unbounded growth in the tail cache and `webhook_deliveries` (needs a 30-day prune).
- Use SPEC Part H2 (UI review) with Fable 5.1 on the screenshot matrix. Probe: does a beginner understand the Memory chart's limit line without a tooltip; does the filter syntax discourage beginners (the placeholder must teach it); does the dashboard feel calm with 12 widgets (one accent element per view, C14); level badge legibility at 11px; whether the error cards' fix buttons are the only accent element.
- Fresh-eyes H4 concerns to carry to Phase 12: fan-out at 50 servers (parallelism cap, per-agent timeouts, partial result UX).

## 10. Risks & open questions
- **Risk:** uPlot has no React bindings and imperative APIs → **Mitigation:** one wrapper hook with a strict props contract and gallery coverage of every state; revisit only if the wrapper exceeds 300 lines.
- **Risk:** Live tail plus search over the same segment files could starve the agent's I/O on a small VM → **Mitigation:** the agent serves queries from the index with a per-query 5s budget and a single-flight limit of 4 concurrent queries; measure on 1 vCPU.
- **Risk:** Notification storms (a crash loop emitting an event per restart) → **Mitigation:** the crash event fires once when the state becomes CRASHED (after retries are exhausted), never per restart; disk and volume events de-duplicate per 6h.
- **Risk:** Webhook receivers that are slow hold worker slots → **Mitigation:** 10s timeout, batch of 100, concurrency 10, `SKIP LOCKED`.
- **Risk:** The dashboard grid library adds weight and its own styling → **Mitigation:** import CSS minimal, override with tokens; if it fights the design system, the fallback is `dnd-kit` with a hand-written 12-column layout (decision recorded either way).
- **Risk:** HTTP log storage from Phase 7 might be shaped for rollups only → **Mitigation:** confirm in the plan step that per-request rows exist for the HTTP mode; if not, this phase adds `http_requests` per-server segment storage on the agent mirroring runtime logs.
- **Open question:** Should log retention be settable per service or only per instance? Default: both, with the instance value as the default and a per-service override under Advanced (the spec lists "retention settings" under D8 without a level).
- **Open question:** Where does the personal mute list for the bell live before Phase 15 builds Account → Notifications? Default: a `user_notification_prefs` row created with defaults here and the UI in Phase 15.
- **Open question:** Are per-request HTTP rows kept 7 days like runtime logs? Default: yes, same retention setting.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: chart library, virtualization library, ANSI library, grid library, filter grammar, webhook signature scheme, retention defaults, notification de-duplication windows, tail cache bounds
- [ ] `docs/UI_DECISIONS.md` updated with the screenshot matrix and the keyboard pass notes
- [ ] Cross-model review done (H1 on API/agent code, H2 on screenshots) and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 08 — Observability</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-08-observability.md,
and these SPEC sections: B5 (MetricsBatch, LogSubscribe, LogQuery), B6 (deployment_logs,
metric_rollups, http_log_rollups, notification_*, webhooks_*), B11, B14, C4, C5 (Charts,
Log viewer), C7.10, C7.11, C7.17, C7.24, C8.3, C8.4, C8.6, C9, C10, C11, C12, D8, J1
(logs/metrics, notifications & webhooks), J6 (OOM_KILLED, CRASH_LOOP).
</context>
<goal>A user can watch live CPU/memory/network/disk and HTTP health charts with deploy
markers for any service, search logs across every server with the typed filter syntax,
assemble a project dashboard from widgets, and receive Discord/Slack/email/webhook
notifications for every D8 event.</goal>
<scope>
- Metrics pipeline: 10s agent samples, 1h local ring, 1-minute rollups, retention 1m×7d and 1h×90d
- Shared TimeSeriesChart (uPlot) with synced crosshair, limit line, deploy and OOM markers, SR summary
- Metrics tab (C7.10) incl. Requests/min, 5xx %, p95 for web services; smart memory hint → staged change
- Filter grammar + parser in packages/shared (TS) and apps/agent (Go) with a shared vector file
- Log viewer completion (virtualized, ANSI, JSON tree, levels, highlight, pause + Jump to live, toggles, download ≤ 50k, copy)
- Logs tab modes Runtime · HTTP · Build, filter chips, time range, deployment selector, URL state
- Log query fan-out across agents, merge by timestamp, offline partial state with cached tail
- Retention settings (instance default 7d, per-service override)
- Observability page: log explorer (histogram zoom, saved queries), widget dashboard (drag/resize, default), deploy timeline
- Event bus + outbox; notification channels (email/Discord/Slack/webhook), templates, rules, Send test
- Outgoing project webhooks with HMAC-SHA256 signatures, delivery log, retry, SSRF guard
- Notifications center bell popover (C7.24)
- OOM_KILLED and CRASH_LOOP error cards with fix actions
</scope>
<out_of_scope>
- HTTP access log capture (Phase 7), build log capture (Phases 3/4)
- Backup and certificate failure detection (Phases 9 and 7 emit; this phase delivers)
- Account → Notifications preferences page (Phase 15), cost view (Phase 16), "Explain this error" (Phase 16)
- Mesh-scale fan-out verification beyond 2 servers (Phase 12)
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-08-observability.md §6, including: fan-out across 2 servers
returns interleaved results; log line → tail < 1s; retention worker test passes; filter vectors
pass in TS and Go; download caps at 50,000 lines; memory hint stages a change; error cards
have working fixes; webhook signature verifies in Node/Python/Go; SSRF tests pass; axe clean
and screenshots reviewed at 390/1024/1440 × dark/light.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, data/protocol changes (MetricsBatch fields,
   DesiredState log_retention_days, new tables), risks, test plan, open questions
   (retention level, HTTP per-request row availability from Phase 7). STOP and wait for approval.
2. Implement in small steps in the §4 order; run code and tests after each step.
3. For UI: screenshots at 390/1024/1440 × dark/light × the states in §5; critique against
   SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
