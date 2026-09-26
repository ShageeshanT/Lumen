# Phase 17 — HA Postgres

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 (cluster template, DCS, routing, failover correctness) → reviewed by Opus 5.5 (template packaging, UI status tab, docs) |
| **Depends on** | Phase 9 (database services, volumes, restic backups with logical dumps, Data/Connect/Backups tabs), Phase 12 (WireGuard mesh, container subnets, embedded DNS, placement across servers, project isolation), Phase 13 (template schema, gallery, deploy form, multi-service templates), Phase 8 (metrics, notifications for `db_failover`) |
| **Unblocks** | Phase 18 (chaos test "kill a database primary" joins the launch suite) |
| **Spec sections** | SPEC D5 ("HA Postgres (Patroni-based, 3 servers). Late phase."), Part F Phase 17, B9 (private networking, embedded DNS, TCP proxy), B10 (volumes, backups), B6 (`services.kind=database`, `placement`), B4 (deployment lifecycle for database services), C7.13 (database tabs), C4 (status language), C9, C14, J4 (template definition), J6 |
| **Estimated sessions** | 4 focused sessions: (1) cluster template + DCS + images on 3 servers over the mesh, (2) routing (router service, DNS, DATABASE_URL) + backups integration, (3) Cluster tab UI + notifications + switchover, (4) failover test protocol on real VMs + docs |

## 1. Goal
A user deploys the "Postgres HA" template onto three connected servers, points their app at the single private `DATABASE_URL`, and when the primary's server dies the app sees fewer than 30 seconds of errors and keeps working without anyone touching the dashboard.

## 2. Why this phase exists
A single Postgres container on a single VM is fine for a side project and wrong for a team's production database. When that VM reboots, every app in the project is down until it comes back. Users who reach this point either leave for a managed database or build a fragile Patroni setup by hand. Lumen already has the two hard ingredients: a private mesh across servers (Phase 12) and multi-service templates (Phase 13). This phase composes them into a cluster that a beginner can deploy from the gallery and understand from one status tab: which node is primary, how far behind the replicas are, and when the last failover happened.

The design bias is toward fewer moving parts over maximum performance: three Patroni nodes with an etcd member beside each, one small router per server, one `DATABASE_URL`. No sharding, no read replicas exposed to apps in the first version.

## 3. Scope
### In scope
- Built-in template `postgres-ha` (SPEC J4 schema, Phase 13 gallery): three Patroni-managed Postgres 16 nodes, three etcd members, a connection router, placed on three distinct servers
- DCS choice (etcd v3), image choice (Spilo), Patroni configuration, bootstrap and re-join behavior
- Placement rules: the template deploy form requires three online servers with mesh connectivity and refuses to put two nodes on one server
- Connection routing: `DATABASE_URL` for apps resolves to routers that always forward to the current primary; failover switch within seconds after promotion
- Backups integration with Phase 9: logical dumps taken through the router (primary), schedule and restore-to-new-cluster
- Cluster tab in the inspector for the HA service: node table (role, server, state, replication lag, timeline), last failover, "Switchover" action, health banner
- Notifications: `db_failover`, `db_replica_lagging`, `db_cluster_degraded`
- Failover test protocol (kill primary container; power off primary server) with the < 30 s error window measured by a write-loop client
- Docs page for the template: how it works, what to expect during failover, limits

### Out of scope
- Read replicas exposed to apps (the router forwards writes and reads to the primary only in v1; a `DATABASE_REPLICA_URL` is a follow-up)
- Connection pooling (PgBouncer) as part of the template (documented as a separate template for later)
- MySQL / MongoDB / Redis HA (not in the spec)
- Cross-workspace or cross-project clusters
- Automatic node replacement when a server is removed (the UI shows "degraded" and the user re-adds a node through "Add node")

## 4. Work breakdown

### 4.1 Cluster design and image choice
- **What:** Decide and record in `docs/DECISIONS.md`:
  - **Image:** Spilo (`ghcr.io/zalando/spilo-16`, Apache-2.0) as the Patroni + Postgres 16 image, pinned by digest, chosen over building a custom `postgres:16` + `pip install patroni[etcd3]` image because Spilo is maintained, includes WAL-G hooks Lumen does not use yet, and has known-good Patroni defaults. Alternative recorded: a Lumen-built image if Spilo's size (≈ 800 MB) or update cadence becomes a problem.
  - **DCS:** etcd v3 (`quay.io/coreos/etcd:v3.5.x`, Apache-2.0), one member per database server, co-located with the Patroni node, addressed over the mesh container subnets. Chosen over Patroni's built-in Raft (deprecated in Patroni 4) and over Consul/ZooKeeper (heavier, no other use in Lumen). Quorum: 2 of 3, so one server may die.
  - **Cluster identity:** Patroni `scope` = `<project>-<env>-<service>`; `namespace` = `/lumen/`.
  - **Postgres parameters:** `synchronous_mode: true` with `synchronous_mode_strict: false` (a sync replica when available, no write blocking when both replicas are gone), `max_connections: 200`, `wal_level: replica`, `hot_standby: on`, `wal_keep_size: 1GB`, `checkpoint_timeout: 15min`; `postgresql.parameters` exposed under Advanced in Settings (C7.13).
  - **Failover timing:** Patroni `ttl: 20`, `loop_wait: 5`, `retry_timeout: 10`, `maximum_lag_on_failover: 16MB`, so a dead primary is detected within ~20 s and promotion happens within ~25 s; the router switch adds ≤ 3 s, keeping the window under 30 s.
- **Files:** `docs/DECISIONS.md`, `packages/templates/postgres-ha/README.md`
- **Done when:** the decision entry lists images with digests, licenses, the timing parameters and the math for the < 30 s window.

### 4.2 Template definition
- **What:** `packages/templates/postgres-ha/template.json` with services:
  - `etcd-1`, `etcd-2`, `etcd-3`: etcd image, `placement` pinned by template slot to servers A / B / C (the deploy form fills the slots), volume `/etcd-data`, variables `ETCD_NAME=${{ self.LUMEN_SERVICE_NAME }}`, `ETCD_INITIAL_CLUSTER=etcd-1=http://etcd-1.<env>.lumen.internal:2380,…`, `ETCD_INITIAL_CLUSTER_TOKEN=${{ secret(16) }}`, `ETCD_LISTEN_PEER_URLS=http://0.0.0.0:2380`, `ETCD_LISTEN_CLIENT_URLS=http://0.0.0.0:2379`, `ETCD_ADVERTISE_CLIENT_URLS`, `ETCD_INITIAL_ADVERTISE_PEER_URLS` (both from the private domain), `ETCD_AUTO_COMPACTION_RETENTION=1h`. Memory limit 128 MB each.
  - `pg-1`, `pg-2`, `pg-3`: Spilo image, volume `/home/postgres/pgdata`, placement slots A / B / C, variables `SCOPE=<cluster scope>`, `ETCD3_HOSTS=etcd-1.<env>.lumen.internal:2379,etcd-2…,etcd-3…`, `PGPASSWORD_SUPERUSER=${{ secret(32) }}`, `PGPASSWORD_ADMIN=${{ secret(32) }}`, `PGPASSWORD_STANDBY=${{ secret(32) }}`, `PGUSER_SUPERUSER=postgres`, `PATRONI_RESTAPI_LISTEN=0.0.0.0:8008`, `SPILO_CONFIGURATION` (YAML with the 4.1 parameters and `bootstrap.dcs`), `KUBERNETES_SERVICE_HOST` unset (disables Spilo's k8s mode); memory limit 1 GB default (Resources slider applies to all three together), `healthcheck_path=/health` on 8008.
  - `pg-router`: HAProxy image (`haproxy:2.9-alpine`, HAPROXY licence: GPL-2.0 with the OpenSSL exception for the binary; record it), replicas: one per database server (placement slots A / B / C), config generated from the template (`packages/templates/postgres-ha/haproxy.cfg.tmpl`): `frontend pg` on 5432 → `backend primary` with `option httpchk GET /primary`, `http-check expect status 200`, `server pg-1 pg-1.<env>.lumen.internal:5432 check port 8008 inter 1s fall 2 rise 2`, `default-server on-marked-down shutdown-sessions` (so clients pinned to the old primary are cut and reconnect). Memory limit 64 MB.
  - Exposed variables on the template's primary service (`pg-router`, marked `kind=database` with `engine=postgres` so the Data / Connect / Backups tabs work): `DATABASE_URL=postgres://app:${{ self.APP_PASSWORD }}@${{ self.LUMEN_PRIVATE_DOMAIN }}:5432/app`, `APP_PASSWORD=${{ secret(32) }}`, `POSTGRES_USER=app`, `POSTGRES_DB=app`. The app user and database are created by a one-shot `pg-init` cron-less job (Phase 16 `RunOnce`) after bootstrap, or by Spilo's `bootstrap.users` block (chosen: Spilo `users` block, fewer moving parts).
  - Template metadata: name "Postgres HA", category `databases`, description "Three-node Postgres with automatic failover. Survives a server going down.", icon `postgresql` (simple-icons), `requires: { servers: 3, mesh: true }` (new optional field in the J4 schema, Phase 13 validates it).
- **Files:** `packages/templates/postgres-ha/template.json`, `packages/templates/postgres-ha/haproxy.cfg.tmpl`, `packages/templates/postgres-ha/spilo.yaml.tmpl`, `packages/templates/schema.ts` (`requires` field), `packages/templates/postgres-ha/template.test.ts`
- **Done when:** the template validates against the J4 schema, references resolve without cycles (Phase 4 resolver test), and the rendered HAProxy and Spilo configs match golden files.

### 4.3 Deploy form and placement enforcement
- **What:** The Phase 13 deploy form reads `requires` and shows three server pickers labeled "Node 1", "Node 2", "Node 3", pre-filled with the three online servers that have `mesh_ready=true` (Phase 12), each picker excluding servers already chosen. Validation: fewer than three eligible servers → the form shows a banner "Postgres HA needs three connected servers on the private network. You have 2." with "Add server" and blocks Deploy. The placement written to each service instance pins one slot per server; the Settings → Scaling section for these services shows the pins as read-only with the note "Nodes of an HA cluster stay on separate servers." Memory/CPU sliders apply to all three `pg-*` instances together (a template-level `resources_group` field, also new in the schema).
- **Files:** `apps/web/components/templates/DeployForm.tsx` (slot pickers), `apps/api/src/routes/templates.ts` (validation of `requires`), `packages/templates/schema.ts` (`resources_group`), `apps/web/components/inspector/settings/ScalingSection.tsx` (pinned state)
- **Done when:** e2e deploy with three servers succeeds and the canvas shows the seven nodes grouped in an auto-created group "Postgres HA"; a two-server workspace sees the banner.

### 4.4 Routing, DNS and `DATABASE_URL`
- **What:** The embedded DNS (Phase 12) returns the mesh IPs of all healthy `pg-router` replicas for `pg-router.<env>.lumen.internal` (round-robin, health from the agent's container health); every router forwards to the current primary, so any answer works. Apps use `DATABASE_URL` unchanged. Connection cut-over: HAProxy marks the old primary down within 2 s of `/primary` failing and shuts its sessions; libpq-based clients reconnect on the next query; the docs page lists the driver settings that make this smooth (`connect_timeout=5`, pool `idleTimeoutMillis`, retry on `57P01`). Optional public access through the Phase 7 TCP proxy targets `pg-router`, so the Connect tab's public URL also follows the primary.
- **Files:** `apps/agent/internal/dns/records.go` (multi-replica answers for router services; verify Phase 12 already does this, else add), `docs/templates/postgres-ha.md` (driver guidance), `packages/templates/postgres-ha/template.json` (`domain`/tcp settings)
- **Done when:** `dig pg-router.production.lumen.internal` from an app container returns three A records that rotate; killing one router leaves two answers within 10 s; a write loop through `DATABASE_URL` continues after the kill.

### 4.5 Backups integration (Phase 9)
- **What:** The Backups tab on `pg-router` uses the Phase 9 logical-dump path (`pg_dump` executed by the agent hosting the current primary, discovered through Patroni's REST `/cluster` endpoint so the dump never targets a replica mid-promotion) streamed into restic. Restore options: "Restore to this cluster" (typed confirmation; performs `pg_restore` through the router against the primary; the cluster keeps running) and "Restore to a new database" (Phase 9 flow, creates a single-node Postgres). Backup schedule UI unchanged. A backup that starts during a failover fails fast with `BACKUP_FAILED` and the reason "The cluster was switching primaries. Try again in a minute." and the scheduler retries once after 5 minutes.
- **Files:** `apps/api/src/workers/jobs/backup-run.ts` (HA branch: primary discovery), `apps/agent/internal/backup/postgres.go` (target selection by Patroni role), `apps/api/src/lib/ha/patroni.ts` (REST client through the agent's `HttpProbe` op, see 4.6)
- **Done when:** the Phase 9 automated backup → restore test passes against the HA cluster, and a backup started during an induced switchover records the documented failure and succeeds on retry.

### 4.6 Cluster status: agent op and API
- **What:** New agent op `HttpProbe{op_id, container_id, path, method, timeout_ms}` → `HttpProbeResult{status, body (≤ 64 KB), latency_ms}` executed inside the container's network namespace (loopback to the Patroni REST port), so the control plane never opens ports. The API polls `GET /cluster` on any healthy `pg-*` node every 10 s while a Cluster tab is open (and every 60 s otherwise, for notifications), normalizes `{members: [{name, role: leader|replica|sync_standby, state, lag_bytes, timeline, host}], last_failover_at}` into `ha_cluster_status` (`service_id`, `snapshot jsonb`, `observed_at`), and emits realtime events on role changes. Notifications: `db_failover` (leader changed), `db_replica_lagging` (lag > 64 MB for 5 min), `db_cluster_degraded` (fewer than 3 healthy members for 2 min). "Switchover" action: `POST /services/:id/ha/switchover {to?}` → Patroni `POST /switchover` with a typed confirmation of the service name and the sentence "Apps reconnect within a few seconds. Do this outside busy hours."
- **Files:** `packages/protocol/proto/lumen/v1/ops.proto` (`HttpProbe`), `apps/agent/internal/ops/http_probe.go`, `apps/api/src/lib/ha/patroni.ts`, `apps/api/src/workers/jobs/ha-status-poll.ts`, `apps/api/src/routes/ha.ts` (`GET /services/:id/ha/status`, `POST /services/:id/ha/switchover`), `packages/db/src/schema/ha-cluster-status.ts`, `packages/shared/src/errors/catalog.ts` (`HA_DEGRADED`, `HA_NO_PRIMARY`, `HA_SWITCHOVER_FAILED`)
- **Done when:** the status endpoint reflects a manual `patronictl switchover` within 10 s; the three notification rules fire in an integration test with a mocked Patroni server.

### 4.7 Cluster tab UI
- **What:** For services created from `postgres-ha`, the inspector tab set becomes **Cluster · Data · Connect · Backups · Metrics · Logs · Settings** (Cluster first, because it is what people open when something feels wrong). Cluster tab:
  - Health banner at the top: healthy (no banner), degraded (`warning` banner "One node is down. Your database still works, but another failure would take it offline." with "View node"), no primary (`danger` banner from `HA_NO_PRIMARY`: "Your database has no primary right now. Patroni is electing one." with a live elapsed timer).
  - Node table: Node (name + server chip), Role (pill: "Primary" `accent-subtle`, "Sync replica" `surface-hover`, "Replica" `surface-hover`), State (C4 language: ● Running, ◐ Starting, ✕ Failed, ■ Stopped), Lag (tabular, "0 B", "1.2 MB", "—" for the primary), Timeline (tabular integer), Last seen. Row menu: "View logs", "Restart node" (simple confirm), "Make primary" (switchover to this node, typed confirm).
  - Timeline strip under the table: last 10 events (failover, switchover, node joined, node lost) with relative time and a tooltip with the ISO timestamp.
  - Facts row: "Replication: synchronous when possible · Failover: automatic · Cluster: acme-production-postgres".
  - Metrics tab gains per-node series with the primary highlighted; Logs tab gains a node selector.
- **Files:** `apps/web/components/inspector/cluster/ClusterTab.tsx`, `NodeTable.tsx`, `ClusterTimeline.tsx`, `HealthBanner.tsx`, `apps/web/components/inspector/InspectorTabs.tsx` (HA tab set), `apps/web/components/inspector/metrics/NodeSeries.tsx`
- **Done when:** screenshots at 390 / 1024 / 1440 × dark / light for healthy, degraded, no-primary and switching states; axe clean; the table updates within 1 s of a role change through realtime.

### 4.8 Failover test protocol and docs
- **What:** `e2e/ha/failover.sh` on the VM harness (three Multipass VMs locally, three cloud VMs nightly):
  1. Deploy `postgres-ha` and a sample app (`lumen-samples/pg-writer`, a Node service that inserts a row every 100 ms and logs each success or error with a timestamp).
  2. Start the writer; wait 60 s; assert 0 errors.
  3. **Scenario A, container kill:** `docker kill` the primary container on its server. Measure from the kill timestamp to the first successful insert after the last error. Pass: < 30 s and the writer resumes without restart.
  4. **Scenario B, server loss:** power off the primary's VM (`multipass stop` / cloud API stop). Same measurement. Pass: < 30 s. Then power on; assert the node re-joins as a replica within 5 minutes and the Cluster tab shows 3 healthy nodes.
  5. **Scenario C, router loss:** kill one `pg-router`; assert 0 errors for connections that were on other routers and reconnection within 10 s for the rest.
  6. **Scenario D, switchover:** trigger from the UI; pass: < 10 s of errors.
  7. Record the numbers in `docs/testing/ha-results.md` with the run date and VM sizes.
  Docs page `docs/templates/postgres-ha.md`: what it deploys, sizing (each node ≥ 1 GB memory recommended; total 3 servers with 1 vCPU / 1 GB minimum per SPEC E1 works for small loads), what failover looks like from the app, driver settings, backups, limits (no read replicas, no PgBouncer yet), how to add a node after losing a server.
- **Files:** `e2e/ha/failover.sh`, `e2e/ha/lib/measure.sh`, `docs/testing/ha-results.md`, `docs/templates/postgres-ha.md`
- **Done when:** scenarios A–D pass on the local harness and once on real cloud VMs (Hetzner or Oracle, three servers), with the numbers recorded.

## 5. Detail checklist

### Typography
- Cluster tab health banner: title card title 14 / 600, body 14 / 400; the elapsed timer tabular 14 / 500.
- Node table: table cell 13 / 400; node names Geist Mono 13; lag and timeline tabular numerals right-aligned; role pills 12 / 500.
- Timeline strip entries: meta 13 / 400 `text-secondary` with the event verb in `text` 500 ("Failover to pg-2").
- Facts row: caption 12 / 400 `text-muted` separated by " · ".
- Deploy form slot labels: label 13 / 500 "Node 1 · Node 2 · Node 3"; the requirement banner body 14 / 400.
- Switchover dialog: title 20 / 600, body 14 / 400, typed-confirm input 14 / 400 Geist Mono.
- Docs page follows the Phase 18 docs typography.

### Spacing & layout
- Cluster tab: banner (16 px padding, radius 10) → 16 px → node table (44 px rows; Node 220 px, Role 120, State 120, Lag 96, Timeline 80, Last seen 120, actions 48) → 24 px → timeline strip (rows 32 px, 8 px gap) → 16 px → facts row.
- Deploy form: three slot pickers stacked with 12 px gaps at < 1024, in a 3-column grid with 16 px gap at ≥ 1024.
- Canvas: the seven nodes auto-laid out in the group "Postgres HA": routers on top row, `pg-*` middle, `etcd-*` bottom, 40 px gaps, group padding 24 px; the group label 13 / 500.
- 4 px grid throughout.

### Color & theme
- Role pill "Primary" is the tab's single accent element (`accent-subtle` background, `accent` text); replicas neutral.
- Degraded banner `warning` background at 12 % alpha with `warning` icon and `text`; no-primary banner `danger` at 12 % with `danger` icon.
- Lag over 64 MB renders in `warning` text with the `alert-triangle` 14 px icon and the text "lagging" after the number (never color alone).
- Timeline events: failover `warning` dot, switchover `info` dot, node joined `success` dot, node lost `danger` dot, each with text.
- Canvas nodes for `etcd-*` and `pg-router` use the generic database icon in `text-secondary`; `pg-*` nodes use the Postgres icon; the primary node shows a small "P" chip in `accent-subtle`.

### Motion
- Role change: the "Primary" pill fades out on the old row and in on the new row over 200 ms; the row order is stable (no reordering) to keep spatial memory.
- No-primary banner timer ticks every second, tabular, fixed width.
- Timeline strip: a new event slides in from the top 200 ms `cubic-bezier(.2,.8,.2,1)`; reduced motion: appears.
- Node state ◐ Starting pulses per C4; reduced motion: static.
- Canvas group appears with the standard node spring (C4 Motion); reduced motion: none.

### Iconography & symbols
- Tab icon `database-zap` 16 px for Cluster; role pills carry no icon; state uses the C4 glyphs (●, ◐, ✕, ■ as Lucide `circle`, `loader-2`, `x`, `square` 12 px).
- Row menu: `scroll-text` (View logs), `rotate-cw` (Restart node), `crown` (Make primary) 16 px.
- Timeline: 8 px dots as described; tooltips show ISO timestamps.
- Banner icons `alert-triangle` 16 px (degraded), `alert-octagon` 16 px (no primary).
- Template card icon: `postgresql` from simple-icons 24 px monochrome with a small "×3" chip.

### Copy
- Template description: "Three-node Postgres with automatic failover. Survives a server going down."
- Requirement banner: "Postgres HA needs three connected servers on the private network. You have 2." button "Add server".
- Deploy form helper: "Each node goes on its own server. If one server fails, the others take over."
- Healthy facts: "Replication: synchronous when possible · Failover: automatic · Cluster: acme-production-postgres".
- Degraded: "One node is down. Your database still works, but another failure would take it offline."
- No primary: "Your database has no primary right now. Patroni is electing one." with "0:14 elapsed".
- Lag: "1.2 MB behind" · lagging: "68 MB behind · lagging".
- Switchover: "Make pg-2 the primary? Apps reconnect within a few seconds. Do this outside busy hours." Typed: the service name. Button "Switch primary".
- Restart node: "Restart pg-3? If it's the primary, the cluster fails over first." Button "Restart node".
- Backup during failover: "The cluster was switching primaries. Try again in a minute."
- Notifications: "postgres failed over to pg-2 (was pg-1)" · "postgres: replica pg-3 is 68 MB behind" · "postgres is running on 2 of 3 nodes".
- Docs: "What to expect during a failover: writes pause for up to 30 seconds, then resume. Your app should retry a failed query once."
- No exclamation marks; buttons are verbs.

### States (empty · loading · error · success · partial)
- Cluster tab loading: banner slot empty, 3 skeleton rows at 44 px, timeline 3 skeleton lines.
- Bootstrapping (first deploy): banner `info` "Setting up the cluster. This takes a couple of minutes." with the node states ◐.
- Healthy · degraded (one node ✕ or ■) · no primary · switching (both old and new rows show ◐ with "Switching…") · agent offline on a node's server (row shows "Server offline" in `text-muted` and the lag "—").
- Status unavailable (all probes failing): error card `HA_NO_PRIMARY` or a plain "Couldn't read the cluster status. Showing the last known state from 14:02." with the stale table dimmed.
- Deploy form: eligible servers ≥ 3 · < 3 (banner) · a chosen server goes offline during the form (picker shows "offline" and Deploy disables).
- Backups tab: inherits Phase 9 states plus the failover failure.

### Keyboard & accessibility
- Node table sortable by Role and Lag with `aria-sort`; role pills are text; state glyphs have visually hidden labels.
- Role changes announced through the C11 live region: "pg-2 is now the primary".
- Switchover and restart dialogs follow C8.5 (typed / simple); focus returns to the row menu trigger on close.
- Timeline strip is a `<ol>` with `aria-label="Cluster events"`.
- Banner regions have `role="status"` (degraded) and `role="alert"` (no primary).
- axe clean; keyboard pass: open the Cluster tab, sort, open a row menu, run a switchover without a mouse.

### Responsive
- ≥ 1280: full table.
- 1024–1279: drop Last seen into the row sheet.
- 768–1023: table keeps Node, Role, State, Lag; horizontal scroll for the rest with the Node column sticky.
- < 768: nodes as cards (name, server chip, role pill, state, lag); timeline strip full width; deploy form pickers stacked; the canvas list view shows the group as a section header "Postgres HA" with its seven services.

### Performance
- Status polling 10 s only while a Cluster tab is open (subscription-driven), 60 s otherwise; probes run inside the network namespace with a 2 s timeout.
- Realtime role-change events go through the existing multiplexed WebSocket; the node table is small (3 rows) so no virtualization.
- HAProxy checks at 1 s intervals cost ~3 HTTP requests per second per router; negligible.
- Spilo memory: 1 GB default per node; the template warns when a chosen server has < 1.5 GB free (Phase 5 capacity check).

### Security
- etcd and Patroni REST listen only on the container network; project isolation (Phase 12 nftables) keeps other projects out; no public ports unless the user enables the TCP proxy on `pg-router`.
- Passwords generated per deploy (`secret(32)`), sealed for the superuser and standby users (write-only), the app password visible as a normal variable.
- `HttpProbe` is restricted to paths under `/` on ports 8008 / 2379 for containers with the `lumen.ha=true` label; the body is capped at 64 KB and never rendered as HTML.
- Switchover requires `deploy.run` (member+), audited with the target node.
- Spilo image pinned by digest; verify the Spilo and etcd licenses and the HAProxy licence exception in DECISIONS.md.

### Data integrity & idempotency
- Template deploy is idempotent per slot: re-deploying the template into the same environment re-uses existing nodes and never bootstraps a second cluster (Patroni refuses when the DCS already has the scope).
- Volumes per node stay on their servers; a node that re-joins uses `pg_rewind` (enabled in Spilo defaults) to catch up rather than a full re-clone when possible.
- `synchronous_mode: true` prevents acknowledged writes from being lost on failover when a sync replica exists; the docs explain the non-strict trade-off.
- Backups always target the current primary via Patroni's role, never a replica.
- Status snapshots are append-only with `observed_at`; the UI shows staleness when the newest snapshot is older than 30 s.

## 6. Acceptance criteria
- [ ] SPEC D5: "HA Postgres (Patroni-based, 3 servers)."
- [ ] SPEC Phase 17 AC: killing the primary fails over and the app reconnects with < 30 s of errors (scenarios A and B in 4.8, measured with the write-loop client on real VMs and recorded).
- [ ] The template deploys from the gallery onto three servers with one node per server; a workspace with fewer than three mesh-ready servers is blocked with the documented banner.
- [ ] `DATABASE_URL` is a single private address that follows the primary; router loss (scenario C) costs no errors for unaffected connections and < 10 s for the rest.
- [ ] Switchover from the UI completes with < 10 s of errors (scenario D) and is audited.
- [ ] A lost node re-joins as a replica within 5 minutes after its server returns.
- [ ] The Cluster tab shows role, state, lag and timeline per node, updates within 1 s of a role change, and renders healthy, degraded, no-primary and switching states correctly in both themes at three widths.
- [ ] Notifications `db_failover`, `db_replica_lagging`, `db_cluster_degraded` fire under the documented conditions.
- [ ] Phase 9 backup → restore passes against the cluster; a backup during failover fails with the documented message and retries.
- [ ] Docs page exists with sizing, failover expectations, driver settings and limits.
- [ ] All new errors come from the catalog (`HA_DEGRADED`, `HA_NO_PRIMARY`, `HA_SWITCHOVER_FAILED`, `BACKUP_FAILED`).

## 7. Test plan
- **Unit:** template schema validation and golden configs; Patroni `/cluster` normalization; notification condition evaluation; slot placement validation; `HttpProbe` request/response limits (Go).
- **Integration:** a Docker-compose harness with three Spilo + three etcd containers on one host (network-isolated) exercising bootstrap, `patronictl switchover`, status polling and the HAProxy config; backup job primary discovery with a mocked Patroni.
- **E2E (Playwright):** deploy the template with three harness servers; Cluster tab states via a mocked status feed; switchover dialog; deploy form with two servers.
- **Visual regression:** Cluster tab states and the deploy form, 3 widths × 2 themes.
- **Accessibility (axe + keyboard pass):** Cluster tab and dialogs.
- **Manual / on a real VM:** scenarios A–D on three cloud VMs; node re-join after power-on; TCP proxy public access following the primary.

## 8. Evidence required to close
- `docs/testing/ha-results.md` with the four scenarios' error windows (start and end timestamps, seconds), VM sizes and provider, run date.
- The writer's log excerpt around each failover.
- Screenshots of the Cluster tab in all states at three widths × two themes with C14 notes; the canvas group.
- Test outputs: template golden tests, compose-harness integration run, Playwright, axe.
- `patronictl list` output before and after each scenario.

## 9. Review
- SPEC H4 (architecture fresh-eyes) on the cluster design: split-brain possibilities, DCS quorum loss behavior, what happens when the mesh partitions (two servers see each other, the third is isolated), unbounded WAL growth when a replica is gone for days (`wal_keep_size`), and whether the router design survives 50 servers.
- SPEC H1 on the template, probe, poller and switchover code; probe: probe abuse, stale snapshots shown as current, notification storms during flapping.
- SPEC H2 on the Cluster tab; probe: does a beginner understand "degraded" versus "down", is "Make primary" scary enough, is lag readable.

## 10. Risks & open questions
- **Risk:** Mesh partition where the primary's server is isolated from the other two: etcd quorum moves to the majority, Patroni demotes the isolated primary (it loses its DCS lease), the majority promotes a replica; apps on the isolated server cannot reach the new primary until the mesh heals. → **Mitigation:** documented; the Cluster tab shows "Server oracle-1 can't reach the others" from Phase 12 mesh status; the chaos suite includes a partition test.
- **Risk:** Spilo image size slows first deploy on small VMs. → **Mitigation:** the deploy form says "First deploy pulls about 800 MB per node"; consider a Lumen-built image later (decision recorded).
- **Risk:** Replica far behind on failover with `maximum_lag_on_failover: 16MB` means no candidate → no primary until the old one returns. → **Mitigation:** `db_replica_lagging` notification fires early; the no-primary banner explains; docs describe manual `patronictl failover --force` through the web terminal.
- **Risk:** HAProxy's licence (GPL-2.0) needs a note for distribution. → **Mitigation:** the binary is pulled as an unmodified upstream image; record in DECISIONS.md and THIRD_PARTY.md.
- **Open question:** Expose `DATABASE_REPLICA_URL` for read scaling in v1? Default: no (out of scope), revisit after launch.
- **Open question:** Should the three `pg-*` nodes appear as one service in the UI with nodes inside, rather than three canvas nodes? Default: seven nodes in a group (matches the template model and keeps per-node logs/metrics simple); revisit after the H2 review.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: Spilo and etcd choice with digests and licenses, HAProxy router and licence note, Patroni timing parameters and the < 30 s math, synchronous mode trade-off, `requires` and `resources_group` template fields, `HttpProbe` op
- [ ] `docs/UI_DECISIONS.md` updated with Cluster tab screenshots
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 17 — HA Postgres</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-17-ha-postgres.md,
and these SPEC sections: D5 (HA Postgres), B4, B6, B9, B10, C4, C7.13, C8.5, C9, C14, J4, J6, Part H1/H2/H4,
plus docs/phases/PHASE-09, PHASE-12 and PHASE-13 for the pieces this phase composes.
</context>
<goal>A user deploys the Postgres HA template onto three servers, points an app at one private DATABASE_URL, and when the primary's server dies the app sees under 30 seconds of errors and keeps working.</goal>
<scope>
- postgres-ha template: 3 Spilo (Patroni + Postgres 16) nodes, 3 etcd members, HAProxy routers (one per database server), one node per server enforced by the deploy form, generated Spilo and HAProxy configs, sealed generated passwords, exposed DATABASE_URL
- Routing: embedded DNS round-robin over routers, HAProxy /primary health checks with session shutdown on demotion, TCP proxy following the primary
- Backups: Phase 9 logical dumps targeting the current primary, failover-safe failure and retry
- Cluster status: HttpProbe agent op, Patroni /cluster polling, ha_cluster_status snapshots, realtime role-change events, notifications db_failover / db_replica_lagging / db_cluster_degraded, switchover endpoint
- Cluster tab UI (banner, node table, timeline, facts), HA tab set, per-node metrics and logs
- Failover test protocol (container kill, server loss, router loss, switchover) with the write-loop client and recorded results; docs page
</scope>
<out_of_scope>
- Read replicas for apps, PgBouncer, other engines' HA, cross-project clusters, automatic node replacement
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-17-ha-postgres.md §6, including: failover on primary container kill and on server loss with < 30 s of app errors measured on real VMs; router loss < 10 s for affected connections; switchover < 10 s; lost node re-joins within 5 minutes; Cluster tab states correct and realtime within 1 s; backups target the primary and handle failover; template blocked without three mesh-ready servers.
</acceptance_criteria>
<process>
1. Write a plan: the DCS/image/router decisions with the timing math, template JSON shape, schema additions (requires, resources_group, ha_cluster_status), protocol addition (HttpProbe), risks, test plan, open questions. STOP and wait for approval.
2. Implement in the session order from the phase doc header; run the compose harness and Go/Vitest tests after each step; run the failover scenarios on real VMs before claiming the AC.
3. For UI: screenshots at 390/1024/1440 × dark/light × healthy, degraded, no-primary, switching; critique against SPEC C14 and §5; fix before reporting.
4. Report: what works (with the measured error windows), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
