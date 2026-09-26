# Phase 12 — Multi-server and private networking

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Fable 5.1 → reviewed by Opus 5.5 (UI pieces built by Opus 5.5, reviewed by Fable 5.1) |
| **Depends on** | Phase 02 (installer opens 51820/udp, provider fix-card content, host metrics), Phase 03 (reconcile loop, container runtime, Caddy routes, builds), Phase 04 (compiler, placement JSON, desired-state push), Phase 05 (Settings tab and server detail pages to extend), Phase 07 (domains and TLS on the ingress server), Phase 09 (volume move wizard used by drain) |
| **Unblocks** | Phase 13 (multi-service templates across servers), Phase 16 (cloud provisioning joins servers into the mesh), Phase 17 (HA Postgres spans three servers over the mesh), Phase 18 (chaos and load suites) |
| **Spec sections** | SPEC B2 (registry), B3, B5 (`mesh_peers`, `dns_records`), B8 (multi-server builds), B9 (private network), B12 (compromised server in the threat model), B14, C7.12 (Scaling and placement), C7.18 (drain, remove, mesh status), D1 (drain), D4 (private networking), D6 (replicas, placement, load balancing), J5, J6 (`MESH_UNREACHABLE`, `SERVER_CAPACITY`) |
| **Estimated sessions** | 9 focused sessions (protocol + key exchange · WireGuard mesh + routing · mesh bridge + nftables isolation · embedded DNS · registry + cross-server builds · placement + replicas in the compiler · cross-server load balancing in Caddy · drain + remove + UI · chaos, isolation and H4 review) |

## 1. Goal
A user connects a second server on a different cloud, sets a web service to run two replicas on the first server and one on the second, and their API reaches `postgres.lumen.internal` on the other server privately, while a service in another project cannot reach it at all, and when one server is switched off the site keeps serving from the remaining replicas.

## 2. Why this phase exists
Multi-server is where a hobby deployer becomes a platform: replicas across clouds, a database on the box with the big disk, an app on the free-tier ARM machine, all talking privately. The design is dangerous to get wrong in three ways: security (a hole in isolation lets project A read project B's database), reliability (a mesh that flaps takes replicas down), and operations (a drain that loses a volume destroys data). The spec therefore assigns this phase to Fable 5.1 and requires the H4 fresh-eyes review at its end (SPEC 0.3, H4).

Everything here rides on the Phase 03 reconciliation model: mesh peers, DNS records, isolation sets and replica containers are all just more items in `DesiredState`, diffed by hash and converged by the agent. There is no new control path, only new item kinds, which is what keeps it restart-safe.

## 3. Scope
### In scope
- Protocol additions: `MeshConfig`, `MeshPeer`, `DnsRecord`, `PlatformServiceSpec` (registry), `AgentHello.wg_public_key`, `ActualState.mesh_peers[]`, `MeshCheck`/`MeshCheckResult`.
- WireGuard mesh managed by the agent through netlink (`wgctrl-go`): interface `lumen0`, key generation and exchange via the control plane, mesh IP allocation (`10.200.0.x`), full-mesh peers with keepalive, MTU handling, handshake monitoring.
- Per-server container subnet `10.210.<n>.0/24` on a routed bridge `lumen-mesh`, routes over the mesh, every managed container attached to it in addition to its environment network.
- nftables isolation: traffic on `lumen-mesh` and `lumen0` allowed only within the same project environment, hosts trusted for ingress and DNS, container access to host services blocked.
- Embedded DNS resolver in the agent for `<service>.<environment>.lumen.internal` and the environment-scoped short form `<service>.lumen.internal`, with upstream forwarding and caching.
- Registry (`registry:2`, pinned by digest) on the control-plane host bound to its mesh IP; build server pushes, replica servers pull by digest over the mesh; registry garbage collection.
- Placement and replicas in the compiler (`placement: [{server_id, replicas}]`), capacity validation, volume constraint (one replica, on the volume's server).
- Cross-server load balancing through the ingress server's Caddy: upstream lists with mesh-bridge IPs, active health checks, retry on dial failure; ingress server selection per domain; multi-ingress guidance (advanced).
- Drain (`POST /servers/:id/drain`, `undrain`), remove server blocked while services remain unless moved, the compiler excluding draining servers.
- `MESH_UNREACHABLE` detection and the UDP 51820 provider guide; "Mesh ready" checklist item from C7.18.
- UI (Opus 5.5): C7.12 **Scaling and placement** section (per-server replica steppers, capacity hints, load-balancing note, volume note), C7.18 server detail mesh status card, drain and remove flows, Mesh ready checklist item and fix card.
- Tests: isolation suite, cross-server DNS, replica failover chaos, drain, 50-server simulation of compiler and DNS set sizes; SPEC H4 review.
### Out of scope
- Cloud-provisioned servers → Phase 16 (they join through Phase 02's installer and appear here automatically).
- Volume move itself → Phase 09 (drain links to its wizard for stateful services).
- HA Postgres → Phase 17.
- Per-region latency-based routing, geo DNS, anycast → not in the spec.
- IPv6 inside the mesh → not in this phase (documented limitation; public IPv6 endpoints for WireGuard are supported).
- Overlay networks other than WireGuard, or Docker Swarm/Kubernetes networking → never.

## 4. Work breakdown

### 4.1 Protocol additions
- **What:** Extend the state and hello messages so the mesh is part of desired state.
- **Files:** `packages/protocol/proto/lumen/agent/v1/mesh.proto`, `state.proto` (extend), `hello.proto` (extend), `envelope.proto` (fields 100–109), regenerated code.
- **Messages:**
  ```proto
  // mesh.proto
  message MeshConfig { bool enabled = 1; string mesh_ip = 2 /* 10.200.0.7/16 */; string container_subnet = 3 /* 10.210.7.0/24 */;
    uint32 listen_port = 4 /* 51820 */; uint32 mtu = 5 /* 0 = auto */; string bridge_name = 6 /* lumen-mesh */; string dns_ip = 7 /* 10.210.7.1 */; }
  message MeshPeer { string server_id = 1; string name = 2; string public_key = 3; string endpoint = 4 /* host:51820 */;
    string mesh_ip = 5; repeated string allowed_ips = 6 /* mesh_ip/32, 10.210.n.0/24 */; uint32 keepalive_s = 7 /* 25 */; }
  message DnsRecord { string name = 1 /* api.production.lumen.internal */; string short_name = 2 /* api.lumen.internal */;
    string environment_id = 3; string project_id = 4; repeated string ips = 5 /* mesh-bridge IPs of every replica */; uint32 ttl_s = 6 /* 5 */; }
  message IsolationSet { string environment_id = 1; repeated string cidrs = 2 /* container IPs across all servers, /32 */; }
  message PlatformServiceSpec { string id = 1 /* registry */; string spec_hash = 2; string image_ref = 3; string image_digest = 4;
    repeated string bind_addrs = 5 /* 10.200.0.1:5000, 127.0.0.1:5000 */; map<string,string> env = 6; repeated Mount mounts = 7; }
  message MeshPeerState { string server_id = 1; int64 last_handshake_ms = 2; uint64 rx_bytes = 3; uint64 tx_bytes = 4;
    enum Status { UP = 0; STALE = 1; DOWN = 2; } Status status = 5; uint32 rtt_ms = 6; }
  message MeshCheck { Meta meta = 1; repeated string peer_server_ids = 2; }
  message MeshCheckResult { string op_id = 1; repeated MeshPeerState peers = 2; bool wg_module_ok = 3; bool port_open_locally = 4; }
  // state.proto additions
  //   DesiredState: MeshConfig mesh = 12; repeated IsolationSet isolation_sets = 13; repeated PlatformServiceSpec platform_services = 14;
  //   ActualState: repeated MeshPeerState mesh_peers = 7; string wg_public_key = 8;
  // hello.proto addition: AgentHello.wg_public_key = 16; bool wg_supported = 17;
  ```
- **Done when:** codegen passes `buf lint`/`buf breaking`; round-trip tests cover the new messages; the Phase 03 compatibility fixtures still decode (fields are additive).

### 4.2 Key exchange and mesh IP allocation
- **What:** Every server gets a WireGuard identity and an address the moment a second server exists.
- **Details:** On start the agent generates a Curve25519 keypair if `/var/lib/lumen/agent/wg.key` is missing (`0600`) and reports `wg_public_key` in `AgentHello`; the control plane stores it on `servers.wg_public_key`. `servers.mesh_ip` and `servers.container_subnet` are allocated at join time from `10.200.0.0/16` (first free host, starting at `10.200.0.1` for the control-plane host's agent) and `10.210.<n>.0/24` where `n` is the server's mesh index (1–254; `SERVER_LIMIT` error beyond that, documented). `instance_settings.mesh_enabled` flips to true automatically when the second server joins and never flips back automatically; the compiler emits `MeshConfig{enabled}` and the full peer list to every online or offline server. A per-server `mesh_endpoint_override` (advanced, C7.18 labels area) lets servers on the same private VPC peer over private addresses.
- **Files:** `apps/agent/internal/mesh/keys.go`, `apps/api/src/services/servers/mesh-alloc.ts`, migration `packages/db/migrations/0031_mesh.sql` (`servers.mesh_index`, `mesh_endpoint_override`, `mesh_status jsonb`), `apps/api/src/compiler/mesh.ts`.
- **Done when:** allocation is unique under concurrent joins (transaction with an advisory lock), released on server delete, and the compiler emits N−1 peers per server for N servers.

### 4.3 WireGuard interface and routes
- **What:** Reconcile `lumen0` from `MeshConfig` + `mesh_peers` as a desired-state item kind (order: mesh → volumes → networks → containers → routes).
- **Details (`apps/agent/internal/mesh/wireguard.go`, `wgctrl-go` MIT + `netlink` Apache-2.0):** create `lumen0` if missing (`ip link add lumen0 type wireguard`), set private key, `ListenPort = 51820`, address `mesh_ip/16`, MTU = `min(default route link MTU) − 80` unless `MeshConfig.mtu` is set (GCP's 1460 → 1380; Hetzner/Oracle 1500 → 1420); replers: `AllowedIPs = [mesh_ip/32, container_subnet]`, `Endpoint = public_ip:51820`, `PersistentKeepalive = 25 s`; peers not in desired state are removed; routes `ip route replace 10.210.<m>.0/24 dev lumen0` per peer and `10.200.0.0/16 dev lumen0`; `net.ipv4.ip_forward = 1` set persistently (`/etc/sysctl.d/90-lumen.conf`); if the kernel lacks the `wireguard` module (Tier 2 RHEL-family without it) report `wg_supported = false` and the checklist explains "Install the WireGuard kernel module" with the distro command. Handshake monitoring every 10 s: `last_handshake` older than 180 s with keepalive on → `STALE`, older than 600 s → `DOWN`; RTT from an ICMP echo to the peer mesh IP every 30 s; reported in `ActualState.mesh_peers`.
- **Files:** `apps/agent/internal/mesh/{wireguard.go,routes.go,monitor.go,sysctl.go}`, `apps/agent/internal/reconcile/diff.go` (mesh item kind).
- **Done when:** two Multipass VMs form the mesh within 15 s of the second joining, `wg show lumen0` matches desired peers exactly, removing a server removes its peer and route on the others within one reconcile pass.

### 4.4 Mesh bridge and container attachment
- **What:** Give every managed container a routed address on `10.210.<n>.0/24` without giving up per-environment Docker networks.
- **Details:** the agent creates a Docker bridge network `lumen-mesh` with `subnet = container_subnet`, `gateway = 10.210.<n>.1`, `com.docker.network.bridge.name = lumen-mesh`, `enable_ip_masquerade = false`, ICC disabled at the Docker level (isolation is enforced by nftables so Docker's own rules do not fight ours); every `ContainerSpec` (Phase 03 §4.3) is now connected to both `lumen-<environment_id>` (local traffic, aliases) and `lumen-mesh` (a static IP assigned by the compiler from the server's subnet so DNS records can be computed before the container starts; the agent honours `ContainerSpec.mesh_ip`); `--dns 10.210.<n>.1`, `--dns-search <environment>.lumen.internal`, `--dns-opt ndots:1`. A server therefore hosts at most 253 containers on the mesh (documented; `instance_settings.mesh.container_subnet_prefix` can be set to `/23` before the first server joins, recorded as a spec deviation option).
- **Files:** `apps/agent/internal/docker/networks.go` (mesh bridge), `apps/agent/internal/docker/containers.go` (second endpoint, static IP, DNS options), `apps/api/src/compiler/mesh-ips.ts` (stable allocation per `ContainerSpec.id`, persisted on `service_instances.runtime_state.mesh_ips`).
- **Done when:** a container on server A can `curl 10.210.2.5:3000` on server B (same environment) with the isolation rules from §4.5 loaded; addresses are stable across redeploys of the same replica id.

### 4.5 nftables isolation
- **What:** Enforce "traffic only within the same project environment" (B9) on both the mesh interface and the mesh bridge, and keep containers away from host services.
- **Rule set (`/etc/nftables.d/lumen.nft`, generated by the agent from `isolation_sets[]`, applied atomically with `nft -f`; table `inet lumen`, other tables untouched):**
  ```
  table inet lumen {
    set env_<environment_id> { type ipv4_addr; flags interval; elements = { 10.210.1.5/32, 10.210.2.7/32 } }   # one per environment
    chain forward { type filter hook forward priority -10; policy accept;
      iifname { "lumen0", "lumen-mesh" } jump mesh_iso
      oifname { "lumen0", "lumen-mesh" } jump mesh_iso }
    chain mesh_iso {
      ct state established,related accept
      ip saddr 10.200.0.0/16 ip daddr 10.210.0.0/16 accept                     # hosts (ingress Caddy, agent) → containers
      ip saddr @env_A ip daddr @env_A accept                                    # generated per environment
      ip saddr @env_B ip daddr @env_B accept
      ip saddr 10.210.0.0/16 ip daddr 10.210.0.0/16 counter drop               # cross-environment on the mesh
      ip saddr 10.210.0.0/16 ip daddr 10.200.0.0/16 udp dport 53 accept        # DNS to any host resolver (fallback)
      ip saddr 10.210.0.0/16 ip daddr 10.200.0.0/16 counter drop               # containers → hosts otherwise
      ip saddr 10.210.0.0/16 ip daddr != 10.0.0.0/8 accept }                   # containers → internet (via the env bridge NAT)
    chain input { type filter hook input priority -10; policy accept;
      iifname "lumen-mesh" udp dport 53 accept
      iifname "lumen-mesh" tcp dport 53 accept
      iifname "lumen-mesh" ip daddr 10.210.0.0/16 icmp type echo-request accept
      iifname "lumen-mesh" counter drop                                         # no host services from containers (2019, 5000, 22)
      iifname "lumen0" ip saddr 10.200.0.0/16 tcp dport 5000 accept             # registry pulls host → host
      iifname "lumen0" ip saddr 10.200.0.0/16 icmp type echo-request accept
      iifname "lumen0" counter drop }
  }
  ```
  Sets are updated in place (`nft add/delete element`) when containers start and stop, and rebuilt from scratch on every full reconcile; the environment sets include container IPs from **all** servers (the compiler emits the complete set to every server). Docker's own `DOCKER-USER` chain is left alone; Phase 02's installer-managed rules for 80/443/51820 live in the distro firewall, not in this table.
- **Files:** `apps/agent/internal/mesh/nftables.go` (template + `nft -f` apply + verification via `nft list table inet lumen`), `apps/agent/internal/mesh/nftables_test.go` (golden rule sets), `deploy/agent-install.sh` (ensure `nftables` package present, Phase 02 addendum).
- **Done when:** the isolation suite (§4.11) passes; `nft list ruleset` after a reconcile equals the golden output for the fixture; applying an invalid rule set fails closed (previous table kept, `StateError{code: MESH_RULES_FAILED}`).

### 4.6 Embedded DNS
- **What:** Resolve service names privately, scoped per environment, across servers.
- **Details (`miekg/dns`, BSD-3):** the agent listens on `10.210.<n>.1:53` UDP and TCP (bound to the bridge address only); records come from `DesiredState.dns_records[]`; a query for `<service>.<environment>.lumen.internal` returns all `ips` as A records in rotated order (TTL 5 s); the short form `<service>.lumen.internal` is answered only for the environment that owns the **source IP** of the query (looked up in the isolation sets; queries from unknown IPs get `REFUSED`); names in other projects or environments return `NXDOMAIN` (isolation at the name layer too); `*.lumen.internal` that is unknown → `NXDOMAIN`; everything else is forwarded to the host's upstream (`/run/systemd/resolve/resolv.conf` when present, else `/etc/resolv.conf`) with a 1,000-entry LRU cache honouring TTL and a 2 s upstream timeout; AAAA for `lumen.internal` names returns an empty `NOERROR` so clients fall through to A quickly; rate limit 500 qps per source IP.
- **Files:** `apps/agent/internal/dns/{server.go,records.go,forward.go,cache.go}`, `apps/api/src/compiler/dns.ts` (records per environment for every server, including replicas on other servers).
- **Done when:** `dig @10.210.1.1 api.production.lumen.internal` from a container returns the replica IPs on both servers; the short form works inside the environment and `NXDOMAIN`s from another project; upstream names resolve; the resolver survives a `DesiredState` swap without dropping in-flight queries.

### 4.7 Registry and cross-server builds
- **What:** Build once, run anywhere in the mesh.
- **Details:** the compiler emits `PlatformServiceSpec{id: registry}` to the control-plane host's agent when `mesh_enabled`: `registry:2` pinned by digest, bind `10.200.0.1:5000` and `127.0.0.1:5000`, storage `/var/lib/lumen/registry`, `REGISTRY_STORAGE_DELETE_ENABLED=true`, basic auth (`htpasswd` file generated from per-server credentials that the control plane issues and stores hashed; each server gets `RegistryAuth{username: server_id, password}` inside its desired state). Transport is plain HTTP inside WireGuard (already encrypted and authenticated); the agent merges `"insecure-registries": ["10.200.0.1:5000"]` into `/etc/docker/daemon.json` (preserving other keys) and reloads Docker with `SIGHUP` (no container restarts). Builds: when a service is placed on any server other than the build server, `BuildRequest.push_auth` is set and the agent pushes `10.200.0.1:5000/lumen/<service_id>:<deployment_id>` after export; `BuildResult.image_digest` is the registry digest; the compiler emits `image_ref = 10.200.0.1:5000/lumen/<service_id>@sha256:…` for remote servers and the local digest for the build server. Registry GC: nightly, keep the last 5 tags per service (matching Phase 03 image GC) then `registry garbage-collect --delete-untagged`. Single-server installs never start the registry.
- **Files:** `apps/api/src/compiler/platform-services.ts`, `apps/api/src/services/servers/registry-credentials.ts`, `apps/agent/internal/build/push.go`, `apps/agent/internal/docker/daemon-config.go`, `apps/agent/internal/gc/registry.go`, `apps/agent/internal/reconcile/platform.go`.
- **Done when:** a build on server A deploys replicas on server B by digest with no rebuild; a wrong credential fails with `IMAGE_PULL_AUTH`; registry GC leaves exactly 5 tags per service; `daemon.json` merge preserves unrelated keys in a table test.

### 4.8 Placement and replicas
- **What:** Turn `placement: [{server_id, replicas}]` into containers, with validation.
- **Details:** `PATCH /services/:id` (placement) validates: every server online or offline (not draining, `SERVER_DRAINING`), replicas 0–20 per server, total memory `replicas × memory_limit_mb` ≤ server free memory − 128 MB reserve (`SERVER_CAPACITY` with the free amount), services with a volume: exactly one replica on the volume's server (`VOLUME_SINGLE_REPLICA`); the compiler emits `ContainerSpec.id = <instance>-<server_index>-r<n>`, `LUMEN_REPLICA_ID = <server_name>-<n>`; scaling down removes the highest replica numbers first; changing placement is a staged change that triggers a `config_change` deploy touching only the affected servers (unchanged servers see the same hash and do nothing).
- **Files:** `apps/api/src/services/services/placement.ts`, `apps/api/src/compiler/placement.ts`, `packages/shared/src/schemas/placement.ts`, `apps/api/src/compiler/fixtures/placement-*.json`.
- **Done when:** golden tests cover 2 servers × (2,1), scale to (0,3), volume constraint, capacity refusal, draining refusal; an integration test scales a live service from 1 to 3 replicas across two VMs with zero failed requests.

### 4.9 Cross-server load balancing and ingress
- **What:** Public traffic enters one server and is balanced across every replica.
- **Details:** each `domains` row gets `ingress_server_id` (default: the first server in placement; changeable in the Networking settings, advanced); the compiler emits the `RouteSpec` for a hostname only to the ingress server, with `upstreams = every replica's mesh-bridge IP:port` (local replicas use their env-bridge IP to avoid a hairpin); Caddy handler options: `lb_policy round_robin`, `lb_try_duration 5s`, `lb_try_interval 250ms` (retry another upstream on dial failure so a dead server costs no user-visible errors), passive health `fail_duration 10s max_fails 2`, and for remote upstreams an active check every 2 s on the healthcheck path when set (TCP-only otherwise, via `health_port`). TLS certificates live on the ingress server (Phase 07 issues them there). Multi-ingress (advanced): a domain may list several ingress servers; the UI then shows the DNS guidance "Add one A record per ingress server (round-robin DNS). Each server will get its own certificate." and Phase 07's DNS-01 becomes required for wildcard.
- **Files:** `apps/api/src/compiler/routes.ts` (extend), `apps/agent/internal/caddy/routes.go` (retry and active-health options), migration `0032_domains_ingress.sql`, `apps/web/src/features/service/settings/networking/IngressServerSelect.tsx`.
- **Done when:** with replicas on A and B and ingress on A, `hey -z 60s -c 20` sees requests on both (counted by `LUMEN_REPLICA_ID` in responses) and 0 non-2xx when B is powered off mid-run.

### 4.10 Drain and remove
- **What:** Empty a server safely, then let it go.
- **Details:** `POST /servers/:id/drain` sets `status = draining`, emits `server.status`, and starts the `server.drain` job: for every instance with replicas on it — stateless (no volume): pick target servers (other placement servers first, then online servers with capacity, `SERVER_CAPACITY` otherwise) and stage-and-apply a placement that adds replicas there, wait until they are `ACTIVE`, then remove the replicas on the draining server (zero-downtime by construction); stateful (volume on this server): leave in place and record `needs_volume_move` with a link to the Phase 09 move wizard; the job reports progress on `servers.drain_progress jsonb` (`{total, moved, pending: [{service, reason}]}`) and finishes when nothing runs there. `POST /servers/:id/undrain` returns to `online` and stops the job. `DELETE /servers/:id` → `409 SERVER_HAS_SERVICES` while any container is placed there; `?move=true` runs drain first and deletes when it completes; deletion revokes the credential (Phase 02), removes the peer from every other server's desired state, releases mesh addresses, and removes its containers from DNS and isolation sets.
- **Files:** `apps/api/src/services/servers/{drain.ts,remove.ts}`, `apps/api/src/workers/server-drain.ts`, `apps/api/src/routes/servers/{drain,undrain}.ts`, `apps/web/src/features/servers/detail/{DrainDialog.tsx,RemoveServerDialog.tsx,DrainProgress.tsx}`.
- **Done when:** draining a server with two stateless services and one database moves the stateless ones with zero failed requests and lists the database as pending with the move link; remove is blocked until the volume is moved; removing a drained server cleans peers, routes, DNS and sets on the others within one reconcile pass.

### 4.11 Mesh readiness, `MESH_UNREACHABLE`, UI
- **What:** Tell the user when servers cannot talk, and how to fix it.
- **Details:** the "Mesh ready" checklist item (C7.18) is `n/a` with one server, `pending` while any peer has never handshaked, `ok` when every peer is `UP`, `failed` when any is `DOWN` for 3 min; failure raises `MESH_UNREACHABLE` with the Phase 02 fix card `MESH_UNREACHABLE.<provider>.cloud|os` (open UDP 51820 between servers; Oracle security list + iptables, AWS security group, GCP firewall rule, Azure NSG, Hetzner cloud firewall, DO cloud firewall, generic) naming both servers involved; `POST /servers/:id/mesh-check` runs an on-demand `MeshCheck` and returns per-peer handshake age and RTT. UI (Opus 5.5, C7.12 and C7.18): the **Scaling and placement** settings section with a row per server (name, provider logo, free memory, a replica stepper 0–20 with `−`/`+` and a numeric input, the projected memory "3 × 512 MB = 1.5 GB of 7.2 GB free"), the note "Traffic is balanced across all replicas by the ingress server (oracle-1)", the note "Volumes limit this service to 1 replica" when applicable with the stepper disabled on other servers; the server detail **Mesh** card (mesh IP, container subnet, per-peer status with C4 status language, RTT, "Run mesh check"); the **Drain** button with a dialog listing what will move and what needs a volume move; the **Remove server** typed confirmation with the block explanation.
- **Files:** `apps/api/src/services/servers/mesh-status.ts`, `apps/api/src/workers/mesh-monitor.ts`, `packages/shared/src/errors/catalog/mesh.ts`, `apps/web/src/features/service/settings/scaling/{ScalingSection.tsx,ReplicaStepper.tsx,PlacementRow.tsx}`, `apps/web/src/features/servers/detail/{MeshCard.tsx,MeshPeerRow.tsx}`, `apps/web/src/features/servers/wizard/ChecklistItem.tsx` (mesh item), e2e `e2e/ui/scaling.spec.ts`, `e2e/ui/server-mesh.spec.ts`.
- **Done when:** blocking UDP 51820 on one VM shows `failed` with the correct provider card within 3 min and recovers within 30 s of unblocking; the scaling section passes the C14 checklist at 390/1024/1440 in both themes.

### 4.12 Isolation and chaos suites, H4 review
- **What:** Prove the security and availability claims.
- **Isolation suite (`e2e/vm/mesh-isolation.spec.ts`, two VMs, projects A and B, environments production and staging in A):** same environment across servers: HTTP 200 by name and by IP; A.production → A.staging: `NXDOMAIN` by name, timeout by IP; A → B: `NXDOMAIN` and timeout; container → host mesh IP `:2019`, `:5000`, `:22`: refused/dropped; container → internet: 200; container → other server's host IP `:80`: allowed (public path, expected); DNS short form scoped; a container with a spoofed source IP (`ip addr add` needs `NET_ADMIN`, which is dropped) cannot be created.
- **Chaos suite (`e2e/vm/mesh-chaos.spec.ts`):** power off server B during `hey` (0 non-2xx after retries, checklist `failed` within 3 min, replicas on A continue); power it back on (peer `UP`, replicas rejoin the upstream list within 15 s); restart the agent on A during a placement change (converges); control plane down 10 min (mesh and DNS keep working from persisted state); rotate a server's WireGuard key (`POST /servers/:id/rotate-mesh-key`, peers updated everywhere in one pass).
- **Scale simulation:** compiler and DNS record generation for 50 servers × 40 containers (2,000 services) under 1 s; nftables set with 2,000 elements applies under 500 ms; `DesiredState` for that server under the 4 MB cap.
- **Files:** the two specs above, `apps/api/src/compiler/compile.bench.ts`, `docs/user/servers/private-networking.md`, `docs/user/servers/replicas-and-placement.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- **Done when:** both suites pass on Multipass and on two real VMs on different clouds (Oracle arm64 + Hetzner/DO amd64); the H4 review is done and its findings fixed.

## 5. Detail checklist

### Protocol design
- Mesh peers, DNS records, isolation sets and platform services are desired-state items with `spec_hash` semantics like every other kind; nothing in this phase is imperative except `MeshCheck` and key rotation.
- The complete peer list and complete isolation sets go to every server; the document stays under 4 MB at 50 servers × 40 containers (measured); if it ever exceeds, sets move to a separate chunked message (documented escape hatch, not built now).
- `ActualState.mesh_peers` is reported every pass and on every status change; the control plane derives the checklist and `MESH_UNREACHABLE` from it with hysteresis (3 min down, 30 s up).
- Key rotation is an op with `op_id`, and the old key stays valid on peers for 60 s after the new one is distributed so no peer pair loses connectivity during the swap.

### Security
- Threat model B12 includes a compromised server in the mesh: WireGuard `AllowedIPs` pin each peer to its own mesh IP and container subnet, so a compromised server cannot spoof another server's addresses on the wire; isolation sets are still enforced on the receiving side, so a compromised server can at most reach environments it already hosts.
- Containers cannot reach any host service over the mesh or the bridge except the agent DNS on `10.210.<n>.1:53` and ICMP echo; the Caddy admin API (2019) and the registry (5000) are unreachable from containers (tested).
- Registry credentials are per server, hashed at rest, revoked with the server; the registry binds only to the mesh IP and loopback; plain HTTP is acceptable only because it never leaves the WireGuard tunnel (recorded in DECISIONS with the TLS-with-internal-CA alternative).
- `NET_ADMIN`, `NET_RAW` remain dropped (Phase 03), so containers cannot add addresses, sniff, or forge packets; `no-new-privileges` stands.
- DNS refuses queries from unknown source IPs and never answers other projects' names; the resolver does not recurse for external names itself (forwarding only) and rate-limits per source.
- The nftables table is Lumen's own (`inet lumen`); the agent never flushes the ruleset and fails closed on apply errors; `nft` availability is checked by the installer.
- The control-plane host's agent is the only one that runs the registry; a `PlatformServiceSpec` sent to any other server is rejected (`OpError{SPEC_INVALID}`).

### Data integrity & idempotency
- Mesh addresses are allocated once per server under an advisory lock and only released on deletion; container mesh IPs are stable per `ContainerSpec.id` so DNS records are correct before the container starts.
- Drain is a resumable job keyed by server id: every step is "ensure replicas exist on targets → verify ACTIVE → remove from source" and can be re-run from any point; a worker crash never leaves fewer replicas than before the step.
- Server deletion is one transaction on the control plane plus one desired-state version for every other server; a crash between the two is healed by the next compile (the deleted server is simply absent).
- `daemon.json` edits are a parse-merge-write with a backup at `daemon.json.lumen-bak` and are skipped when already present.

### Failure modes
- Peer down: Caddy retries other upstreams (`lb_try_duration 5s`) so users see no errors for dial failures; the checklist and `MESH_UNREACHABLE` follow with hysteresis; DNS keeps returning the dead replica's IP (TTL 5 s) until the compiler removes it after the server is marked offline (30 s), which is acceptable because clients retry on connection failure and Caddy handles public traffic.
- Control plane down: mesh, DNS, isolation and routes are all persisted desired state and keep working; new placements wait.
- Public IP change of a server (reboot on a provider without static IPs): the agent reports the new `public_ip` in `AgentHello`; the compiler re-emits peers with the new endpoint; peers with keepalive re-handshake within 25 s; the docs recommend reserving static IPs.
- MTU mismatch (silent large-packet loss): the agent probes path MTU to each peer with DF pings at 1420/1380/1280 on mesh check and reports `mtu_ok`; the fix card explains setting `MeshConfig.mtu`.
- Kernel without WireGuard: reported at join; the checklist shows the install command; the server can still run single-server workloads.

### Observability
- `ActualState.mesh_peers` carries handshake age, rx/tx and RTT; the server detail Mesh card charts RTT; `MeshCheck` is exposed as "Run mesh check".
- nftables counters on the drop rules are read every 60 s and reported as `isolation_drops` in `HostSample.self`, so a misconfigured app repeatedly hitting another environment is visible.
- DNS query rate, NXDOMAIN rate and upstream latency are sampled into `HostSample.self`.

### Performance
- Mesh formation for a new server < 15 s after join; peer removal < 1 reconcile pass.
- Cross-server request overhead < 2 ms on the same region (WireGuard in kernel); measured and documented.
- DNS answers < 1 ms for local names; upstream cached.
- Compiler at 50 servers × 40 containers < 1 s; nftables apply with 2,000 elements < 500 ms; `DesiredState` < 4 MB.
- Agent idle RSS stays < 50 MB with the DNS server and mesh monitor running (B14).

### Typography, spacing, motion, iconography, copy (UI pieces)
- Replica stepper: `Kbd`-sized buttons (28 px), numeric input 48 px wide with tabular numerals, `−`/`+` as Lucide `minus`/`plus` at 14 px; projected memory in `text-secondary` 13 px under the row; server rows 44 px tall on the 4 px grid; provider logo 16 px.
- Mesh peer status uses the C4 status language: ● Up (success), ◐ Connecting (warning, pulsing), ✕ Down (danger); RTT in Geist Mono 12 px tabular.
- Motion: stepper value changes animate the projected-memory number with a 120 ms ease-out; drain progress bar uses the 200 ms panel easing; respect `prefers-reduced-motion`.
- Copy (C9): "Traffic is balanced across all replicas by oracle-1.", "Volumes limit this service to 1 replica.", "This server doesn't have enough memory for that. 3 × 512 MB needs 1.5 GB; 900 MB is free.", "Your servers can't reach each other privately. Open UDP 51820 between oracle-1 and hetzner-1.", "Draining moves your stateless services to other servers. Databases stay until you move their volumes."
- Buttons are verbs: "Drain server", "Remove server", "Run mesh check", "Apply placement".

### States
- Scaling section: loading skeleton matching the row layout; empty (one server) shows "Add another server to run replicas elsewhere" with a link; error state for `SERVER_CAPACITY` inline under the row; partial state when a server is offline (row muted, stepper disabled, tooltip "oracle-1 is offline").
- Mesh card: n/a (single server) · pending · ok · failed with the fix card inline.

### Keyboard & accessibility
- Steppers operate with arrow keys and type-in; the projected memory is an `aria-live="polite"` region; drain progress is announced at each moved service; the Remove dialog's typed confirmation is labelled.

## 6. Acceptance criteria
- [ ] **Private networking** on one server and across servers/clouds, with internal DNS and project isolation: a service in project A cannot reach project B; `api.lumen.internal` resolves across servers. (D4)
- [ ] **Replicas per server, cross-server load balancing via the ingress server's Caddy.** (D6)
- [ ] **Placement across servers**; multi-ingress with DNS guidance (advanced). (D6)
- [ ] **Server labels, drain, and remove:** drain moves stateless services to other servers. (D1)
- [ ] The isolation suite passes on Multipass and on two real VMs on different clouds.
- [ ] Killing one server keeps replicas on others serving traffic with 0 non-2xx during a continuous `hey` run.
- [ ] A build on one server runs on another by digest through the registry; the registry is unreachable from containers.
- [ ] `MESH_UNREACHABLE` is raised with the correct provider card within 3 min of UDP 51820 being blocked and clears within 30 s of unblocking.
- [ ] Mesh, DNS, isolation and routes survive a 10-minute control-plane outage.
- [ ] Compiler, DNS and nftables scale figures for 50 servers × 40 containers meet §5 Performance.
- [ ] Scaling and placement UI and the server Mesh card pass C14 at 390/1024/1440 × dark/light.
- [ ] SPEC H4 review completed with findings fixed.

## 7. Test plan
- **Unit:** mesh address allocation (concurrency), MTU computation, nftables golden rule sets, DNS scoping logic (short form by source IP, NXDOMAIN cases, rotation), placement validation table, compiler goldens for placement/ingress/DNS/isolation sets, `daemon.json` merge, drain planner (targets by capacity).
- **Integration:** agent against real WireGuard in two network namespaces on one CI VM (peer add/remove, handshake monitor), nftables apply/fail-closed, DNS server with a fake upstream, registry push/pull with credentials, Caddy retry behaviour with a dead upstream.
- **E2E (VM harness):** `mesh-isolation.spec.ts`, `mesh-chaos.spec.ts`, `e2e/ui/scaling.spec.ts`, `e2e/ui/server-mesh.spec.ts`; drain with two stateless services and one database.
- **Visual regression:** Scaling section and Mesh card in all states, 3 widths × 2 themes.
- **Accessibility (axe + keyboard pass):** Scaling section, Mesh card, Drain and Remove dialogs.
- **Manual / on real VMs:** Oracle arm64 + Hetzner or DO amd64 in different regions: formation time, RTT, cross-server overhead, power-off failover, provider firewall block/unblock, MTU probe on GCP if available.

## 8. Evidence required to close
- `wg show lumen0` from both real VMs and the matching desired peers.
- Isolation suite output with every case listed (name and IP, same/other environment, host services).
- `hey` summary during the power-off failover and the replica distribution counts.
- Registry push/pull logs and the `docker image inspect` digest match on the replica server.
- Timeline of the UDP 51820 block: block time, `failed` time, fix card shown, unblock time, `ok` time.
- Scale benchmark output (compiler, nftables apply, document size).
- Screenshots: Scaling section (empty, loading, populated, capacity error, volume constraint, offline server), Mesh card (n/a, pending, ok, failed with card), Drain and Remove dialogs, at 390/1024/1440 × dark/light.
- Go, Vitest, e2e outputs; H4 review notes and the fixes.

## 9. Review
SPEC H1 with Opus 5.5 on the agent and compiler code; Fable 5.1 reviews the UI pieces with SPEC H2. Then SPEC H4 (mandatory at the end of Phase 12). Probe: any path where a container packet can reach another environment (bridge ICC, Docker's own iptables rules, IPv6 leaks, the env bridge NAT path); `AllowedIPs` correctness per peer; whether the DNS short form can be tricked by a forged source (it cannot without `NET_ADMIN`; verify caps); registry exposure; key rotation overlap; drain safety for volumes; unbounded growth of isolation sets and `runtime_state.mesh_ips`; the 253-container ceiling and the `/23` option; what happens at 50 servers (full mesh 1,225 tunnels) and whether a hub topology is needed later.

## 10. Risks & open questions
- **Risk:** B9's `10.210.<n>.0/24` per server caps mesh-attached containers at 253 per server → **Mitigation:** documented; `container_subnet_prefix` instance setting (`/23` or `/22`) selectable before the first server joins; recorded as a spec deviation option.
- **Risk:** Docker's iptables management interferes with `inet lumen` rules after a Docker restart → **Mitigation:** our table has its own hooks at priority −10 and is re-applied on every reconcile and on Docker events; the integration test restarts Docker and re-verifies.
- **Risk:** providers with restricted UDP or CGNAT public IPs cannot form the mesh → **Mitigation:** `mesh_endpoint_override` and the fix card; documented as unsupported when neither side has a reachable UDP endpoint.
- **Risk:** plain-HTTP registry inside WireGuard is questioned in the audit → **Mitigation:** the TLS-with-internal-CA alternative is designed in DECISIONS and can be switched on without protocol changes.
- **Open question:** whether every container should join the mesh bridge or only those with cross-server dependencies; default: every managed container (simpler, DNS always works), revisit if the 253 cap bites.
- **Open question:** full mesh vs hub through the control-plane host at 50+ servers; default: full mesh (no single point of failure for private traffic, matches B3's failure rule), with the H4 review asked to weigh in.
- **Open question:** ingress server default when placement spans servers; default: the first server in `placement[]`, changeable per domain.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps, incl. the 253-container ceiling and IPv6 limitation)
- [ ] `docs/DECISIONS.md` entries added: mesh bridge + dual-network attachment, `/24` cap and prefix option, nftables table design, DNS scoping by source IP, registry over plain HTTP inside WireGuard, per-server registry credentials, `wgctrl-go` / `netlink` / `miekg/dns` licenses, full mesh topology, Caddy retry settings, ingress server default
- [ ] `docs/UI_DECISIONS.md` updated with Scaling section and Mesh card screenshots
- [ ] Cross-model review (H1, H2) and architecture review (H4) done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 12 — Multi-server and private networking</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-12-multi-server-mesh.md,
and these SPEC sections: B2, B3, B5, B8, B9, B12, B14, C7.12, C7.18, D1, D4, D6, J5, J6.
</context>
<goal>A second server on another cloud joins a private mesh; replicas run across servers behind one ingress; services reach each other by name privately and only within their own environment; switching one server off keeps the site serving.</goal>
<scope>
- Protocol: MeshConfig, MeshPeer, DnsRecord, IsolationSet, PlatformServiceSpec, MeshCheck; AgentHello.wg_public_key; ActualState.mesh_peers
- WireGuard lumen0 via wgctrl-go: keys, 10.200.0.x mesh IPs, full-mesh peers with keepalive 25s, MTU auto, routes for 10.210.<n>.0/24, handshake monitor
- lumen-mesh bridge on 10.210.<n>.0/24 with static container IPs, dual-network attachment, DNS options
- nftables `inet lumen` isolation: same-environment only, hosts → containers allowed, containers → host services blocked except DNS, fail-closed apply
- Embedded DNS on 10.210.<n>.1:53: <service>.<environment>.lumen.internal, source-scoped short form, NXDOMAIN across projects, upstream forwarding + cache
- Registry (registry:2 by digest) on the control-plane host's mesh IP with per-server credentials; push from the build server, pull by digest elsewhere; registry GC keep-5
- Placement + replicas in the compiler with capacity and volume validation; ingress server per domain; Caddy upstreams with retry and active health; multi-ingress guidance
- Drain (resumable job, stateless moves, volume services listed), undrain, remove blocked until empty
- MESH_UNREACHABLE with provider fix cards, Mesh ready checklist, mesh check op
- UI: Scaling and placement section (replica steppers, capacity, notes), server Mesh card, Drain/Remove dialogs
- Isolation suite, failover chaos, 50×40 scale benchmark, H4 review
</scope>
<out_of_scope>
- Cloud provisioning (16), volume move wizard (09), HA Postgres (17), geo/latency routing, IPv6 inside the mesh, non-WireGuard overlays
</out_of_scope>
<acceptance_criteria>
See docs/phases/PHASE-12-multi-server-mesh.md §6: D4 private networking (A cannot reach B; api.lumen.internal resolves across servers); D6 replicas, placement, cross-server load balancing, multi-ingress guidance; D1 drain moves stateless services; isolation suite passes on Multipass and two real clouds; power-off failover with 0 non-2xx; cross-server image by digest; MESH_UNREACHABLE within 3 min and clear within 30 s; survives 10-min control-plane outage; scale figures met; UI passes C14; H4 done.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, protocol and schema changes, risks (/24 cap, Docker iptables interplay, UDP-restricted providers, registry transport), test plan, open questions (all-containers-on-mesh, full mesh vs hub, ingress default). STOP and wait for approval.
2. Implement in small steps; run Go unit + netns integration tests after each step; keep Phase 03 compatibility fixtures green.
3. Verify on two Multipass VMs, then Oracle arm64 + Hetzner/DO amd64 in different regions: formation, isolation suite, failover, firewall block/unblock, RTT.
4. UI: screenshots at 390/1024/1440 × dark/light × all states; critique against SPEC C14; fix before reporting.
5. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
6. Update docs/PROGRESS.md, docs/DECISIONS.md, docs/UI_DECISIONS.md; request H1, H2 and H4 reviews.
</process>
```
