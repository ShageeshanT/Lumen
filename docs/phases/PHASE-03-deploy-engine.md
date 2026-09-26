# Phase 03 — Deploy engine on the agent

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 → reviewed by Opus 5.5 |
| **Depends on** | Phase 02 (agent process, connection, envelope, Caddy bootstrap, host metrics, `DISK_FULL` flag) |
| **Unblocks** | Phase 04 (the desired-state compiler targets the `DesiredState` contract fixed here), Phase 05 (deploy timeline, runtime logs, canvas status), Phase 07 (routes and HTTP logs extend the Caddy layer), Phase 08 (container metrics and log query), Phase 09 (volumes reconcile here), Phase 12 (replicas across servers), Phase 16 (cron, sleep) |
| **Spec sections** | SPEC B3, B4, B5 (`DesiredState`, `ActualState`, `Build*`, `Log*`, `MetricsBatch`), B7 (log scrubbing), B8, B11, B12 (container defaults), B13, B14, D2, J3, J6 |
| **Estimated sessions** | 8 focused sessions (reconcile loop · container runtime + hardening · Caddy routes + zero-downtime swap · healthcheck/restart/crash-loop · BuildKit + Railpack + Dockerfile + image · build log streaming + scrubbing + failure explanations · runtime log capture + query · port detection + metrics + GC + chaos tests) |

## 1. Goal
Given a desired state and a build request, a server running the agent builds a repository (or pulls an image), starts it with limits, swaps traffic to it with zero failed requests, keeps it alive with backoff, and streams build and runtime logs live, and it converges to the same result even if the agent is killed halfway through.

## 2. Why this phase exists
This is the part of Lumen that touches the user's real workloads. The reconciliation model (B3) is the single idea that makes the platform restart-safe: the control plane never issues "run this command", it publishes a target, and the agent moves toward it. If this phase is implemented as imperative scripts instead, every later feature (replicas, environments, rollbacks, drain, sleeping, PR previews) has to re-invent recovery. The spec assigns this to Fable 5.1 because a wrong design here is the most expensive one to undo (SPEC 0.3).

The user-visible promises this phase carries: "your app never goes down because the dashboard is down" (B3 failure rule), "deploys don't drop requests" (B4), "your build failed and here's why, in plain words" (D2), and "logs appear within a second" (B14). Performance budgets are acceptance criteria, not aspirations: Node hello world under 90 s cold and 30 s warm on 2 vCPU, log line to live tail under 1 s, status change under 1 s.

## 3. Scope
### In scope
- Protocol additions: `DesiredState`, `ActualState`, `DeployEvent`, `BuildRequest`, `BuildEvent`, `BuildResult`, `BuildCancel`, `ContainerAction`, `LogSubscribe`, `LogUnsubscribe`, `LogChunk`, `LogQuery`, `LogQueryResult`, `MetricsBatch.container_samples`.
- Agent reconciliation loop: persisted desired state, diff by content hash, ordered execution (volumes → networks → containers → routes → TCP proxies), timer + on-message + Docker-event triggers, `ActualState` reporting.
- Docker container management with the B12 hardening defaults, memory/CPU/pids limits, labels, per-project-environment networks (single server), volume bind mounts at `/var/lib/lumen/volumes/<volume_id>`.
- Caddy route management via the loopback admin API: HTTP routes per hostname → upstream list, upstream swap, default 404, the port-check route from Phase 02.
- Deploy lifecycle B4 on the agent side: pre-deploy command, zero-downtime swap, healthcheck (TCP connect default, HTTP path optional, 120 s default timeout), drain (SIGTERM then SIGKILL after 30 s default), stop-first path for services with volumes, superseding, cancel.
- Restart supervision: agent-managed restarts with exponential backoff, crash-loop detection → `CRASHED`, OOM detection → `OOM_KILLED`.
- Builds: BuildKit (`buildkitd` platform container pinned by digest) with Railpack zero-config, Dockerfile, and prebuilt images (public and private registries); source from a git URL with a short-lived token or a tarball URL; build cache persistence; build log streaming with secret scrubbing; build timeout; cancel; the 20 human-readable build failure explanations.
- Runtime log capture into rotating segment files with an index, live tail, query by time range and filter, JSON line parsing, 7-day default retention, scrubbing.
- Port detection inside the container network namespace and the "Detected your app on port N" event.
- Container metrics sampling every 10 s with a 1 h local ring buffer.
- Image and build-cache garbage collection (keep last 5 images per service, nightly), disk-full refusal (`DISK_FULL`).
- A control-plane **dev driver** (`LUMEN_DEV_DRIVER=1` only) that can push a hand-written `DesiredState` and `BuildRequest` to a server so this phase is testable before Phase 04's compiler exists.
- Chaos tests: kill the agent mid-build and mid-swap; control plane down for 10 min.
### Out of scope
- Desired-state compilation from the data model, deployment rows, variable resolution → Phase 04 (this phase consumes already-resolved values).
- GitHub App tokens and webhooks → Phase 06 (this phase accepts any git URL + token).
- Generated/custom domains, HTTPS issuance, TCP proxy UI, HTTP access-log parsing → Phase 07 (this phase installs HTTP routes for whatever hostnames the desired state lists and enables Caddy's JSON access log so Phase 07 can parse it).
- Metric rollups in Postgres and the Metrics tab → Phase 08.
- Volume creation UI, backups, moves → Phase 09 (this phase mounts volumes listed in desired state).
- Cross-server images, mesh, replicas on other servers → Phase 12.
- Local upload (`lumen up`) → Phase 14.
- Sleeping and cron → Phase 16 (`cron_jobs[]` and `desired_status` fields exist but are not acted on beyond `stopped`).

## 4. Work breakdown

### 4.1 Protocol additions
- **What:** Extend `Envelope.body` (field numbers 30–49 reserved in Phase 02) and add the state and build messages.
- **Files:** `packages/protocol/proto/lumen/agent/v1/state.proto`, `build.proto`, `logs.proto`, `deploy.proto`, `metrics.proto` (extend), `envelope.proto` (extend), regenerated `packages/protocol/gen/{go,ts}`.
- **Messages:**
  ```proto
  // state.proto
  message DesiredState { Meta meta = 1; uint64 version = 2; string content_hash = 3;
    repeated ContainerSpec containers = 4; repeated RouteSpec routes = 5; repeated TcpProxySpec tcp_proxies = 6;
    repeated VolumeSpec volumes = 7; repeated MeshPeer mesh_peers = 8; repeated DnsRecord dns_records = 9;
    repeated CronJobSpec cron_jobs = 10; repeated NetworkSpec networks = 11; }
  message ContainerSpec { string id = 1 /* stable per service_instance + replica */; string spec_hash = 2;
    string service_id = 3; string service_instance_id = 4; string environment_id = 5; string project_id = 6;
    string deployment_id = 7; uint32 replica = 8; string image_ref = 9; string image_digest = 10;
    RegistryAuth registry_auth = 11; repeated string command = 12; repeated string entrypoint = 13;
    map<string,string> env = 14 /* resolved values, in memory only */; repeated Mount mounts = 15;
    Resources resources = 16; Healthcheck healthcheck = 17; RestartPolicy restart = 18;
    string network_id = 19; repeated string network_aliases = 20; uint32 target_port = 21;
    repeated string pre_deploy_command = 22; uint32 drain_timeout_s = 23 /* 30 */;
    DesiredStatus desired_status = 24 /* RUNNING | STOPPED */; Security security = 25; string workdir = 26; }
  message Resources { uint64 memory_bytes = 1; double cpus = 2; uint32 pids_limit = 3 /* 256 */; }
  message Healthcheck { string http_path = 1 /* empty = TCP connect */; uint32 timeout_s = 2 /* 120 */; uint32 interval_ms = 3 /* 1000 */; }
  message RestartPolicy { enum Kind { ALWAYS = 0; ON_FAILURE = 1; NEVER = 2; } Kind kind = 1; uint32 max_retries = 2 /* 10 */; }
  message Security { bool read_only_rootfs = 1; repeated string cap_add = 2; bool docker_socket = 3 /* opt-in, scary */; }
  message Mount { string volume_id = 1; string mount_path = 2; bool read_only = 3; }
  message VolumeSpec { string id = 1; string spec_hash = 2; uint64 size_limit_bytes = 3; }
  message NetworkSpec { string id = 1 /* lumen-<environment_id> */; string environment_id = 2; string project_id = 3; string subnet = 4; }
  message RouteSpec { string id = 1; string spec_hash = 2; repeated string hostnames = 3; string service_instance_id = 4;
    repeated Upstream upstreams = 5; bool tls = 6; string tls_mode = 7 /* acme | internal | off */; }
  message Upstream { string container_id = 1; string address = 2 /* ip:port */; }
  message TcpProxySpec { string id = 1; string spec_hash = 2; uint32 public_port = 3; string container_id = 4; uint32 container_port = 5; }
  message ActualState { Meta meta = 1; uint64 version_applied = 2; repeated ContainerState containers = 3;
    repeated StateError errors = 4; repeated RouteState routes = 5; bool converged = 6; }
  message ContainerState { string id = 1; string spec_hash = 2; string docker_id = 3; Status status = 4; Health health = 5;
    uint32 restarts = 6; bool oom_killed = 7; int64 started_at_ms = 8; int32 exit_code = 9; repeated uint32 detected_ports = 10;
    string ip = 11; string deployment_id = 12; uint32 replica = 13;
    enum Status { CREATING = 0; STARTING = 1; RUNNING = 2; EXITED = 3; CRASHED = 4; STOPPED = 5; DRAINING = 6; }
    enum Health { UNKNOWN = 0; HEALTHY = 1; UNHEALTHY = 2; } }
  message StateError { string item_id = 1; string code = 2; string message = 3; }

  // deploy.proto
  message DeployEvent { Meta meta = 1; string deployment_id = 2; string container_id = 3;
    Phase phase = 4; string message = 5; string error_code = 6; int64 duration_ms = 7;
    enum Phase { PRE_DEPLOY = 0; DEPLOYING = 1; HEALTHCHECKING = 2; ACTIVE = 3; FAILED = 4; CANCELLED = 5; DRAINING_OLD = 6; REMOVED_OLD = 7; } }
  message ContainerAction { Meta meta = 1; string container_id = 2; enum Kind { RESTART = 0; STOP = 1; START = 2; } Kind kind = 3; }

  // build.proto
  message BuildRequest { Meta meta = 1; string build_id = 2; string deployment_id = 3; string service_id = 4;
    Source source = 5; Builder builder = 6; string dockerfile_path = 7; repeated string build_command = 8;
    string root_dir = 9; map<string,string> build_env = 10; string image_ref = 11 /* lumen/<service_id>:<deployment_id> */;
    uint32 timeout_s = 12 /* 1800 */; repeated string secret_values = 13 /* for scrubbing */; string platform = 14 /* linux/arm64 */;
    RegistryAuth push_auth = 15 /* Phase 12 */; }
  message Source { oneof kind { GitSource git = 1; TarballSource tarball = 2; ImageSource image = 3; } }
  message GitSource { string url = 1; string ref = 2; string commit_sha = 3; string token = 4; }
  message TarballSource { string url = 1; string sha256 = 2; }
  message ImageSource { string ref = 1; RegistryAuth auth = 2; }
  enum Builder { AUTO = 0; RAILPACK = 1; DOCKERFILE = 2; IMAGE = 3; }
  message BuildEvent { Meta meta = 1; string build_id = 2; Phase phase = 3; repeated LogLine lines = 4; uint32 progress_pct = 5;
    Detection detection = 6; enum Phase { FETCHING = 0; DETECTING = 1; BUILDING = 2; EXPORTING = 3; PUSHING = 4; DONE = 5; FAILED = 6; } }
  message Detection { string provider = 1 /* node, python, go, ... */; string framework = 2 /* nextjs, fastapi, ... */;
    repeated string start_command = 3; repeated string build_command = 4; string runtime_version = 5; }
  message BuildResult { string op_id = 1; string build_id = 2; bool success = 3; string image_ref = 4; string image_digest = 5;
    int64 duration_ms = 6; string error_code = 7; string error_message = 8; uint32 error_line_seq = 9; bool cache_hit = 10; }
  message BuildCancel { Meta meta = 1; string build_id = 2; }

  // logs.proto
  message LogLine { int64 ts_ms = 1; uint64 seq = 2; string stream = 3 /* stdout|stderr|build|deploy */; string line = 4;
    string level = 5; map<string,string> attrs = 6 /* parsed JSON fields, values stringified, max 32 */; string container_id = 7; }
  message LogSubscribe { Meta meta = 1; string subscription_id = 2; repeated string container_ids = 3; int64 since_ms = 4; string filter = 5; uint32 tail = 6 /* 200 */; }
  message LogUnsubscribe { Meta meta = 1; string subscription_id = 2; }
  message LogChunk { string subscription_id = 1; repeated LogLine lines = 2; bool truncated = 3; }
  message LogQuery { Meta meta = 1; repeated string container_ids = 2; int64 from_ms = 3; int64 to_ms = 4; string filter = 5; uint32 limit = 6 /* 5000 */; string cursor = 7; }
  message LogQueryResult { string op_id = 1; repeated LogLine lines = 2; string next_cursor = 3; bool complete = 4; }

  // metrics.proto (extend)
  message ContainerSample { string container_id = 1; int64 ts_ms = 2; double cpu_percent = 3; uint64 mem_used = 4; uint64 mem_limit = 5;
    uint64 net_rx = 6; uint64 net_tx = 7; uint64 blk_read = 8; uint64 blk_write = 9; uint32 pids = 10; }
  ```
- **Done when:** codegen passes `buf lint` and `buf breaking`, and Go + TS round-trip tests cover every message with all enum values.

### 4.2 Persisted desired state and the reconciliation loop
- **What:** Store the latest `DesiredState` on disk, compute a diff against real Docker/Caddy state, execute in dependency order, report `ActualState`.
- **Algorithm (`apps/agent/internal/reconcile/loop.go`):**
  ```
  triggers: DesiredState message · timer every 30 s · Docker event (die, oom, destroy, start) · after any executor step
  on trigger (single-flight; a trigger during a run schedules exactly one follow-up run):
    desired := load(/var/lib/lumen/agent/desired-state.json)   // written atomically on receipt, after signature check
    actual  := observe()  // docker: containers with label lumen.managed=true (inspect), networks lumen-*, /var/lib/lumen/volumes/*, caddy GET /config/
    plan    := diff(desired, actual) ordered: volumes → networks → containers → routes → tcp_proxies
      for each desired item d:   a := actual[d.id]
        a == nil                      → CREATE
        a.spec_hash != d.spec_hash    → REPLACE (containers: zero-downtime swap or stop-first when mounts exist; routes: PUT; networks: recreate only when empty)
        else                          → NOOP
      for each actual item a with no desired[a.id]: DELETE (containers: drain + remove; routes: delete; networks: remove when no containers;
        volume directories: never deleted by reconcile — only by an explicit VolumeDelete op in Phase 09)
    execute(plan): per item, errors are recorded in ActualState.errors[] with item_id + J6 code; a failed item skips its dependents
      (a route whose container failed) but not unrelated items
    report ActualState{version_applied = desired.version, converged = len(errors)==0 && no pending swaps}
  ```
  - `spec_hash` is computed by the control plane and carried in the spec; the agent also stores it as a Docker label `lumen.spec_hash` and a Caddy route `@id` suffix so `observe()` can compare without re-hashing.
  - **Convergence sketch:** the target is fixed for a given `version`; each pass performs only operations that reduce the set of differing items; every operation is idempotent (keyed by item id + hash) and the next pass re-observes real state rather than trusting the previous plan; no other writer touches `lumen.managed` containers or `lumen-` routes; therefore a sequence of passes terminates with an empty diff unless an item errors, in which case the error is reported and the pass is retried with backoff (5 s, 10 s, 30 s, 60 s cap) without blocking other items.
- **Files:** `apps/agent/internal/reconcile/{loop.go,observe.go,diff.go,plan.go,execute.go,report.go}`, `apps/agent/internal/state/desired.go`.
- **Done when:** table tests cover CREATE/REPLACE/NOOP/DELETE for every item kind; a fuzz test applies random desired-state sequences against a fake Docker and asserts convergence within 3 passes; killing the process between any two executor steps (fault injection via env `LUMEN_FAULT_AFTER_STEP=n`) leaves a state from which the next run converges.

### 4.3 Docker runtime and container hardening
- **What:** Create, start, stop, remove containers exactly per `ContainerSpec` with the B12 defaults.
- **Container creation (`apps/agent/internal/docker/containers.go`):**
  - Name `lumen-<service_id[:8]>-<deployment_id[:8]>-r<replica>`; labels `lumen.managed=true`, `lumen.id`, `lumen.spec_hash`, `lumen.service_id`, `lumen.service_instance_id`, `lumen.deployment_id`, `lumen.environment_id`, `lumen.project_id`, `lumen.replica`.
  - Image by digest (`image_ref@sha256:…`), pulled with `RegistryAuth` when present; pull failure with 401/403 → `IMAGE_PULL_AUTH`, 404 → `IMAGE_NOT_FOUND`.
  - `HostConfig`: `Memory = memory_bytes`, `MemorySwap = memory_bytes` (no swap), `NanoCPUs = cpus × 1e9`, `PidsLimit = 256` default (max 4096), `CapDrop = [ALL]`, `CapAdd = [CHOWN, DAC_OVERRIDE, FOWNER, FSETID, SETGID, SETUID, SETPCAP, KILL, NET_BIND_SERVICE]` (a subset of Docker's default set; `NET_RAW`, `MKNOD`, `AUDIT_WRITE`, `SYS_CHROOT`, `SETFCAP` are dropped) plus `Security.cap_add` from an allowlist, `SecurityOpt = ["no-new-privileges:true"]`, `ReadonlyRootfs` when requested with tmpfs at `/tmp` and `/run`, `RestartPolicy = no` (the agent supervises restarts itself so backoff and `CRASHED` accounting are ours), `LogConfig = json-file {max-size: 10m, max-file: 3}` as a bounded buffer only, `Binds` for volumes at `/var/lib/lumen/volumes/<volume_id>:<mount_path>`, `NetworkMode = lumen-<environment_id>` with aliases `<service>` and `<service>.<environment>`; never `Privileged`; the Docker socket is bind-mounted only when `Security.docker_socket = true`.
  - `Env` = resolved `env` map plus B13 platform variables that the agent owns: `LUMEN_REPLICA_ID`, `LUMEN_SERVER_NAME`, `LUMEN_VOLUME_MOUNT_PATH`; all others arrive already resolved from the control plane. Values are held in memory only and never written to disk or logs.
  - Capacity guard: refuse to create when `memory_bytes > host mem_available − 128 MB` reserve → `SERVER_CAPACITY` with the free amount in the message; refuse when `disk_low` → `DISK_FULL`.
- **Networks (`apps/agent/internal/docker/networks.go`):** one bridge network per project environment, `lumen-<environment_id>`, `enable_ipv6=false`, `com.docker.network.bridge.enable_icc=true`, labels `lumen.managed`, `lumen.project_id`, `lumen.environment_id`. Cross-environment isolation rules are Phase 12; single-server Docker networks already isolate bridges from each other by default.
- **Volumes (`apps/agent/internal/volumes/dirs.go`):** ensure `/var/lib/lumen/volumes/<volume_id>` exists (`0755`, owned by root; ownership fix-ups happen in Phase 09), report `used_bytes` via `du` every 5 min.
- **Files:** `apps/agent/internal/docker/{client.go,containers.go,images.go,networks.go,events.go,stats.go}`, `apps/agent/internal/volumes/dirs.go`.
- **Done when:** an integration test against real Docker asserts `docker inspect` shows the exact caps, limits, `no-new-privileges`, no socket, and no privileged flag; the capacity guard test refuses a 64 GB container with `SERVER_CAPACITY`.

### 4.4 Caddy route management
- **What:** Translate `RouteSpec` into Caddy JSON via the admin API on `127.0.0.1:2019`, with per-route ids so single routes can be replaced atomically.
- **Layout:** one HTTP server `srv0` on `:80` and `:443`; each `RouteSpec` becomes a route with `@id = "lumen-route-<id>"`, `match: [{host: hostnames}]`, `handle: [{handler: "reverse_proxy", upstreams: [{dial: "<ip>:<port>"}…], health_checks: {passive: {fail_duration: "10s", max_fails: 2}}, load_balancing: {selection_policy: {policy: "round_robin"}}}]`; the terminal catch-all route serves the Lumen 404 page; TLS automation policies and the ACME issuer are added in Phase 07 (this phase uses `tls_mode = internal` for tests and `off` for plain HTTP). Access log: `logging.logs.access` JSON to `/var/lib/lumen/caddy/access/access.log` with `roll_size 50MiB`, `roll_keep 5`, ready for Phase 07 parsing.
- **Operations:** `PUT /id/lumen-route-<id>` (create or replace whole route), `DELETE /id/lumen-route-<id>`, `PATCH /id/lumen-route-<id>/handle/0/upstreams` for upstream swaps; every call is retried 3× with 200 ms backoff and verified by `GET`.
- **Files:** `apps/agent/internal/caddy/{routes.go,config.go,admin.go}`, `apps/agent/assets/caddy-base.json`.
- **Done when:** integration test creates two routes, swaps upstreams under load (`hey -z 10s`), deletes one, and `GET /config/` matches the expected JSON exactly after each step.

### 4.5 Zero-downtime swap, healthcheck, drain, pre-deploy
- **What:** The REPLACE path for containers.
- **Sequence (stateless service, per replica; `apps/agent/internal/deploy/swap.go`):**
  1. `DeployEvent{PRE_DEPLOY}` if `pre_deploy_command` is set: run a one-off container with the identical spec, command replaced, `--rm`, no route, 10 min timeout; non-zero exit → `PRE_DEPLOY_FAILED`, old container untouched, stop here.
  2. `DeployEvent{DEPLOYING}`: create and start the new container (image already present from the build/pull step).
  3. `DeployEvent{HEALTHCHECKING}`: every `interval_ms` (1,000) up to `timeout_s` (120): TCP connect to `<container_ip>:<target_port>` (default) or `GET http://<container_ip>:<target_port><http_path>` expecting 200–399. Port detection (§4.9) runs in parallel from t+2 s; if the configured port is not listening but exactly one other port is, the healthcheck switches to it and records `detected_ports`. Timeout → `HEALTHCHECK_TIMEOUT` with the last observed state ("nothing listening on 8080; found 3000 listening" when applicable), new container removed, old stays.
  4. Route flip: add the new upstream, wait 1 s, remove the old upstream (Caddy's passive health check drops it from rotation immediately, in-flight requests complete).
  5. `DeployEvent{DRAINING_OLD}`: send `SIGTERM`; wait up to `drain_timeout_s` (30); `SIGKILL`; remove the container; `DeployEvent{REMOVED_OLD}`.
  6. `DeployEvent{ACTIVE}` with total duration.
  - **Services with volumes:** because two containers cannot share the bind mount safely, stop the old container first (`SIGTERM` → 30 s → `SIGKILL`), then run steps 2–3 and 6; the `DeployEvent` carries `message = "Services with a volume have a few seconds of downtime during deploys."`.
  - **Cancel:** a `DesiredState` with a newer version that no longer references the in-progress `deployment_id` cancels the swap at the next checkpoint (after 1, 2 or 3); the new container is removed and `DeployEvent{CANCELLED}` is emitted.
  - **Crash mid-swap:** every step writes a checkpoint into `state.json` (`swap: {container_id, step, new_docker_id, old_docker_id}`); on restart, the reconcile pass observes real Docker state: an extra healthy new container → resume at step 4; an unhealthy new container → remove it and retry; both gone → CREATE.
- **Files:** `apps/agent/internal/deploy/{swap.go,healthcheck.go,drain.go,predeploy.go,checkpoint.go}`.
- **Done when:** the zero-downtime test (`hey -z 30s -c 20` against the route while 3 consecutive deploys run) reports 0 non-2xx responses for a stateless service; the volume path shows a bounded gap under 5 s; `LUMEN_FAULT_AFTER_STEP` fault injection at each step converges on restart.

### 4.6 Restart supervision, crash loops, OOM
- **What:** Watch Docker `die` events for managed containers and apply the restart policy with backoff.
- **Backoff table:** delay = min(1 s × 2^(n−1), 300 s): 1, 2, 4, 8, 16, 32, 64, 128, 256, 300 s; `max_retries` default 10 (J3); the counter resets after 10 min of continuous running; `ALWAYS` restarts on any exit, `ON_FAILURE` only on non-zero exit, `NEVER` never. Exhausted retries → status `CRASHED`, `StateError{code: CRASH_LOOP}` with the last 20 log lines' seq range so the UI can jump to them. `inspect.State.OOMKilled = true` → `oom_killed = true` and `OOM_KILLED` with the limit in the message ("ran out of memory (512 MB)"). A `ContainerAction{RESTART}` resets the counter.
- **Files:** `apps/agent/internal/supervise/{supervisor.go,backoff.go}`.
- **Done when:** a container that exits immediately is restarted at the table's intervals (fake clock test) and ends `CRASHED` after 10 tries; a `--memory 32m` container running `stress` ends `oom_killed = true` within 1 s of the event.

### 4.7 Builds: BuildKit, Railpack, Dockerfile, image
- **What:** Turn a `BuildRequest` into an image in the local Docker store, with logs streamed as `BuildEvent`s.
- **Design:** `buildkitd` runs as a platform container (`moby/buildkit` pinned by digest, `--oci-worker-no-process-sandbox` off, unix socket at `/var/run/lumen-buildkit.sock`, GC policy `keepBytes = max(10 GB, 20 % of disk)`), started by the agent on first build. The agent uses the BuildKit Go client. Railpack (MIT) is imported as a Go library for `prepare` (plan + detection) and its frontend image drives the solve; Dockerfile builds use the `dockerfile.v0` frontend; prebuilt images skip the solve and pull by digest. Output uses the `docker` exporter streamed into `POST /images/load`, then the agent resolves the digest via `inspect`.
- **Builder priority (B8):** `lumen.toml [build].builder` if the control plane passes it → `Dockerfile` at `dockerfile_path` (default `Dockerfile` under `root_dir`) if present → Railpack auto-detect. `BuildRequest.builder = AUTO` triggers this order; explicit values skip it.
- **Source fetch:** git: shallow clone at `commit_sha` (`--depth 1`, token via `http.extraheader` never written to disk or the clone's config, submodules on), tarball: download + `sha256` check; workdir `/var/lib/lumen/builds/<build_id>/` deleted after the build; `root_dir` applied before detection.
- **Steps and events:** `FETCHING` → `DETECTING` (emit `Detection` so the UI can say "Looks like a Next.js app") → `BUILDING` (BuildKit status stream converted to `LogLine`s with vertex names as prefixes and `progress_pct` from completed/total vertices) → `EXPORTING` → `DONE` with `BuildResult{image_digest, duration_ms, cache_hit}` or `FAILED` with `error_code` from §4.8 and `error_line_seq` pointing at the first error line.
- **Guards:** refuse when `disk_low` (`DISK_FULL`); one build per service at a time on a server, up to 2 concurrent builds per server by default (configurable in `AgentConfig`); `timeout_s` default 1,800 → `BUILD_TIMEOUT`; `BuildCancel` cancels the solve context and removes the workdir; memory for `buildkitd` capped at 60 % of host RAM.
- **Cache:** BuildKit's content-addressed cache persists across builds; per-service scoping is implicit; Railpack's layer ordering keeps dependency installs cached when lockfiles are unchanged; `cache_hit` is reported when > 80 % of vertices were cached. Warm Node hello world < 30 s, cold < 90 s on 2 vCPU (B14).
- **Files:** `apps/agent/internal/build/{buildkit.go,railpack.go,dockerfile.go,image.go,source.go,progress.go,limits.go}`, `apps/agent/internal/build/testdata/` sample apps (node, python, go, ruby, php, java, rust, deno, bun, static).
- **Done when:** all ten sample apps build with `builder = AUTO` on amd64 and arm64; a Dockerfile app builds; a private GHCR image pulls with credentials and fails with `IMAGE_PULL_AUTH` without; cold/warm timings are recorded on a 2 vCPU VM.

### 4.8 Build log streaming, scrubbing and failure explanations
- **What:** Ship build logs in real time, scrub secrets, and map the 20 most common failures to plain-language codes.
- **Streaming:** `BuildEvent.lines` batched at 100 lines or 100 ms, whichever first; `seq` monotonic per build; the control plane persists to `deployment_logs` (Phase 04) and fans out (`log line → visible < 1 s`). Backpressure: if the send queue is full, build lines are coalesced (keep first and last of each 100 ms window with a `truncated` marker) rather than dropped silently.
- **Scrubbing (`apps/agent/internal/scrub/scrub.go`):** the agent keeps a set of `secret_values` (every resolved variable value ≥ 8 characters, always including sealed ones) and replaces exact and URL-encoded occurrences with `••••••` in build events and runtime lines before storage or transmission; values shorter than 8 characters are not scrubbed (documented) to avoid mangling logs; matching uses Aho–Corasick over the batch.
- **Failure explanations (`apps/agent/internal/build/explain.go`, patterns applied to the last 200 lines plus BuildKit error, first match wins, each maps to an error catalog entry with a fix):**
  | # | Pattern (summary) | Code |
  |---|---|---|
  | 1 | Railpack: no lockfile for npm/yarn/pnpm/bun | `BUILD_LOCKFILE_MISSING` |
  | 2 | `npm ci` "lockfile out of sync" / `ERR_PNPM_OUTDATED_LOCKFILE` | `BUILD_LOCKFILE_OUT_OF_SYNC` |
  | 3 | Unsupported Node version in `engines` / `.nvmrc` / `EBADENGINE` | `BUILD_NODE_VERSION` |
  | 4 | No start command detected / `Missing script: "start"` | `NO_START_COMMAND` |
  | 5 | Framework needs a build script but none exists (`next build` missing) | `BUILD_SCRIPT_MISSING` |
  | 6 | TypeScript errors (`error TS\d{4}`) | `BUILD_TYPE_ERRORS` |
  | 7 | Python app without `requirements.txt` / `pyproject.toml` / `Pipfile` | `BUILD_PY_NO_DEPS` |
  | 8 | Unsupported Python version (`runtime.txt`, `.python-version`) | `BUILD_PY_VERSION` |
  | 9 | Native extension compile failure (`gcc: error`, `error: Microsoft Visual C++`, `Failed building wheel`) | `BUILD_NATIVE_DEP_FAILED` |
  | 10 | Go `missing go.sum entry` / `go: updates to go.mod needed` | `BUILD_GO_MOD` |
  | 11 | Dockerfile parse error (`dockerfile parse error`) | `BUILD_DOCKERFILE_SYNTAX` |
  | 12 | Dockerfile `COPY`/`ADD` source not found | `BUILD_DOCKERFILE_COPY_MISSING` |
  | 13 | Base image pull denied (401/403) | `IMAGE_PULL_AUTH` |
  | 14 | Base image not found (404 / `manifest unknown`) | `IMAGE_NOT_FOUND` |
  | 15 | Build process killed (exit 137, `Killed`) | `BUILD_OOM` |
  | 16 | `no space left on device` | `DISK_FULL` |
  | 17 | Build exceeded timeout | `BUILD_TIMEOUT` |
  | 18 | Railpack could not detect any provider in `root_dir` | `BUILD_NO_APP_DETECTED` |
  | 19 | Private dependency auth failure (`npm ERR! 401/403`, `git@github.com: Permission denied`, `E401`) | `BUILD_PRIVATE_DEP_AUTH` |
  | 20 | Lifecycle script failed (`husky`, `prepare`, `postinstall` non-zero) | `BUILD_LIFECYCLE_SCRIPT_FAILED` |
  | — | Anything else | `BUILD_FAILED_GENERIC` (fix: highlight the first line matching `error|Error|ERR!|failed`) |
- **Files:** `apps/agent/internal/build/{stream.go,explain.go,explain_test.go}` with one fixture log per row, `apps/agent/internal/scrub/scrub.go`, `packages/shared/src/errors/catalog/builds.ts` (titles, explanations and fixes in the C9 voice for every code above).
- **Done when:** every row has a fixture log that maps to its code and to nothing else; a build that echoes a sealed value shows `••••••` in the stored log; a 5,000-line build streams with the first line visible under 1 s in the dev driver.

### 4.9 Runtime log capture, tail and query
- **What:** Tail every managed container's stdout/stderr into segment files with an index; serve live tails and time-range queries; parse JSON lines.
- **Storage:** `/var/lib/lumen/logs/<service_instance_id>/<container_docker_id[:12]>/seg-<n>.ndjson` (one `LogLine` JSON per line, gzip-compressed when rotated), segment rotation at 16 MB or 1 h, `index.json` per directory mapping minute-bucket → `{segment, byte_offset, first_seq}`; retention 7 days by age (configurable via `AgentConfig.log_retention_days`) and a per-service cap of 1 GB (oldest segments dropped first); `seq` is a per-container monotonic counter persisted every 1,000 lines and reconciled from the last segment on restart.
- **Capture:** Docker Engine `logs?follow=1&since=<last_ts>` per container with the 8-byte multiplex header parsed; lines longer than 64 KB are split with a `truncated` attribute; JSON lines are parsed into `level` (from `level`, `severity`, `lvl`), `msg` (from `msg`, `message`), and up to 32 other top-level scalar attributes; non-JSON lines get `level` inferred from leading tokens (`ERROR`, `WARN`, `INFO`, `DEBUG`) else empty. Every line passes through the scrubber before storage.
- **Tail:** `LogSubscribe{tail: 200}` replays the last 200 lines then streams; chunks batch at 100 lines or 100 ms; per-subscription queue of 5,000 lines, overflow sets `truncated = true` on the next chunk rather than blocking capture.
- **Query:** `LogQuery{from, to, filter, limit, cursor}` scans only the segments the index says overlap; the filter grammar is the subset Phase 08 finalises (`free text`, `level:error`, `attr:value`); results stream in `LogQueryResult` chunks ≤ 1 MB with a cursor `<segment>:<offset>`.
- **Files:** `apps/agent/internal/logs/{capture.go,segment.go,index.go,tail.go,query.go,parse.go,retention.go}`.
- **Done when:** a container printing 1,000 lines/s for 60 s loses no lines (seq contiguous), the live tail shows a new line within 1 s (measured with an embedded timestamp), a query for a 5-minute window over 7 days of segments opens at most the overlapping segments, and retention deletes day-8 segments on the hourly sweep.

### 4.10 Port detection
- **What:** After a container starts, find what it actually listens on.
- **Method:** read `/proc/<State.Pid>/net/tcp` and `tcp6` (the container's namespace view), select rows with state `0A` (LISTEN); addresses `0.0.0.0` / `::` / the container IP count as reachable; `127.0.0.1` / `::1` only → `APP_LISTENS_LOCALHOST` ("Your app only listens on localhost. Bind to 0.0.0.0 so Lumen can reach it."). Sampled at t+2 s, t+5 s, t+10 s, then every 30 s while `HEALTHCHECKING`. Reported as `ContainerState.detected_ports`; when `target_port` is not among them and exactly one candidate exists, the agent uses it for the healthcheck and route and emits `DeployEvent{message: "Detected your app on port 3000. Routing traffic there."}`; the control plane persists `detected_port` and `target_port` (Phase 04).
- **Files:** `apps/agent/internal/ports/detect.go`, fixtures for `/proc/net/tcp` layouts.
- **Done when:** a Node app listening on 3000 with `PORT=8080` unset in the image is routed correctly and the event is emitted; a `127.0.0.1`-only app yields `APP_LISTENS_LOCALHOST`.

### 4.11 Container metrics
- **What:** Sample Docker stats for every managed container every 10 s (`stats?stream=0` in parallel with a bounded worker pool), compute `cpu_percent` from the CPU deltas, `mem_used = usage − inactive_file`, network and block I/O counters, pids; keep 1 h in a ring buffer (360 samples per container) for the live charts; send `MetricsBatch.container_samples` every 10 s (rollups to Postgres are Phase 08).
- **Files:** `apps/agent/internal/metrics/{containers.go,ring.go}`.
- **Done when:** 50 containers sampled every 10 s add < 2 % CPU on 2 vCPU and the ring buffer holds exactly 1 h.

### 4.12 Garbage collection and disk protection
- **What:** Nightly at 03:30 server-local time and whenever `disk_low` flips true: remove images labelled `lumen.service_id` beyond the 5 most recent per service that no container uses, prune dangling images, run BuildKit GC to its `keepBytes` policy, delete build workdirs older than 1 h, and `docker container prune` for exited unmanaged leftovers created by Lumen (label match only). Never touch user data under `/var/lib/lumen/volumes`.
- **Files:** `apps/agent/internal/gc/{images.go,schedule.go}`.
- **Done when:** after 8 deploys of one service exactly 5 images remain plus the running one; GC never removes an image referenced by the current desired state.

### 4.13 Dev driver on the control plane
- **What:** Endpoints available only with `LUMEN_DEV_DRIVER=1`, behind the Phase 02 admin token, to exercise the agent before Phase 04: `PUT /dev/agent/:serverId/desired-state` (raw JSON validated against the proto), `POST /dev/agent/:serverId/build`, `POST /dev/agent/:serverId/logs/subscribe` (streams over `/v1/ws`), `GET /dev/agent/:serverId/actual-state`.
- **Files:** `apps/api/src/dev/agent-driver/*.ts`, `apps/api/src/gateway/handlers/{state,build,logs,deploy}.ts` (real handlers that Phase 04 keeps), `e2e/vm/deploy-engine.spec.ts`.
- **Done when:** the e2e spec deploys a sample repo and an image to a Multipass VM through the driver and asserts `ACTIVE`, HTTP 200 through Caddy, and live logs.

### 4.14 Chaos and real-VM verification
- **What:** Run the chaos suite on a real 2 vCPU VM: kill agent mid-build, mid-swap (each step), control plane down 10 min with a deploy queued, disk filled to < 2 GB during a build, Docker restarted under the agent.
- **Files:** `e2e/vm/chaos-deploy.spec.ts`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- **Done when:** every scenario ends with the app serving traffic and the agent converged; timings recorded.

## 5. Detail checklist

### Protocol design
- `DesiredState` is a complete document, never a delta; the agent replaces its persisted copy wholesale after verifying the envelope signature and `content_hash` (SHA-256 over the canonical protobuf bytes, computed by the control plane and re-checked by the agent).
- Versions are monotonic per server; a lower version than the persisted one is ignored with `OpError{code: STALE_STATE}`; equal version with a different hash is a control-plane bug and is rejected loudly.
- `ActualState` is sent after every reconcile pass and at least every 60 s; it is idempotent for the control plane (last write wins per `version_applied` and container `docker_id`).
- All imperative ops (`BuildRequest`, `ContainerAction`, `LogQuery`) are keyed by `op_id` and de-duplicated for 24 h; a duplicate `BuildRequest` for a running `build_id` re-attaches to the stream instead of building twice.
- Resolved env values ride only inside `ContainerSpec.env` over the signed channel; they are never echoed back in `ActualState`, `DeployEvent` or errors.
- Large payloads are chunked: `BuildEvent` and `LogChunk` ≤ 1 MB; `LogQueryResult` paginated by cursor; `DesiredState` for 100 services stays under the 4 MB envelope cap (measured).

### Security
- Every user container: unprivileged, `CapDrop ALL` + the fixed allowlist, `no-new-privileges`, pids limit, memory and CPU limits always set (a spec without limits is rejected with `OpError{code: SPEC_INVALID}`), no Docker socket unless `Security.docker_socket = true` (which the UI guards with a warning in Phase 05), optional read-only rootfs, own bridge network per environment.
- `buildkitd` runs as a platform container with its socket `0600` root-only; build contexts are cleaned after every build; git tokens are passed via `GIT_CONFIG_*` env to the clone subprocess, never argv or files.
- Registry credentials are used for the pull call and discarded; they are not stored in Docker's `config.json`.
- Secret scrubbing covers build and runtime streams before persistence and transmission; the scrub set is updated with every `DesiredState`.
- Caddy admin API stays on loopback; route ids are namespaced `lumen-route-` so a foreign route cannot be replaced by a crafted id.
- Build sources are fetched to a directory with `0700` under root; symlinks escaping the workdir are rejected by the tar extractor (path traversal check).

### Data integrity & idempotency
- Container identity is `ContainerSpec.id` + `spec_hash`, not the Docker id; reconciliation observes real state on every pass and never trusts an in-memory plan across a restart.
- Swap checkpoints persist per step; a crash at any step converges on restart (fault-injection tests for every step).
- Volume directories are never deleted by reconcile; a desired state that omits a volume leaves the directory in place and reports it as `orphaned` in `ActualState` for Phase 09 to handle.
- Log `seq` is contiguous per container across agent restarts; the index is rebuilt from segments when missing or corrupt (checksum per segment footer).
- Image GC keeps everything referenced by the current desired state regardless of age.

### Failure modes
- Control plane down: the persisted desired state keeps being enforced; restarts, healthchecks and log capture continue; the send queue drops metrics first, then coalesces logs; on reconnect the agent sends `ActualState` and the buffered `DeployEvent`s (bounded at 1,000) so the deployment history is completed.
- Docker daemon restart: the events stream reconnects with backoff; running containers are re-observed; nothing is recreated unless it actually died.
- Healthcheck timeout: old container stays live; new one removed; `HEALTHCHECK_TIMEOUT` explains which port was probed and what was listening.
- Pre-deploy failure: `PRE_DEPLOY_FAILED` with "Your previous version is still live." (J6 wording).
- Build server out of disk mid-build: BuildKit error mapped to `DISK_FULL`; GC runs immediately; the build is not retried automatically.
- Two deploys for one service in flight: the newer desired-state version supersedes; the older swap is cancelled at its next checkpoint and reported `CANCELLED`.

### Observability
- Every reconcile pass logs a one-line JSON summary (`version`, `created`, `replaced`, `deleted`, `errors`, `duration_ms`); every deploy step logs with `deployment_id` and `container_id`.
- `HostSample.self` (Phase 02) gains `reconcile_duration_ms`, `builds_running`, `log_lines_per_s`, `log_bytes_on_disk`.
- Build progress is a percentage the UI can show; deploy steps carry `duration_ms` for the timeline (C7.8).

### Performance
- Node hello world: < 90 s cold, < 30 s warm on 2 vCPU (B14); measured in `e2e/vm/deploy-engine.spec.ts` and recorded.
- Second build of an unchanged Node app > 2× faster than the first (D2).
- Status change → UI < 1 s: Docker `die` event → `ActualState` → control plane in < 500 ms on the agent side.
- Log line → live tail < 1 s end to end; capture handles 1,000 lines/s per container and 100 containers × 100 lines/s per server without loss (k6 scenario in Phase 18 reuses this).
- Reconcile pass with 100 containers < 500 ms when nothing changed (inspect calls are parallel, bounded at 16).
- Agent idle RSS stays < 50 MB with 20 idle containers captured; log capture buffers are bounded (64 KB per container).

### Copy
- Every user-facing string emitted by the agent follows C9: "Detected your app on port 3000. Routing traffic there.", "Your app ran out of memory (512 MB).", "Services with a volume have a few seconds of downtime during deploys.", "Your pre-deploy command failed. Your previous version is still live." No exit codes or Docker jargon in titles; raw details go in `details`.

### States
- `ContainerState.Status` and `Health` map 1:1 to the C4 status language in the UI: RUNNING+HEALTHY → Active; STARTING/CREATING → Deploying; CRASHED → Crashed; STOPPED → Stopped; EXITED with retries pending → Restarting.

## 6. Acceptance criteria
- [ ] **Deploy from GitHub (any branch via URL + token), Docker image (public/private).** Local directory is Phase 14. (D2)
- [ ] **Zero-config builds (Railpack), Dockerfile, custom build and start commands.** Sample apps in Node, Python, Go, Ruby, PHP, Java, Rust, Deno, Bun and static sites all deploy with zero config. (D2)
- [ ] **Pre-deploy command:** a failing pre-deploy aborts the deploy and keeps the old one live. (D2)
- [ ] **Healthchecks and zero-downtime swap:** a continuous curl during deploy sees 0 failed requests (stateless service). (D2)
- [ ] **Restart policies and crash-loop detection** per the backoff table; `CRASHED` after `max_retries`. (D2)
- [ ] **Redeploy, restart, cancel** work through the protocol (rollback and "deploy specific commit" are compiler concerns in Phase 04/06 but exercise the same swap). (D2)
- [ ] **Auto port detection** including the localhost-only error. (D2)
- [ ] **Build caching:** second build of an unchanged Node app is > 2× faster. (D2)
- [ ] **Human-readable build failure explanations** for the 20 listed failures, each with a fixture. (D2)
- [ ] **Secret scrubbing:** printing a sealed value in build output shows `••••••`. (D3)
- [ ] Every user container has the B12 hardening defaults, verified by `docker inspect` in a test.
- [ ] Killing the agent mid-build and mid-swap (every checkpoint) and restarting converges to `ACTIVE` with the app serving.
- [ ] Control plane down for 10 min: apps keep serving; the queued events flush on reconnect.
- [ ] Runtime logs: no loss at 1,000 lines/s; tail latency < 1 s; retention 7 days; JSON attributes parsed.
- [ ] Image GC keeps the last 5 per service; builds refused with `DISK_FULL` under 2 GB free.
- [ ] Node hello world: < 90 s cold, < 30 s warm on a 2 vCPU VM, timings recorded.

## 7. Test plan
- **Unit:** Go — diff/plan table tests, convergence fuzz against a fake Docker, backoff schedule with a fake clock, `/proc/net/tcp` parsing, JSON log parsing (levels, attrs, truncation), scrubber (exact and URL-encoded, < 8 chars untouched), failure-explanation fixtures (one per row, plus 10 negative logs), Caddy JSON generation snapshots, checkpoint resume logic.
- **Integration (real Docker on a privileged CI runner or VM):** container hardening inspect, network creation, route swap under `hey`, healthcheck TCP and HTTP, pre-deploy failure, OOM detection, crash-loop to `CRASHED`, builds of all sample apps, private image pull, log capture at 1,000 lines/s, GC counts.
- **E2E (Playwright, VM harness):** `e2e/vm/deploy-engine.spec.ts` through the dev driver: repo deploy, image deploy, 3 consecutive zero-downtime deploys with a load generator, cancel mid-build, live tail over `/v1/ws`.
- **Visual regression:** none.
- **Accessibility:** none.
- **Manual / on a real VM:** 2 vCPU Hetzner/DO amd64 and Oracle arm64: cold/warm timings, chaos suite, `docker inspect` audit, disk-fill test, control plane outage test.

## 8. Evidence required to close
- `hey` summary for the zero-downtime run (0 non-2xx) and the volume-service run (gap duration).
- Build timing table: 10 sample apps × cold/warm × amd64/arm64.
- Chaos transcripts with the fault step, restart time and convergence time for every checkpoint.
- `docker inspect` excerpt showing caps, limits, security opts for a user container.
- Stored build log excerpt showing `••••••` where a sealed value was printed.
- Log throughput test output (lines sent vs stored, tail latency histogram).
- GC before/after image lists.
- Go test, Vitest, e2e and `buf` outputs.

## 9. Review
Use SPEC H1 with Opus 5.5, then SPEC H4 (architecture fresh-eyes, required at the end of Phase 03). Probe: whether any executor step mutates Docker without an idempotency key; the resume logic for every swap checkpoint; whether env values can leak into `ActualState`, events, logs, or the build workdir; the Caddy upstream swap ordering under concurrent deploys of two services on the same hostname list; unbounded growth (segments, indexes, `agent_ops` table, ring buffers); what breaks at 50 servers × 40 containers; the correctness of `mem_used` and `cpu_percent` formulas against `docker stats`.

## 10. Risks & open questions
- **Risk:** the `docker` exporter from a standalone `buildkitd` is slow for large images → **Mitigation:** measure; fall back to the Docker daemon's built-in BuildKit via the Engine API build endpoint if export dominates the 90 s budget; record in DECISIONS.
- **Risk:** Railpack frontend image changes break detection → **Mitigation:** pin the frontend by digest per agent release; the compatibility suite builds the 10 samples on every release.
- **Risk:** Caddy passive health checks keep routing to a draining upstream for up to `fail_duration` → **Mitigation:** remove the upstream explicitly before `SIGTERM` (step 4 before 5) and verify with the load test.
- **Risk:** `/proc/<pid>/net/tcp` unavailable on hardened kernels → **Mitigation:** fall back to `nsenter --net` + `ss -ltn` bundled logic; report `detected_ports` empty rather than failing the deploy.
- **Open question:** Phase 03 precedes the compiler, so the "test API call" in the spec's AC is the dev driver in §4.13. Default: keep the driver behind an env flag and delete it after Phase 04 lands its compiler tests.
- **Open question:** framework detection for the Phase 05 "Looks like a Next.js app" preview needs the repo before a build; default: the agent's `DETECTING` event provides it at first deploy, and Phase 06 may add a lightweight control-plane detection using the GitHub tree API.
- **Open question:** agent-managed restarts (`RestartPolicy = no`) versus Docker's restart policy; default: agent-managed, because backoff, `CRASHED` accounting and notifications need the agent in the loop; the trade-off is that a stopped agent stops restarting crashed containers (running ones are unaffected), recorded in DECISIONS.
- **Open question:** scrubbing threshold of 8 characters; default stands, documented in user docs.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps, including the dev driver's planned removal)
- [ ] `docs/DECISIONS.md` entries added: standalone `buildkitd` + docker exporter, Railpack as library + frontend digest, agent-managed restarts, cap allowlist, backoff table, segment format and retention, scrub threshold, Caddy route id scheme, licenses (BuildKit Apache-2.0, Railpack MIT, Caddy Apache-2.0)
- [ ] `docs/UI_DECISIONS.md` unchanged (no UI)
- [ ] Cross-model review (H1) and architecture review (H4) done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 03 — Deploy engine on the agent</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-03-deploy-engine.md,
and these SPEC sections: B3, B4, B5, B7 (scrubbing), B8, B11, B12, B13, B14, D2, J3, J6.
</context>
<goal>A server builds a repo or pulls an image, starts it with limits, swaps traffic with zero failed requests, keeps it alive with backoff, streams build and runtime logs live, and converges even when the agent is killed mid-deploy.</goal>
<scope>
- Protocol: DesiredState/ActualState/DeployEvent/Build*/Log*/ContainerAction/container metrics
- Reconcile loop: persisted desired state, hash diff, volumes → networks → containers → routes → tcp proxies, timer + message + Docker-event triggers, ActualState reporting, fault-injection resume
- Docker runtime with B12 hardening (cap allowlist, no-new-privileges, pids/mem/cpu limits, no socket, optional read-only), per-environment networks, volume bind mounts
- Caddy routes via loopback admin API with @id, upstream swap, JSON access log
- Zero-downtime swap, healthcheck (TCP default / HTTP path, 120s), drain (SIGTERM → 30s → SIGKILL), pre-deploy, stop-first for volumes, cancel, checkpoints
- Restart supervision: backoff 1s×2^n capped 300s, max_retries 10 → CRASHED, OOM detection
- Builds: buildkitd container, Railpack library + frontend, Dockerfile, prebuilt image, private registries, cache, timeout 1800s, cancel, 20 failure explanations, scrubbing ••••••
- Runtime logs: segments + index, 7-day retention, tail < 1s, query, JSON parsing
- Port detection in container netns, container metrics every 10s with 1h ring, image GC keep-5 nightly, DISK_FULL refusal
- Dev driver (LUMEN_DEV_DRIVER=1) and chaos + real-VM tests
</scope>
<out_of_scope>
- Desired-state compiler and variable resolution (Phase 04); GitHub App (Phase 06); domains/HTTPS/TCP proxy UI/HTTP log parsing (Phase 07); metric rollups (Phase 08); volume UI/backups (Phase 09); mesh/replicas across servers (Phase 12); lumen up (Phase 14); sleep/cron (Phase 16)
</out_of_scope>
<acceptance_criteria>
See docs/phases/PHASE-03-deploy-engine.md §6: 10 sample apps deploy zero-config on amd64 + arm64; Dockerfile and private image deploys; failing pre-deploy keeps old live; 0 failed requests across 3 consecutive deploys under load; backoff table and CRASHED after 10; port detection incl. localhost-only error; warm build > 2× faster; 20 failure explanations with fixtures; sealed values scrubbed; hardening verified via docker inspect; kill mid-build/mid-swap at every checkpoint converges; control plane down 10 min keeps apps up; logs lossless at 1,000 lines/s with tail < 1s; GC keeps 5; DISK_FULL under 2 GB; Node hello world < 90s cold / < 30s warm on 2 vCPU.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, protocol changes, risks (buildkitd exporter speed, Caddy drain ordering, /proc access), test plan, open questions (agent-managed restarts, dev driver lifetime). STOP and wait for approval.
2. Implement in small steps; run Go unit + Docker integration tests after each step; fault-inject every swap checkpoint.
3. Verify on a real 2 vCPU VM (amd64) and Oracle arm64: timings, hey results, chaos suite, docker inspect audit.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md; request the H1 and H4 reviews.
</process>
```
