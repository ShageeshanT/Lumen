# Decisions

One entry per decision. Newest at the bottom. Format: date · decision · why ·
alternatives rejected. Mark unresolved items **OPEN** with the default that applies
until someone decides.

---

## 0001 · 2026-09-26 · Documentation layout
**Decision:** The spec lives at `docs/SPEC.md` and is the single source of truth.
Each build phase has one document at `docs/phases/PHASE-NN-<slug>.md` following
`docs/phases/_TEMPLATE.md`. Evidence (screenshots, test output) goes under
`docs/evidence/phase-NN/`.
**Why:** SPEC §0.1 asks for this layout; a fixed template keeps every phase
reviewable against the same checklist.
**Rejected:** a single PLAN.md (too long to load per session); issues in GitHub only
(loses the detail checklists the build depends on).

## 0002 · 2026-09-26 · Commit identity
**Decision:** All commits and pushes are authored by the repository owner using the
configured git identity. No AI attribution trailers ("Co-Authored-By", "Generated
with") in commits, pull requests or files.
**Why:** Owner's instruction.
**Rejected:** default tool attribution trailers.

## 0003 · 2026-09-26 · Parity target and visual identity — **OPEN**
**Decision (default):** Railway is the feature and UX parity target: its feature set
and interaction structure are replicated (canvas + inspector, staged changes, ⌘K,
environments, PR environments, templates, observability, CLI, MCP). Visual tokens
stay Lumen's own as defined in SPEC C4 ("calm graphite + aurora teal", Geist Sans /
Geist Mono, Lucide icons).
**Why:** SPEC C2 requires an original visual identity; the owner asked for a replica
of the reference product's UI and features. Structure and features can be replicated
without copying trade dress. Tokens are centralized (Phase 1), so changing the
palette later is a one-file change.
**Open:** confirm whether the accent palette should stay teal or change. Until
decided, SPEC C4 tokens apply.
**Rejected:** copying the reference product's palette, type and brand assets
outright.

## 0004 · 2026-09-26 · Phase order
**Decision:** Phases follow SPEC Part F order 0–18. Backend phases 2–4 (agent,
deploy engine, control plane) come before the first dashboard phase 5.
**Why:** SPEC B2: the dashboard talks only to the public API, so UI pages need real
endpoints and realtime events. Building the UI against a mock layer first would be
built twice. Phase 1 (design system with a live component gallery) still lands the
visual identity early.
**Rejected:** UI-first with a mock API (double work, mock drift); strict
"vertical slice" per feature (breaks the agent/protocol design into fragments that
are expensive to redo).

## 0005 · 2026-09-26 · Phase 0 dependencies and licenses
**Decision:** Every dependency added in Phase 0, with the license read from the
installed package. Versions are pinned once in `pnpm-workspace.yaml` (`catalog:`).

| Package | Version | License | Role |
|---|---|---|---|
| next | 16.3.6 | MIT | Dashboard framework |
| react, react-dom | 19.3.0 | MIT | UI runtime |
| typescript | 5.9.3 | Apache-2.0 | See 0010 |
| tailwindcss, @tailwindcss/postcss | 4.3.3 | MIT | See 0006 |
| geist | 1.7.2 | SIL OFL 1.1 (fonts) | Geist Sans and Mono, self-hosted |
| hono, @hono/node-server | 4.13.9, 2.1.1 | MIT | API framework |
| @hono/zod-openapi, zod | 1.6.3, 4.6.5 | MIT | Validation and OpenAPI |
| @scalar/hono-api-reference | 0.12.6 | MIT | See 0009 |
| pino | 10.3.1 | MIT | Structured logging with redaction |
| drizzle-orm, drizzle-kit | 0.45.3, 0.31.11 | Apache-2.0, MIT | ORM and migrations |
| pg | 8.23.0 | MIT | See 0008 |
| @bufbuild/protobuf | 2.15.0 | Apache-2.0 AND BSD-3-Clause | Protobuf runtime (TS) |
| google.golang.org/protobuf | 1.36.12 | BSD-3-Clause | Protobuf runtime (Go) |
| ulid | 3.0.2 | MIT | See 0012 |
| turbo | 2.11.4 | MIT | Task runner |
| vitest, @vitest/coverage-v8 | 5.0.2 | MIT | Unit tests and coverage |
| @playwright/test | 1.63.0 | Apache-2.0 | E2E and screenshots |
| @axe-core/playwright, axe-core | 4.13.0 | MPL-2.0 | Accessibility checks, dev-only (see note) |
| eslint | 10.11.0 | MIT | See 0011 |
| typescript-eslint | 8.70.1 | MIT | Type-aware lint |
| eslint-plugin-react-hooks | 7.1.1 | MIT | Hooks rules |
| @next/eslint-plugin-next | 16.3.6 | MIT | Core web vitals rules |
| eslint-plugin-jsx-a11y | 6.10.2 | MIT | Accessibility lint |
| eslint-plugin-import-x | 4.17.1 | MIT | Import ordering |
| @eslint-community/eslint-plugin-eslint-comments | 4.8.1 | MIT | Disable-comment hygiene |
| eslint-config-prettier | 10.1.8 | MIT | Prettier compatibility |
| prettier, prettier-plugin-tailwindcss | 3.9.9, 0.8.1 | MIT | Formatting |
| simple-git-hooks, lint-staged | 2.14.0, 17.6.0 | MIT | See 0014 |
| tsup, tsx | 8.5.1, 4.23.15 | MIT | API bundling and dev runner |
| @testing-library/react, jest-dom, dom | 16.3.3, 7.0.1, 10.4.2 | MIT | Component tests |
| jsdom, msw | 30.1.1, 2.15.0 | MIT | Browser environment and request mocking |
| @vitejs/plugin-react | 6.1.1 | MIT | JSX in Vitest |
| postgres:16-alpine | digest `721873c3…` | PostgreSQL License | Development database (see 0016) |
| buf, golangci-lint (tools) | 1.73.0, 2.14.0 | Apache-2.0, GPL-3.0 (tool only) | Codegen and Go lint; never linked into shipped code |

**Note on MPL-2.0 / GPL tools:** axe-core is a development dependency used only in
tests; golangci-lint is a build-time tool. Neither ships in Lumen's binaries or
images. Every runtime dependency is MIT, Apache-2.0, BSD or SIL OFL.
**Why:** CLAUDE.md `<never>`: no dependency without a license and maintenance
check. All packages are actively maintained (releases within the last three months
at the time of pinning).

## 0006 · 2026-09-26 · Tailwind CSS v4
**Decision:** Tailwind v4 through `@tailwindcss/postcss`, with design tokens
declared in a CSS `@theme` block.
**Why:** v4's CSS-first tokens map one-to-one onto the CSS custom properties Phase 1
defines, removing the `tailwind.config.js` indirection. Stable since January 2025.
**Rejected:** Tailwind v3 (JS config duplicates the token source); no utility
framework (slower UI iteration, no class sorting).

## 0007 · 2026-09-26 · Hono with Zod-derived OpenAPI
**Decision:** The API is Hono on `@hono/node-server`; routes are declared with
`@hono/zod-openapi` so Zod schemas produce the OpenAPI document and the `/v1/docs`
page. Zod 4 (the plugin's peer range is `^4`).
**Why:** SPEC tech stack; the control plane must idle under 512 MB (B14), and Hono
is far lighter than Nest or Express-plus-middleware while giving typed routes.
**Rejected:** Fastify (heavier, its own schema format); Express (no typing, no
OpenAPI without a second source of truth).

## 0008 · 2026-09-26 · `pg` driver
**Decision:** node-postgres (`pg`) with a pool of 10, 30 s idle timeout and a 5 s
connection timeout; Drizzle on top.
**Why:** Phase 4's queue (pg-boss) uses the same driver, so one pool implementation
serves the whole control plane.
**Rejected:** postgres.js (would mean two drivers once the queue arrives).

## 0009 · 2026-09-26 · Scalar for the API reference page
**Decision:** `/v1/docs` serves Scalar's API reference (`@scalar/hono-api-reference`).
**Why:** MIT, one dependency, renders dark by default, lighter than Swagger UI.
**Rejected:** Swagger UI (heavier, dated styling); Redoc (no try-it-out).

## 0010 · 2026-09-26 · TypeScript 5.9 rather than 7
**Decision:** Pin TypeScript 5.9.3.
**Why:** typescript-eslint 8.70 supports `>=4.8.4 <6.1.0`; TypeScript 7 (the native
compiler) is outside that range and Next's type plugin has not been validated
against it. Revisit when typescript-eslint declares support.
**Rejected:** TypeScript 7.0.2 (lint toolchain unsupported).

## 0011 · 2026-09-26 · ESLint 10 with a peer allowance for jsx-a11y
**Decision:** ESLint 10.11.0, `typescript-eslint` `strictTypeChecked` and
`stylisticTypeChecked`, `projectService` for type-aware rules across the repo,
`no-explicit-any` and `no-non-null-assertion` as errors, `import-x/order` for import
grouping. `eslint-plugin-jsx-a11y` declares peers only up to ESLint 9, so
`pnpm-workspace.yaml` allows ESLint 10 for it; its flat configs work unchanged.
**Why:** ESLint 9 is marked unsupported on npm ("This version is no longer
supported"). Zero peer warnings on install was a Phase 0 criterion.
**Rejected:** ESLint 9.39.5 (unsupported); eslint-import-resolver-typescript
(TypeScript already resolves modules; the import plugin only orders imports).

## 0012 · 2026-09-26 · Prefixed ULID ids
**Decision:** Every row id is `<prefix>_<ulid>` in lowercase (`prj_01j8…`),
generated in application code by `newId()` in `@lumen/shared`, monotonic within a
process. Prefixes: usr, ws, srv, prj, env, svc, dep, var, vol, dom, tpl, tok, req.
**Why:** Readable in logs and URLs; the API rejects an id of the wrong kind early;
time-ordered for cheap "recent" queries.
**Rejected:** UUIDv4 (not sortable, not readable); serial integers (enumerable,
leak counts).

## 0013 · 2026-09-26 · Generated protobuf code is committed
**Decision:** `packages/protocol/gen` (Go and TypeScript from `buf generate` with
remote plugins) is committed. CI regenerates and fails on any diff.
**Why:** Go and TypeScript consumers never need a local buf install; reviews see the
generated diff. `PROTOCOL_VERSION` is a one-line file; tests in both languages
assert the constants match it. Envelope payload numbers start at 10 and are only
appended.
**Rejected:** generating in CI only (every clone needs buf and network access).

## 0014 · 2026-09-26 · simple-git-hooks and lint-staged
**Decision:** `simple-git-hooks` installs a pre-commit hook running `lint-staged`:
ESLint with `--fix --max-warnings=0` and Prettier on JS/TS, Prettier on JSON, MD,
YAML and CSS, gofmt plus golangci-lint on Go, `buf format` on proto.
**Why:** Zero-dependency hook manager keeps `pnpm install` fast; fixes land before
CI sees them.
**Rejected:** husky (more moving parts); commit-message linting (convention, not
enforcement).

## 0015 · 2026-09-26 · Renovate
**Decision:** `renovate.json` extends `config:recommended`, pins everything except
peers, pins Docker digests, groups non-major updates weekly. The Renovate app must
be installed on the repository by the owner; until then the file is inert.
**Why:** Groups pnpm workspace updates into one PR, handles `go.mod` and Docker
digests in the same run. Dependabot is not added so two bots do not double the PRs.
**Rejected:** Dependabot (no digest pinning, no grouping across ecosystems).

## 0016 · 2026-09-26 · Postgres 16 pinned by digest
**Decision:** `postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`
(the multi-arch index digest) in `docker-compose.dev.yml` and the CI service
container. The compose host port is `${PG_PORT:-5432}` so a machine with a local
Postgres on 5432 can publish on another port through `.env`.
**Why:** Reproducible dev and CI databases (Renovate updates the digest).

## 0017 · 2026-09-26 · `packages/protocol` is its own Go module
**Decision:** Three Go modules (`apps/agent`, `apps/cli`, `packages/protocol`)
joined by a root `go.work`. Root scripts use explicit patterns
(`./apps/agent/... ./apps/cli/... ./packages/protocol/...`) because `./...` from
a workspace root that is not itself a module matches nothing.
**Why:** The agent and CLI import one copy of the generated protocol code without
importing each other's internals.

## 0018 · 2026-09-26 · `instance_settings` uses `key` as primary key
**Decision:** SPEC B6 says every table has `id`, `created_at`, `updated_at`; the
instance settings table is a natural key-value store, so `key text primary key`
replaces `id`. The timestamps remain.
**Why:** A surrogate id on a key-value table only adds a unique index.

## 0019 · 2026-09-26 · snake_case JSON in the API
**Decision:** Response and request fields are snake_case (`uptime_s`,
`desired_state_version`), matching SPEC J1 and the protobuf field names.
**Why:** One naming convention across API, protocol and database columns.

## 0020 · 2026-09-26 · Workspace packages are consumed as TypeScript source
**Decision:** `@lumen/shared`, `@lumen/db`, `@lumen/protocol` and `@lumen/ui` export
`.ts` files directly. Next compiles them through `transpilePackages`; the API is
bundled by tsup with `noExternal: [/^@lumen\//]`; tests import them as source.
**Why:** No build step or watch process per package; one TypeScript program per
consumer. Turborepo caching still applies to the apps' builds.
**Rejected:** per-package `tsc` builds with project references (slower inner loop,
stale `dist` bugs).

## 0021 · 2026-09-26 · Vitest 5 `projects` instead of a workspace file
**Decision:** A root `vitest.config.ts` lists `test.projects`; each package has its
own `vitest.config.ts`. Coverage thresholds (90 % lines) are enforced in
`@lumen/shared` and `@lumen/db` on every run (`coverage.enabled: true`).
**Why:** Vitest 5 removed `vitest.workspace.ts`.

## 0022 · 2026-09-26 · Playwright projects and screenshot baselines
**Decision:** Six Playwright projects (`desktop`, `tablet`, `mobile` × `dark`,
`light`; 1440×900, 1024×768, 390×844) with `maxDiffPixelRatio: 0.002` and baselines
under `e2e/__screenshots__/`. `turbo run test` excludes the `e2e` package; the suite
runs with `pnpm --filter e2e test`. Baselines are captured on Windows; CI runs the
smoke test with `--ignore-snapshots` until Linux baselines are generated in Phase 1.
**Why:** Font rasterization differs between Windows and Linux, so a single baseline
set would fail on one of them.

## 0023 · 2026-09-26 · errcheck excludes `fmt.Fprint*`
**Decision:** golangci-lint's errcheck ignores the return values of `fmt.Fprint`,
`fmt.Fprintf` and `fmt.Fprintln`.
**Why:** Writes to stdout and stderr in a CLI have no useful recovery path; checking
them adds noise without safety.

## 0024 · 2026-09-26 · Next.js agent rules disabled
**Decision:** `agentRules: false` in `next.config.ts`.
**Why:** Next 16 otherwise writes `AGENTS.md` and `CLAUDE.md` into `apps/web` on
every dev run; the repository root already carries the project context.
