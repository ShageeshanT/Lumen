# Phase 00 — Foundations

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 |
| **Depends on** | Nothing (first phase) |
| **Unblocks** | Every other phase; Phase 01 (design system) and Phase 02 (agent core) start immediately after |
| **Spec sections** | SPEC 0.1–0.4, Part A (`CLAUDE.md`), B2, B5 (handshake messages only), B6 (`instance_settings` only), B14, C4 (font choice only), Part F "Phase 0", Part G (test tooling), J6 |
| **Estimated sessions** | 3 focused sessions: (1) workspace + TS/Go tooling, (2) proto + db + shared errors, (3) web + api shells + CI |

## 1. Goal
A fresh clone runs `pnpm install && pnpm dev` and, within five minutes, serves an empty Lumen dashboard on `http://localhost:3000` with Geist loaded and a control-plane API answering `GET http://localhost:4000/v1/health` from a real Postgres, while CI is green on lint, typecheck, test, buf and Go builds for linux/amd64 and linux/arm64.

## 2. Why this phase exists
Every later phase inherits whatever this one gets wrong. A monorepo that is slow to type-check, a Go toolchain that only builds on one architecture, a proto pipeline that drifts between Go and TypeScript, or a database layer without migrations will each cost more to fix at Phase 8 than they cost to get right now. The control plane must idle under 512 MB (SPEC B14) because beginners run everything on one free-tier VM, so this phase deliberately picks light dependencies (Hono over Nest, `pg` over an ORM runtime, no Redis) and records every choice in `docs/DECISIONS.md` with the license and maintenance status checked (Part A `<never>`: no dependency without checking license and maintenance).

Nothing in this phase is user-visible except the empty shell, so the temptation is to rush it. Do not. The quality bar for this phase is "a new contributor is productive in one hour", and the way to verify that is to actually do a clean clone into a second directory and time it.

## 3. Scope
### In scope
- pnpm workspaces + Turborepo monorepo with the exact packages in SPEC `<repo_layout>`
- TypeScript strict base config shared by every TS package
- ESLint (flat config) + Prettier, one config for the whole repo
- Go workspace (`go.work`) covering `apps/agent`, `apps/cli`, `packages/protocol` (Go generated code) with `golangci-lint`
- buf-based Protobuf pipeline generating Go and TypeScript from `packages/protocol/proto`
- First proto file with the four handshake/ack messages from SPEC B5 (`AgentHello`, `ControlHello`, `Ack`, `OpError`) and an envelope
- `docker-compose.dev.yml` running Postgres 16
- Drizzle ORM setup in `packages/db` with a migration runner and one migration (`instance_settings`)
- `packages/shared` with the typed error catalog skeleton (SPEC J6) and the `LumenError` shape
- `apps/web`: Next.js App Router shell with Geist Sans + Geist Mono via `next/font`, Tailwind v4, and a `data-theme` attribute stub (no components yet)
- `apps/api`: Hono on Node with `GET /v1/health`, OpenAPI JSON generated from Zod, and a docs page
- GitHub Actions CI: lint, typecheck, test (with a Postgres service), web build, Go build matrix (linux/amd64 + linux/arm64), buf lint + breaking
- Git hooks (`simple-git-hooks` + `lint-staged`), `.editorconfig`, `.nvmrc`, `.gitignore`, `.gitattributes`
- Renovate config
- `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/UI_DECISIONS.md` confirmed present and seeded with Phase 0 entries
- `README.md` with the three-command quick start

### Out of scope
- Any design token, theme value or component (Phase 01)
- The agent's WebSocket client, heartbeat or join flow (Phase 02); this phase only makes `apps/agent` compile and print its version
- Any API route beyond `/v1/health`, `/v1/openapi.json`, `/v1/docs` (Phase 04)
- Any table beyond `instance_settings` (Phase 04)
- Authentication of any kind (Phase 04)
- Playwright e2e harness with VMs (Phase 03/05); this phase installs Playwright and adds one smoke test only
- The installer, docker-compose for self-hosting, systemd units (Phase 11)

## 4. Work breakdown

### 4.1 Root workspace
- **What:** Create the pnpm workspace and Turborepo pipeline. Root `package.json` is private, declares `"packageManager": "pnpm@11.14.0"` (matches the installed toolchain; CI reads this field) and `"engines": { "node": ">=22 <25" }`. `pnpm-workspace.yaml` lists `apps/*`, `packages/*` and `e2e`. `turbo.json` defines tasks `build` (dependsOn `^build`, outputs `.next/**`, `dist/**`, `gen/**`, `bin/**`), `dev` (cache false, persistent), `lint`, `typecheck` (dependsOn `^build` so generated proto types exist), `test` (dependsOn `^build`, env `DATABASE_URL`), `gen` (outputs `gen/**`).
- **Files:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc` (`24`), `.npmrc` (`auto-install-peers=true`, `strict-peer-dependencies=false`, `shamefully-hoist=false`), `.gitignore` (node_modules, .next, dist, .turbo, coverage, playwright-report, test-results, .env, .env.*, !.env.example, *.log, apps/agent/bin, apps/cli/bin; note `packages/protocol/gen` is deliberately **not** ignored, see 4.5), `.gitattributes` (`* text=auto eol=lf`, `*.sh text eol=lf`, `*.png binary`, `*.woff2 binary`), `.editorconfig` (utf-8, lf, final newline, 2-space indent, `[*.go]` indent_style tab, `[Makefile]` tab).
- **Root scripts (the contract every later phase relies on):**

| Script | Runs | Must be true |
|---|---|---|
| `pnpm dev` | `turbo run dev --parallel` | web on `:3000`, api on `:4000`, both hot-reload; api prints a one-line hint if Postgres on `:5432` is unreachable |
| `pnpm dev:infra` | `docker compose -f docker-compose.dev.yml up -d --wait` | Postgres healthy before returning |
| `pnpm build` | `turbo run build` | every package builds; `apps/agent` and `apps/cli` produce `bin/lumen-agent-linux-{amd64,arm64}` and `bin/lumen-linux-{amd64,arm64}` |
| `pnpm test` | `turbo run test && pnpm test:go` | Vitest in every TS package (`vitest run`), `go test ./...` in every Go module; exit code non-zero on any failure |
| `pnpm test:go` | `go test ./...` from the workspace root (uses `go.work`) | passes on Windows (dev machine) and Linux (CI) |
| `pnpm lint` | `turbo run lint && pnpm lint:go && pnpm lint:proto && pnpm format:check` | eslint clean, `golangci-lint run ./...` clean, `buf lint` clean, prettier clean |
| `pnpm typecheck` | `turbo run typecheck` | `tsc --noEmit -p tsconfig.json` in every TS package |
| `pnpm gen` | `turbo run gen` → `buf generate` in `packages/protocol` | regenerates Go + TS; `git diff --exit-code packages/protocol/gen` is clean in CI |
| `pnpm format` / `pnpm format:check` | `prettier --write .` / `prettier --check .` | |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` | forwarded to `packages/db` | |
| `pnpm build:go` / `pnpm lint:go` | `scripts/build-go.sh` / `golangci-lint run ./...` | |

- **Done when:** `pnpm install` on a clean clone completes with zero peer warnings; `pnpm turbo run build --dry=json` lists every package once.

### 4.2 TypeScript base config
- **What:** `tsconfig.base.json` at the root, extended by every TS package. Compiler options: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"noPropertyAccessFromIndexSignature": true`, `"verbatimModuleSyntax": true`, `"isolatedModules": true`, `"moduleResolution": "bundler"`, `"module": "esnext"`, `"target": "es2022"`, `"lib": ["es2023"]` (web adds `dom`, `dom.iterable`), `"skipLibCheck": true`, `"forceConsistentCasingInFileNames": true`, `"resolveJsonModule": true`. `any` is forbidden by lint, not by tsc (tsc has no such flag): see 4.3.
- **Files:** `tsconfig.base.json`; each package gets `tsconfig.json` that extends it and sets `include`, `outDir`, and `composite: true` for packages consumed by others (`packages/*`); `apps/web/tsconfig.json` adds `"plugins": [{ "name": "next" }]`, `"jsx": "preserve"`, `"paths": { "@/*": ["./src/*"] }`.
- **Done when:** `pnpm typecheck` passes in every package, and a deliberately introduced `const x: any = 1` fails `pnpm lint` (remove the line afterwards).

### 4.3 ESLint + Prettier
- **What:** One ESLint flat config at the root, `eslint.config.js`, using `typescript-eslint` with `strictTypeChecked` and `stylisticTypeChecked` presets and `parserOptions.projectService: true`. Rules turned to `error`: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion` (escape hatch: `// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- <reason>`; the description is mandatory via `@eslint-community/eslint-plugin-eslint-comments` rule `require-description`, and `linterOptions.reportUnusedDisableDirectives: "error"`), `@typescript-eslint/consistent-type-imports`, `@typescript-eslint/switch-exhaustiveness-check`, `no-console` (allowed in `apps/api/src/logger.ts` and `scripts/` only), `eqeqeq`. Web-only block adds `eslint-plugin-react-hooks` (rules-of-hooks error, exhaustive-deps error), `@next/eslint-plugin-next` core-web-vitals, `eslint-plugin-jsx-a11y` strict. Import ordering via `eslint-plugin-import-x` (`order` with groups builtin, external, internal `@lumen/**`, parent, sibling; newlines between groups; alphabetized). Prettier config: `printWidth: 100`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `tabWidth: 2`, plugin `prettier-plugin-tailwindcss` (class sorting keeps every later UI diff readable). `.prettierignore` covers `packages/protocol/gen/`, `.next/`, `dist/`, `pnpm-lock.yaml`, `docs/SPEC.md` (the spec is hand-formatted).
- **Files:** `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, per-package `"lint": "eslint ."` scripts.
- **Done when:** `pnpm lint` is clean; the ESLint run for the whole repo finishes in under 60 seconds on the dev machine (record the time in `PROGRESS.md`; if slower, split `projectService` per package).

### 4.4 Go workspace and lint
- **What:** `go.work` at the root with `go 1.26` and `use ./apps/agent ./apps/cli ./packages/protocol`. Each Go module: `apps/agent/go.mod` module `github.com/ShageeshanT/Lumen/apps/agent`, `apps/cli/go.mod` module `github.com/ShageeshanT/Lumen/apps/cli`, `packages/protocol/go.mod` module `github.com/ShageeshanT/Lumen/packages/protocol` (holds generated Go code so both binaries import one copy). Standard layout: `apps/agent/cmd/lumen-agent/main.go`, `apps/agent/internal/version/version.go` (`Version`, `Commit`, `BuildDate` set via `-ldflags "-X ..."`), `apps/cli/cmd/lumen/main.go`, `apps/cli/internal/version/version.go`. Each `main.go` parses `--version` and prints `lumen-agent <version> (<commit>, <date>, <os>/<arch>)`; everything else waits for Phase 02/14. Build script `scripts/build-go.sh` (bash; runs in Git Bash on Windows) builds `GOOS=linux GOARCH=amd64` and `GOARCH=arm64` with `CGO_ENABLED=0 -trimpath -ldflags "-s -w -X ...version.Version=..."` into `apps/<name>/bin/`. `.golangci.yml` (v2 config format, verified with `golangci-lint config verify`) enables `errcheck`, `govet`, `staticcheck`, `unused`, `ineffassign`, `errorlint` (enforces `%w` wrapping per Part A), `gosec`, `bodyclose`, `contextcheck` (context everywhere), `noctx`, `revive` with `exported` and `context-as-argument`, `gocritic`, `misspell`; `gosec` excludes G204 in `apps/cli` only where subprocess execution is intentional and commented.
- **Files:** `go.work`, `apps/agent/go.mod`, `apps/agent/cmd/lumen-agent/main.go`, `apps/agent/internal/version/version.go`, `apps/agent/internal/version/version_test.go`, `apps/cli/go.mod`, `apps/cli/cmd/lumen/main.go`, `apps/cli/internal/version/version.go`, `packages/protocol/go.mod`, `.golangci.yml`, `scripts/build-go.sh`, root `package.json` scripts `build:go`, `test:go`, `lint:go`.
- **Done when:** `pnpm build:go` produces four binaries; `file apps/agent/bin/lumen-agent-linux-arm64` reports `ELF 64-bit LSB executable, ARM aarch64, statically linked`; `docker run --rm --platform linux/arm64 -v "$PWD/apps/agent/bin:/b" debian:12-slim /b/lumen-agent-linux-arm64 --version` prints the version (QEMU emulation through Docker Desktop verifies arm64 actually runs).

### 4.5 Protobuf pipeline (buf)
- **What:** Install buf (Windows: `scoop install buf` or the release binary on PATH; CI: `bufbuild/buf-setup-action`). `packages/protocol/buf.yaml` (v2): module path `proto`, lint `STANDARD` with `RPC_REQUEST_STANDARD_NAME` and `SERVICE_SUFFIX` disabled (no RPCs; this is a message protocol over WebSocket), breaking `FILE`. `packages/protocol/buf.gen.yaml` (v2) with `managed.enabled: true` and `go_package_prefix: github.com/ShageeshanT/Lumen/packages/protocol/gen/go`; plugins: `buf.build/protocolbuffers/go` → `gen/go` (`paths=source_relative`), `buf.build/bufbuild/es` (protobuf-es v2) → `gen/ts` (`target=ts`, `import_extension=js`). `packages/protocol/package.json` name `@lumen/protocol` exports `./agent/v1` → `./gen/ts/lumen/agent/v1/agent_pb.ts`; depends on `@bufbuild/protobuf`. Decision recorded: generated code **is committed** (`packages/protocol/gen` is not gitignored) so Go and TS consumers never depend on a local buf install; CI verifies `pnpm gen && git diff --exit-code packages/protocol/gen`.
- **First proto** `packages/protocol/proto/lumen/agent/v1/agent.proto` (`syntax = "proto3"; package lumen.agent.v1;`):
  - `message AgentHello { string server_id = 1; string agent_version = 2; uint32 protocol_version = 3; string os = 4; string arch = 5; uint32 cpu_cores = 6; uint64 memory_bytes = 7; uint64 disk_bytes = 8; string docker_version = 9; string public_ip = 10; }`
  - `message ControlHello { bool accepted = 1; uint64 desired_state_version = 2; AgentConfig config = 3; string reject_reason = 4; }` with `message AgentConfig { uint32 heartbeat_interval_s = 1; uint32 metrics_interval_s = 2; uint32 log_retention_days = 3; }`
  - `message Ack { string op_id = 1; }`
  - `message OpError { string op_id = 1; string code = 2; string message = 3; }`
  - `message Envelope { string op_id = 1; google.protobuf.Timestamp timestamp = 2; oneof payload { AgentHello agent_hello = 10; ControlHello control_hello = 11; Ack ack = 12; OpError op_error = 13; } }` (payload field numbers start at 10 so Phase 02/03 add `Heartbeat`, `DesiredState`, `ActualState`, `BuildRequest`, `BuildEvent`, `LogChunk`, `MetricsBatch` at 14+ without renumbering; document this rule in a comment at the top of the file)
  - `PROTOCOL_VERSION` is defined in `packages/protocol/version.go` and `packages/protocol/src/version.ts` as `1`, with a test in each language asserting equality with the value in `packages/protocol/PROTOCOL_VERSION` (a one-line text file, the single source).
- **Files:** `packages/protocol/buf.yaml`, `packages/protocol/buf.gen.yaml`, `packages/protocol/proto/lumen/agent/v1/agent.proto`, `packages/protocol/gen/go/lumen/agent/v1/agent.pb.go` (generated), `packages/protocol/gen/ts/lumen/agent/v1/agent_pb.ts` (generated), `packages/protocol/package.json`, `packages/protocol/tsconfig.json`, `packages/protocol/src/version.ts`, `packages/protocol/src/version.test.ts`, `packages/protocol/src/roundtrip.test.ts`, `packages/protocol/version.go`, `packages/protocol/version_test.go`, `packages/protocol/roundtrip_test.go`, `packages/protocol/testdata/agent_hello.bin`, `packages/protocol/PROTOCOL_VERSION`.
- **Done when:** `pnpm gen` is idempotent (second run produces no diff); a Go test round-trips an `Envelope{AgentHello}` through `proto.Marshal`/`Unmarshal` and writes `testdata/agent_hello.bin`; a Vitest test loads that fixture with `fromBinary`, re-encodes with `toBinary`, and asserts byte equality (deterministic serialization is enabled on both sides).

### 4.6 Postgres for development
- **What:** `docker-compose.dev.yml` with one service `postgres` using image `postgres:16-alpine` pinned by digest (`postgres:16-alpine@sha256:<digest>`; look up the current digest with `docker manifest inspect` when adding and record it in `DECISIONS.md`), `POSTGRES_USER=lumen`, `POSTGRES_PASSWORD=lumen`, `POSTGRES_DB=lumen`, port `5432:5432`, named volume `lumen_pg_dev`, `healthcheck: pg_isready -U lumen` every 5s, `command: postgres -c log_statement=none -c shared_buffers=128MB`. `.env.example` at the root with `DATABASE_URL=postgres://lumen:lumen@localhost:5432/lumen`, `API_PORT=4000`, `WEB_ORIGIN=http://localhost:3000`, `NEXT_PUBLIC_API_URL=http://localhost:4000`, `LOG_LEVEL=info`. Dev-only credentials are acceptable here and only here; the self-host compose in Phase 11 generates secrets.
- **Files:** `docker-compose.dev.yml`, `.env.example`.
- **Done when:** `pnpm dev:infra` returns only after the healthcheck passes; `psql "$DATABASE_URL" -c 'select 1'` works.

### 4.7 Database package (Drizzle)
- **What:** `packages/db` (`@lumen/db`) with `drizzle-orm` + `pg` (node-postgres; chosen over postgres.js because pg-boss in Phase 04 shares the same driver and pool) + `drizzle-kit`. `src/client.ts` exports `createDb(connectionString)` returning `{ db, pool }` with a pool max of 10 and `idleTimeoutMillis: 30_000`. `src/schema/index.ts` re-exports every table file. `src/schema/instance_settings.ts`: `instance_settings` with `key text primary key`, `value jsonb not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (SPEC B6 says all tables have `id`, `created_at`, `updated_at`; for this key-value table `key` is the primary key and the deviation is recorded in `DECISIONS.md`). `src/columns.ts` exports the shared `timestamps()` helper (`created_at`, `updated_at`) and `id(prefix)` helper (`text` primary key; value generated in app code with `newId(prefix)` from `@lumen/shared`) so every later table is uniform. `drizzle.config.ts` (`dialect: "postgresql"`, `schema: "./src/schema/index.ts"`, `out: "./migrations"`). `src/migrate.ts` runs `migrate(db, { migrationsFolder })` and is the entry for `pnpm db:migrate`; it is also imported by `apps/api` on boot when `RUN_MIGRATIONS_ON_BOOT=true` (self-host default, Phase 11). First migration generated by `drizzle-kit generate --name instance_settings` and committed as `migrations/0000_instance_settings.sql` plus the `meta/` journal.
- **Files:** `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/client.ts`, `packages/db/src/columns.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/schema/instance_settings.ts`, `packages/db/src/migrate.ts`, `packages/db/src/index.ts`, `packages/db/migrations/0000_instance_settings.sql`, `packages/db/migrations/meta/_journal.json`, `packages/db/migrations/meta/0000_snapshot.json`, `packages/db/src/schema.test.ts` (Vitest with a real Postgres from `DATABASE_URL`: creates a throwaway schema per run, runs migrations, inserts and reads one row, drops the schema).
- **Done when:** `pnpm db:migrate` on an empty database creates the table; running it again is a no-op; the Vitest test passes locally and in CI's Postgres service container.

### 4.8 Shared package: error catalog and ids
- **What:** `packages/shared` (`@lumen/shared`) with `src/errors/types.ts`: `LumenErrorCode` string-literal union of every SPEC J6 code (`PORT_BLOCKED`, `AGENT_OFFLINE`, `DISK_FULL`, `OOM_KILLED`, `CRASH_LOOP`, `HEALTHCHECK_TIMEOUT`, `NO_START_COMMAND`, `BUILD_LOCKFILE_MISSING`, `BUILD_FAILED_GENERIC`, `PRE_DEPLOY_FAILED`, `VARIABLE_REF_MISSING`, `VARIABLE_REF_CYCLE`, `DNS_NOT_POINTED`, `TLS_FAILED`, `IMAGE_PULL_AUTH`, `GITHUB_ACCESS_REVOKED`, `SERVER_CAPACITY`, `VOLUME_FULL`, `BACKUP_FAILED`, `MESH_UNREACHABLE`) plus the infrastructure codes the API needs from day one (`VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `RATE_LIMITED`, `INTERNAL`). `LumenError` interface: `{ code: LumenErrorCode; title: string; explanation: string; fix: string; action: ErrorAction; raw?: string; supportId?: string }` with `ErrorAction = { kind: "none" } | { kind: "link"; label: string; href: string } | { kind: "button"; label: string; actionId: ErrorActionId } | { kind: "command"; label: string; command: string }`. `src/errors/catalog.ts`: a `Record<LumenErrorCode, (ctx: ErrorContext) => Omit<LumenError, "code">>` where each entry's `title` is the exact J6 wording (`"Port 443 is blocked on your server"` takes `ctx.port`; `"Server 'x' isn't responding"` takes `ctx.serverName`). `src/errors/index.ts` exports `makeError(code, ctx)`, `isLumenError`, and `LumenHttpError` (extends `Error`, carries `status` and a `LumenError`). `src/ids.ts` exports `newId(prefix)` (ULID, monotonic within a process; prefixes `usr`, `ws`, `srv`, `prj`, `env`, `svc`, `dep`, `var`, `vol`, `dom`, `tpl`, `tok`, `req`) so Phase 04 has a single ID scheme.
- **Files:** `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/errors/types.ts`, `packages/shared/src/errors/catalog.ts`, `packages/shared/src/errors/index.ts`, `packages/shared/src/errors/catalog.test.ts`, `packages/shared/src/ids.ts`, `packages/shared/src/ids.test.ts`.
- **Done when:** the catalog test asserts every `LumenErrorCode` has an entry, no title ends with a period, no title starts with "Error" or "Failed" (voice rule C9: no blame; `BUILD_FAILED_GENERIC` is titled "Your build failed" and passes), no explanation exceeds 200 characters, and every `action.label` starts with a verb from an allowlist (`Fix`, `Open`, `Show`, `Increase`, `Set`, `Add`, `Reconnect`, `Retry`, `Test`, `Clean`, `View`, `Move`, `Copy`, `Recheck`, `Jump`).

### 4.9 Web shell (Next.js)
- **What:** `apps/web` (`@lumen/web`) created with `create-next-app` (App Router, TypeScript, Tailwind, `src/` dir, no ESLint config of its own, `@/*` alias). Verify and record the current stable Next.js and React versions in `DECISIONS.md` before installing. Tailwind **v4** via `@tailwindcss/postcss` (decision: v4's CSS-first `@theme` block maps one-to-one onto the CSS custom properties Phase 01 defines, removes the `tailwind.config.js` indirection, and has been stable since January 2025; the risk is plugin ecosystem gaps, mitigated because Lumen uses Radix primitives and writes its own components). `src/app/layout.tsx`: `<html lang="en" suppressHydrationWarning>` with the no-flash theme script inline in `<head>` (reads `localStorage["lumen.theme"]`, falls back to `prefers-color-scheme`, sets `document.documentElement.dataset.theme`; the full logic is Phase 01's, this phase ships the script setting `data-theme="dark"` by default) and `className={`${GeistSans.variable} ${GeistMono.variable}`}`. Fonts: the `geist` npm package (Vercel; font files licensed SIL Open Font License 1.1, verified at install by reading `node_modules/geist/LICENSE.txt`; record the version and license in `DECISIONS.md`) exposes `GeistSans` and `GeistMono` as `next/font/local` instances, self-hosted, `display: "swap"`, CSS variables `--font-geist-sans` and `--font-geist-mono`. `src/app/globals.css`: `@import "tailwindcss";` and a `@theme` block that only wires `--font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif` and `--font-mono: var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, monospace` (color tokens arrive in Phase 01). `src/app/page.tsx` renders the word "Lumen" in Geist Sans at 24px/600 and the API health status fetched from `NEXT_PUBLIC_API_URL/v1/health` in Geist Mono (a real fetch; shows "API: ok · db: ok" or "API unreachable at <url>"). `src/app/dev/components/page.tsx` exists as an empty route guarded by `process.env.NODE_ENV !== "production" || process.env.LUMEN_ENABLE_GALLERY === "true"` returning `notFound()` otherwise (Phase 01 fills it). `next.config.ts`: `reactStrictMode: true`, `output: "standalone"` (Phase 11 packages it), `typedRoutes: true`.
- **Files:** `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`, `apps/web/src/app/icon.svg`, `apps/web/src/app/dev/components/page.tsx`, `apps/web/src/lib/api.ts` (typed `fetch` wrapper reading `NEXT_PUBLIC_API_URL`), `apps/web/src/app/page.test.tsx` (Vitest + `@testing-library/react` + `msw` for the health fetch: renders the four health states), `apps/web/vitest.config.ts` (jsdom environment).
- **Done when:** `pnpm --filter @lumen/web dev` serves `:3000`; DevTools Network shows two self-hosted `woff2` requests from `/_next/static/media/` (no request to any font CDN); `document.fonts.check("14px Geist")` is `true` in the console; Lighthouse in Chrome reports CLS 0 for the page.

### 4.10 API shell (Hono)
- **What:** `apps/api` (`@lumen/api`) with `hono`, `@hono/node-server`, `@hono/zod-openapi`, `zod` (verify whether `@hono/zod-openapi` supports Zod v4 at install time; if not, pin Zod v3 and record it). `src/index.ts` boots the server on `API_PORT` (default 4000), `src/app.ts` builds the `OpenAPIHono` app with middleware: request ID (`x-request-id`, ULID with prefix `req`), structured JSON logger (`src/logger.ts`, pino; redaction list initialised with `["req.headers.authorization", "req.headers.cookie"]` and extended in Phase 04), `secureHeaders()`, CORS allowing `WEB_ORIGIN` only, and a global error handler that converts `LumenHttpError` into `{ error: LumenError }` JSON and anything else into `makeError("INTERNAL", { supportId: requestId })` with the stack logged server-side only (Part A: never show raw stack traces to users). `src/routes/health.ts`: `GET /v1/health` → `{ status: "ok" | "degraded", version, db: "ok" | "unavailable", uptime_s }` with a 2-second `SELECT 1` against the pool; HTTP `503` when db is unavailable. `src/openapi.ts` registers `GET /v1/openapi.json` (title "Lumen API", version from `package.json`, servers `[{ url: "/v1" }]`) and `GET /v1/docs` serving the Scalar API reference (`@scalar/hono-api-reference`; MIT; lighter than Swagger UI and renders dark by default). `src/config.ts` parses env with Zod (`DATABASE_URL`, `API_PORT`, `WEB_ORIGIN`, `LOG_LEVEL`) and fails fast with a readable list of missing variables.
- **Files:** `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/config.test.ts`, `apps/api/src/logger.ts`, `apps/api/src/logger.test.ts`, `apps/api/src/openapi.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/routes/health.test.ts` (Vitest: `app.request("/v1/health")` with a real db returns 200 and the schema-validated body; with `DATABASE_URL` pointing at a closed port returns 503 within 3 seconds), `apps/api/src/middleware/error.ts`, `apps/api/src/middleware/error.test.ts`, `apps/api/src/middleware/request-id.ts`, `apps/api/tsup.config.ts` (bundles to `dist/index.js`, ESM, target node22, external `pg`), `apps/api/vitest.config.ts`.
- **Done when:** `curl -s localhost:4000/v1/health | jq .` shows `db: "ok"`; `curl -s localhost:4000/v1/openapi.json | npx @redocly/cli lint -` reports zero errors; `/v1/docs` renders in a browser; the idle RSS of the API process is under 80 MB (record it in `PROGRESS.md` as the Phase 0 baseline against the 512 MB control-plane budget in B14).

### 4.11 Test tooling baseline
- **What:** Vitest in every TS package with a shared `vitest.workspace.ts` at the root; coverage via `@vitest/coverage-v8` with thresholds enforced only for `packages/shared` and `packages/db` at 90% lines (they are pure logic). Playwright installed in `e2e/` (`@playwright/test`, Chromium only for now) with `e2e/playwright.config.ts` (baseURL `http://localhost:3000`, `webServer` starting `pnpm dev`, six projects named `desktop-dark`, `desktop-light`, `tablet-dark`, `tablet-light`, `mobile-dark`, `mobile-light` with viewports 1440×900, 1024×768, 390×844 and `colorScheme` set accordingly) and one smoke test `e2e/tests/smoke.spec.ts` asserting the page shows "Lumen" and "API: ok". `@axe-core/playwright` installed with a helper `e2e/lib/a11y.ts` (`expectNoA11yViolations(page)`) used by the smoke test. Screenshot convention: `e2e/__screenshots__/<spec>/<test>-<project>.png` via `toHaveScreenshot` with `maxDiffPixelRatio: 0.002`.
- **Files:** `vitest.workspace.ts`, `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/tests/smoke.spec.ts`, `e2e/lib/a11y.ts`.
- **Done when:** `pnpm test` is green; `pnpm --filter e2e test` passes the smoke test in all six projects on the dev machine.

### 4.12 CI (GitHub Actions)
- **What:** `.github/workflows/ci.yml` on `push` to `main` and `pull_request`, `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`, `permissions: contents: read`. Jobs:
  1. A composite action `.github/actions/setup/action.yml`: `actions/checkout@v4`, `pnpm/action-setup@v4` (version from `packageManager`), `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: pnpm`, `pnpm install --frozen-lockfile`.
  2. `lint`: `turbo run lint` and `pnpm format:check`.
  3. `typecheck`: `pnpm gen` then `pnpm typecheck`, then `git diff --exit-code packages/protocol/gen` (fails if generated code was not committed).
  4. `test`: Postgres 16 service container (same digest as compose), `DATABASE_URL` env, `turbo run test -- --coverage`; uploads coverage as an artifact.
  5. `build-web`: `pnpm --filter @lumen/web build`; writes the First Load JS of `/` to the job summary.
  6. `go`: `actions/setup-go@v5` with `go-version-file: apps/agent/go.mod`, `golangci/golangci-lint-action@v6`, `go test ./...`, then a matrix `goarch: [amd64, arm64]` running `scripts/build-go.sh` and uploading the binaries as artifacts; the arm64 binary is executed under QEMU (`docker/setup-qemu-action@v3` + `docker run --platform linux/arm64`) to print `--version`.
  7. `proto`: `bufbuild/buf-setup-action@v1`, `buf lint`, `buf breaking --against "https://github.com/ShageeshanT/Lumen.git#branch=main,subdir=packages/protocol"` (on the very first push to `main` there is no baseline; mark the step `continue-on-error: true` in that commit only and remove it in the next).
  8. `e2e-smoke`: installs Playwright Chromium, starts the Postgres service, runs `pnpm --filter e2e test --project=desktop-dark`; uploads the HTML report on failure.
  A required-status job `ci-ok` `needs` all of the above so branch protection can require a single check.
- **Files:** `.github/workflows/ci.yml`, `.github/actions/setup/action.yml`, `.github/CODEOWNERS` (`* @ShageeshanT`).
- **Done when:** the workflow is green on `main`; total wall time under 10 minutes; the `go` job's arm64 step prints the version string under QEMU.

### 4.13 Git hooks
- **What:** `simple-git-hooks` (MIT, zero dependencies; chosen over husky to keep `pnpm install` fast) with `pre-commit: pnpm lint-staged`. No commit-message linting; commit messages follow Conventional Commits by convention documented in `CONTRIBUTING.md`, not enforced. `lint-staged` config in the root `package.json`: `"*.{ts,tsx,js,mjs}": ["eslint --fix --max-warnings=0", "prettier --write"]`, `"*.{json,md,yml,yaml,css}": ["prettier --write"]`, `"*.go": ["scripts/lint-go-staged.sh"]` (runs `gofmt -l -w` and `golangci-lint run --fix` only if `go` is on PATH; exits 0 otherwise), `"*.proto": ["buf format -w"]`.
- **Files:** root `package.json` (`simple-git-hooks`, `lint-staged` fields, `"prepare": "simple-git-hooks"`), `scripts/lint-go-staged.sh`, `CONTRIBUTING.md`.
- **Done when:** committing a file with a formatting error rewrites it; committing a file with an `any` is rejected with the ESLint message.

### 4.14 Dependency updates
- **What:** Renovate (chosen over Dependabot: groups pnpm workspace updates into one PR, pins Docker image digests automatically, supports `go.mod` and `buf` in the same run, and has `lockFileMaintenance`). `renovate.json` extends `config:recommended`, `:pinAllExceptPeerDependencies`, `docker:pinDigests`, `group:allNonMajor`, schedule `["before 6am on monday"]`, `labels: ["deps"]`, and a `packageRules` comment reminding the reviewer to check licenses per Part A `<never>` (Renovate cannot check licenses). The Renovate GitHub App must be installed on the repository by the owner; until then the config is inert and `dependabot.yml` is **not** added (two bots would double the PRs).
- **Files:** `renovate.json`.
- **Done when:** `npx --yes renovate-config-validator renovate.json` passes.

### 4.15 Docs files and README
- **What:** Confirm `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/UI_DECISIONS.md` exist (created with the phase docs). Add Phase 0 entries to `DECISIONS.md` for: Tailwind v4, `pg` driver, Hono + `@hono/zod-openapi`, Scalar docs page, Geist via `geist` package (SIL OFL 1.1), committing generated proto code, ULID ids with prefixes, simple-git-hooks, Renovate, Postgres 16 digest, Next.js and React versions, `packages/protocol` as its own Go module, `key` as primary key on `instance_settings`, snake_case JSON fields. `README.md`: what Lumen is (two sentences), requirements (Node 24, pnpm 11, Go 1.26, Docker, buf), the three commands (`pnpm install`, `pnpm dev:infra`, `pnpm dev`), the ports table (web 3000, api 4000, postgres 5432), links to `docs/SPEC.md` and `docs/phases/README.md`.
- **Files:** `README.md`, `CONTRIBUTING.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`.
- **Done when:** a fresh clone in a new directory follows the README from zero to `/v1/health` showing `db: ok` in under five minutes, timed.

### 4.16 Resulting repository tree
The tree after this phase (files marked ⟲ are generated and committed; every other file is hand-written):

```
.
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .golangci.yml
├── .npmrc
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── .github/
│   ├── CODEOWNERS
│   ├── actions/setup/action.yml
│   └── workflows/ci.yml
├── CLAUDE.md
├── CONTRIBUTING.md
├── README.md
├── docker-compose.dev.yml
├── .env.example
├── eslint.config.js
├── go.work
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── renovate.json
├── tsconfig.base.json
├── turbo.json
├── vitest.workspace.ts
├── scripts/
│   ├── build-go.sh
│   └── lint-go-staged.sh
├── apps/
│   ├── agent/
│   │   ├── go.mod · go.sum
│   │   ├── cmd/lumen-agent/main.go
│   │   └── internal/version/{version.go,version_test.go}
│   ├── cli/
│   │   ├── go.mod · go.sum
│   │   ├── cmd/lumen/main.go
│   │   └── internal/version/version.go
│   ├── api/
│   │   ├── package.json · tsconfig.json · tsup.config.ts · vitest.config.ts
│   │   └── src/{index.ts,app.ts,config.ts,config.test.ts,logger.ts,logger.test.ts,openapi.ts}
│   │       ├── middleware/{error.ts,error.test.ts,request-id.ts}
│   │       └── routes/{health.ts,health.test.ts}
│   └── web/
│       ├── package.json · tsconfig.json · next.config.ts · postcss.config.mjs · vitest.config.ts
│       └── src/
│           ├── app/{layout.tsx,globals.css,page.tsx,page.test.tsx,icon.svg}
│           ├── app/dev/components/page.tsx
│           └── lib/api.ts
├── packages/
│   ├── db/
│   │   ├── package.json · tsconfig.json · drizzle.config.ts
│   │   ├── migrations/0000_instance_settings.sql · migrations/meta/{_journal.json,0000_snapshot.json}
│   │   └── src/{index.ts,client.ts,columns.ts,migrate.ts,schema.test.ts,schema/index.ts,schema/instance_settings.ts}
│   ├── protocol/
│   │   ├── package.json · tsconfig.json · go.mod · buf.yaml · buf.gen.yaml · PROTOCOL_VERSION
│   │   ├── proto/lumen/agent/v1/agent.proto
│   │   ├── gen/go/lumen/agent/v1/agent.pb.go ⟲
│   │   ├── gen/ts/lumen/agent/v1/agent_pb.ts ⟲
│   │   ├── src/{version.ts,version.test.ts,roundtrip.test.ts}
│   │   ├── testdata/agent_hello.bin
│   │   └── {version.go,version_test.go,roundtrip_test.go}
│   ├── shared/
│   │   ├── package.json · tsconfig.json
│   │   └── src/{index.ts,ids.ts,ids.test.ts,errors/types.ts,errors/catalog.ts,errors/catalog.test.ts,errors/index.ts}
│   ├── templates/  (package.json only; Phase 13)
│   └── ui/        (package.json only; Phase 01)
├── deploy/        (empty .gitkeep; Phase 11)
├── docs/
│   ├── SPEC.md · PROGRESS.md · DECISIONS.md · UI_DECISIONS.md
│   └── phases/
└── e2e/
    ├── package.json · playwright.config.ts
    ├── lib/a11y.ts
    └── tests/smoke.spec.ts
```

### 4.17 Verification commands per step
Run these after each step and paste the output into the closing report.

| Step | Command | Expected |
|---|---|---|
| 4.1 | `pnpm install --frozen-lockfile && pnpm turbo run build --dry=json \| jq '.tasks \| length'` | no peer warnings; one task per package |
| 4.2 | `pnpm typecheck` | exit 0 in every package |
| 4.3 | `time pnpm lint` | exit 0; under 60 s |
| 4.4 | `pnpm build:go && file apps/agent/bin/* apps/cli/bin/*` | four `ELF 64-bit LSB executable ... statically linked` lines |
| 4.4 | `docker run --rm --platform linux/arm64 -v "$PWD/apps/agent/bin:/b" debian:12-slim /b/lumen-agent-linux-arm64 --version` | `lumen-agent 0.0.0-dev (...) linux/arm64` |
| 4.5 | `pnpm gen && git status --short packages/protocol/gen` | empty (no diff after the second run) |
| 4.5 | `buf lint && buf format -d --exit-code` (in `packages/protocol`) | exit 0 |
| 4.6 | `pnpm dev:infra && psql "$DATABASE_URL" -c 'select version()'` | PostgreSQL 16.x |
| 4.7 | `pnpm db:migrate && pnpm db:migrate` | second run prints "0 migrations applied" |
| 4.8 | `pnpm --filter @lumen/shared test -- --coverage` | green; lines ≥ 90 % |
| 4.9 | `curl -s localhost:3000 \| grep -o 'data-theme="dark"'` | `data-theme="dark"` |
| 4.9 | Lighthouse (Chrome DevTools) on `/` | CLS 0 |
| 4.10 | `curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/v1/health` | `200`; `503` after `docker compose -f docker-compose.dev.yml stop postgres` |
| 4.10 | `curl -s localhost:4000/v1/openapi.json \| npx --yes @redocly/cli lint -` | 0 errors |
| 4.11 | `pnpm test && pnpm --filter e2e test` | green; 6 smoke runs |
| 4.12 | `gh run list --branch main --limit 1` | `completed success` |
| 4.13 | `printf 'const x: any = 1\n' > apps/api/src/tmp.ts && git add -A && git commit -m tmp` | rejected by ESLint; then `git reset && rm apps/api/src/tmp.ts` |
| 4.14 | `npx --yes renovate-config-validator renovate.json` | `INFO: Config validated successfully` |
| 4.15 | timed fresh clone in a new directory | under five minutes to `db: ok` |

## 5. Detail checklist

### Typography
- [ ] Geist Sans and Geist Mono are self-hosted through `next/font`; no external font requests appear in the Network tab
- [ ] `--font-geist-sans` / `--font-geist-mono` variables are set on `<html>` and referenced by Tailwind's `--font-sans` / `--font-mono` in `@theme`
- [ ] `font-display: swap` and size-adjusted fallbacks are generated by `next/font` (check the injected `@font-face` has `size-adjust`)
- [ ] The Geist license (`SIL OFL 1.1`) and package version are written into `docs/DECISIONS.md`
- [ ] The health line uses `font-variant-numeric: tabular-nums` so "uptime" digits do not jitter (first use of the rule that C4 mandates for metrics)

### Spacing & layout
- [ ] The shell page has no layout shift when fonts load (CLS 0 in Lighthouse)
- [ ] Root `globals.css` sets `html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }` and `body { margin: 0; }` and nothing else visual (Phase 01 owns the rest)

### Color & theme
- [ ] `<html data-theme="dark">` is set before first paint by the inline script (no flash; verify by throttling CPU 6× in DevTools and reloading)
- [ ] `color-scheme: dark` is declared on `[data-theme="dark"]` and `color-scheme: light` on `[data-theme="light"]` so native form controls and scrollbars match
- [ ] No color value other than the temporary favicon accent appears in this phase's CSS

### Motion
- [ ] Nothing animates in this phase; the `@media (prefers-reduced-motion: reduce)` rule stub exists in `globals.css` (`*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }`) ready for Phase 01 to refine

### Iconography & symbols
- [ ] No icon library is installed yet (Phase 01 decides; avoids a wrong dependency now)
- [ ] `apps/web/src/app/icon.svg` is a temporary geometric mark (a 24×24 rounded square with a single circle, accent color hard-coded `#14B8A6`) so the tab is not blank; recorded as temporary in `UI_DECISIONS.md`

### Copy
- [ ] `/v1/health` field names are snake_case (`uptime_s`) because the public API (J1) will be snake_case; note this in `DECISIONS.md`
- [ ] README uses the C9 voice: second person, short sentences, verbs on commands, no exclamation marks

### States (empty · loading · error · success · partial)
- [ ] The web shell's health line handles: loading ("Checking API…"), success ("API: ok · db: ok"), degraded ("API: ok · db: unavailable"), unreachable ("API unreachable at http://localhost:4000")
- [ ] The API health route returns `503` (not `200` with a sad body) when the database is unavailable, so uptime monitors work

### Keyboard & accessibility
- [ ] `<html lang="en">`
- [ ] The smoke e2e runs axe and passes on the shell page
- [ ] The `/v1/docs` page is reachable by keyboard (Scalar's own a11y is out of our control; note any violations found in `PROGRESS.md` "Known gaps")

### Responsive
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1">` is present (Next default; verify)
- [ ] The Playwright config defines the three widths (390, 1024, 1440) as named projects so every later phase reuses them

### Performance
- [ ] API idle RSS recorded in `PROGRESS.md` (target < 80 MB for the empty shell)
- [ ] Web `next build` output recorded (First Load JS for `/` under 100 kB)
- [ ] `pnpm typecheck` for the whole repo under 30 s; `pnpm lint` under 60 s; cold `pnpm install` under 90 s on the dev machine
- [ ] Turborepo remote cache is not configured (no Vercel account dependency); local cache verified by running `pnpm build` twice and seeing `FULL TURBO`

### Security
- [ ] `.env` is gitignored and `.env.example` contains only dev-safe values
- [ ] `secureHeaders()` middleware on the API; CORS restricted to `WEB_ORIGIN`
- [ ] The API error handler never serialises `err.stack`; a test asserts the JSON body for a thrown `Error("boom")` contains only the `INTERNAL` catalog entry and a `supportId`
- [ ] pino redaction list exists and is unit-tested with a fake `authorization` header
- [ ] CI `permissions` is `contents: read` only; no secrets are used in this phase
- [ ] Every dependency added has its license recorded in `DECISIONS.md` (MIT, ISC, Apache-2.0, BSD, SIL OFL accepted; anything else needs a note)

### Data integrity & idempotency
- [ ] Migrations are forward-only SQL files; `pnpm db:migrate` twice is a no-op
- [ ] `pnpm gen` twice produces no diff
- [ ] The `PROTOCOL_VERSION` file is the single source for the Go and TS constants, enforced by tests

## 6. Acceptance criteria
- [ ] `pnpm dev` starts web + api (SPEC Phase 0 AC)
- [ ] `pnpm test` green (SPEC Phase 0 AC)
- [ ] CI green (SPEC Phase 0 AC)
- [ ] The agent builds for both architectures (SPEC Phase 0 AC); the arm64 binary prints its version under QEMU
- [ ] `GET /v1/health` returns `200` with `db: "ok"` against the compose Postgres and `503` when Postgres is down
- [ ] `GET /v1/openapi.json` passes Redocly lint with zero errors
- [ ] Geist Sans and Geist Mono are self-hosted and `document.fonts.check("14px Geist")` is true
- [ ] A proto `Envelope{AgentHello}` round-trips byte-identically between Go and TypeScript (shared fixture)
- [ ] Every J6 error code has a catalog entry and the catalog voice tests pass
- [ ] Fresh clone to `db: ok` in under five minutes following only `README.md`
- [ ] `docs/DECISIONS.md` has one entry per dependency or tooling choice listed in 4.15

## 7. Test plan
- **Unit:** `packages/shared` (catalog completeness and voice rules, id prefixes and monotonicity), `packages/protocol` (protocol version parity, round-trip), `apps/api` (error handler never leaks stacks, request-id middleware, config parsing failure message, logger redaction), `apps/web` (health line four states with msw).
- **Integration:** `packages/db` migration on a fresh schema (Vitest against the compose/CI Postgres); `apps/api` health route against a real database and against a closed port.
- **E2E (Playwright):** `smoke.spec.ts` on six projects (3 widths × 2 color schemes): page shows "Lumen" and "API: ok", axe passes.
- **Visual regression:** the smoke test takes one `toHaveScreenshot` per project so the screenshot directory convention exists; the threshold is `maxDiffPixelRatio: 0.002`.
- **Accessibility (axe + keyboard pass):** axe on the shell page in the smoke test.
- **Manual / on a real VM:** none required; the arm64 QEMU run stands in for a real ARM VM until Phase 02.

## 8. Evidence required to close
- Terminal output of `pnpm install`, `pnpm dev:infra`, `pnpm dev` (first 30 lines) and `curl localhost:4000/v1/health`
- Screenshot of `http://localhost:3000` at 1440px dark showing "Lumen" and "API: ok · db: ok", plus the Network tab filtered to `woff2`
- `pnpm test` and `pnpm lint` full output (green)
- Link to the green CI run on `main` with the `go` job's arm64 `--version` line quoted
- `file` output for the four Go binaries
- Timed fresh-clone run (start and end timestamps)
- API idle RSS number and web First Load JS number

## 9. Review
Use SPEC H1 (code review) with Fable 5.1. Probe specifically: (1) does anything in the TS config or lint setup make later strictness cheaper to loosen than to keep (it should not); (2) is the proto envelope extensible without renumbering; (3) does the API error handler leak anything in any branch; (4) are the Go modules laid out so `apps/cli` can import `packages/protocol` without importing agent internals; (5) is every dependency's license recorded; (6) would the CI matrix catch a Windows-only path bug (the dev machine is Windows, production is Linux; scripts must be bash and paths must use forward slashes).

## 10. Risks & open questions
- **Risk:** Tailwind v4 or the latest Next.js has a regression with `next/font` variables. → **Mitigation:** verify the combination on the shell page before writing any component; if broken, pin the previous minor and record it.
- **Risk:** `@hono/zod-openapi` lags Zod major versions. → **Mitigation:** check at install; pin Zod to whatever the plugin supports; the version is isolated in `apps/api` and `packages/shared` only.
- **Risk:** golangci-lint v2 config format differs from v1 examples online. → **Mitigation:** run `golangci-lint config verify` in CI.
- **Risk:** QEMU arm64 execution in CI is slow or flaky. → **Mitigation:** it only runs `--version`; give it a 2-minute timeout and keep it required because arm64 (Oracle free tier) is a Tier 1 target.
- **Risk:** Windows dev machine vs Linux CI path and line-ending differences. → **Mitigation:** `.gitattributes` with `* text=auto eol=lf`; all scripts are bash run through Git Bash; no `path.join` with backslashes anywhere.
- **Open question:** Should `packages/protocol/gen` be committed or generated in CI only? Default: committed (decided in 4.5). Whoever runs Phase 02 can revisit if merge conflicts in generated code become frequent.
- **Open question:** The `engines` range allows Node 22 for contributors; CI runs 24 only. Default stands unless a contributor on 22 hits a real incompatibility.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps, with the RSS and build-size baselines)
- [ ] `docs/DECISIONS.md` entries added for every choice made
- [ ] `docs/UI_DECISIONS.md` notes the temporary favicon
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 00 — Foundations</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-00-foundations.md,
and these SPEC sections: 0.1–0.4, Part A, B2, B5 (handshake messages), B6 (instance_settings),
B14, C4 (font choice), Part F "Phase 0", Part G, J6.
Local toolchain: Node 24.11, pnpm 11.14, Go 1.26, Docker 28 on Windows 11 (Git Bash available);
buf is not installed yet. Production targets are Linux amd64 and arm64.
</context>
<goal>
A fresh clone runs `pnpm install && pnpm dev:infra && pnpm dev` and serves an empty Lumen
dashboard on :3000 with self-hosted Geist, an API on :4000 answering /v1/health from a real
Postgres, with CI green on lint, typecheck, test, buf, and Go builds for linux/amd64 + linux/arm64.
</goal>
<scope>
- pnpm workspaces + Turborepo with @lumen/web, @lumen/api, @lumen/ui (empty), @lumen/db,
  @lumen/shared, @lumen/protocol, @lumen/templates (empty), apps/agent, apps/cli, e2e
- tsconfig.base.json (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes), ESLint flat
  config (typescript-eslint strictTypeChecked, no-explicit-any, no-non-null-assertion), Prettier
- go.work + golangci-lint; agent and cli print --version; build script for both architectures
- buf.yaml/buf.gen.yaml; lumen/agent/v1/agent.proto with Envelope, AgentHello, ControlHello,
  Ack, OpError; generated Go + TS committed; PROTOCOL_VERSION single source
- docker-compose.dev.yml (Postgres 16 pinned by digest); packages/db with Drizzle, pg driver,
  migration runner, migration 0000 for instance_settings
- packages/shared errors: LumenErrorCode (all J6 codes + infra codes), LumenError, catalog, tests;
  ids.ts with prefixed ULIDs
- apps/web: Next.js App Router, Tailwind v4, Geist via `geist` package, data-theme stub, health line
- apps/api: Hono, /v1/health, /v1/openapi.json, /v1/docs (Scalar), error handler, pino, config
- Vitest everywhere, Playwright smoke test with 3 widths × 2 color schemes + axe
- GitHub Actions CI, simple-git-hooks + lint-staged, renovate.json, README, CONTRIBUTING
</scope>
<out_of_scope>
- Design tokens, components, gallery content (Phase 01)
- Agent WebSocket, heartbeat, join flow (Phase 02)
- Any API route or table beyond the ones listed (Phase 04)
- Auth, installer, self-host compose (Phases 04, 11)
</out_of_scope>
<acceptance_criteria>
See docs/phases/PHASE-00-foundations.md §6. Non-negotiable: pnpm dev starts web + api;
pnpm test green; CI green; arm64 agent binary prints --version under QEMU; /v1/health returns
200 with db ok and 503 when the database is down; proto round-trip bytes identical in Go and TS;
fresh clone to db ok in under five minutes.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, dependency versions you verified (with licenses),
   risks, test plan, open questions. STOP and wait for approval.
2. Implement in small steps; run code and tests after each step. Commit after every green step.
3. Report: what works (with evidence: command output, screenshot of :3000, CI link),
   what doesn't, deviations from spec, next steps.
4. Update docs/PROGRESS.md (with RSS and bundle-size baselines) and docs/DECISIONS.md
   (one entry per dependency or tooling choice).
</process>
```
