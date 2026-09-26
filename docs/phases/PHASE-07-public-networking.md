# Phase 07 — Public networking

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (Caddy route safety, TCP proxy, certificate handling) |
| **Depends on** | Phase 5 (inspector Settings tab, Logs tab, canvas node URL), Phase 3 (Caddy route management in the agent) |
| **Unblocks** | Phase 8 (HTTP metrics from rollups), Phase 11 (setup wizard domain step reuses the DNS record card and live checker), Phase 16 (sleeping needs the Caddy wake route) |
| **Spec sections** | SPEC B9 (public HTTP(S), generated domains, custom domains, HTTP logs, TCP proxy), B6 (domains, tcp_proxies, http_log_rollups, instance_settings), B13 (`LUMEN_PUBLIC_DOMAIN`, `LUMEN_TCP_PROXY_*`), C5 (DNS record card, Port check card), C7.6 (node public URL), C7.7 (header URL), C7.11 HTTP mode, C7.12 Networking, C9, C10, D4 first three items, J5, J6 `DNS_NOT_POINTED`, `TLS_FAILED`, `PORT_BLOCKED` |
| **Estimated sessions** | 5 focused sessions: (1) generated domains + base domain + Caddy wiring, (2) custom domains + DNS record card + live checker + certificates, (3) target port + TCP proxy, (4) HTTP access logs + rollups + Logs HTTP mode, (5) Networking section polish + real-domain test |

## 1. Goal
Every web service gets a working HTTPS address the moment it is Active, a user can add their own domain and watch a live checker turn green and a certificate appear within two minutes of DNS propagating, and databases can be reached from outside through an opt-in TCP port.

## 2. Why this phase exists
"My app is live on HTTPS" is the north-star sentence (SPEC Part A). Until this phase, a deploy produces a container nobody can reach. Three things make this phase harder than "point Caddy at a port":

- **DNS is where beginners get stuck.** They do not know what an A record is, which value to paste, or why it "doesn't work yet". The DNS record card and the live checker exist to turn a support ticket into a green tick. The card must show the exact record, in the exact shape their registrar expects, with a copy button on each field.
- **Certificates fail for reasons the user cannot see.** Port 443 blocked by a cloud firewall, a CAA record, a rate limit, a CNAME to a proxying CDN. Every one of those has to surface as a plain-language error with a fix, not as "TLS handshake failed".
- **Routes are live traffic.** A wrong Caddy config takes every app on the server down. All route changes go through the agent's desired-state reconciliation (Phase 3) with validation before apply and automatic rollback of the last known-good config if the admin API rejects the new one.

HTTP access logs are here rather than in Phase 8 because they come from Caddy and are the raw material for the request metrics, the 5xx rate and the p95 latency the Metrics tab shows later.

## 3. Scope
### In scope
- Base domain from instance settings, wildcard DNS guidance, IP-based fallback (sslip.io-style) with documented certificate limits.
- Generated domains `<service>-<env>-<4char>.<base-domain>` with collision handling, "Generate domain" button, one generated domain per service instance by default, more on demand.
- Custom domains: add, validate, DNS record card (A for apex, CNAME for subdomains), live propagation check, certificate issuance via Caddy HTTP-01 with ZeroSSL fallback, `dns_status`/`tls_status` state machines, remove with undo.
- Optional Cloudflare DNS-01 (API token) for wildcard custom domains.
- Target port: auto-detected value shown, manual override.
- TCP proxy: enable per service, public port allocated from 20000–29999 (configurable range), `host:port` display, disable.
- Caddy JSON access logs parsed by the agent into per-service request logs and `http_log_rollups`.
- Networking settings section in the inspector (C7.12), HTTP mode in the Logs tab (C7.11), canvas node and inspector header public URL wiring.
- Error cards for `DNS_NOT_POINTED`, `TLS_FAILED`, `PORT_BLOCKED`.
- Platform variables `LUMEN_PUBLIC_DOMAIN`, `LUMEN_TCP_PROXY_DOMAIN`, `LUMEN_TCP_PROXY_PORT` injected on deploy.
### Out of scope
- Private networking, mesh DNS, cross-server load balancing (Phase 12). This phase routes only to containers on the same server as the ingress.
- Metrics charts built on the rollups (Phase 8). This phase writes the rollups and shows the HTTP log rows.
- App sleeping wake route (Phase 16), though the route structure leaves a slot for it.
- Multi-ingress DNS guidance (Phase 12, advanced).
- The setup wizard's domain step UI (Phase 11) — it reuses this phase's components.

## 4. Work breakdown

### 4.1 Base domain and instance settings
- **What:** `instance_settings` keys `base_domain` (string, lowercase, no trailing dot), `base_domain_mode` (`custom` | `ip_fallback`), `tls_email` (ACME account email), `tls_dns01_cloudflare_token_enc` (optional), `tcp_proxy_range` (`{ from: 20000, to: 29999 }`). `GET/PATCH /v1/instance/settings/networking` (instance admin). Validation: `base_domain` must be a valid hostname, must not be an IP, and for `custom` mode a wildcard DNS check (`*.<base_domain>` resolves to the ingress server's public IP) runs on save and returns `wildcard_ok: boolean` with the observed records.
- **Files:** `packages/db/src/schema/instance-settings.ts` (typed keys), `apps/api/src/routes/instance/networking.ts`, `apps/api/src/dns/resolve.ts` (DoH-free resolver using `node:dns/promises` with explicit public resolvers 1.1.1.1 and 8.8.8.8 and a 3 s timeout), `apps/web/app/(app)/settings/instance/domain/page.tsx`
- **Done when:** saving a base domain with correct wildcard DNS shows "Wildcard DNS is pointing here" with a green check; saving with wrong DNS still saves but shows the record card and "Not pointing here yet"; the IP fallback mode computes `<ip-with-dashes>.sslip.io` and shows the limits note.

### 4.2 Generated domains
- **What:** On service instance creation for kind `web` (and on "Generate domain"), create a `domains` row with `kind = 'generated'`, `hostname = <slug(service)>-<slug(env)>-<4char>.<base_domain>`, `target_port = service_instances.target_port ?? detected_port ?? null`. The 4-char suffix is drawn from the alphabet `abcdefghijkmnpqrstuvwxyz23456789` (no `l`, `o`, `0`, `1`) using `crypto.randomInt`; on a unique-constraint collision retry up to 5 times, then extend to 6 chars. Slugs are lowercased, non-alphanumerics collapsed to `-`, trimmed to 30 chars each so the full label stays under 63 characters. Generated domains have `dns_status = 'ok'` immediately (wildcard) and `tls_status = 'pending'` until Caddy reports the certificate. Deleting the last generated domain requires a confirm ("Your service will have no public address."). Environments other than production use the same format; preview environments (Phase 10) get `-pr-123` as the env slug.
- **Files:** `apps/api/src/domains/generate.ts`, `apps/api/src/routes/domains.ts` (`GET/POST /v1/services/:id/domains`, `DELETE /v1/domains/:id`), `packages/shared/src/domains/slug.ts` (+ tests), `apps/web/components/networking/domains-list.tsx`
- **Done when:** creating a web service produces one generated domain visible on the node and in the header within 1 s; 10,000 generated names in a test produce zero invalid labels; a forced collision resolves by retry.

### 4.3 Caddy route compilation and reconciliation
- **What:** Extend the Phase 4 desired-state compiler so each server's `DesiredState.routes[]` contains, per domain on that server, `{ route_id, hostnames[], upstreams[{ container_id, port }], health: { path?, interval_s }, tls: { mode: 'auto' | 'dns01_cloudflare', email }, access_log: { service_instance_id } }`. The agent (Phase 3 `internal/caddy`) renders a Caddy JSON config: one `http.handlers.reverse_proxy` per route with `lb_policy: round_robin` (single upstream now, replicas in Phase 12), `X-Forwarded-*` headers, `request_body.max_size` default 100 MB, WebSocket pass-through (Caddy default), and a per-server `logging.logs.access` sink writing JSON to `/var/lib/lumen/caddy/access.log` with `include: ["http.log.access"]`. Route apply is a full-config `POST /load` to the admin API on `localhost:2019` after validating with `POST /adapt`; on a non-2xx response the agent restores the previous config (kept in memory and on disk at `/var/lib/lumen/caddy/last-good.json`) and reports `OpError{code: "ROUTE_APPLY_FAILED"}`. TLS: `tls.automation.policies` with `issuers: [acme (Let's Encrypt), zerossl]`, `on_demand: false`; DNS-01 policy added when a Cloudflare token exists, scoped to the wildcard hostnames only.
- **Files:** `apps/api/src/desired-state/routes.ts`, `packages/protocol/proto/lumen/agent/v1/desired_state.proto` (Route message fields), `apps/agent/internal/caddy/config.go`, `apps/agent/internal/caddy/apply.go`, `apps/agent/internal/caddy/lastgood.go`
- **Done when:** a Go test renders a config for 3 routes and validates it against `caddy adapt`; an intentionally bad route triggers rollback and the previous routes keep serving (curl loop shows zero failures); the agent survives a Caddy restart by re-applying last-good.

### 4.4 Certificate status reporting
- **What:** The agent polls the Caddy admin API `GET /pki/ca/local` is irrelevant; instead it watches Caddy's structured logs (`tls.obtain` / `tls.renew` events on the `/var/lib/lumen/caddy/caddy.log` sink with `include: ["tls"]`) and inspects `$XDG_DATA_HOME/caddy/certificates/` for `<hostname>.crt` to derive per-hostname `tls_status`: `pending` (no cert yet, < 3 min since route applied), `issuing` (an `obtain` attempt logged), `ok` (cert file present, not expired; `not_after` reported), `failed` (an `obtain` error logged; the error line is mapped to a reason code: `rate_limit`, `caa`, `port_blocked` (connection refused/timeout on 80/443 in the ACME challenge), `dns_wrong` (challenge 404 from another server), `unknown`). Statuses go up in `ActualState.routes[]` and the API updates `domains.tls_status`, `domains.tls_reason`, `domains.last_checked_at`. Renewals are Caddy's job; the API only records `not_after`.
- **Files:** `apps/agent/internal/caddy/tls_status.go`, `packages/protocol/proto/lumen/agent/v1/actual_state.proto` (RouteStatus), `apps/api/src/domains/tls-status.ts`
- **Done when:** on a real VM with a real domain, the Networking section shows `pending → issuing → ok` with a certificate expiry date; blocking 443 with a firewall rule produces `failed/port_blocked` within 3 minutes.

### 4.5 Custom domains and the DNS record card
- **What:** `POST /v1/services/:id/domains { hostname }` validates: lowercase, punycode-safe (convert IDN with `url.domainToASCII`), 1–253 chars, labels 1–63, no wildcard unless a Cloudflare token exists, not equal to the base domain or a subdomain of it (those are generated), not already used by another service instance on the instance (error "That domain is already used by <project>/<service>"). The record card shows: for an apex (`example.com`) an **A** record `@ → <ingress public IP>`; for a subdomain (`app.example.com`) a **CNAME** record `app → <generated hostname of this service>` (so IP changes need no user action), with an "Use an A record instead" link that shows `app → <ip>`. Each of type / name / value has a copy button. The live checker runs on `POST /v1/domains/:id/check` and automatically on a schedule after add: every 10 s for 2 min, every 30 s for 10 min, every 5 min for 24 h, then hourly for 7 days, then stops (the user can click "Check now" any time). `dns_status`: `pending` (no record yet) → `wrong_target` (record exists but points elsewhere; card shows what we saw: "We see 203.0.113.9, expected 198.51.100.4") → `ok` (resolves to the ingress IP, or CNAME chain ends at a Lumen hostname). When `dns_status` becomes `ok` the route is added to desired state (routes are never added before DNS points here, so a stray ACME attempt cannot burn rate limit) and the certificate flow starts.
- **Files:** `apps/api/src/domains/validate.ts` (+ tests), `apps/api/src/domains/check.ts`, `apps/api/src/workers/domain-checker.ts` (pg-boss schedule per domain), `packages/ui/src/components/dns-record-card.tsx` (C5 specialized component: type / name / value with copy buttons and live check indicator), `apps/web/components/networking/add-domain-dialog.tsx`, `apps/web/components/networking/domain-row.tsx`
- **Done when:** adding `app.<real domain>` shows the CNAME card, the indicator goes from grey "Checking…" to green "Pointing here" within one polling interval after the record is added, the certificate issues, and `https://app.<real domain>` serves the app; total wall time from DNS propagation to a valid cert < 2 min (measured).

### 4.6 Cloudflare DNS-01 for wildcards
- **What:** Instance admin pastes a Cloudflare API token (Zone.DNS edit scope) in Instance → Domain & TLS; stored encrypted; "Test token" calls `GET /client/v4/user/tokens/verify`. With a token present, a workspace user may add `*.example.com` as a custom domain; the route's TLS policy uses the Caddy Cloudflare DNS module. The agent binary must be built with `xcaddy --with github.com/caddy-dns/cloudflare` (Phase 0 build pipeline gains this) — record in DECISIONS.md. The token reaches the agent inside `DesiredState.routes[].tls.dns01.cloudflare_token` only for servers that host a wildcard route, over the authenticated channel, and is held in memory.
- **Files:** `apps/api/src/routes/instance/networking.ts`, `apps/agent/internal/caddy/config.go` (dns01 policy), `deploy/build/caddy.Dockerfile` or `apps/agent/build/xcaddy.sh`
- **Done when:** a wildcard domain gets a certificate on a real Cloudflare zone; a wrong token shows "Cloudflare rejected this token. It needs Zone → DNS → Edit on your zone."

### 4.7 Target port
- **What:** The Networking section shows "Target port" with the value the app listens on: if `service_instances.target_port` is null, show the agent-detected `detected_port` with the caption "Detected" and a lock-free input to override; once overridden, show "Set by you" with a "Use detected (3000)" link. Saving is a staged change (C8.1) because it changes routes. If neither is known, show "Not detected yet — deploy once, or set it here". Validation 1–65535. Both `PORT` env injection and route upstream use the effective port (`target_port ?? detected_port ?? 3000` when building; routes wait for a known port).
- **Files:** `apps/web/components/networking/target-port-field.tsx`, `apps/api/src/routes/services.ts` (PATCH `target_port`), `apps/api/src/desired-state/routes.ts` (effective port)
- **Done when:** an app listening on 8080 without `PORT` is reachable after the agent reports `detected_port = 8080`; overriding to a wrong port yields `HEALTHCHECK_TIMEOUT` on the next deploy with the fix "Check port / set healthcheck path" pointing back here.

### 4.8 TCP proxy
- **What:** "Enable public TCP access" toggle in Networking (and on the database Connect tab in Phase 9). `POST /v1/services/:id/tcp-proxy { internal_port }` allocates the lowest free `public_port` in the instance range for the service's server (unique index on `(server_id, public_port)`), creates a `tcp_proxies` row, and adds `DesiredState.tcp_proxies[]{ proxy_id, public_port, container_id, container_port }`. The agent runs one Go listener per proxy on `0.0.0.0:<public_port>` (`net.Listen("tcp")`, `SO_REUSEADDR`), dials the container IP:port on the project network, copies bidirectionally with `io.Copy` in two goroutines, idle timeout 10 minutes, max 512 concurrent connections per proxy (excess connections get closed immediately and a counter is reported), and closes all connections when the proxy is removed from desired state. Firewall: the installer opens the range only when the first proxy is created? No — decision: the installer opens the configured range at install time (documented in J5 as opt-in), and the port-check card (C5) gains a "TCP proxy port reachable" line that runs when a proxy is enabled. `DELETE /v1/services/:id/tcp-proxy` disables with an undo toast. Platform variables `LUMEN_TCP_PROXY_DOMAIN` (= server public IP or the server's DNS name if set) and `LUMEN_TCP_PROXY_PORT` are injected on the next deploy.
- **Files:** `apps/api/src/routes/tcp-proxy.ts`, `apps/api/src/tcp-proxy/allocate.ts` (+ tests), `apps/agent/internal/tcpproxy/proxy.go`, `apps/agent/internal/tcpproxy/manager.go`, `apps/web/components/networking/tcp-proxy-card.tsx`
- **Done when:** enabling on a Postgres service shows `203.0.113.9:20000`; `psql` from a laptop connects; disabling closes the connection within 1 s; 600 parallel connections leave 512 served and 88 refused, reported as `refused_connections` in `ActualState`.

### 4.9 HTTP access logs and rollups
- **What:** The agent tails `/var/lib/lumen/caddy/access.log` (JSON lines, rotated by Caddy at 100 MB × 5 files) and maps each entry to a service instance through the route id embedded as a request header set by the route handler (`X-Lumen-Route: <route_id>` added via a `headers` handler before `reverse_proxy` and stripped before forwarding — decision: use Caddy's `log_append` / route-level `logger_names` instead if available in the pinned Caddy version; record the choice). Parsed fields: `ts`, `method`, `path` (query stripped, stored separately truncated to 512 chars), `status`, `duration_ms` (from `duration` seconds × 1000, one decimal), `bytes_out` (`size`), `client_ip` (from `request.client_ip`, respecting `trusted_proxies` when set), `user_agent` (truncated 256), `host`, `route_id`. Rows go into the agent's local HTTP log segments (same rotating store as runtime logs, 7 d default retention, separate namespace) and are queryable via `LogQuery{kind: http}`. Every 60 s the agent computes per-service rollups for the closed minute — `requests`, `status_2xx/3xx/4xx/5xx`, `p50/p95/p99` (t-digest or exact sort over the minute's samples; exact sort is fine under 100k requests/min) — and sends them in `MetricsBatch.http_rollups[]`; the API upserts `http_log_rollups` keyed by `(service_instance_id, bucket_ts)`.
- **Files:** `apps/agent/internal/httplog/tail.go`, `apps/agent/internal/httplog/parse.go` (+ tests with real Caddy lines), `apps/agent/internal/httplog/rollup.go`, `packages/protocol/proto/lumen/agent/v1/metrics.proto` (HttpRollup), `apps/api/src/metrics/http-rollups.ts`, `apps/api/src/routes/http-logs.ts` (`GET /v1/services/:id/http-logs`)
- **Done when:** a k6 burst of 10,000 requests over 2 minutes yields rollups whose `requests` sum matches ±0.5 %; p95 in the rollup is within 5 ms of k6's; a request line never contains a query string value (privacy) — verified by test.

### 4.10 Logs tab: HTTP mode
- **What:** The Phase 5 Logs tab gains the mode switch entry **HTTP**. Row layout (dense, one line): time (mono 12, tabular), method (mono 12/500, 48px column), status (mono 12/500, colored: 2xx `--color-text-secondary`, 3xx `--color-info`, 4xx `--color-warning`, 5xx `--color-danger`), path (mono 13, truncated with tooltip), duration ("42 ms" tabular, right-aligned 64px), bytes ("1.2 kB", 64px), client IP (mono 12 muted, hidden below 1024). Filter bar accepts `status:>=500`, `status:404`, `method:POST`, `path:/api/*` (glob), `ip:203.0.113.9`, `ua:curl*`, `duration:>1000`, free text over path + user agent. Filters become chips; the parser is the Phase 8 shared grammar, of which this phase implements the HTTP subset (`packages/shared/src/log-filter/` created here, extended in Phase 8). Clicking a row expands a key-value tree with every field and a "Copy as curl" action (method + URL, no headers). Live tail applies (new rows every second).
- **Files:** `apps/web/components/inspector/logs/http-mode.tsx`, `apps/web/components/inspector/logs/http-row.tsx`, `packages/shared/src/log-filter/parser.ts` (+ tests), `packages/shared/src/log-filter/http.ts`
- **Done when:** typing `status:>=500 path:/api/*` produces two chips, the query hits the API with the structured filter, results stream, and the deep link `?mode=http&q=status%3A%3E%3D500` restores the view.

### 4.11 Networking settings section
- **What:** In Settings, the **Networking** section renders: (a) **Public domains** list — each row: hostname (mono 13, click opens `https://`), kind caption ("Generated" / "Custom"), DNS pill, TLS pill, overflow (Copy, Open, Check now (custom), Remove); "Generate domain" ghost button and "Add custom domain" secondary button; (b) **Target port** field (4.7); (c) **TCP proxy** card (4.8); (d) **Private address** copy field showing `<service>.<env>.lumen.internal` with the caption "Reachable from services in this environment" (the address is informational until Phase 12 makes cross-server work; on one server it works already because Phase 3's project network + Docker embedded DNS aliases the container name — verify and state in DECISIONS.md). The inspector header's URL and the canvas node URL use the first `ok` domain by preference order: custom `ok` → generated `ok` → generated pending (shown greyed with a tooltip "Certificate pending").
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/settings/networking-section.tsx`, `apps/web/components/networking/*.tsx`, `apps/web/components/inspector/header-url.tsx`, `apps/web/components/canvas/service-node.tsx` (URL slot)
- **Done when:** screenshots at three widths × two themes for: no domains, generated only, custom pending, custom wrong target, custom ok, TLS failed, TCP proxy on; C14 passes.

### 4.12 Error cards
- **What:** Wire three J6 entries in `packages/shared/errors`:
  - `DNS_NOT_POINTED` — title "Your domain doesn't point here yet"; explanation "We looked up <hostname> and found <observed or 'no record'>. It needs to point to <expected>. DNS changes can take a few minutes to spread."; fix action "Show DNS record" (scrolls to / expands the card) and "Check again"; raw: the resolver output.
  - `TLS_FAILED` — title "We couldn't get a certificate for your domain"; explanation by reason: `port_blocked` → "The certificate authority couldn't reach port 80 or 443 on your server."; `rate_limit` → "The certificate authority limited requests for this domain. This lifts automatically; we'll retry in <time>."; `caa` → "A CAA record on your domain forbids Let's Encrypt and ZeroSSL."; `dns_wrong` → "The challenge reached a different server. Check the DNS record."; `unknown` → "The certificate authority returned an error."; fix actions respectively: "Run port check", "Retry at <time>" (disabled countdown), "Show CAA fix", "Show DNS record", "Retry now"; raw: the Caddy log line.
  - `PORT_BLOCKED` — title "Port 443 is blocked on your server" (or 80, or both); explanation "Traffic to port <n> on <server> isn't getting through. This is usually the cloud firewall."; fix action opens the Phase 2 provider-specific fix card for that server; raw: the port check result.
- **Files:** `packages/shared/src/errors/catalog.ts`, `apps/web/components/errors/error-card.tsx` (generic, Phase 5) with the three action handlers in `apps/web/components/networking/error-actions.tsx`
- **Done when:** each card renders from a fixture in the component gallery (`/dev/components#error-cards`) in both themes; the "Run port check" action triggers `POST /v1/servers/:id/port-check` and shows the result inline.

### 4.13 Real-domain acceptance run
- **What:** On a real VM with a real domain (a dedicated test zone), run the scripted checklist: base domain wildcard → generated domain HTTPS ok; add subdomain via CNAME → live checker green → cert ok (< 2 min after propagation, timed with `dig` polling); add apex via A → same; block 443 in the cloud firewall → `TLS_FAILED/port_blocked` card → unblock → "Retry now" → ok; enable TCP proxy on Postgres → `psql` from a laptop; 10k-request k6 run → HTTP mode shows rows and rollups match.
- **Files:** `e2e/networking/real-domain.md` (runbook), `e2e/networking/domains.spec.ts` (Playwright parts that can run against the seeded instance), `e2e/networking/http-logs.k6.js`
- **Done when:** the runbook is executed once with timings recorded in `docs/evidence/phase-07/real-domain.md`.

## 5. Detail checklist

### Typography
- Hostnames everywhere (domain rows, header URL, node URL, copy fields): code 13/400 Geist Mono `--color-text`; the header URL is 13px, never larger than the service name (16/600) so the two never compete (C14 "one accent element per view").
- Domain row kind caption ("Generated" / "Custom"): caption 12/400 `--color-text-secondary`, 8px after the hostname.
- DNS record card: field labels ("Type", "Name", "Value") label 12/500 uppercase tracking 0.04em `--color-text-secondary`; values code 13/400 mono `--color-text`; the "expected vs seen" line body 14/400 with the values in mono 13.
- Status pills: 12/500; letter-spacing 0.
- Target port input: mono 14/400, width 96px, right-aligned digits; caption "Detected" / "Set by you" in caption 12/400.
- TCP proxy `host:port`: mono 14/500 in a copy field; the range note in meta 12/400.
- HTTP log rows: as specified in 4.10; header row labels 12/500 `--color-text-secondary`.
- Error cards: title card title 14/600; explanation body 14/400 `--color-text-secondary`; raw details code 12/400 mono in a `--color-bg` well.
- Section titles in Networking ("Public domains", "Target port", "TCP proxy", "Private address"): section title 16/600 letter-spacing -0.01em, 24px above, 12px below.
- Instance → Domain & TLS page title: 24/600 -0.01em.

### Spacing & layout
- Networking section: label/control grid 200px + 1fr at ≥1024; stacked below. Sub-cards (DNS record card, TCP proxy card) 10px radius, 16px padding, 1px `--color-border`.
- Domain rows: 40px min height, 12px horizontal padding, 8px between hostname and caption, pills right-aligned with 8px gap, overflow button 28px square at the far right; rows separated by 1px `--color-border`.
- DNS record card: three columns Type (72px) / Name (1fr) / Value (2fr) at ≥768; stacked label-over-value below 768; each value cell has a 28px copy button flush right; the live check indicator sits in the card footer: 8px dot + status text + "Check now" ghost button + "Last checked 12 s ago" meta on the right.
- Add-domain dialog: 480px wide, 14px radius, 24px padding; input 32px; helper line 8px below; primary button "Add domain" right-aligned in the footer with a ghost "Cancel" to its left, 12px gap.
- TCP proxy card: toggle row (label left, switch right, 40px tall) then, when on, the copy field 8px below and the note 8px under that.
- HTTP row: 32px tall (dense 28px), 8px column gaps, 12px side padding; expanded tree indents 16px per level.
- Everything on the 4px grid.

### Color & theme
- DNS pill: `pending` grey (`--color-sleeping` dot, text `--color-text-secondary`), `wrong_target` warning (`--color-warning`), `ok` success (`--color-success`). TLS pill: `pending`/`issuing` warning pulsing, `ok` success, `failed` danger. Each pill is icon + color + text (C4), never color alone.
- Live check indicator dot: same mapping; pulses only while a check is in flight.
- HTTP status coloring as in 4.10; only the status column is colored, never the whole row.
- Error card left border: `--color-danger` for `TLS_FAILED` and `PORT_BLOCKED`, `--color-warning` for `DNS_NOT_POINTED` (expected during propagation, not a failure).
- Copy buttons: ghost, `--color-text-secondary` icon; "Copied" state swaps to `check` in `--color-success` for 1.5 s.
- Light theme: cards get the C4 soft shadow; pills keep the same hue tokens (light-theme fill-ins from Phase 1).

### Motion
- Live check indicator: while checking, the dot pulses per C4 (opacity 1 → 0.4 → 1 over 1.6 s); on success the dot scales 1 → 1.2 → 1 over 200ms `cubic-bezier(.2,.8,.2,1)` and the text crossfades 120ms; reduced motion: no pulse, no scale, text swaps instantly.
- Domain row add/remove: height + opacity 200ms; remove shows the undo toast for 8 s; reduced motion: opacity only.
- Copy feedback: icon crossfade 120ms ease-out.
- TCP proxy toggle: switch thumb 120ms ease-out; the copy field expands 200ms panel easing; reduced motion: instant.
- TLS `issuing` pill pulses like Building; stops at `ok` or `failed`.
- HTTP rows entering in live tail: no animation (rows just appear, same as runtime logs) to keep 60 fps under load.
- Error card countdown ("Retry at 14:32 · 4 min"): updates once a second, text only.

### Iconography & symbols
- Public domains section icon: Lucide `globe` 16.
- Open in new tab: `arrow-up-right` 14 on hover of hostnames (always visible below 768); copy: `copy` 14 → `check` 14.
- DNS record type badge: text only ("A", "CNAME") in a 24px pill, mono 12/500.
- Live check: 8px dot plus text ("Checking…", "Pointing here", "Points elsewhere"); no extra icon.
- TLS ok: `lock` 14 `--color-success`; TLS failed: `lock-open` 14 `--color-danger` paired with "Certificate failed"; pending: `clock` 14.
- TCP proxy: `network` 16 in the card title; port check lines use `circle-check` / `circle-x` 16 with text (the C5 ✅/❌ language).
- HTTP method column: text only.
- Error card icons: `DNS_NOT_POINTED` `route-off` 20 warning; `TLS_FAILED` `shield-alert` 20 danger; `PORT_BLOCKED` `shield-ban` 20 danger.

### Copy
- Section intro (Public domains): "Every address below serves this service over HTTPS."
- Empty domains list (non-web kinds): "This service has no public address. Add one if it serves HTTP." Button: "Generate domain".
- Generated domain tooltip: "Lumen made this address for you. Add your own domain any time."
- Add custom domain dialog: title "Add a domain"; input placeholder `app.example.com`; helper "Apex domains use an A record. Subdomains use a CNAME."; errors: "That doesn't look like a domain." · "That domain is already used by <project> / <service>." · "Wildcards need a Cloudflare token. Ask your instance admin." · "<base domain> addresses are generated for you. Use Generate domain instead."
- DNS record card header: "Add this record at your DNS provider". Footer states: "Checking…" · "Pointing here" · "Points elsewhere — we see 203.0.113.9, expected 198.51.100.4" · "No record found yet". Meta: "Last checked 12 s ago". Buttons: "Check now" · "Use an A record instead" · "Use a CNAME instead".
- Certificate line under a custom domain: "Certificate: pending" · "Certificate: issuing…" · "Certificate: valid until 12 Dec 2026" · "Certificate failed — <reason sentence>".
- IP fallback note (Instance → Domain & TLS and wizard reuse): "Free temporary addresses end in sslip.io and share a certificate limit with everyone using that service. They're fine for testing. Add your own domain before inviting users."
- Wildcard DNS instruction (custom base domain): "Add a wildcard record so every app gets an address automatically." Record: `*.apps.example.com → <ip>` (type A) and, optionally, `apps.example.com → <ip>`.
- Target port: label "Target port"; captions "Detected" / "Set by you" / "Not detected yet — deploy once, or set it here"; link "Use detected (3000)".
- TCP proxy: toggle label "Public TCP access"; helper "Expose a port for databases, game servers or MQTT. Off means only services in this project can connect."; on-state copy field label "Connect from anywhere at"; note "Ports 20000–29999 are used for this. Your firewall must allow them."; disable toast "Public TCP access turned off" with "Undo".
- Private address: label "Private address"; caption "Reachable from services in this environment".
- Remove domain confirm (last generated): title "Remove this address?" body "Your service will have no public address until you add one." Confirm: "Remove address". Others: no confirm, undo toast "Removed app.example.com" with "Undo".
- HTTP mode empty: "No requests yet. Requests appear here as soon as someone opens your app." Filter placeholder: `status:>=500 path:/api/*`.
- Error card copy as listed in 4.12.

### States (empty · loading · error · success · partial)
- Domains list: loading (2 skeleton rows 40px: bar 220px mono + two 56px pills), empty (as above), populated, partial (server offline: pills show last known status with a `cloud-off` 14 icon and tooltip "Server offline — showing last known status").
- DNS record card: checking, ok, wrong target, no record, check error ("We couldn't reach a DNS resolver. Try again.").
- Certificate: pending, issuing, ok, failed (reason variants).
- Target port: detected, set by you, unknown, invalid input (inline error "Enter a port between 1 and 65535").
- TCP proxy: off, allocating (switch disabled + spinner 12), on, allocation failed ("No free ports left in 20000–29999. Ask your admin to widen the range."), server offline (switch disabled, tooltip).
- HTTP mode: loading (10 skeleton rows 32px with 6 column bars), empty, streaming, filtered-empty ("No requests match these filters"), paused (Jump to live), server offline partial ("Server offline — showing requests up to 14:02").
- Instance → Domain & TLS: unset (hero: "Choose how apps get addresses" with the two big cards from C7.1 step 2), custom ok, custom wildcard not pointing, IP fallback, Cloudflare token ok/invalid.

### Keyboard & accessibility
- Domain rows are list items; overflow menus open with Enter/Space and arrow-navigate; "Copy" is reachable by Tab inside the card; copy buttons announce "Copied" via a polite live region.
- Live check status changes announced: "app.example.com is pointing here." / "Certificate ready for app.example.com."
- Pills have `aria-label` with the full status ("DNS: pointing here").
- Add-domain dialog: focus trap, initial focus in the input, Enter submits, Esc cancels.
- HTTP rows: `role="row"` in a `grid`; Enter expands; arrow keys move; the expanded tree is a `tree`.
- Contrast: 4xx warning text on `--color-surface` verified ≥ 4.5:1 in both themes (Phase 1 table); if the light-theme warning fails, use the darker warning text token defined there.
- No hover-only affordances: copy and open buttons are visible on touch devices (always visible below 768).

### Responsive
- ≥1280: Networking section in the inspector at its remembered width; DNS card three columns.
- 1024–1279: same; inspector overlays.
- 768–1023: label/control stacked; DNS card still three columns if width ≥ 720, else stacked.
- <768: inspector as a full-screen sheet; DNS card stacked with full-width copy buttons (44px); TCP card toggle 44px tall; HTTP rows show time / status / path / duration only, expand for the rest; the add-domain dialog is a bottom sheet.

### Realtime and deep links
- Topics → query invalidation: `domain.updated` (service instance) → `['domains', serviceInstanceId]`, `['service', id]` (header URL); `tcp_proxy.updated` → `['tcp-proxy', serviceInstanceId]`; `http_log.chunk` (subscription per service instance + filter hash) → appended to the live buffer, no invalidation; `instance.networking.updated` → `['instance','networking']`.
- Deep links: `/p/:project/:env/s/:service/settings#networking`, `?domain=<id>` to expand a domain's DNS card, `/p/:project/:env/s/:service/logs?mode=http&q=<urlencoded filter>&from=<iso>&to=<iso>`, `/settings/instance/domain`.

### Performance
- Domain checks run in workers; the UI polls nothing; realtime events update rows.
- HTTP log streaming: rows arrive in batches every 500 ms, virtualized list (Phase 5 log viewer), 60 fps at 1,000 rows/s in the k6 run.
- Rollup computation on the agent stays under 20 ms per minute for 100k requests (benchmark in Go test).
- Caddy config apply < 200 ms for 100 routes; validated with `POST /adapt` first.

### Security
- Route apply uses the admin API on `localhost:2019` only; the agent refuses to start if the admin endpoint is bound elsewhere.
- Custom hostnames are validated server-side; the checker resolves with explicit public resolvers and rejects private/loopback results (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `::1`, link-local) so the checker cannot be used as an internal scanner (SSRF guard).
- ACME attempts only after `dns_status = ok` (rate-limit protection).
- Cloudflare token encrypted at rest; sent only to servers hosting wildcard routes; never logged.
- TCP proxy: connection cap per proxy; idle timeout; listeners bound only for enabled proxies; the range is documented as opt-in and the port check tells the user whether it is open.
- Access logs: query strings dropped (they may contain tokens); user agent truncated; client IP stored but shown only to workspace members.
- The route-identification header is stripped before the request reaches the container.

### Data integrity & idempotency
- Domains are unique per hostname across the instance (unique index); generated names unique by construction with retry.
- Route ids are stable (`domain.id`), so re-applying the same desired state produces the same Caddy config and the same content hash (no-op).
- Public port allocation is transactional with `SELECT … FOR UPDATE` on the server row; freeing on delete; ports are not reused within 60 s (soft hold) to avoid confusing clients.
- Rollups are upserted by `(service_instance_id, bucket_ts)`; a resent `MetricsBatch` after a reconnect overwrites identical values.
- Last-good Caddy config on disk survives agent restarts.

## 6. Acceptance criteria
- [ ] D4: **Generated domains, custom domains, automatic HTTPS, DNS instructions** with a live checker, and wildcard via DNS-01 (optional). AC: a custom domain goes live with a valid cert within 2 min of DNS propagating.
- [ ] D4: **TCP proxy** — enable on a database, connect from outside with the shown `host:port`, disable closes connections.
- [ ] D4: **HTTP request logs and rollups** — HTTP mode shows live rows with working filters; rollups match k6 counts within ±0.5 %.
- [ ] Every web service has a generated HTTPS address visible on the node and in the header within 1 s of becoming Active.
- [ ] A bad route never breaks existing routes: the rollback test shows zero failed requests during a rejected apply.
- [ ] `DNS_NOT_POINTED`, `TLS_FAILED` (all five reasons) and `PORT_BLOCKED` render with working fix actions.
- [ ] The DNS record card shows an A record for apexes and a CNAME for subdomains, each field copyable, and the live indicator changes without a reload.
- [ ] Target port shows the detected value, can be overridden, and the override is a staged change.
- [ ] Query strings never appear in stored HTTP logs.
- [ ] C14 passes on: Networking section (all states), add-domain dialog, DNS record card, TCP proxy card, HTTP mode, Instance → Domain & TLS, error cards.
- [ ] Deep links restore HTTP mode filters and the Networking section anchor.

## 7. Test plan
- **Unit (TS):** hostname validation (20 cases incl. IDN, wildcard, base-domain subdomain, 63-char label, uppercase); slug + suffix generation (10k names valid, alphabet excludes ambiguous chars); port allocation (lowest free, exhaustion error, concurrent allocation under transaction); HTTP filter parser subset; domain preference order for the header URL.
- **Unit (Go):** Caddy config rendering (golden JSON for 1/3/100 routes; DNS-01 policy present only with token); last-good rollback; TLS log line → reason mapping (fixtures for each reason); access log parse (fixtures from real Caddy 2.x lines incl. IPv6 and WebSocket upgrades); rollup math (p50/p95/p99 vs a reference implementation).
- **Integration (API + Postgres):** add domain → check worker schedule rows; check transitions pending → wrong_target → ok with a mocked resolver; route added only after ok; realtime `domain.updated` emitted; TCP proxy create/delete → desired state diff.
- **Integration (agent + Docker + Caddy):** apply routes and curl through Caddy; reject a bad config and assert continuity; TCP proxy end-to-end with a TCP echo container, connection cap, idle timeout.
- **E2E (Playwright):** generated domain appears on node/header; add custom domain (mock resolver in CI) → card → green → cert pill ok (mock agent status); HTTP mode filters and deep link; TCP proxy toggle and copy.
- **Visual regression:** every surface × state in §5 States × 390/1024/1440 × dark/light.
- **Accessibility:** axe on Networking section, dialog, Instance → Domain & TLS; keyboard pass through domain rows and the DNS card.
- **Manual / real VM:** the 4.13 runbook with timings.

| ID | Layer | Case | Expected |
|---|---|---|---|
| NET-01 | unit | `App.Example.com` | normalized to `app.example.com`, subdomain → CNAME card |
| NET-02 | unit | `example.com` | apex → A card |
| NET-03 | unit | `*.example.com` without Cloudflare token | error "Wildcards need a Cloudflare token…" |
| NET-04 | unit | `foo.<base domain>` | error "…generated for you…" |
| NET-05 | unit | hostname used by another service | error naming project/service |
| NET-06 | integration | resolver returns `10.0.0.5` | check result `wrong_target`, never `ok` (SSRF guard) |
| NET-07 | integration | resolver returns ingress IP | `ok`, route added, `domain.updated` emitted |
| NET-08 | agent | bad route JSON | `/adapt` rejects; last-good re-applied; curl loop zero failures |
| NET-09 | agent | Caddy restarted | last-good re-applied within 5 s |
| NET-10 | agent | 600 concurrent TCP connections | 512 served, 88 refused, counter reported |
| NET-11 | agent | idle TCP connection 10 min | closed |
| NET-12 | agent | access log line with `?token=abc` | stored path has no query |
| NET-13 | agent | 10k requests in 2 min | rollup sum within ±0.5 %; p95 within 5 ms of k6 |
| NET-14 | e2e | `status:>=500 path:/api/*` | two chips; API called with structured filter; deep link restores |
| NET-15 | e2e | remove domain | undo toast 8 s; undo restores row and route |
| NET-16 | real VM | CNAME custom domain | green within one polling interval; cert < 2 min after propagation |
| NET-17 | real VM | block 443 | `TLS_FAILED/port_blocked` within 3 min; fix opens provider card |

## 8. Evidence required to close
- Unit/integration test output (TS and Go), counts and durations.
- `docs/evidence/phase-07/real-domain.md` with `dig` timestamps and the measured propagation-to-cert time (< 2 min) for a CNAME and an apex.
- The rollback continuity curl log (zero failures) and the k6 summary next to the rollup rows for the same window.
- `psql` session transcript through the TCP proxy, then the disconnect after disabling.
- Screenshot matrix from §5 States, both themes, three widths.
- Log grep proving no query strings and no Cloudflare token in agent/API logs.

## 9. Review
SPEC H1 with Fable 5.1 on: `apps/agent/internal/caddy/*`, `tcpproxy/*`, `httplog/*`, `apps/api/src/domains/*`, `tcp-proxy/allocate.ts`. Probe: can a workspace member add a hostname that hijacks another workspace's domain (unique index + ownership check)? Is the resolver SSRF-guarded? Can a bad route apply leave Caddy without any routes? Does route apply happen before DNS ok (rate-limit burn)? TCP proxy goroutine leaks on client half-close; access-log tailing across Caddy rotation; port-range exhaustion behaviour. SPEC H2 on the screenshot matrix, checking that the DNS record card is the single most prominent element while a domain is pending and that pills never rely on color alone.

## 10. Risks & open questions
- **Risk:** Let's Encrypt rate limits (50 certificates per registered domain per week) hit on the shared sslip.io fallback → **Mitigation:** ZeroSSL fallback is configured; the UI shows the limits note; the DECISIONS entry records the checked limit values and date.
- **Risk:** Mapping access-log lines to services depends on a Caddy feature (`log_append` / per-route logger names) whose availability varies by version → **Mitigation:** pin the Caddy version in Phase 0/11; spike both mechanisms in session 4 before committing; record the choice.
- **Risk:** Users behind CDN proxies (proxied Cloudflare records) get HTTP-01 challenges answered by the CDN → **Mitigation:** detect a CNAME chain ending at a known CDN and show "Turn off proxying for this record while the certificate is issued" in the card.
- **Risk:** `X-Forwarded-For` spoofing when the ingress is behind another proxy → **Mitigation:** `trusted_proxies` configurable in Instance → Domain & TLS; default none.
- **Open question:** Should generated domains be created for `worker`/`cron` kinds? Default: no; "Generate domain" remains available.
- **Open question:** Should the header URL prefer a custom domain while its certificate is pending? Default: prefer the first domain with `tls_status = ok`.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries: generated-name alphabet, checker schedule, ACME-after-DNS rule, access-log mapping mechanism, Caddy build with Cloudflare module, TCP proxy limits, sslip.io limits
- [ ] `docs/UI_DECISIONS.md` updated with the §5 screenshot matrix
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 07 — Public networking</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md,
docs/phases/PHASE-07-public-networking.md, and these SPEC sections: B9, B6 (domains,
tcp_proxies, http_log_rollups), B13, C5 (DNS record card, Port check card), C7.6, C7.7,
C7.11 HTTP mode, C7.12 Networking, C9, C10, D4, J5, J6 (DNS_NOT_POINTED, TLS_FAILED,
PORT_BLOCKED).
</context>
<goal>Every web service gets a working HTTPS address when Active; a user adds their own
domain, watches the live checker turn green and gets a certificate within 2 minutes of
DNS propagating; databases can be reached through an opt-in public TCP port.</goal>
<scope>
- Base domain settings (custom wildcard or IP fallback), generated domains with 4-char suffix
- Caddy route compilation in desired state, validated apply with last-good rollback, TLS status reporting
- Custom domains: validation, DNS record card (A/CNAME), live checker schedule, ACME only after DNS ok, Cloudflare DNS-01 for wildcards
- Target port (detected / override, staged), TCP proxy (20000–29999, agent Go proxy with caps)
- Caddy JSON access logs → per-service HTTP logs + 1-minute rollups; Logs tab HTTP mode with filters
- Networking settings section, header/node URL wiring, error cards DNS_NOT_POINTED / TLS_FAILED / PORT_BLOCKED
- Real-domain acceptance runbook
</scope>
<out_of_scope>
- Private networking, mesh DNS, cross-server load balancing (Phase 12)
- Metrics charts on the rollups (Phase 8)
- Sleeping wake route (Phase 16); setup wizard domain step UI (Phase 11)
</out_of_scope>
<acceptance_criteria>
Every item in PHASE-07-public-networking.md §6, including: custom domain live with a valid
cert within 2 minutes of DNS propagating; a rejected route apply causes zero failed
requests; rollups match k6 within ±0.5 %; query strings never stored; C14 passes on every
listed surface.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, protocol changes (Route, RouteStatus, TcpProxy,
   HttpRollup messages), the access-log mapping spike, risks, test plan, open questions.
   STOP and wait for approval.
2. Implement in small steps; run code and tests after each step, including the Go agent
   tests against real Docker and Caddy.
3. For UI: screenshots at 390/1024/1440 × dark/light × key states (domains list states,
   DNS card states, TCP card, HTTP mode, Instance Domain & TLS, error cards); critique
   against SPEC C14; fix before reporting.
4. Report: what works (with evidence incl. the real-domain timings), what doesn't,
   deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md.
</process>
```
