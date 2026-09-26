# Progress

_Updated: 2026-09-26_

## Current phase
Phase 1 — Design direction and design system. Not started. Phase 0 is done and
awaits its cross-model review (SPEC H1).

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
| arm64 agent under QEMU | `lumen-agent 0.0.0-dev (455ae03, …, linux/arm64)` | prints version |

## Next
1. Cross-model review of Phase 0 with SPEC H1 (the six probes in
   `docs/phases/PHASE-00-foundations.md` §9); fix findings.
2. Remove `continue-on-error` from the `buf breaking` CI step now that `main`
   carries the first proto.
3. Decide `docs/DECISIONS.md` 0003 (visual tokens) and skim `docs/SPEC_QUESTIONS.md`.
4. Phase 1 — Design system: paste the session prompt from
   `docs/phases/PHASE-01-design-system.md` §12 into a fresh session.

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
