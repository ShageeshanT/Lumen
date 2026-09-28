# Progress

_Updated: 2026-09-28_

## Current phase
**Phase 3 — Deploy engine on the agent.** In progress: protocol additions,
runtime building blocks and the reconcile loop with zero-downtime steps are on
branch `worktree-agent-a2252730cd1bb563d` (not merged). Phases 1 and 2 are done.

## Done
- 2026-09-26 — Repository initialized. Spec saved as `docs/SPEC.md`. `CLAUDE.md`
  written from SPEC Part A plus project process rules.
- 2026-09-26 — Phase documents 00–18 written under `docs/phases/`; spec
  ambiguities collected in `docs/SPEC_QUESTIONS.md`.
- 2026-09-26 — **Phase 0 — Foundations.** pnpm + Turborepo monorepo with
  `@lumen/web`, `@lumen/api`, `@lumen/db`, `@lumen/shared`, `@lumen/protocol`,
  `@lumen/ui` and `@lumen/templates` stubs, `apps/agent`, `apps/cli`, `e2e`;
  strict TypeScript base config; ESLint 10 (type-aware) + Prettier; Go workspace
  with golangci-lint; buf pipeline with the first proto (`Envelope`, `AgentHello`,
  `ControlHello`, `Ack`, `OpError`) and committed Go + TS output; Postgres 16 by
  digest in `docker-compose.dev.yml`; Drizzle with the `instance_settings`
  migration; the J6 error catalog with voice tests; prefixed ULID ids; Next.js 16
  shell with self-hosted Geist and the `data-theme` attribute; Hono API with
  `/v1/health`, `/v1/openapi.json`, `/v1/docs`, request ids, redacting logger and a
  catalog-only error handler; Vitest in every package; Playwright smoke suite in
  six viewport × theme projects with axe; GitHub Actions CI; git hooks; Renovate
  config. Evidence: `docs/evidence/phase-00/`.

- 2026-09-27/28 — **Phase 1 — Design system (Direction D "Signal").** Every
  SPEC C5 component in `@lumen/ui` with a gallery page and examples: overlays
  (command palette, dropdown/context menus, popover, modal, confirm dialog, side
  panel, sheet), navigation (tabs, breadcrumbs, environment/workspace switchers,
  rail, top bar, shell frame), feedback (toast, alert, progress steps, live
  region, empty state, error card for every catalog entry), status, data display
  (virtualized data table, uPlot chart with synced crosshair, code block,
  terminal frame, diff viewer), specialized (virtualized log viewer with ANSI,
  canvas node/volume/group/edge on React Flow, stepper, DNS and port-check
  cards), Devicon framework/database marks, provider tiles, the decode title.
  Gallery with filter, density toggle and Run axe. Guards: token-only lint rule
  and CSS test (no hex, raw font size or raw z-index), React hooks rules on the
  kit. Cross-model UI review (SPEC H2, Fable 5.1) done: 36 of 38 findings fixed,
  React Flow attribution kept, phone canvas-as-list deferred (DECISIONS 0091+).
  Evidence: 360 UI unit tests; gallery screenshots per example × 6 projects
  (Windows baselines; Linux baselines rendered by the Visual baselines
  workflow); axe (WCAG 2.2 AA + best practices) clean on every page; automated
  keyboard walk; 60 fps traces for the 5,000-row table, 50,000-line log viewer
  and 100-node canvas pan (`docs/evidence/phase-01/perf/`); Button-only bundle
  21 KB gzip vs 304 KB for the whole kit (`docs/evidence/phase-01/bundle/`);
  Chromium/Firefox focus-ring and type check (`docs/evidence/phase-01/cross-browser/`).
- 2026-09-27 — **Phase 2 — Agent core and server join.** Protocol v1 with signed
  envelopes; `lumen-agent` (static amd64/arm64) with join, signed WebSocket,
  heartbeats, host metrics and disk-full flag, hardened Caddy bootstrap, port
  check, provider detection (7 providers), self-update with trial run and
  rollback, revocation; `deploy/agent-install.sh` + uninstaller (62 bats tests);
  control-plane join, `/agent/v1` gateway, offline sweep, server routes, fix
  cards, `/v1/ws`. Verified on systemd Ubuntu 24.04 and Debian 12 container
  hosts (`e2e/vm/`, `docs/evidence/phase-02/`). DECISIONS 0073–0090.

## Baselines (Phase 0, dev machine: Windows 11, Node 24.11, pnpm 11.14, Go 1.26)

| Measure | Value | Target (SPEC / Phase 0) |
|---|---|---|
| API idle RSS, production bundle (`node dist/index.js`) | 64.3 MB | < 80 MB |
| API idle RSS under `tsx watch` (dev) | 83.7 MB | informational |
| Web First Load JS for `/` | 553.7 KB raw · 169.8 KB gzip (7 chunks; Lumen code < 1 KB, the rest is the Next 16 + React 19 runtime) | < 100 kB (see SPEC_QUESTIONS 38) |
| `pnpm typecheck` (7 packages) | 7.1 s | < 30 s |
| `pnpm turbo run lint` (7 packages) | 16 s | < 60 s |
| Cold `pnpm install` | 93 s | < 90 s (three seconds over; postinstall builds dominate) |
| Second `pnpm build` | 103 ms, FULL TURBO | cache hit |
| Playwright smoke, 6 projects | 5.7 s, all passing | green |
| CI on `main` (lint, typecheck, test, build web, Go with QEMU arm64, protobuf, E2E smoke) | green in 1.2 min: https://github.com/ShageeshanT/Lumen/actions/runs/36250769849 | green, under 10 min |
| arm64 agent under QEMU | `lumen-agent 0.0.0-dev (455ae03, …, linux/arm64)` | prints version |
| Fresh clone → `db: ok` following README.md | 23 s (clone 5 s, install 9 s with a warm store, infra 2 s, API ready 5 s, web ready 2 s) | < 5 min |

## Next
1. Finish Phase 3 (deploy engine): Docker runtime and hardening, Caddy routes,
   zero-downtime swap, crash loops, BuildKit + Railpack builds, log streaming
   and scrubbing, port detection, metrics, GC, chaos and host verification.
2. Commit the Linux gallery baselines from the Visual baselines workflow run.
3. Cross-model reviews: Phase 0 and Phase 2 (SPEC H1; H4 on the agent registry).
4. Real-VM runs (Hetzner/DO amd64, Oracle Ampere arm64) to close Phase 2's
   cloud-only criteria.

## Known gaps
- The smoke page screenshot has Windows baselines only (it needs the API and
  Postgres); CI's smoke job ignores snapshots, the Visual job checks the gallery.
- First Load JS is above the Phase 0 target because of the framework floor; the
  budget is re-set per page in Phase 5 (SPEC_QUESTIONS 38).
- The Scalar docs page has not been audited with axe (third-party UI); Phase 14
  owns the API docs page.
- The Renovate GitHub App is not installed on the repository yet; `renovate.json`
  is inert until the owner installs it.
- No repository license is chosen yet; the OpenAPI document therefore has no
  `info.license` (Redocly warning, not an error).
- Cold `pnpm install` measured 93 s against a 90 s target on this machine.
- Phase 1: canvas under 640 px should become a list (SPEC C12) — Phase 5.
  Virtualized tables (over 100 rows) keep the scrolling table on phones; a
  virtualized card list is Phase 5 work. Canvas wheel-zoom holds ~55 fps (pan
  meets 60). Provider marks are monograms until a brand-guideline review.
  Foundation pages `tokens` and `signal` overflow a 390 px phone. The
  "canvas below 100 % zoom shrinks targets under 24 px" trade-off stands.
- Phase 2: no public cloud VM was available — public reachability, metadata
  provider detection on real clouds, Oracle security lists, native Ampere arm64
  and paste-to-online under 3 min on a 1 vCPU VM are unverified (the test host
  took 3m31s–4m48s, dominated by Docker's apt install). arm64 end-to-end under
  QEMU failed (Docker never came up). The installer's 90 s proxy wait can expire
  on slow pulls. Dashboard pieces (add-server wizard, fix cards) are Phase 5;
  `rolloutAgentUpdate` has no route yet (Phase 11). bats and the host harness
  don't run in CI yet. No goreleaser config (Phase 18).
- Local development: set `DATABASE_URL` (from `.env`) when running the api/db
  tests, or the Postgres suites skip and db coverage fails its threshold.

## Found issues
- None outside the phase scope.
