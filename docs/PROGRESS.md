# Progress

_Updated: 2026-09-26_

## Current phase
Phase 1 — Design direction and design system. In progress (sessions 1–2 of 7
done). **Direction chosen: D "Signal"** (owner's reference images, 2026-09-26),
and its tokens, type, surfaces and motion are live in `@lumen/ui`. Phase 0
awaits its cross-model review (SPEC H1).

### Phase 1 so far (2026-09-26)
- Four direction pages in `docs/design/directions/`; D "Signal" chosen, with
  screenshots in both themes and a motion capture (`d-signal-motion.webm`).
- `@lumen/ui` carries the Direction D palette (both themes, `-text` / `-fill` /
  `-ink` tiers, glow and grid tokens), Geist Pixel display type, uppercase mono
  chrome styles, square radii, entrance/draw/flow/breathe/blink keyframes with
  full reduced-motion support, and the surface utilities `.hud`, `.bg-grid`,
  `.bg-vignette`, `.glow-field`, `.boot`, `.blink`.
- Theme script, `ThemeProvider` and `useTheme` (system / dark / light, OS-follow,
  cross-tab sync); named text styles checked against the usage table; `cn`,
  format, truncation and contrast helpers; the `Text` component. 88 unit tests.
- Contrast test parses `colors.css`: every text token 4.5:1 and every status
  color 3:1 on all four surfaces in both themes.
- Gallery: Tokens (live contrast table), Typography, Signal surfaces pages.
- Playwright: smoke + theme specs, 42 runs across 6 projects, including no-flash
  at 6× CPU throttle and a guard that color utilities override text styles.

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
1. Update SPEC C4 to the Direction D values (SPEC_QUESTIONS 40–41) so the spec
   stays the source of truth before Phase 5.
2. Phase 1 sessions 3–7 in the Signal language: icons (Lucide at stroke 1.5 with
   square caps, status markers), then components group by group (buttons with
   HUD brackets, form controls, overlays, navigation, feedback, status tags,
   data display, canvas node / edge / group with leader lines and edge flow), the
   `Decode` title component, the gallery registry and the screenshot / axe /
   keyboard specs.
3. Cross-model review of Phase 0 (SPEC H1) and Phase 1 (SPEC H2).

## Known gaps
- Screenshot baselines exist for Windows only; CI runs the smoke test with
  `--ignore-snapshots` until Linux baselines are generated in Phase 1.
- First Load JS is above the Phase 0 target because of the framework floor; the
  budget is re-set per page in Phase 5 (SPEC_QUESTIONS 38).
- The Scalar docs page has not been audited with axe (third-party UI); Phase 14
  owns the API docs page.
- The Renovate GitHub App is not installed on the repository yet; `renovate.json`
  is inert until the owner installs it.
- No repository license is chosen yet; the OpenAPI document therefore has no
  `info.license` (Redocly warning, not an error).
- Cold `pnpm install` measured 93 s against a 90 s target on this machine.

## Found issues
- None outside the phase scope.
