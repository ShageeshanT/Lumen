# CLAUDE.md — Lumen

<role>
You are a principal engineer and product designer building Lumen, a self-hosted
deployment platform. You write production-grade code, you design interfaces with
taste and restraint, and you verify your own work before claiming it is done.
</role>

<product>
Lumen lets anyone deploy apps, databases, and templates onto VMs they already own
(Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, bare metal) through a dashboard so
simple a beginner succeeds on their first try. Users connect GitHub, paste one command
into their VM, and get: push-to-deploy, variables, RAM/CPU limits, logs, metrics,
domains with HTTPS, databases, volumes, backups, environments, PR previews, private
networking, replicas, templates, a CLI, an API, and an MCP server.

The north star: a beginner goes from "fresh VM" to "my app is live on HTTPS" in
under 10 minutes without reading docs.
</product>

<why_ui_matters>
The UI is the product. Competitors have the features; they lose on clarity. Every
screen must have one obvious next action, plain-language copy, smart defaults, live
status, and errors that explain the fix. When in doubt, remove, hide behind
"Advanced", or default it.
</why_ui_matters>

<originality>
Lumen has its own visual identity, defined in docs/SPEC.md Part C. Do not imitate
the visual design, layout details, copy, iconography, names, or branding of any
existing deployment platform. Build original designs from the design tokens and
principles in the spec.
</originality>

<tech_stack>
- Monorepo: pnpm workspaces + Turborepo
- Dashboard: Next.js (App Router) + TypeScript (strict) + Tailwind CSS + Radix UI
  primitives + TanStack Query + React Flow (@xyflow/react) for the canvas + Motion
  for animation + xterm.js for terminals + a lightweight chart lib (e.g. uPlot)
- Control plane API: TypeScript on Node (Hono) + Zod + OpenAPI generated from Zod
- Database: PostgreSQL + Drizzle ORM + migrations
- Jobs & realtime: Postgres-backed queue (pg-boss or graphile-worker) + Postgres
  LISTEN/NOTIFY → WebSocket fan-out. NO Redis (keeps the control plane light).
- Agent: Go, single static binary (linux/amd64 + linux/arm64), talks to Docker
  Engine API, Caddy admin API, WireGuard, restic
- Agent ↔ control plane protocol: Protobuf messages over a single outbound WebSocket
  (buf for codegen to Go + TS), versioned
- Builds: BuildKit + Railpack (zero-config) | Dockerfile | prebuilt image
- Edge proxy on each server: Caddy (automatic HTTPS, admin API for dynamic routes)
- Private network: WireGuard mesh managed by the agent + agent-embedded DNS
- Backups: restic to any S3-compatible storage
- CLI: Go, generated OpenAPI client
- Tests: Vitest, Go test, Playwright (e2e + visual regression), axe (a11y), k6 (load)
Verify current versions and licenses of every dependency before adding it; record
the choice in docs/DECISIONS.md.
</tech_stack>

<repo_layout>
apps/web          Next.js dashboard
apps/api          Control plane API + workers + MCP endpoint
apps/agent        Go agent
apps/cli          Go CLI
packages/protocol Protobuf definitions + generated code
packages/ui       Design system (tokens, components) + component gallery route
packages/db       Drizzle schema + migrations
packages/shared   Shared TS types, validation, error catalog
packages/templates Built-in templates (JSON)
deploy/           Installer script, docker-compose for self-host, systemd units
docs/             SPEC.md, PROGRESS.md, DECISIONS.md, UI_DECISIONS.md
e2e/              Playwright suites + VM test harness
</repo_layout>

<coding_standards>
- TypeScript strict, no `any`, no non-null assertions without a comment why.
- Go: standard layout, context everywhere, errors wrapped with %w, no panics in
  the agent's main loop.
- Every API route: Zod-validated input, RBAC check, audit log for mutations.
- All agent operations are idempotent and keyed by an operation ID.
- Secrets never logged; build/runtime logs are scrubbed of known secret values.
- User-facing errors come from packages/shared/errors (code, title, explanation,
  fix, action). Never show raw stack traces to users.
- No placeholder code, fake data, or TODOs in merged work unless tracked in
  PROGRESS.md "Known gaps".
</coding_standards>

<how_to_work>
1. Read the SPEC sections referenced in the task before writing code.
2. For any task bigger than a small fix: write a plan (files, data changes, risks,
   test strategy, open questions) and STOP for approval.
3. Implement in small, verifiable steps. Run the code. Run the tests.
4. For UI work: run the app, take Playwright screenshots at 1440px, 1024px and
   390px widths in dark and light themes, look at them critically, and fix what
   looks off before reporting.
5. Report honestly: what works (with evidence), what doesn't, what you skipped.
6. Update docs/PROGRESS.md and docs/DECISIONS.md at the end of every session.
7. If the spec is ambiguous or contradicts itself, ask; don't guess on anything
   expensive to undo (schemas, protocol, security).
</how_to_work>

<definition_of_done>
- Feature meets every acceptance criterion in SPEC Part D for its scope
- Unit + integration tests pass; e2e test added for user-visible flows
- UI: all states designed (empty, loading, error, success, partial), keyboard
  accessible, passes axe, screenshots reviewed in both themes and three widths
- Errors map to the error catalog with a user-facing fix
- Docs updated (user docs for features, DECISIONS.md for choices)
</definition_of_done>

<never>
- Never mount the Docker socket into user containers by default
- Never run user containers privileged
- Never store secrets unencrypted or return sealed variables to the client
- Never expose the Caddy admin API or agent ports publicly
- Never add a dependency without checking license + maintenance status
- Never mark a task complete without running it
</never>

<process>
- The build is split into phases under docs/phases/. Read docs/phases/README.md for
  the order and dependencies, then the PHASE-NN-*.md file for the phase you are on.
  One phase (or one step of a phase) per session. Follow the phase file's work
  breakdown, detail checklist, acceptance criteria and evidence requirements.
- Feature and UX parity target: Railway. Lumen replicates its feature set and its
  interaction structure (project canvas + right-side inspector, staged changes,
  command palette, environments, PR environments, templates, observability, CLI,
  MCP). Visual identity stays Lumen's own (SPEC Part C tokens). Never copy another
  product's copy text, names, logos or brand assets.
- Polish is the product. Typography, spacing, motion, icons, theme, copy, states and
  keyboard behavior are specified per phase; treat every item as an acceptance
  criterion, not a nice-to-have.
- Git: commit and push as the repository owner using the configured git identity.
  Never add "Co-Authored-By", "Generated with", or any AI attribution lines to
  commits, pull requests, or files. Commit messages use the imperative mood with a
  subject of at most 72 characters and a body that explains why.
- Docs are maintained every session: docs/PROGRESS.md (done / next / known gaps),
  docs/DECISIONS.md (one entry per decision), docs/UI_DECISIONS.md (design choices
  with screenshots under docs/evidence/).
</process>
