# Phase 09 — Databases, volumes, backups

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 (backup/restore correctness, DbQuery executor, volume move) → Opus 5.5 (Data / Connect / Backups tabs, Volume panel) → each reviewed by the other |
| **Depends on** | Phase 3 (agent container and volume management, `DbQuery`/`BackupRequest` message handling), Phase 4 (control plane, encryption, staged changes), Phase 5 (canvas, inspector, add flow), Phase 7 (TCP proxy for public database access), Phase 8 (Metrics and Logs tabs reused by database services, event bus for `backup.failed`) |
| **Unblocks** | Phase 12 (cross-server volume move over the mesh), Phase 13 (templates create database services and volumes), Phase 14 (`lumen connect` uses the tunnel groundwork), Phase 16 (usage view reads volume sizes), Phase 17 (HA Postgres builds on the engine catalog and backup path) |
| **Spec sections** | SPEC B5 (`DbQuery`, `BackupRequest`, `BackupProgress`, `RestoreRequest`), B6 (`services.kind`, `volumes`, `backup_destinations`, `backup_schedules`, `backups`), B7 (generators, encryption), B9 (TCP proxy, private DNS), B10, C4, C5 (Data table, Confirm dialog typed variant, Copy field, Secret field), C7.5 (Database option), C7.6 (volume chip), C7.13, C7.14, C8.1, C8.5, C9, C10, C11, C12, D5 (first four items), J1 (volumes & backups), J6 (`VOLUME_FULL`, `BACKUP_FAILED`), J7 |
| **Estimated sessions** | 10 focused sessions: (1) engine catalog + one-click creation, (2) volumes on the agent, (3) Volume panel + attach/detach + staged limits, (4) DbQuery executor per engine, (5) Data tab, (6) Connect tab + tunnel groundwork, (7) backup destinations + restic engine, (8) schedules, restore, download, (9) Backups tab + volume move wizard, (10) round-trip tests, screenshots, review fixes |

## 1. Goal
A user adds a Postgres, MySQL, Redis or MongoDB in one click, sees it on the canvas with its volume, browses and edits its data in the dashboard, copies a connection string that works from other services, turns on nightly backups to their own S3 bucket, and restores a backup with a typed confirmation, and every one of those steps is safe against data loss.

## 2. Why this phase exists
Databases are where beginners lose data, and losing data is the one mistake a deployment platform cannot apologize for. Every other feature in Lumen is recoverable by redeploying; a volume is not. This phase therefore belongs to the "wrong design is expensive to undo" category (spec 0.3): the backup format, the restore semantics and the volume layout on disk are decisions the product will live with for years.

The spec (B10) fixes the shape: volumes are bind directories at `/var/lib/lumen/volumes/<volume_id>`; backups go through restic to any S3-compatible bucket the user owns; databases are backed up as logical dumps streamed into restic so a restore is consistent and engine-version tolerant; raw volumes use filesystem snapshots. Nothing is stored on the control plane, so a lost control plane never means lost data, and a lost server never means lost backups.

On the UI side, the Data tab and query console give beginners a spreadsheet-like view into their database, structurally comparable to what mature platforms offer, and the Connect tab removes the "how do I connect from my laptop" support question by making the private URL the recommended path and public exposure an explicit opt-in.

## 3. Scope
### In scope
- Engine catalog for Postgres, MySQL, Redis, MongoDB: pinned image tags, data paths, ports, health probes, auto variables (`DATABASE_URL`, `MYSQL_URL`, `REDIS_URL`, `MONGO_URL`, plus the engine's native credential variables) generated with B7 generators, private domain, volume auto-created.
- One-click database creation from the Add flow (C7.5 option 2) with canvas auto-placement of the node and its volume chip.
- Volumes (B10): bind directory layout, mounts, ownership and permissions per engine, usage tracking, 80% and 95% warnings against the size limit and against host disk, optional XFS project quota, attach/detach for volumes not bound to a service, size limit edits as staged changes, delete with typed confirmation.
- Volume panel (C7.14) and the volume chip on the canvas node.
- Move a volume between servers: backup → restore → switch → keep the old copy for 24h.
- `DbQuery` executor on the agent per engine, with a hard read-only mode, row and size limits, and timeouts.
- Data tab (C7.13): table/collection/key list, rows grid (paginated, sortable, filterable), staged cell edits applied as "Apply N changes", add and delete rows with confirmation, query console (SQL for Postgres/MySQL, a Mongo shell subset, Redis commands) with a results grid, history, and read-only mode on by default in production.
- Connect tab (C7.13): private URL marked "Recommended", public URL via the TCP proxy (off by default, "Enable public access"), copy buttons, snippets for psql/mysql/mongosh/redis-cli, Node, Python and Go, and the "Connect from your laptop" `lumen connect <service>` snippet.
- Tunnel groundwork: an authenticated API WebSocket endpoint that relays a TCP stream through the agent into a container port, used by Phase 14's CLI.
- Backup destinations (workspace settings, C7.20): S3-compatible endpoint, bucket, credentials, restic password, "Test connection".
- Backup engine on the agent: restic binary management, logical dumps (`pg_dump`, `mysqldump`, `mongodump`, Redis RDB) streamed into restic, raw volume snapshots with an optional brief pause, progress reporting.
- Backup schedules (off / daily / weekly with retention), "Back up now", backups list, restore in place (typed confirmation) or to a new database/volume, download.
- Backups tab (C7.13) and the same UI on the Volume panel.
- Automated backup → restore round-trip test for every engine.
- Error cards `VOLUME_FULL` and `BACKUP_FAILED` and the `backup.failed`, `volume.high` events for Phase 8's notifications.

### Out of scope
- The `lumen connect` and `lumen volume` CLI commands themselves (Phase 14; this phase ships the API tunnel endpoint).
- Cross-server volume moves over the WireGuard mesh (Phase 12; this phase implements the move wizard and verifies it between two servers that share a backup destination, which works without the mesh because restic is the transport).
- Database templates in the template gallery (Phase 13 reuses the engine catalog).
- HA Postgres (Phase 17).
- Control-plane backups (Phase 11).
- Metrics and Logs tabs for databases (Phase 8 components; this phase only registers database services in those tabs).

## 4. Work breakdown

### 4.1 Engine catalog
- **What:** A single source of truth for the four engines: image (`postgres:16-alpine`, `mysql:8.4`, `redis:7.4-alpine`, `mongo:8.0`, each pinned by digest in the same file and refreshed by a script), container port (5432, 3306, 6379, 27017), data path (`/var/lib/postgresql/data`, `/var/lib/mysql`, `/data`, `/data/db`), healthcheck command (`pg_isready -U $POSTGRES_USER`, `mysqladmin ping -h 127.0.0.1 -p$MYSQL_ROOT_PASSWORD`, `redis-cli -a $REDIS_PASSWORD ping`, `mongosh --eval "db.adminCommand('ping')"`), default memory 512 MB and CPU 0.5, run-as uid for the volume directory (postgres 70 on alpine, mysql 999, redis 999, mongodb 999), native credential variables and the URL variable template, the logical dump and restore commands, and the query dialect id. Also a `configParameters` list for the Advanced section (`max_connections`, `shared_buffers` for Postgres; `max_connections`, `innodb_buffer_pool_size` for MySQL; `maxmemory`, `maxmemory-policy` for Redis; `wiredTigerCacheSizeGB` for Mongo).
- **Files:** `packages/shared/src/databases/engines.ts`, `packages/shared/src/databases/engines.test.ts`, `scripts/pin-database-images.ts` (writes digests), `docs/DECISIONS.md` (image choice, license note: PostgreSQL License, GPL-2.0 for MySQL Community, Redis 7.4 under RSALv2/SSPL with Valkey as the BSD alternative to evaluate, SSPL for MongoDB).
- **Done when:** the test asserts every engine has every field, digests are present, and the URL template renders with sample values.

### 4.2 One-click database creation
- **What:** `POST /v1/environments/:id/services` accepts `{kind: "database", engine}`; the API creates the service (icon = engine icon), the service instance (source_type image, builder image, healthcheck from the catalog, restart always, memory/cpu defaults), the variables (`POSTGRES_USER=app`, `POSTGRES_PASSWORD=${{ secret(32) }}`, `POSTGRES_DB=app`, `DATABASE_URL=postgres://app:${{ self.POSTGRES_PASSWORD }}@${{ self.LUMEN_PRIVATE_DOMAIN }}:5432/app`, with the equivalents for the other engines and `REDIS_PASSWORD` / `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` / `MYSQL_ROOT_PASSWORD` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`), the volume at the engine data path, and the first deployment. The Add flow tile for each engine calls it and the canvas auto-places the node to the right of the last node with its volume chip, then opens the inspector on Deployments.
- **Files:** `apps/api/src/routes/environments/services.ts` (database branch), `apps/api/src/databases/create.ts`, `apps/api/src/databases/create.test.ts`, `apps/web/components/add/AddDatabase.tsx`, `apps/web/components/canvas/auto-place.ts`, `e2e/databases/create.spec.ts`.
- **Done when:** clicking "Postgres" produces a running container with a healthy status on the canvas within 60s on the test VM and `DATABASE_URL` resolves to a working connection from another service in the same environment.

### 4.3 Volumes on the agent
- **What:** `DesiredState.volumes[] {id, path, mount_path, uid, gid, mode, size_limit_mb, xfs_quota}` is reconciled: create `/var/lib/lumen/volumes/<volume_id>` with `0700` and the engine's uid/gid, bind-mount into the container at `mount_path`, and never delete a directory that is not in the desired state unless a `VolumeDelete{volume_id, op_id}` operation arrives (deletion is explicit, reconciliation only creates). Usage tracking: `statfs` on the host filesystem every 60s for free space; `du -s` per volume directory every 5 minutes (and immediately after a backup or restore), reported in `ActualState.volumes[] {id, used_bytes, host_free_bytes, host_total_bytes}`. Optional XFS project quota when the volume root is on XFS with `prjquota`: `xfs_quota -x -c 'project -s …' -c 'limit -p bhard=…'`, else a soft limit enforced by warnings only. Emit warning conditions at 80% and 95% of the size limit and of host disk, and refuse new deployments with `DISK_FULL` when host free disk is under 2 GB (D1).
- **Files:** `apps/agent/internal/volumes/manager.go`, `apps/agent/internal/volumes/usage.go`, `apps/agent/internal/volumes/quota_xfs.go`, `apps/agent/internal/volumes/manager_test.go`, `packages/protocol/proto/lumen/v1/state.proto` (volume fields, `ActualState.volumes`), `apps/api/src/gateway/handlers/actual-state.ts` (volume usage → `volumes.used_bytes`, `volume.high` events).
- **Done when:** a Go integration test creates, mounts, measures and deletes a volume against real Docker; the XFS quota test is skipped with a clear message on non-XFS runners and runs on the XFS CI job.

### 4.4 Volume API and staged edits
- **What:** `GET/POST /v1/volumes`, `PATCH /v1/volumes/:id` (name, mount_path, size_limit_mb via staged changes since a mount path change redeploys the service), `DELETE /v1/volumes/:id` (typed confirmation in the UI, refuses while attached unless `?detach=true`), `POST /v1/volumes/:id/attach` / `detach`, `POST /v1/volumes/:id/move`. Staged change kinds `volume.mount_path` and `volume.size_limit_mb` render in the review diff.
- **Files:** `packages/db/src/schema/volumes.ts` (add `size_limit_mb`, `used_bytes`, `host_free_bytes`, `last_measured_at`, `moving_to_server_id`, `previous_copy_until`), `apps/api/src/routes/volumes.ts`, `apps/api/src/staged/kinds/volume.ts`, `apps/api/src/routes/volumes.test.ts`.
- **Done when:** RBAC tests pass (member may edit, viewer may read, only admin may delete), audit rows exist for every mutation, and staged changes apply through the existing review modal.

### 4.5 Volume panel and canvas chip
- **What:** The volume chip under a service node (C7.6) shows the `HardDrive` icon, the mount path, and a 4px usage bar; click opens the Volume panel in the inspector at `/p/:project/:env/v/:volume`. Panel (C7.14): name (inline editable, autosave), mount path (staged), server, usage bar with "used / limit · host free", size limit stepper (staged), backups section (same component as the Backups tab, §4.13), "Move to another server" (wizard, §4.14), attach/detach for unbound volumes, Delete (typed confirmation with consequences: "This deletes all data on the volume. Backups are kept.").
- **Files:** `apps/web/components/canvas/VolumeChip.tsx`, `apps/web/app/(app)/p/[project]/[env]/v/[volume]/page.tsx`, `apps/web/components/volumes/VolumePanel.tsx`, `apps/web/components/volumes/UsageBar.tsx`, `apps/web/components/volumes/SizeLimitField.tsx`, `apps/web/components/volumes/AttachDialog.tsx`, `apps/web/components/volumes/DeleteVolumeDialog.tsx`.
- **Done when:** screenshots exist for the chip at 40%, 82% and 96% usage and the panel in every state; the delete dialog requires the exact volume name.

### 4.6 `DbQuery` executor on the agent
- **What:** The agent handles `DbQuery{op_id, container_id, engine, query, params[], read_only, row_limit, timeout_ms}` by connecting from the agent process to the container's IP on the project environment network (the agent joins that Docker network with a dedicated interface only for the duration of the query pool's life) using Go drivers: `pgx` (Postgres), `go-sql-driver/mysql`, `go-redis`, `mongo-go-driver`. Read-only enforcement: Postgres `BEGIN READ ONLY` + `SET LOCAL statement_timeout`, MySQL `SET SESSION TRANSACTION READ ONLY` + `max_execution_time`, Redis a command allowlist (`GET`, `MGET`, `HGETALL`, `HGET`, `LRANGE`, `SMEMBERS`, `ZRANGE`, `SCAN`, `KEYS` with a 1,000 cap, `TYPE`, `TTL`, `INFO`, `DBSIZE`), Mongo only `find`, `aggregate` (without `$out`/`$merge`), `countDocuments`, `listCollections`, `stats`. Results are capped at `row_limit` (default 200, max 1,000) and 5 MB, returned as `DbQueryResult{op_id, columns[], rows[] (JSON-encoded cells), row_count, truncated, duration_ms, error}`. Credentials come from the resolved service variables already held in memory (B7) and are never logged.
- **Files:** `apps/agent/internal/dbquery/executor.go`, `apps/agent/internal/dbquery/postgres.go`, `apps/agent/internal/dbquery/mysql.go`, `apps/agent/internal/dbquery/redis.go`, `apps/agent/internal/dbquery/mongo.go`, `apps/agent/internal/dbquery/readonly_test.go`, `apps/agent/internal/dbquery/executor_test.go` (against real containers in CI), `packages/protocol/proto/lumen/v1/dbquery.proto`.
- **Done when:** for each engine a write attempted in read-only mode is rejected with the engine's own error surfaced verbatim, a 1,001-row result reports `truncated`, and a `SELECT pg_sleep(60)` is cancelled at the timeout.

### 4.7 Data API
- **What:** `GET /v1/services/:id/data/schema` (tables/collections/keys with row estimates), `GET /v1/services/:id/data/rows?table&page&sort&filter` (paginated 50 per page, sort by one column, filter as `column op value` list), `POST /v1/services/:id/data/query` (`{query, params, read_only}`), `POST /v1/services/:id/data/apply` (`{table, changes[]}` where each change is `update {pk, column, value}`, `insert {row}` or `delete {pk}` executed in one transaction with row counts verified), `GET /v1/services/:id/data/history` (last 50 queries per user, stored server-side). Primary keys are discovered from the schema; tables without a primary key are read-only in the grid with the note "This table has no primary key, so cells can't be edited here."
- **Files:** `apps/api/src/routes/services/data.ts`, `apps/api/src/databases/schema-introspect/{postgres,mysql,redis,mongo}.ts`, `apps/api/src/databases/grid-query-builder.ts` (parameterized, identifier-quoted), `apps/api/src/databases/grid-query-builder.test.ts`, `packages/db/src/schema/db_query_history.ts`.
- **Done when:** the query builder test proves every identifier is quoted and every value is a parameter (no string interpolation path exists); RBAC: viewers may read rows and run read-only queries, members may apply changes, and any write in a production environment writes an audit row with the row count.

### 4.8 Data tab
- **What:** Two-pane layout: left list (240px) of tables / collections / key patterns with search and row estimates; right grid using the `packages/ui` data table with server-side pagination (50 rows), column sort, a filter row (column, operator, value chips), cell editing on double-click or Enter (text, number, boolean switch, JSON editor for jsonb/objects, datetime input), edited cells outlined in `warning` and collected into "Apply 3 changes" / "Discard" in a sticky footer, "Add row" opening a form built from the schema, row checkbox selection with "Delete 2 rows" (simple confirm). Query console below the grid as a resizable dock (default 240px): a code editor (CodeMirror 6, MIT) with SQL / Mongo / Redis syntax, `⌘⏎` runs, results grid, history dropdown, a "Read-only" switch that is on and locked to a warning confirm in production ("Writes in production can't be undone. Turn off read-only?"), and duration + row count in the status line.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/data/page.tsx`, `apps/web/components/data/DataTab.tsx`, `apps/web/components/data/SchemaList.tsx`, `apps/web/components/data/RowsGrid.tsx`, `apps/web/components/data/CellEditor.tsx`, `apps/web/components/data/FilterRow.tsx`, `apps/web/components/data/ApplyChangesBar.tsx`, `apps/web/components/data/AddRowDialog.tsx`, `apps/web/components/data/QueryConsole.tsx`, `apps/web/components/data/QueryHistory.tsx`, `apps/web/lib/url-state/data.ts` (`?table=users&page=2&sort=-created_at&f=status%3Deq%3Aactive&console=1`).
- **Done when:** e2e edits two cells, adds a row, applies, and asserts the database contents; the console runs a query and the history shows it; the production read-only guard is exercised.

### 4.9 Connect tab
- **What:** Two cards. "Private URL — Recommended": `postgres://app:••••@postgres.production.lumen.internal:5432/app` with a reveal toggle and copy; a note "Works from any service in this project. No public exposure." "Public URL": off by default with the switch "Enable public access", which creates a TCP proxy (Phase 7 API) on port 20000–29999 and shows `postgres://app:••••@203.0.113.7:20017/app` with a copy button and the warning "Anyone with this URL and password can reach your database. Prefer the private URL or the CLI tunnel." Below, a snippet block with tabs `psql` / `mysql` / `mongosh` / `redis-cli` (engine-appropriate) · Node · Python · Go, each a copyable code block using the private URL by default and switching to public when enabled. Last, the "Connect from your laptop" card with `lumen connect postgres` and a one-line explanation "Opens a secure tunnel to your database. Nothing is exposed publicly."
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/connect/page.tsx`, `apps/web/components/connect/ConnectTab.tsx`, `apps/web/components/connect/UrlCard.tsx`, `apps/web/components/connect/SnippetTabs.tsx`, `apps/web/components/connect/snippets/{psql,mysql,mongosh,redis-cli,node,python,go}.ts`, `apps/web/components/connect/LaptopCard.tsx`.
- **Done when:** every snippet is verified by running it against the test database (Node with `pg`/`mysql2`/`mongodb`/`ioredis`; Python with `psycopg`/`pymysql`/`pymongo`/`redis`; Go with `pgx`/`go-sql-driver`/`mongo-go-driver`/`go-redis`).

### 4.10 Tunnel groundwork
- **What:** `GET /v1/services/:id/tunnel` upgrades to a WebSocket (token or session auth, member role or above, audit row per session) and relays binary frames to a new agent operation `TunnelOpen{op_id, container_id, port}` / `TunnelData` / `TunnelClose`; the agent dials the container port on the environment network and pipes bytes. Idle timeout 10 minutes, max 8 concurrent tunnels per user. Phase 14's CLI listens locally and forwards.
- **Files:** `apps/api/src/routes/services/tunnel.ts`, `apps/api/src/gateway/tunnel-relay.ts`, `apps/agent/internal/tunnel/tunnel.go`, `packages/protocol/proto/lumen/v1/tunnel.proto`, `apps/api/src/routes/services/tunnel.test.ts` (with a fake agent that echoes).
- **Done when:** an integration test pushes 10 MB through the relay both ways with no corruption and the idle timeout closes an inactive session.

### 4.11 Backup destinations
- **What:** Workspace settings → Backup destinations: list and form (name, endpoint URL, region, bucket, path prefix, access key, secret key, restic repository password with "Generate" and the warning "Keep this password somewhere safe. Without it, backups can't be restored."), "Test connection" (the API asks the workspace's most recently online agent to run `restic -r s3:… snapshots --json` (initializing the repo if missing) and returns the result), default destination toggle. Credentials and the restic password are encrypted with the workspace data key (B7) and only ever decrypted into the agent's memory for a backup/restore operation. Providers with known endpoints pre-filled from a dropdown: Cloudflare R2, Backblaze B2, Oracle Object Storage, AWS S3, MinIO, Other.
- **Files:** `packages/db/src/schema/backup_destinations.ts`, `apps/api/src/routes/workspaces/backup-destinations.ts`, `apps/api/src/backups/test-destination.ts`, `apps/web/app/(app)/w/[workspace]/settings/backups/page.tsx`, `apps/web/components/backups/DestinationForm.tsx`, `apps/web/components/backups/DestinationList.tsx`, `packages/shared/src/backups/providers.ts` (endpoint templates).
- **Done when:** a MinIO container in CI accepts a test connection and a wrong secret yields the inline error "We couldn't sign in to that bucket (403). Check the access key and secret."

### 4.12 Backup engine on the agent
- **What:** restic binary: bundled in the agent release tarball for amd64 and arm64 with SHA-256 verified at agent start, placed at `/var/lib/lumen/bin/restic`. `BackupRequest{op_id, backup_id, volume_id, container_id?, engine?, destination{...}, mode logical|snapshot, pause bool}`: for logical mode, `docker exec` the engine's dump command inside the container (`pg_dump -Fc -U $USER $DB`, `mysqldump --single-transaction --routines --triggers -u root -p… --all-databases`, `mongodump --archive --gzip -u … -p … --authenticationDatabase admin`, Redis `redis-cli --rdb -` after `BGSAVE` completes) and stream stdout into `restic backup --stdin --stdin-filename <engine>.dump --tag lumen --tag volume:<id> --tag mode:logical`; for snapshot mode, optionally `docker pause` the container, run `restic backup /var/lib/lumen/volumes/<id> --tag …`, then unpause. Emit `BackupProgress{op_id, bytes_done, bytes_total?, phase dumping|uploading|done}` every 2s and a final `Ack` with `{snapshot_id, size_bytes, duration_ms}` or `OpError{code: BACKUP_FAILED, message}`. Scrub the destination credentials from any error message. Concurrency: one backup per volume at a time, max 2 per server.
- **Files:** `apps/agent/internal/backup/restic.go`, `apps/agent/internal/backup/logical.go`, `apps/agent/internal/backup/snapshot.go`, `apps/agent/internal/backup/progress.go`, `apps/agent/internal/backup/backup_test.go` (MinIO + each engine in CI), `deploy/agent-release/` (restic bundling and checksums), `packages/protocol/proto/lumen/v1/backup.proto`.
- **Done when:** each engine produces a restic snapshot in MinIO whose `restic dump` output restores cleanly (verified in §4.16), and a killed agent mid-upload leaves no partial snapshot (restic's own atomicity, verified with `restic check`).

### 4.13 Schedules, backup records, "Back up now", retention and events
- **What:** `backup_schedules(volume_id, cron, retention {keep_last, keep_daily, keep_weekly})` with UI presets Off / Daily at 03:00 / Weekly on Sunday at 03:00 (server local time shown in UTC with the user's local equivalent) and retention presets "Keep 7 daily" / "Keep 4 weekly" / custom; `backups(volume_id, status queued|running|done|failed, size_bytes, snapshot_id, started_at, finished_at, error_code, trigger schedule|manual|move)`; a scheduler worker enqueues due backups, a runner sends `BackupRequest` to the volume's server and updates progress via realtime topic `backup:<id>`; after a successful backup run `restic forget --prune` according to retention (rate-limited to once per day per destination). `POST /v1/volumes/:id/backups` = "Back up now". On failure, emit `backup.failed` to the Phase 8 event bus with the error code and the volume/service names.
- **Files:** `packages/db/src/schema/backup_schedules.ts`, `packages/db/src/schema/backups.ts`, `apps/api/src/routes/volumes/backups.ts`, `apps/api/src/workers/backup-scheduler.ts`, `apps/api/src/workers/backup-runner.ts`, `apps/api/src/backups/retention.ts`, `apps/api/src/backups/retention.test.ts`, `packages/shared/src/backups/schedule-presets.ts`.
- **Done when:** a clock-mocked test fires the daily schedule once and skips when a backup is already running; a failed backup produces the event and the `BACKUP_FAILED` notification through Phase 8.

### 4.14 Restore (in place or to new) and download
- **What:** `POST /v1/backups/:id/restore` with `{target: "in_place"}` or `{target: "new", name}`. In place: the API stages the service into a maintenance state (status `RESTORING` shown as ◐ with the label "Restoring"), sends `RestoreRequest{op_id, backup_id, snapshot_id, volume_id, container_id, engine, mode}`; the agent stops the container, for logical mode starts a temporary engine container on the same volume path only if the volume is empty, otherwise wipes the data directory after taking a safety snapshot (tagged `mode:pre-restore`, kept 24h), then streams `restic dump <snapshot> <engine>.dump` into the restore command (`pg_restore -Fc --clean --if-exists -d $DB`, `mysql`, `mongorestore --archive --gzip --drop`, Redis: write `dump.rdb` and start), and restarts the service; for snapshot mode it restores files with `restic restore --target /var/lib/lumen/volumes/<id>` after moving the old directory aside for 24h. To new: creates a new database service (same engine and version) with a new volume on the same server, then performs the same restore into it. Download: `GET /v1/backups/:id/download` streams `restic dump` output through the API (agent → control plane → browser) with `Content-Disposition: attachment; filename="<service>-<date>.dump"` and a size header when known; requires member role and writes an audit row.
- **Files:** `apps/api/src/routes/backups.ts`, `apps/api/src/backups/restore.ts`, `apps/api/src/backups/download-stream.ts`, `apps/agent/internal/backup/restore.go`, `apps/agent/internal/backup/restore_test.go`, `apps/web/components/backups/RestoreDialog.tsx` (typed confirmation: the service name, consequences list, radio "Replace the data in this database" / "Restore into a new database").
- **Done when:** the round-trip test (§4.16) passes for every engine in both target modes and the pre-restore safety snapshot exists after an in-place restore.

### 4.15 Backups tab and volume move wizard
- **What:** Backups tab (C7.13) and the Volume panel's backups section share `BackupsSection`: schedule card (preset select, retention select, next run time, "Saved" tick on autosave), "Back up now" secondary button (primary when no schedule exists), list (time, size, status pill, trigger, duration; row menu Restore, Download, Delete backup), a running row with a progress bar and phase label, and the empty state "Set up a backup destination" (primary button linking to workspace settings) when the workspace has none. Move wizard ("Move to another server"): step 1 pick the destination server (capacity shown, servers without enough free disk disabled with the reason), step 2 summary "We'll back up the volume, restore it on 'aws-1', switch the service over, and keep the old copy for 24 hours. Your service will be paused for about N minutes (estimated from size).", typed confirmation of the volume name, step 3 live progress (Backing up → Restoring → Switching → Done) driven by realtime, step 4 done with "Old copy is kept until <time>". Requires a backup destination.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/backups/page.tsx`, `apps/web/components/backups/BackupsSection.tsx`, `apps/web/components/backups/ScheduleCard.tsx`, `apps/web/components/backups/BackupList.tsx`, `apps/web/components/backups/BackupRow.tsx`, `apps/web/components/backups/NoDestination.tsx`, `apps/web/components/volumes/MoveVolumeWizard.tsx`, `apps/api/src/volumes/move.ts`, `apps/api/src/workers/volume-move.ts`, `apps/api/src/volumes/move.test.ts`.
- **Done when:** e2e moves a 50 MB Postgres volume between two test servers, the app reconnects, and the old directory is present with `previous_copy_until` set; screenshots for every wizard step exist.

### 4.16 Round-trip test per engine
- **What:** An automated test per engine: create the database service, write a fixture (100 rows / 100 keys / 100 documents with unicode and binary values), "Back up now" to MinIO, mutate the data (delete half), restore in place, assert the fixture is back exactly; then restore to new and assert equality in the new service; then delete the original and assert the backup list still shows the snapshot. Runs in CI against real Docker.
- **Files:** `e2e/backups/roundtrip.spec.ts` (drives the UI and API), `apps/agent/internal/backup/roundtrip_test.go` (agent-level, faster), `e2e/fixtures/db/{postgres,mysql,redis,mongo}.ts`.
- **Done when:** both suites are green for all four engines and the run time is recorded in PROGRESS.md.

### 4.17 Error cards, events and Advanced config parameters
- **What:** `VOLUME_FULL` (title "Your volume is almost full", explanation "It's using 9.6 GB of its 10 GB limit. Your app may fail to write data.", fix "Increase the limit" (staged) plus "Clean up" link to the Data tab) and `BACKUP_FAILED` (title "Your backup didn't complete", explanation from the agent's scrubbed error, fix "Test destination" and "Retry backup"). Advanced config parameters per engine (from the catalog) render in Settings → Advanced as a key-value editor whose values become engine command-line flags or config files in the container spec (staged).
- **Files:** `packages/shared/src/errors/catalog.ts` (entries), `apps/web/components/errors/actions/{increaseVolumeLimit,testBackupDestination,retryBackup}.ts`, `apps/web/components/settings/DatabaseConfigSection.tsx`, `apps/api/src/desired-state/database-config.ts` (parameter → flag mapping), `apps/api/src/desired-state/database-config.test.ts`.
- **Done when:** the cards render from a fixture in the gallery and each fix action is exercised in e2e; changing `max_connections` redeploys Postgres with the new value visible in `SHOW max_connections`.

### 4.18 Screenshots, accessibility, review fixes
- **What:** Screenshot matrix for the Add flow database tiles, canvas node with volume chip (3 usage levels), Volume panel, Data tab (grid, editing, apply bar, add row, delete confirm, console, history, read-only guard, no-primary-key note), Connect tab (private, public enabled, each snippet tab), Backups (no destination, empty, scheduled, running, failed, list), Restore dialog, Move wizard (4 steps), Backup destinations settings, error cards; axe on each; C14 self-critique; Part H1 review by Opus 5.5 of the agent backup/restore code and by Fable 5.1 of the UI code; Part H2 UI review by Fable 5.1.
- **Files:** `e2e/visual/databases.spec.ts`, `e2e/a11y/databases.spec.ts`, `docs/UI_DECISIONS.md`.
- **Done when:** every finding is fixed or tracked and screenshots are linked.

## 5. Detail checklist

### Typography
- Database node on the canvas: the engine name in card title (14/500), the version tag ("16") in meta 13/400 text-secondary right after the name; status per the C4 language at 13/500.
- Volume chip: mount path in code 12/400 Geist Mono `text-secondary`, truncated from the middle with the full path in a tooltip; usage percentage 11/500 tabular right-aligned.
- Volume panel: page title 20/600 (panel-level, not 24 because it sits inside the inspector); section titles 16/600; field labels 13/500; helper text caption 12/400 text-muted; usage readout "3.2 GB of 10 GB · 41 GB free on oracle-1" in body 14/400 with numbers tabular.
- Data tab schema list: item names in 13/400 Geist Mono (table names are identifiers), row estimates in caption 12/400 tabular text-muted right-aligned.
- Rows grid: header cells label 13/500 with the column type in caption 11/400 text-muted below on hover; cells table cell 13/400, numeric columns Geist Mono tabular right-aligned, booleans centered, nulls rendered as `null` in text-muted italic 13/400, JSON cells in mono truncated to one line with "{…}" and the full value in the editor.
- Cell editor: input 14/400 (mono for JSON and identifiers); the JSON editor uses 13/400 mono with line-height 1.5.
- Apply bar: "3 changes" in 14/500, buttons md.
- Query console: editor 13/400 Geist Mono line-height 1.5 with line numbers in 12/400 text-muted; results grid as above; status line caption 12/400 ("142 rows · 38 ms"); history items 13/400 mono truncated to one line with the relative time in caption.
- Connect tab: card titles 14/500 with the "Recommended" badge 11/600 uppercase 0.04em in `success` on a 12% tint; URL in a Secret field 13/400 mono with the password segment masked as `••••`; snippet code blocks 13/400 mono; tab labels 13/500.
- Backups list: time 13/400 (absolute "26 Sep 2026, 03:00" with relative in tooltip), size 13/400 tabular ("1.2 GB"), status pill 12/500, duration meta 13/400 text-secondary; schedule card "Next backup in 6 h" in body with the exact time in caption.
- Restore dialog: title 20/600, consequences as a bulleted list in body 14/400, the typed confirmation label "Type **postgres** to confirm" with the name in 14/600 mono.
- Move wizard: step titles 16/600, the estimate sentence in body, progress step labels 14/500 with durations in caption tabular.
- Destination form: labels 13/500; endpoint and bucket inputs 14/400 mono; the restic password in a Secret field with the warning in body 14/400 on a `warning` tint.
- Error cards per Phase 8 sizes (title 16/600, explanation 14/400 text-secondary, raw 12/400 mono).

### Spacing & layout
- Canvas volume chip: 8px below the node, same width as the node minus 24px (centered), 32px tall, 8px horizontal padding, 8px gap between icon, path and percentage; a 1px `border` connector line 8px tall from the node's bottom edge to the chip's top edge.
- Volume panel: 24px padding; sections separated by 32px with a 1px `border` divider; usage bar 8px tall, radius full, 8px below the readout; size limit stepper 160px wide.
- Data tab: schema list 240px wide with 8px item padding and 32px row height, 1px `border` on the right; grid header 36px, rows 36px (dense 28px on mobile); cell padding 8px 12px; the filter row 40px tall directly under the header with 8px gaps; the apply bar is sticky at the bottom of the grid pane, 48px tall, 16px padding, `surface-raised` with the theme shadow; the console dock is separated by a 4px draggable splitter (hit area 12px) and has a 40px toolbar (dialect label left, read-only switch and Run button right), editor min-height 120px, results below with the status line 28px.
- Connect tab: cards stacked with 16px gap, 16px padding, radius 10; the snippet block has a 40px tab bar and a code block with 12px padding and a copy button absolutely positioned 8px from the top-right.
- Backups section: schedule card 16px padding with two selects side by side (each 200px) and the next-run line below; list rows 44px tall, columns Time 200 · Size 96 · Status 120 · Trigger 96 · Duration 88 · Actions 40; the running row's progress bar is 4px tall spanning the full row width under the columns.
- Restore dialog: 480px wide, 24px padding, radio cards 12px padding with 8px gap, confirmation input full width, footer buttons right-aligned with 8px gap.
- Move wizard: modal 560px wide, stepper 48px tall across the top, content 24px padding, server cards 12px padding in a 2-column grid with 12px gaps.
- Destination settings: form max-width 560px, fields stacked with 16px gaps, "Test connection" secondary button left of "Save" primary in the footer.
- All spacing on the 4px grid; radii 6 (inputs, buttons, chips), 10 (cards, node, volume chip), 14 (modals, panels), full (pills, usage bars).

### Color & theme
- Engine icons use a two-tone treatment in `text-secondary` on the node (no vendor brand colors; the icon set license is recorded in DECISIONS.md and icons are used as plain glyphs).
- Volume chip: `surface` background, `border` 1px; the usage bar track `border`, fill `success` under 80%, `warning` from 80%, `danger` from 95%; the chip border turns `warning` / `danger` at the same thresholds so it reads at canvas zoom-out.
- Usage bar in the panel: same fill rules, with a 1px `text-muted` tick at the limit position when a host-free-space overlay is shown.
- Grid: header `surface`, rows alternate none (a striped grid competes with edited-cell highlights); hover `surface-hover`; selected row `accent-subtle`; edited cell outline 2px `warning` inset with a 6% `warning` tint; invalid cell outline `danger`; null text `text-muted`; boolean switch uses the standard component.
- Console: editor background `surface`, gutter `bg`, active line `surface-hover`, syntax colors mapped to tokens (keywords `accent`, strings `success`, numbers `info`, comments `text-muted`); the read-only switch shows a `Lock` icon in `warning` when it is off in production.
- "Recommended" badge `success` text on a 12% `success` tint; public URL card carries a `warning`-tinted inline alert.
- Backups status pills: ● Done `success`, ◐ Running `warning` pulsing, ✕ Failed `danger`, … Queued muted; the running progress bar fill `accent`.
- Restore dialog: the destructive radio ("Replace the data") is not colored red until selected, then the confirm button becomes the danger variant; the consequences list has a `danger`-colored `TriangleAlert` 16px.
- Move wizard progress: completed steps `success` check, active step `accent` spinner ring, pending `text-muted`.
- Both themes verified ≥ 4.5:1 for text; the usage bar colors ≥ 3:1 against the track.

### Motion
- Volume chip usage bar fill animates width over 200ms `cubic-bezier(.2,.8,.2,1)` on first paint and on each measurement update (every 5 minutes, so it never feels twitchy).
- Threshold crossing (80% / 95%) flashes the chip border to the new color over 120ms and then stays.
- Data grid: page changes cross-fade rows over 120ms; sort changes reorder with no animation (instant is clearer for tabular data); the edited-cell outline fades in over 120ms; the apply bar slides up 8px and fades in over 200ms when the first change is made and slides down when the count hits zero.
- Cell editor opens in place with no animation (immediate focus); Escape reverts with a 120ms fade of the outline.
- Console dock resize follows the pointer; opening or closing it animates height over 200ms panel easing.
- Running a query: the Run button shows the loading spinner; results appear with a 120ms fade; the status line counts duration live while running ("1.2 s…").
- Connect tab: copy feedback swaps the `Copy` icon to `Check` with a 120ms scale pop and back after 1.2s; enabling public access reveals the URL card body by expanding height over 200ms.
- Backups: a new running row appears at the top with a 200ms slide-down; the progress bar width follows `bytes_done` with a 200ms ease; on completion the row's pill cross-fades from ◐ to ● over 120ms.
- Restore dialog: standard modal 200ms; the typed-confirmation input's border transitions to `accent` when the name matches (120ms).
- Move wizard: steps slide horizontally 16px with a 200ms cross-fade; the progress step checkmarks draw in over 200ms.
- Pulsing status glyphs use the shared 1.6s cycle; all of the above are disabled under `prefers-reduced-motion` (instant state changes; the running pill shows a static ◐).

### Iconography & symbols
- Engine glyphs (16px on the node, 20px in the Add flow tiles, 24px in the template gallery later): `Database` (Lucide) as the base for all four with an engine initial letter badge (P, M, R, Mo) rendered in 9/600 in a 14px circle at the bottom-right; this keeps the icon set license-clean without vendor marks. Recorded in DECISIONS.md with the option to switch to a permissively licensed logo set later.
- Volume: `HardDrive` 14px on the chip, 20px in the panel header, 16px in the Add flow.
- Data tab: `Table2` (tables), `Braces` (Mongo collections), `Key` (Redis keys), `Search` 14px in the schema list search, `ArrowUpDown` 12px in sortable headers with `ArrowUp`/`ArrowDown` when sorted, `Filter` 14px on the filter row toggle, `Plus` 14px "Add row", `Trash2` 14px delete, `Check` / `X` 14px in the cell editor, `Play` 14px on Run, `History` 14px for query history, `Lock` / `LockOpen` 14px next to the read-only switch, `TriangleAlert` 14px in the no-primary-key note.
- Connect tab: `Network` 16px for the private card, `Globe` 16px for the public card, `Copy` / `Check` 14px, `Eye` / `EyeOff` 14px reveal, `Laptop` 16px for the laptop card, `TerminalSquare` 14px on the CLI snippet.
- Backups: `Archive` 16px section icon, `CalendarClock` 14px for the schedule, `CloudUpload` 14px "Back up now", `RotateCcw` 14px Restore, `Download` 14px, `Trash2` 14px, `TriangleAlert` 16px `danger` on failed rows.
- Move wizard: `ArrowRightLeft` 20px in the header, `Server` 16px on server cards, `Check` 16px on completed steps.
- Status glyphs (C4) on every status pill in this phase: ● ◐ ✕ ⟳ ☾ ■ … and the new ◐ "Restoring" label (same glyph as building, distinct label).
- Destination providers in the dropdown use `Cloud` 16px generically (no provider marks).

### Copy
- Add flow tiles: "Postgres", "MySQL", "Redis", "MongoDB" with the caption "One click. Includes a volume and connection variables." on the group header.
- Node: status labels "Active", "Building", "Restoring", "Failed", "Crashed", "Sleeping", "Stopped", "Queued".
- Volume chip tooltip: "/var/lib/postgresql/data · 3.2 GB of 10 GB used".
- Volume panel: title = volume name; "Mount path" helper "Where your app sees this disk. Changing it redeploys the service."; "Size limit" helper "We warn you at 80% and 95%."; usage "3.2 GB of 10 GB · 41 GB free on oracle-1"; Delete dialog title "Delete volume 'pg-data'?" consequences "This deletes all data on the volume." / "Backups in your bucket are kept." / "Type the volume name to confirm."; attach empty "This volume isn't attached to a service." primary "Attach to a service".
- Warnings: 80% "Your volume is 82% full." with "Increase limit"; 95% "Your volume is almost full. Your app may fail to write." (danger).
- Data tab: schema search placeholder "Find a table"; empty schema "No tables yet. Your app creates them on first run."; grid empty "No rows in users."; no-PK note "This table has no primary key, so cells can't be edited here."; apply bar "3 changes" · "Discard" · "Apply 3 changes"; add row title "Add a row to users" primary "Add row"; delete confirm "Delete 2 rows from users?" primary "Delete rows"; console placeholders "SELECT * FROM users LIMIT 50;" / "db.users.find({})" / "GET user:42"; read-only guard title "Turn off read-only in production?" body "Writes in production can't be undone." primary "Turn off read-only"; status line "142 rows · 38 ms" / "Truncated to 1,000 rows"; error line shows the engine error verbatim under "Your database said:".
- Connect tab: "Private URL" badge "Recommended" note "Works from any service in this project. No public exposure."; "Public URL" switch "Enable public access" note "Anyone with this URL and password can reach your database. Prefer the private URL or the CLI tunnel."; laptop card title "Connect from your laptop" body "Opens a secure tunnel to your database. Nothing is exposed publicly."; copy toast "Copied".
- Backups: section title "Backups"; no destination title "Set up a backup destination" body "Backups go to a bucket you own. It takes about two minutes." primary "Add destination"; schedule "Off" / "Daily at 03:00" / "Weekly on Sunday at 03:00"; retention "Keep 7 daily" / "Keep 4 weekly" / "Custom"; next run "Next backup in 6 h (03:00 UTC, 08:30 your time)"; empty list "No backups yet." primary "Back up now"; running "Backing up · 240 MB of 1.2 GB"; failed row tooltip = the scrubbed error; restore menu "Restore", "Download", "Delete backup".
- Restore dialog: title "Restore backup from 26 Sep, 03:00?"; options "Replace the data in postgres" / "Restore into a new database"; consequences for replace: "Current data in postgres is replaced." / "We keep a safety copy for 24 hours." / "The service pauses for about 2 minutes."; confirmation "Type postgres to confirm"; primary "Restore" (danger variant for replace).
- Move wizard: title "Move volume to another server"; step 1 "Pick a server" with disabled reason "Not enough free disk (needs 3.2 GB, has 1.1 GB)"; step 2 summary as in §4.15; step 3 labels "Backing up", "Restoring on aws-1", "Switching", "Done"; step 4 "Moved. The old copy on oracle-1 is kept until 27 Sep, 14:02."; requires destination: "Moving uses your backup destination. Set one up first."
- Destination form: title "Add a backup destination"; provider select; fields "Endpoint", "Region", "Bucket", "Path prefix (optional)", "Access key", "Secret key", "Repository password" with "Generate" and the warning "Keep this password somewhere safe. Without it, backups can't be restored."; "Test connection" results "Connected. The bucket is ready." / "We couldn't sign in to that bucket (403). Check the access key and secret." / "We couldn't reach that endpoint. Check the URL."
- Error cards (J6): `VOLUME_FULL` "Your volume is almost full" / fix "Increase the limit"; `BACKUP_FAILED` "Your backup didn't complete" / fixes "Test destination", "Retry backup".
- Voice rules per C9 throughout; buttons are verbs; no exclamation marks.

### States (empty · loading · error · success · partial)
- Node with volume: chip shows a skeleton bar until the first measurement; if the server is offline the chip shows the last known usage with a `WifiOff` 12px and the tooltip "Last measured 14:02".
- Volume panel: loading skeleton (title bar, usage bar block, three field blocks); error card if the volume's server is offline (`AGENT_OFFLINE`); partial when moving (a banner "Moving to aws-1 · Restoring" with the wizard's progress).
- Data tab: schema loading = 8 skeleton rows; grid loading = header plus 10 skeleton rows matching column widths; grid error = inline error card ("We couldn't read users. Your database said: …") with Retry; empty per copy; partial = a row-level error when applying changes (the failed change highlighted `danger` with the engine message, the others applied and cleared); console idle / running / results / error / truncated.
- Connect tab: loading skeletons for both URL cards; public access enabling shows the switch in a loading state; error when the TCP proxy could not be created (`PORT_BLOCKED` card with the provider fix from Phase 7).
- Backups: no destination; empty; loading (3 skeleton rows); list; running (progress); failed (row + error card); restoring (whole tab dimmed 60% with a banner "Restoring from 26 Sep, 03:00 · 40%" and actions disabled).
- Restore dialog: confirm disabled until the name matches; in-flight shows the loading button and locks the dialog; on error the dialog shows the `BACKUP_FAILED`-style card with the reason.
- Move wizard: per step; a failure in step 3 shows which stage failed and "Your data is untouched on oracle-1." with Retry.
- Destination settings: empty state; form validation; test in-flight / success / failure; delete blocked while schedules reference it ("3 schedules use this destination. Pick another destination for them first.").

### Keyboard & accessibility
- Volume chip is a button inside the node's tab order; Enter opens the panel; the usage bar has `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and an `aria-label` "Volume usage 32 percent".
- Data grid: `role="grid"` with roving tabindex; arrow keys move the focused cell, Enter or F2 edits, Escape cancels, Tab moves to the next editable cell while editing, `⌘S`/`Ctrl+S` applies staged changes, Delete on a selected row asks to delete; column headers are buttons with `aria-sort`; the apply bar is announced via a polite live region ("3 changes staged").
- Console: the editor is a real `textarea`-backed CodeMirror with `aria-label` "SQL query"; `⌘⏎` runs; the results grid follows the grid rules; the read-only switch is a `switch` with a described-by warning.
- Connect tab: copy buttons have `aria-label` "Copy private URL"; reveal toggles are `aria-pressed`; snippet tabs are a `tablist`.
- Backups list is a `table`; row menus are `menu` buttons; progress uses `role="progressbar"` with `aria-valuenow`; running status announced politely once per phase change.
- Restore dialog and Move wizard trap focus, restore focus on close, and the typed confirmation input has `aria-describedby` on the consequences list.
- All status pills are icon + text; usage colors are paired with the percentage text; edited cells are outlined and also carry `aria-description="Edited, not applied"`.
- Focus rings 2px `accent` 2px offset everywhere, including grid cells (inset to avoid clipping).
- axe clean on every state; keyboard pass recorded.

### Responsive
- ≥1280: Data tab two panes plus the console dock; Connect cards side by side (private, public) with snippets below.
- 1024–1279: Data schema list collapses to a 40px rail with a `PanelLeft` toggle; console dock default closed.
- 768–1023: inspector full width; grid hides columns beyond the first six with a "6 of 14 columns" chip that opens a column picker; Connect cards stack.
- <768: Data tab becomes tabs "Tables" / "Rows" / "Console" inside the sheet; rows render as key-value cards (label 12/500, value 13/400) instead of a grid, with edit via a bottom sheet form; the apply bar sits above the bottom tab bar; Backups list rows stack time and size on the first line and status and actions on the second; Move wizard is a full-screen sheet; Restore dialog is a sheet with the typed confirmation input auto-focused only after the consequences are visible (no auto-scroll past them).
- No hover-only affordances: row actions, copy buttons and the cell edit icon are visible on touch.

### Performance
- Grid fetches 50 rows per page with server-side sort and filter; column type metadata is cached per table for the session; row estimates use `pg_class.reltuples` / `information_schema` / `DBSIZE` / `collStats` rather than `COUNT(*)`.
- DbQuery results cap at 1,000 rows and 5 MB; the UI renders results through the virtualized table.
- Usage measurement: `du` runs at nice 19 / ionice idle, at most every 5 minutes per volume, staggered across volumes; `statfs` every 60s.
- Backups run with restic's default 2 MB packs and a per-server concurrency of 2; logical dumps stream (no temp files); the download path streams end to end with backpressure and never buffers a whole dump in the control plane.
- The tunnel relay copies frames with 64 KB buffers and applies per-session flow control; 8 concurrent tunnels per user.
- The control plane never stores database rows; the Data tab holds at most one page plus staged edits in memory.

### Security
- Every DbQuery is executed by the agent with credentials it already holds; the API never sees database passwords in query requests; the read-only flag is enforced at the engine level, not by parsing SQL.
- The grid query builder quotes every identifier and parameterizes every value; identifiers are validated against the introspected schema so a client cannot name an arbitrary table.
- Writes in production environments require member role, log an audit row with the table and row count, and pass the read-only guard; viewers can only read.
- Public database access is off by default, opt-in per service, and the warning names the risk; enabling it writes an audit row; the TCP proxy port is random within 20000–29999.
- Backup credentials and the restic password are encrypted at rest with the workspace data key, decrypted only into agent memory for an operation, scrubbed from every error and log line, and never returned to a client after creation (last 4 characters shown).
- Restic repositories are encrypted client-side by restic; the repository password is the only way to read a bucket's contents.
- Downloads require member role, are audited, and stream through an authenticated route (no pre-signed bucket URLs that would expose the bucket).
- The tunnel endpoint authenticates per session, is rate-limited (8 per user), idles out at 10 minutes, and relays only to the container port declared by the service.
- Restore in place always takes a pre-restore safety snapshot; the "keep 24h" copies are cleaned by a worker and never before their time.
- Volume directories are `0700` owned by the engine's uid; user containers cannot see other volumes because only their bind mount is passed.

### Data integrity & idempotency
- Volume creation is idempotent by `volume_id`; reconciliation never deletes directories; explicit `VolumeDelete` is keyed by `op_id` and acknowledged once.
- Backups are keyed by `backup_id`; a re-sent `BackupRequest` with the same id is acknowledged with the existing result; restic snapshots carry `lumen`, `volume:<id>` and `backup:<id>` tags so the control plane can reconcile its `backups` table from `restic snapshots --json` after a crash.
- Logical dumps use `--single-transaction` (MySQL), a consistent snapshot (`pg_dump` default), and `mongodump` at a point in time; Redis waits for `BGSAVE` completion before reading the RDB.
- Restore stages: safety snapshot → stop → restore → start → healthcheck → mark done; a failure at any stage leaves the previous data in place (logical) or the moved-aside directory (snapshot), and the deployment record shows the failed stage.
- Volume move is a state machine (`backing_up` → `restoring` → `switching` → `done` | `failed`) persisted per step in `volumes.move_state`; each step is idempotent and resumable by the worker after a control-plane restart.
- Retention pruning runs `restic forget` with explicit policy flags and `--prune` at most once per day per destination, never concurrently with a backup on the same repository (restic locks are respected and stale locks older than 1h are cleared with `restic unlock`).
- Staged cell changes are applied in a single transaction with expected row counts; a mismatch rolls back and surfaces which change failed.
- Usage numbers carry `last_measured_at` so the UI can say "Last measured 14:02" rather than show stale data as current.

## 6. Acceptance criteria
- [ ] One-click Postgres, MySQL, Redis, MongoDB with auto variables (`DATABASE_URL` and the engine equivalents) and a volume (D5).
- [ ] Data browser, query console, connect tab, CLI tunnel groundwork (D5; the `lumen connect` command itself lands in Phase 14 and the tunnel endpoint is verified here with the integration test).
- [ ] Volumes: create, attach, resize limit, usage alerts, move between servers (D5).
- [ ] Scheduled and manual backups, restore (in place or new), download; the restore round-trip is verified in an automated test for every engine (D5).
- [ ] Warnings at 80% and 95% of the configured size limit and of host disk (B10); `DISK_FULL` blocks builds under 2 GB free (D1).
- [ ] Read-only mode is enforced by the engine for every dialect (write attempts fail in the test).
- [ ] Moving a volume keeps the old copy for 24h and the service reconnects without manual changes.
- [ ] Backup failure emits `backup.failed` and Phase 8 delivers the `BACKUP_FAILED` notification.
- [ ] `VOLUME_FULL` and `BACKUP_FAILED` error cards render with working fix actions.
- [ ] Every Connect snippet runs successfully against the test database in CI.
- [ ] Credentials never appear in API responses, logs, or error messages (a grep-based test over captured logs during the backup suite).
- [ ] Every page and state passes axe and the C14 checklist; screenshots at 390/1024/1440 × dark/light reviewed.

## 7. Test plan
- **Unit:** engine catalog completeness; URL template rendering; grid query builder (identifier quoting, parameterization, sort/filter operators, rejection of unknown identifiers); retention policy flag generation; schedule preset → cron and next-run computation; move state machine transitions; URL state for the Data tab.
- **Integration:** agent volume manager against Docker; DbQuery executor per engine (read-only rejection, truncation, timeout, unicode and binary values); backup + restore per engine against MinIO; tunnel relay with an echo container; API data routes with RBAC and audit assertions; scheduler with a mocked clock; destination test against MinIO with good and bad credentials.
- **E2E (Playwright):** create each database from the Add flow; edit cells and apply; add and delete rows; run a console query and see history; production read-only guard; enable public access and connect through the proxy; back up now, watch progress, restore in place with typed confirmation, restore to new; move a volume between two servers; volume delete with typed confirmation; destination CRUD and test connection; error cards.
- **Visual regression:** every state listed in §5 at 390/1024/1440 × dark/light.
- **Accessibility (axe + keyboard pass):** axe on each page; keyboard pass for the grid (arrow navigation, edit, apply), console, dialogs and the wizard.
- **Manual / on a real VM:** Oracle ARM VM with an XFS-formatted volume root: verify the project quota path; fill a volume to 96% and confirm the chip, panel warning, and notification; pull the agent during a backup and confirm `restic check` is clean and the backup row ends `failed` with a retry.

## 8. Evidence required to close
- `go test ./apps/agent/internal/backup/... ./apps/agent/internal/dbquery/... ./apps/agent/internal/volumes/...` output green in CI with the engine containers.
- The round-trip e2e report for all four engines with durations.
- Screenshots (390/1024/1440 × dark/light) for the Add flow database tiles, node with chip at 40/82/96%, Volume panel (loading, normal, warning, moving, delete dialog), Data tab (grid, editing, apply bar, add row, delete confirm, console idle/running/results/error, history, read-only guard, no-PK note, mobile cards), Connect tab (private, public enabled, each snippet tab), Backups (no destination, empty, scheduled, running, failed, restoring), Restore dialog (both modes), Move wizard (4 steps and the failure state), Destination settings (empty, form, test success, test failure), both error cards — linked from `docs/UI_DECISIONS.md`.
- A captured API log excerpt during the backup suite proving no credential strings appear (the grep test output).
- The tunnel integration test output with the 10 MB throughput figure.
- `restic snapshots --json` output from MinIO showing the tags after the round-trip.
- Memory and CPU of the agent during a 1 GB backup on the test VM (must stay under the 50 MB idle budget plus restic's own process).

## 9. Review
- Part H1 (code review) with Opus 5.5 on the Fable-written agent backup/restore/dbquery/volume code: probe restore atomicity, the pre-restore snapshot, `restic` lock handling, credential scrubbing, the network attachment used by the executor (must not leave the agent permanently on user networks), and the XFS quota commands.
- Part H1 with Fable 5.1 on the Opus-written UI and API data routes: probe the query builder for any interpolation, RBAC on every route, audit coverage on writes, the production read-only guard, and public-access opt-in.
- Part H2 (UI review) with Fable 5.1 on the screenshot matrix: probe whether a beginner understands "Private URL — Recommended" without reading the note; whether the edited-cell outline plus apply bar makes staged edits obvious; whether the restore dialog's consequences are read before the confirmation input; whether the Move wizard's estimate is trusted; one accent element per view.
- Part H4 concerns to carry forward: `backups` table growth (prune rows after retention removes snapshots), `du` cost on volumes with millions of files (consider `statfs` on XFS quota instead), and cross-server moves at mesh scale (Phase 12).

## 10. Risks & open questions
- **Risk:** Logical restores across engine minor versions can fail (Postgres 16 → 16 is fine; 16 → 17 needs `pg_restore` from the newer version) → **Mitigation:** the restore-to-new path uses the same pinned image as the backup's `engine_version` tag stored on the snapshot; upgrades are out of scope and documented.
- **Risk:** Redis logical backup via `redis-cli --rdb` needs `BGSAVE` permission and enough disk for the RDB → **Mitigation:** stream directly and check host free disk ≥ 2 × the estimated RDB size before starting.
- **Risk:** `du` on large volumes is slow and I/O heavy → **Mitigation:** nice/ionice, 5-minute cadence, staggering, and XFS quota accounting when available.
- **Risk:** MongoDB and Redis licenses (SSPL, RSALv2/SSPL) constrain redistribution of images but not self-hosting by users → **Mitigation:** Lumen pulls official images at deploy time and does not redistribute them; the license note goes in DECISIONS.md; evaluate Valkey as a drop-in for the Redis template in Phase 13.
- **Risk:** The agent joining project networks for DbQuery widens its exposure → **Mitigation:** connect through a short-lived helper container on the network with a socket to the agent, or attach the agent for the duration of a query pool only (decide in the plan step; record the choice).
- **Risk:** Users restore in place by accident → **Mitigation:** typed confirmation, the safety snapshot, and the 24h moved-aside copy.
- **Open question:** Should the tunnel endpoint live on the API host or bypass to the agent's server? Default: through the API (single outbound connection model, B12); revisit if throughput becomes a complaint.
- **Open question:** Is "Restoring" a deployment status or a service status? Default: a service-level status flag (`service_instances.maintenance = restoring`) rendered with the ◐ glyph and the label "Restoring", leaving the B4 deployment lifecycle untouched.
- **Open question:** Default backup time 03:00 in which timezone? Default: UTC, with the user's local time shown alongside.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: engine images and licenses, restic bundling, logical vs snapshot defaults, DbQuery network attachment, read-only enforcement per engine, XFS quota policy, backup time default, tunnel routing
- [ ] `docs/UI_DECISIONS.md` updated with the screenshot matrix and keyboard pass notes
- [ ] Cross-model review done (H1 both directions, H2 on screenshots) and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 09 — Databases, volumes, backups</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-09-databases-volumes-backups.md,
and these SPEC sections: B5 (DbQuery, BackupRequest, BackupProgress, RestoreRequest), B6 (services,
volumes, backup_destinations, backup_schedules, backups), B7, B9 (TCP proxy, private DNS), B10, C4, C5,
C7.5, C7.6, C7.13, C7.14, C8.1, C8.5, C9, C10, C11, C12, D5, J1 (volumes & backups), J6
(VOLUME_FULL, BACKUP_FAILED), J7.
</context>
<goal>A user adds Postgres/MySQL/Redis/MongoDB in one click with a volume and connection variables,
browses and edits data in the dashboard, connects privately or via an explicit public proxy, schedules
backups to their own S3-compatible bucket, and restores with a typed confirmation, with a verified
backup → restore round-trip for every engine.</goal>
<scope>
- Engine catalog (pinned images, ports, data paths, healthchecks, auto variables, config parameters)
- One-click creation from the Add flow with canvas auto-placement and the volume chip
- Volumes on the agent: /var/lib/lumen/volumes/<volume_id>, mounts, usage (du/statfs), 80%/95% warnings, optional XFS quota
- Volume API, staged mount path / size limit edits, attach/detach, delete with typed confirmation, Volume panel (C7.14)
- DbQuery executor per engine with engine-enforced read-only, row/size caps, timeouts
- Data tab: schema list, rows grid, staged cell edits "Apply N changes", add/delete rows, query console with history, production read-only guard
- Connect tab: private URL (Recommended), public via TCP proxy (opt-in), snippets, "Connect from your laptop"
- Tunnel groundwork: /v1/services/:id/tunnel WebSocket relay through the agent
- Backup destinations (workspace settings) with Test connection
- Backup engine: bundled restic, logical dumps streamed into restic, raw snapshots, progress
- Schedules (off/daily/weekly + retention), Back up now, list, restore in place or to new, download
- Backups tab, volume move wizard (backup → restore → switch → keep 24h)
- Round-trip test per engine; VOLUME_FULL and BACKUP_FAILED cards; backup.failed and volume.high events
</scope>
<out_of_scope>
- lumen connect / lumen volume CLI commands (Phase 14)
- Mesh-based cross-server moves (Phase 12), database templates in the gallery (Phase 13), HA Postgres (Phase 17), control-plane backups (Phase 11)
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-09-databases-volumes-backups.md §6, including D5's first four items,
the automated backup → restore test passing for every engine, 80%/95% warnings, engine-enforced read-only,
the 24h kept copy after a move, credential-free logs, and axe-clean screenshots at 390/1024/1440 × dark/light.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, data/protocol changes (volume fields, DbQuery, Backup*, Tunnel*),
   the DbQuery network attachment approach, risks, test plan, open questions. STOP and wait for approval.
2. Implement in small steps in the §4 order; run code and tests after each step, including the
   per-engine containers.
3. For UI: screenshots at 390/1024/1440 × dark/light × the states in §5; critique against SPEC C14;
   fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
