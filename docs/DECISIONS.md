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

## 0003 · 2026-09-26 · Parity target and visual identity — **RESOLVED (see 0030)**
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

## 0025 · 2026-09-26 · Phase 1 dependencies and licenses (foundation)
**Decision:** Added to `@lumen/ui`, licenses read from the installed packages.

| Package | Version | License | Role |
|---|---|---|---|
| lucide-react | 1.48.0 | ISC | UI icons (SPEC C4) |
| clsx | 2.1.1 | MIT | Class name joining |
| tailwind-merge | 3.7.0 | MIT | Conflicting utility resolution in `cn()` |
| class-variance-authority | 0.7.1 | Apache-2.0 | Component variants |

`motion` 13.4.4 (MIT) is pinned in the catalog for the components that need
springs but is not installed until the first one lands. Radix primitives and
`cmdk` are added one at a time with the components that use them.

## 0026 · 2026-09-26 · Tokens as CSS variables, Tailwind maps to them inline
**Decision:** Every design token is a CSS custom property in
`packages/ui/src/tokens/*.css` under `:root, [data-theme="dark"]` and
`[data-theme="light"]`. The web app's `globals.css` clears every Tailwind theme
namespace (`--color-*: initial` and so on) and re-declares only Lumen's tokens in
an `@theme inline` block that references the variables, so utilities such as
`bg-surface`, `text-text-secondary`, `rounded-card` and `gap-4` exist and nothing
off the system can be expressed.
**Why:** One source for the values (the token files), inspectable in DevTools,
themeable by attribute; the inline mapping keeps the Tailwind layer from
double-defining them. Verified by the Playwright theme spec, which reads computed
values from rendered utilities.
**Rejected:** defining tokens inside `@theme` (Tailwind becomes the source and the
static direction pages and Go/agent surfaces could not share it); `color-mix()`
for tints (values stop being inspectable).

## 0027 · 2026-09-26 · Two-tier semantic colors
**Decision:** `--color-<status>` is for non-text use (dots, icons, borders, chart
lines; 3:1) and `--color-<status>-text` for text (4.5:1 on every surface, including
`surface-hover`). Components never use the base status color for text.
**Why:** SPEC C4's single values cannot meet C11's 4.5:1 for text in the light
theme (accent `#0D9488` is 3.74:1 on white). See `docs/UI_DECISIONS.md` for the
two light tokens that moved a ramp step to hold the rule on hover surfaces.

## 0028 · 2026-09-26 · Theme preference defaults to "system"
**Decision:** `localStorage["lumen.theme"]` holds `dark`, `light` or `system`
(default `system`); an inline `<head>` script resolves it before first paint and
sets `data-theme` and `color-scheme` on `<html>`; `ThemeProvider` follows the OS
live, persists changes and syncs tabs through the `storage` event and a same-tab
`lumen:theme` event. The server renders `data-theme="dark"` as the pre-script
default because dark is the product's default look (SPEC C4).
**Why:** SPEC C7.21 lists system / dark / light; no flash at any CPU speed is a
Phase 1 acceptance criterion (Playwright verifies at 6× throttle).

## 0029 · 2026-09-26 · Focus ring policy and z-index scale
**Decision:** One focus ring, `2px solid var(--color-accent)` with `2px` offset on
`:focus-visible` only, applied globally in `packages/ui/src/styles/focus.css` and
never overridden per component; inputs add a soft `:focus` state of their own.
Z-index comes only from `--z-base/sticky/rail/panel/popover/modal/toast/palette`
(0/10/20/30/40/50/60/70).
**Why:** Keyboard users get the same ring everywhere and instantly; a fixed layer
order prevents the "z-index: 9999" escalation that breaks overlays later.

## 0030 · 2026-09-26 · Visual direction D "Signal" replaces the SPEC C4 look
**Decision:** The owner chose a HUD / instrument-panel direction from two
reference images: near-black with a fine grid, electric-blue accent with a
blue-violet glow, Geist Pixel display type, uppercase Geist Mono chrome, square
corners, corner brackets, bracket notation, leader lines, and live motion
(boot-in, decode, edge flow, blink). Full value table in
`docs/UI_DECISIONS.md`. Railway stays the feature and interaction-structure
parity target; the look is Lumen's own and copies nothing from the reference
site. Resolves 0003 (accent: electric blue, not teal).
**Why:** Owner's instruction ("this is the kind of ui and animation theme that
was in my head"). Tokens made the swap a token-file change plus tests.
**Kept from the spec:** WCAG AA contrast on every surface, sentence-case sans for
readable text, one strong element per view, full reduced-motion support, a light
theme.
**Rejected:** directions A, B and C.

## 0031 · 2026-09-26 · Geist Pixel Square as the display face
**Decision:** Page, section and display titles use Geist Pixel Square
(`geist/font/pixel`, weight 500), loaded by `next/font` next to Geist Sans and
Mono. Same package and license (SIL OFL 1.1) as 0005, so no new dependency.
**Why:** Closest match to the reference lettering among the five Pixel variants
(Square, Grid, Circle, Triangle, Line were compared side by side).

## 0032 · 2026-09-26 · Entrance choreography exception to the 300 ms rule
**Decision:** Interaction feedback stays at or under 300 ms. First-load entrance
may reveal each element in 240 ms with a 45 ms stagger (screen assembled in under
700 ms), a display title may decode once per page in under 360 ms, and three
slow ambient loops are allowed (edge flow 1.4 s, glow breathe 9 s, status blink
1.6 s). All of them stop under `prefers-reduced-motion` and the account
reduced-motion preference.
**Why:** The direction's "live system" character depends on assembly and flow;
limiting them to entrance and ambient layers keeps interactions instant.

## 0033 · 2026-09-26 · Design-system CSS in cascade layers
**Decision:** `@lumen/ui` base styles are in `@layer base` and its named text,
surface and elevation classes in `@layer components`, so Tailwind utilities
always override them.
**Why:** Unlayered styles beat layered utilities; a color utility on a text-styled
element was being ignored. Guarded by a Playwright test.

## 0034 · 2026-09-26 · Radix primitives, added one at a time
**Decision:** `@radix-ui/react-slot` 1.3.3 (MIT) for `asChild` and
`@radix-ui/react-tooltip` 1.2.16 (MIT) for tooltips, pinned in the catalog.
Further primitives (dialog, dropdown, popover, tabs, select…) are added with the
components that need them.
**Why:** SPEC tech stack; accessible behavior (focus, Escape, collision
handling) without re-implementing it.

## 0035 · 2026-09-26 · tailwind-merge configured with Lumen's theme
**Decision:** `cn()` uses `extendTailwindMerge` with Lumen's color names, text
sizes, radii, fonts, tracking and leading, plus a `text-style` class group for
the named text styles.
**Why:** The default config treats unknown `text-*` classes as colors, so
`cn("text-action", "text-success-text")` silently dropped the text style.
Unit-tested.

## 0036 · 2026-09-26 · Tailwind scans packages/ui explicitly; forced-state variants
**Decision:** `globals.css` adds `@source "../../../../packages/ui/src"` and three
custom variants, `is-hover`, `is-active`, `is-focus`, which match the real
pseudo-class or `data-force~="hover|active|focus"`. The global focus ring also
matches `[data-force~="focus"]`.
**Why:** Tailwind's automatic source detection ignores workspace links, so
classes used only inside `packages/ui` were never generated. The forced
variants let the gallery render hover, pressed and focus states for screenshots
without a pointer.

## 0037 · 2026-09-26 · Gallery registry drives pages, screenshots and axe
**Decision:** Each component ships `<name>.examples.tsx` exporting a
`ComponentDoc`; `COMPONENT_DOCS` in `@lumen/ui/examples` lists them in order.
The gallery nav and `/dev/components/[slug]` render from it,
`/dev/components/registry.json` exposes it, and `e2e/tests/gallery.spec.ts`
screenshots every example element in all six projects and runs axe on every
page. A unit test fails if an exported component has no gallery page.
**Why:** One list means a new component cannot ship without states, screenshots
and an accessibility check.

## 0038 · 2026-09-26 · Muted text is never informative; decorative brackets are pseudo-elements
**Decision:** `text-muted` (under 4.5:1) is used only for placeholders, disabled
controls and decoration. The `[ ]` around status tags are CSS `::before` /
`::after` content so they stay dim without being text. Section numbers, nav
group labels and the "then" in shortcuts use `text-secondary`.
**Why:** axe flagged each of these; they carried meaning or were real text.

