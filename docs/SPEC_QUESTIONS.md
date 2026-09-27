# Spec questions

Ambiguities and contradictions found in `docs/SPEC.md` while writing the phase
documents. Each row records the default the phase docs apply until the owner
decides. When a row is decided, update `docs/SPEC.md` first (SPEC §0.4), then
move the entry to `docs/DECISIONS.md`.

| # | Area | Question | Default applied | Where |
|---|---|---|---|---|
| 1 | C2 vs owner brief | C2 requires an original visual identity; the owner asked for a replica of the reference product's UI and features. | **Decided:** replicate features and interaction structure; the visual identity is Direction D "Signal", the owner's own choice, which copies no deployment platform. | DECISIONS 0003, 0030 |
| 2 | C4 vs C11 | Light `accent` `#0D9488` measures 3.74:1 on white and 3.49:1 on `#F7F7F5`, under the 4.5:1 text rule. | Add an `accent-text` tier (`#0F766E`, 5.47:1) for accent-colored text; keep `#0D9488` for fills. | Phase 1 §5, §10 |
| 3 | C4 vs C11 | Dark `text-muted` `#646C76` is 3.38:1 on `surface`. | Placeholders and disabled text only (WCAG exemption); never carries information. | Phase 1 §5 |
| 4 | C4 vs C11 | Dark `danger` and `info` fail 4.5:1 on `surface-raised` and `surface-hover`; `sleeping` fails everywhere as text. | Add `-text` variants per status color; fills keep the C4 values. | Phase 1 §5 |
| 5 | C4 | The light theme defines 8 of 18 tokens. | Phase 1 proposes the other 10 with the rule used to pick them. | Phase 1 §4 |
| 6 | C4 | No third or fourth chart series color. | Phase 1 adds `--chart-3` and `--chart-4`. | Phase 8 §10 |
| 7 | C4 vs C7.21 | OS `prefers-reduced-motion` versus the account preference: which wins. | The account preference overrides the OS setting. | Phase 1 §5 |
| 8 | C5 vs Phase 14 | "Terminal (xterm)" is listed as a Phase 1 component but xterm is Phase 14 work. | Phase 1 ships the `TerminalFrame` shell only. | Phase 1 §3 |
| 9 | C6 vs C12 | Inspector 480–880 px versus the overlay rule at 1024–1279 px leaves 88 px of canvas at the widest setting. | Overlay mode renders over a scrim, not side by side. | Phase 1 §10, Phase 5 |
| 10 | B6 | "All tables have `id`, `created_at`, `updated_at`" but `instance_settings` is key-value. | `key` is the primary key; deviation recorded. | Phase 0 §4 |
| 11 | B4 vs C7.13 | No "restoring" lifecycle state, but restore-in-place needs a visible one. | A service-level flag rendered with the ◐ glyph and "Restoring". | Phase 9 §10 |
| 12 | B11 vs D8 | Log retention: per instance, per service, or both. | Instance default with a per-service override. | Phase 8 §10 |
| 13 | B6 vs C7.11 | HTTP mode needs per-request rows; B6 defines only `http_log_rollups`. | Per-request rows are kept on the agent like runtime logs; Postgres holds rollups only. | Phase 7 §4, Phase 8 §10 |
| 14 | D8 vs C7.21 | Notifications ship in Phase 8; personal notification preferences are a Phase 15 page. | Phase 8 ships channel-level rules; personal email preferences land in Phase 15. | Phase 8 §3 |
| 15 | D5 vs J2 | "CLI tunnel" is listed under databases (Phase 9) while `lumen connect` is a Phase 14 command. | Relay endpoint in Phase 9; the command in Phase 14. | Phase 9 §3 |
| 16 | B7 vs D10 | Sealed values are never returned to clients, so `lumen run`, `variables export` and MCP cannot inject or export them. | Sealed values are excluded and listed as `# KEY (sealed)`; the CLI says so. | Phase 10 §4.9, Phase 14 |
| 17 | C2 vs D9 | Templates must name and iconize third-party apps. | Factual names and monochrome glyphs only; no third-party logos. | Phase 13 §5 |
| 18 | D9 | Licenses: n8n (Sustainable Use), Directus (BSL 1.1), Redis 7.4 (RSALv2/SSPL), MongoDB (SSPL), MinIO (AGPL) may fail the "verify before bundling" rule. | Each recorded in DECISIONS during Phase 13; Valkey is the proposed Redis alternative. | Phase 13 §10 |
| 19 | C7.19 vs D9 | The gallery has an AI category but no built-in AI template. | Category hidden while empty. | Phase 13 §10 |
| 20 | B12 vs B2 | Rate limits are required and Redis is forbidden; an in-process limiter assumes one API process. | Single API process documented; a Postgres-backed limiter is the upgrade path. | Phase 4, Phase 14 §10 |
| 21 | C13 | No shortcut for "Open shell". | `S` proposed. | Phase 14 §5 |
| 22 | C7.21 | "Apply changes immediately" is per account; a workspace may want to force staging for everyone. | Account level only, as specified. | Phase 10 §10 |
| 23 | D7 vs D2 | Whether preview environments respect a service's "wait for CI". | They do; a failing check suite yields a SKIPPED row. | Phase 10 §10 |
| 24 | H2 | The UI review prompt names no model. | Fable 5.1 reviews UI written by Opus 5.5. | Phase 1 §9 |
| 25 | J6 | Titles mix straight and curly quotes. | Kept verbatim; the catalog test must not normalise them. | Phase 0 §4 |
| 26 | E2 vs B1/B9 | The installer starts a compose-managed Caddy on the control-plane host, but that host also runs an agent that manages Caddy on every server; two instances would fight over 80/443. | The agent adopts the existing Caddy on the control-plane host; Phase 2/3 owners confirm. | Phase 11 §10 |
| 27 | E2 vs B12 | The setup token is written to `.env` in plaintext while B12 treats it as the takeover-protection credential. | Stored hashed in the database; the `.env` value is blanked after setup. | Phase 11 §5 |
| 28 | B9 | The IP-based wildcard DNS fallback is unnamed; if the chosen service is not on the Public Suffix List, Let's Encrypt limits apply to every instance at once. | Verify the service and its Public Suffix List status in Phase 7 before relying on it; document the limits. | Phase 7 §10 |
| 29 | D11/C7.16 vs B6 | Per-project access overrides have UI and a permission but no table. | Phase 15 adds `project_access_overrides`. | Phase 15 §4 |
| 30 | B5 vs B6/F16 | `cron_jobs[]` lives in `DesiredState` (agent-driven) while `cron_runs` and Phase 16 read as control-plane scheduling. | Control-plane scheduling with an agent `RunOnce` operation; `cron_jobs[]` kept for display. | Phase 16 §10 |
| 31 | D6 vs B6/E6 | Cloud provisioning lists Oracle, AWS, GCP, Hetzner, DO; the provider enum and guides include Azure. | Azure excluded from provisioning only; join and guides still cover it. | Phase 16 §3 |
| 32 | C4 vs C11 | `sleeping` `#64748B` on `surface` is under 4.5:1 for small text. | Glyph and pill only; sleeping meta text uses `text-secondary`. | Phase 16 §5 |
| 33 | 0.3 vs F18 | The final audit must be a fresh Fable 5.1 session, yet Phase 18's owner is also Fable 5.1. | Opus 5.5 applies fixes; a fresh session re-audits. | Phase 18 §9 |
| 34 | D5 vs J4 | HA Postgres needs one node per server, which the template schema cannot express. | Phase 17 adds `requires` and `resources_group` fields to the template schema. | Phase 17 §4 |
| 35 | E1 vs D5 | The 1 vCPU / 1 GB minimum for extra servers is tight for a Patroni node. | Recommend at least 1 GB per HA node and say so in the template. | Phase 17 §10 |
| 36 | Codename | "Lumen" is a codename to replace before launch, but `LUMEN_*` variables, `lumen.toml`, `lumen.internal` and the CLI name are user-facing contracts. | Keep "Lumen" for v1.0.0; the rename is an owner decision before Phase 18. | Phase 18 §10 |
| 37 | J6 vs Phase 0 test rule | The `PRE_DEPLOY_FAILED` title is two sentences ending in a period, while the catalog test forbids titles ending in a period. | Title "Your pre-deploy command failed"; "Your previous version is still live." opens the explanation. | Phase 0 §4.8, `packages/shared` |
| 38 | Phase 0 §5 | "First Load JS for `/` under 100 kB" is below the Next.js 16 + React 19.3 framework floor (about 150 kB gzipped before any Lumen code). | Record the measured baseline in PROGRESS.md; set the budget per page in Phase 5 against the framework floor. | Phase 0 §5 Performance |
| 39 | Phase 1 §5 vs C11 | The phase document's proposed light `success-text` and `warning-text` measured under 4.5:1 on `surface-hover`, and three light ratios in its table were miscalculated. | Tokens moved one ramp step darker (`#166534`, `#92400E`); the table now carries computed values and a hover column, enforced by a test. | Phase 1 §5, UI_DECISIONS |
| 40 | C4 vs owner direction | SPEC C4 defines a teal, rounded, calm-graphite look; the owner chose a HUD direction with an electric-blue accent, square corners and pixel display type. | **Decided:** Direction D replaces C4's values; C4's rules (two themes, status never by color alone, contrast, reduced motion) still apply. SPEC C4 rewritten to match (2026-09-26). | UI_DECISIONS, DECISIONS 0030 |
| 41 | C4 motion rule | "No animation over 300 ms except progress" conflicts with the chosen direction's entrance and ambient motion. | **Decided:** exception for first-load entrance, a once-per-page title decode and three slow ambient loops, all off under reduced motion. | DECISIONS 0032 |
| 42 | PHASE-02 §4.11 vs 0012/0019 | The Zod sketch uses camelCase fields and `workspaceId: uuid()`. | snake_case and `ws_…` ids. | DECISIONS 0085 |
| 43 | PHASE-02 §5 clock skew | "Connection accepted but each message is rejected" conflicts with timestamp correction from `server_time_ms` (§4.4). | Correct and surface; reject only out-of-window envelopes. | DECISIONS 0082 |
| 44 | PHASE-02 §4.3 unit | `ConditionPathExists` alone doesn't keep a revoked agent stopped under `Restart=always`. | Exit 78 + `RestartPreventExitStatus`. | DECISIONS 0084 |
| 45 | PHASE-02 §3 | "servers and server_join_tokens tables only" vs §5/§6 needing `agent_ops`, a notification row and audit entries. | Three small extra tables. | DECISIONS 0086 |
| 46 | PHASE-02 §4.6 | Port check "enqueues a job" but the queue is Phase 04. | Synchronous request returning the result. | DECISIONS 0085 |
| 47 | D1 / §6 | "Offline within 30 s": the sweep runs every 5 s over a 30 s threshold, so detection lands 30–35 s after the last heartbeat (up to 45 s after the failure, heartbeats being 10 s apart). Measured 31 s after the network was cut. | Keep 30 s threshold + 5 s sweep; read the AC as "30 s of silence". | offline-online.txt |
| 48 | D1 / §4.8 | "Paste to online < 3 min" includes installing Docker; on the test host Docker's apt install alone took 3–4 min. | Needs measuring on real 1 vCPU VMs; §10's fallback (skip buildx) not applied yet. | install transcripts |
| 49 | PHASE-02 §4.1 vs §5 | `HostSample.self` is required by §5 but missing from §4.1's list. | Added (field 15). | DECISIONS 0075 |
| 50 | SPEC J1 | Lists `POST /servers`; Phase 02 has no such route (servers come from join). | Not implemented; Phase 16 (cloud provisioning) may own it. | — |
| 51 | PHASE-02 §4.8 files | `e2e/vm/agent-install.spec.ts` (Multipass) and `apps/api/test/servers.test.ts`. | Docker-based shell harness in `e2e/vm/`; API tests next to sources (Phase 0 convention). | DECISIONS 0090 |
| 52 | PHASE-02 §4.2 | `apps/agent/.goreleaser.yaml`. | Not added: `scripts/build-go.sh` + `lumen-release sign` produce the artifacts; goreleaser is a Phase 18 release-pipeline choice. | Known gaps |
