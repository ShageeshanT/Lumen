# Progress

_Updated: 2026-09-26_

## Current phase
Phase 1 — Design direction and design system. In progress (sessions 1–2 of 7
done: three directions produced; tokens, theme, typography, helpers and the
gallery foundations built). **Blocked on the owner's direction pick** (see
`docs/design/directions/README.md`). Phase 0 awaits its cross-model review
(SPEC H1).

### Phase 1 so far (2026-09-26)
- Three direction pages with screenshots in both themes:
  `docs/design/directions/{a-instrument,b-studio,c-console}.html`.
- `@lumen/ui`: color tokens for both themes with the `-text` / `-fill` / `-ink`
  tiers, typography, spacing, radius, elevation, z-index and motion tokens; the
  no-flash theme script, `ThemeProvider` and `useTheme` (system / dark / light,
  OS-follow, cross-tab sync); named text styles with a test that checks
  `text.css` against the usage table; `cn`, format, truncation and contrast
  helpers; the `Text` component. 84 unit tests.
- A contrast test parses `colors.css` and enforces 4.5:1 for every text token on
  every surface and 3:1 for non-text status colors; it caught two light tokens the
  phase document had wrong (recorded in `docs/UI_DECISIONS.md`).
- The web app now imports tokens and styles from `@lumen/ui` with a Tailwind
  `@theme inline` mapping; the gallery has a nav, theme toggle, a live Tokens page
  (contrast table computed from the CSS variables) and a Typography page.
- Playwright `theme.spec.ts`: no flash at 6× CPU throttle for stored dark/light,
  live OS-follow in system mode, and utilities resolving to token values.

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
1. **Owner:** pick a direction (A, B, C, or a combination) from
   `docs/design/directions/`; record it in `docs/UI_DECISIONS.md` (Phase 1 §4.2)
   and confirm or replace the §5 proposals against it.
2. Phase 1 sessions 3–7: icons, then components group by group (buttons, form
   controls, overlays, navigation, feedback, status, data display, specialized),
   the gallery registry and the screenshot / axe / keyboard specs.
3. Cross-model review of Phase 0 with SPEC H1 and of Phase 1 with SPEC H2.
4. Decide `docs/DECISIONS.md` 0003 (accent palette) alongside the direction pick.

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
