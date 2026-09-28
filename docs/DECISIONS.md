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

## 0039 · 2026-09-26 · Form-control dependencies
**Decision:** Radix `react-select` 2.3.7, `react-switch` 1.3.7, `react-checkbox`
1.3.11, `react-radio-group` 1.4.7, `react-toggle-group` 1.1.19, `react-slider`
1.4.7, `react-popover` 1.1.23 and `cmdk` 1.1.1, all MIT, pinned in the catalog.
**Why:** Accessible patterns (listbox, switch, radiogroup, slider, combobox) with
keyboard support, without re-implementing them.

## 0040 · 2026-09-26 · Field context wires every control
**Decision:** `<Field>` provides the control's id, `aria-describedby` (helper
and error), invalid, disabled and required state through context; every control
reads it with `useFieldProps` and explicit props win. `lockedBy="lumen.toml"`
disables the control and shows a lock with a tooltip. Only errors that appear
after mount use `role="alert"`.
**Why:** One place to get labelling right; controls stay usable outside a Field.

## 0041 · 2026-09-26 · Focus frame on a wrapper, not the input
**Decision:** Text-entry controls sit in a frame element that draws accent HUD
brackets when the control inside has focus (`has-[:focus-visible]`); the input
itself shows an accent border and a 3 px accent-subtle halo instead of the
global outline.
**Why:** `<input>` cannot render `::after`, so the brackets cannot live on it.

## 0042 · 2026-09-26 · Gallery accessibility rules
**Decision:** Examples that force a modal open (`forcesModal`) relax only axe's
`aria-hidden-focus` on that page, because an open modal hides the rest of the
page by design. Everything else runs the full WCAG 2.2 AA tag set at three widths,
including `target-size`: interactive targets are at least 24 × 24 px (the slider
thumb is a 24 px hit area around a 10 × 16 cap; small links get a 24 px box).
Stateful demos live in client-only `*.demos.tsx` files so the registry can be
imported on the server. The gallery nav becomes a top bar under 768 px and
examples use fluid widths. Next's dev badge is off so screenshots show only Lumen.
**Why:** Each of these was found by axe or by the phone-width screenshots.

## 0043 · 2026-09-27 · Overlay and navigation dependencies
**Decision:** Radix `react-dialog` 1.1.23, `react-dropdown-menu` 2.1.24,
`react-context-menu` 2.3.7 and `react-tabs` 1.1.21, all MIT, pinned in the
catalog. Versions checked with `npm view` on 2026-09-27 (latest, last published
2026-07-31, same release train as the Radix packages already in use). Dialog
1.1.23 is the version cmdk already pulled in, so no second copy is installed.
**Why:** Focus trapping and restore, Escape layering, typeahead, submenus,
roving focus and collision handling without re-implementing them (SPEC tech
stack; 0034).

## 0044 · 2026-09-27 · Overlays render into a container for gallery previews
**Decision:** Modal, ConfirmDialog, CommandPalette, Sheet, SidePanel and the rail
drawer take `container?: HTMLElement`. With it they portal into that element,
position `absolute` inside it, are non-modal (no focus trap, no `aria-hidden`
on the page) and do not take focus when they mount already open
(`useSkipMountFocus`; the flag clears once the overlay has been closed, because
Strict Mode mounts focus scopes twice). Forced-open menus and popovers use
`modal={false}`, `avoidCollisions={false}`, `max-h-none` and prevent open/close
auto-focus. The real app renders overlays against the viewport; every modal
sets `aria-modal="true"`.
**Why:** A gallery page shows up to seven dialogs at once. As real modals they
would fight over focus, hide the page from axe and cover each other; as
collision-aware poppers they flipped depending on scroll position, which made
screenshots unstable. `forcesModal` is therefore not needed on these pages.

## 0045 · 2026-09-27 · Focus returns to whatever opened an overlay
**Decision:** Modal, ConfirmDialog, CommandPalette, Sheet and SidePanel record
`document.activeElement` in `onOpenAutoFocus` and restore it in
`onCloseAutoFocus`. Initial focus: Modal the first control in the body (else
Close), destructive ConfirmDialog the name field, simple ConfirmDialog Cancel,
CommandPalette the search field, Sheet the sheet itself (no phone keyboard pops
up), SidePanel its title (`tabIndex=-1`).
**Why:** Radix only restores focus to its own `Trigger`; the palette (⌘K), the
inspector (canvas click) and confirmations opened from menus have none.

## 0046 · 2026-09-27 · The inspector is a region when docked, a dialog below 1280
**Decision:** SidePanel picks its mode from the viewport: docked at 1280 px and
up (`role="complementary"`, `aria-label="Service inspector"`, no trap, outside
clicks and focus do not close it), overlay 1024–1279 (modal dialog, 20 % scrim),
full width 768–1023 (modal dialog), and a full-screen Sheet under 768. `mode`
overrides it. Width: `localStorage["lumen.panel.width"]` via `useStoredState`
(synced across tabs), clamped 480–880, default 560; the separator handle is
`role="separator"` with `aria-valuenow` in px, arrows ±16, Home/End to min/max,
and the width is written on pointer release, not on every move.
**Why:** SPEC C7.7/C12 require the canvas to stay operable beside the panel
while §4.9 also asks for a focus trap; the trap only makes sense where the panel
covers the canvas.

## 0047 · 2026-09-27 · Rail expansion by clip, not width
**Decision:** The rail's panel is always 220 px wide; collapsed, a `clip-path`
hides all but 56 px and the right hairline is translated to the visible edge.
Hover expands after 150 ms and collapses 300 ms after leave (mouse only); the
slot in the page stays 56 px so hover never reflows the page. Pinning makes the
slot 220 px and is stored in `localStorage["lumen.rail.pinned"]`. Under 1024 px
the rail is hidden and a Radix Dialog drawer (opened by the top bar's menu
button) shows it expanded; phones use `MobileTabBar`. Tooltips switch off when
expanded through the new `Tooltip disabled` prop, so a focused link is never
remounted.
**Why:** §5 Motion allows only opacity and transform; animating width would
reflow the canvas on every hover.

## 0048 · 2026-09-27 · Scroll regions and empty listboxes stay accessible
**Decision:** A Modal body joins the tab order only while it overflows
(ResizeObserver); the environment list is focusable when it scrolls (more than
eight); the palette's result listbox is `display: none` while loading or when
nothing matches, with "No matches for …" outside it.
**Why:** axe `scrollable-region-focusable` and `aria-required-children`
(WCAG 2.1.1, 1.3.1) flagged each of these.

## 0049 · 2026-09-27 · Context menu long-press at 500 ms and Shift+F10
**Decision:** `ContextMenuTrigger` dispatches the browser's own `contextmenu`
event after a 500 ms touch press (Radix waits 700 ms) and on `Shift+F10` or the
ContextMenu key, positioned under the focused element.
**Why:** SPEC C5 timings; browsers disagree on where a keyboard-triggered
context menu lands.

## 0050 · 2026-09-27 · Registry test ignores SCREAMING_CASE exports
**Decision:** The gallery-coverage test treats exports matching `^[A-Z][a-z]`
as components. Constants such as `PANEL_WIDTH_KEY`, `RAIL_PINNED_KEY`,
`LONG_PRESS_MS` and `BREADCRUMB_MAX_CHARS` are exported for the shell (Phase 5)
and tests.
**Why:** Constants are not components and have no gallery page.

## 0051 · 2026-09-27 · Data-display dependencies and licenses
**Decision:** Added to `@lumen/ui`, pinned in the catalog; licenses read from
the installed packages.

| Package | Version | License | Role |
|---|---|---|---|
| @tanstack/react-table | 9.2.4 | MIT | Sorting and selection state for `DataTable` |
| @tanstack/react-virtual | 3.14.13 | MIT | Row virtualization (5,000 rows at 60 fps) |
| uplot | 1.6.32 | MIT | Canvas time-series charts |
| @radix-ui/react-dropdown-menu | 2.1.24 | MIT | Row actions menu in `DataTable` |
| motion | 13.4.4 | MIT | Toast enter, exit and stack re-flow (already pinned in 0025) |

`@lumen/shared` (workspace) is now a dependency of `@lumen/ui` so the error
card takes the real `LumenError` type.
**Maintenance:** TanStack Table 9 shipped 2026-08-04 (9.2.4 on 2026-08-28) and
is the maintained major; 8.x has had no release since 2025-04. TanStack Virtual
released 2026-09-14. uPlot's last release is 2025-03-14; it is stable,
dependency-free and 50 kB, and the API surface Lumen uses (options, hooks,
`setCursor`, `setSeries`, `valToPos`, cursor sync) has not changed in years.
Radix DropdownMenu released 2026-07-31.
**Rejected:** a diff library (the viewer compares settings field by field, not
text); `@radix-ui/react-toast` (its region uses `aria-live="off"` with its own
announcer, which contradicts the spec's polite region with `role="alert"` for
danger toasts, and it has no "max three" stack).

## 0052 · 2026-09-27 · DataTable hides TanStack's types behind plain columns
**Decision:** Callers describe columns as `{ id, header, value?, cell?, size,
align, sortable, mono, tabular, hideInCards }` with plain functions;
`DataTable` converts them to TanStack Table 9 column definitions internally
(with its own comparator, so no sort-function registry is needed). Sorting and
selection can be controlled (`sorting` / `selectedKeys`) or left to the table.
The table stays a real `<table>`; virtualization renders only the rows in view
between two spacer rows, so native table semantics, `aria-rowcount` /
`aria-rowindex` and the sticky header keep working.
**Why:** Table 9's feature-typed generics are heavy for page code and change
between majors; one adapter keeps every page on a small, stable API.

## 0053 · 2026-09-27 · Toasts come from a module store, not a context
**Decision:** `toast({...})` writes to a tiny module-level store read by
`<Toaster>` with `useSyncExternalStore`; `toast.dismiss(id?)` and
`activeToasts()` complete the API. The Toaster keeps three, removes the oldest
from the store when a fourth arrives, pauses a toast's JavaScript timer on
hover, keyboard focus and window blur, handles F8 (focus newest, remembering
where focus was) and Escape (close focused, focus returns). Closing toasts are
marked `data-state="closing"` and `aria-hidden` while their exit plays.
**Why:** Mutations and event handlers need to toast without threading a
context; JavaScript timers (not CSS animation end) make Playwright's fake clock
and Vitest fake timers able to test dismissal.

## 0054 · 2026-09-27 · Chart colors are read from tokens at draw time
**Decision:** `Chart` reads `--color-*` and `--font-mono` with
`getComputedStyle` when it builds the uPlot instance and rebuilds on a
`data-theme` change. Area fills convert the token hex to `rgba()` at 12 %
at runtime. Only uPlot's structural CSS is vendored, restyled with tokens, in
`packages/ui/src/styles/chart.css`; uPlot's legend is off and the legend,
limit line, markers and tooltip are HTML overlays styled with utilities.
y ticks are round steps (0 / 200 / 400 / 600) and x ticks are round minutes
strictly inside the range so edge labels never collide.
**Why:** Canvas cannot use CSS variables; this keeps "tokens only" true and
both themes correct.

## 0055 · 2026-09-27 · Terminals scope themselves to the dark tokens
**Decision:** `TerminalFrame` puts `data-theme="dark"` on its inner screen, so
every token inside resolves to the dark palette in both themes; the outer
1 px `border-strong` frame stays in the page's theme.
**Why:** SPEC wants terminals dark in both themes without new color tokens or
literals.

## 0056 · 2026-09-27 · Status gaps closed with the Signal components
**Decision:** §4.12's `StatusDot` / `StatusPill` are not built; the Signal
`StatusMarker` / `StatusTag` (0030, session 3) replace them. The one missing
piece, `AvatarStack`, is added (max 4 then "+N", 2 px surface ring, hover lifts
within an isolated stacking context, `role="group"` with "Members: …").
`LiveRegion` is added as the shared polite announcer used by progress steps
and chart keyboard moves.

## 0057 · 2026-09-27 · Gallery specs split, with room to run
**Decision:** The axe walk moved out of `gallery.spec.ts` into
`gallery-a11y.spec.ts`, split into four parallel shards (5 minutes each). The
screenshot walk stays one test with a 10-minute limit.
**Why:** With 60+ pages, one test that ran axe and another that took every
screenshot came close to their limits at the phone width. Shards finish sooner
and a failure names a smaller set of pages.

## 0058 · 2026-09-27 · Canvas and virtualization dependencies
**Decision:** `@xyflow/react` 12.12.0 (MIT) for the canvas and
`@tanstack/react-virtual` 3.14.13 (MIT) for the log viewer, pinned in the
catalog and added to `@lumen/ui`. Transitive: `@xyflow/system` 0.0.83 (MIT),
`zustand` 4.5.7 (MIT), `classcat` 5.0.5 (MIT), `d3-zoom` / `d3-selection` /
`d3-drag` / `d3-interpolate` 3.x (ISC), `@tanstack/virtual-core` 3.17.11 (MIT).
Licenses read with `npm view`; both packages had releases within the last three
weeks (actively maintained). Only React Flow's structural `base.css` is loaded
(imported in `packages/ui/src/styles/canvas.css`, `@layer base`); every visible
part is a Lumen component, and its internal z-indexes stay inside the
`.react-flow` stacking context.
**Why:** SPEC tech stack names React Flow for the canvas; TanStack Virtual is
headless, small, and handles fixed and measured rows in one API.
**Rejected:** `react-window` (no dynamic row measurement without a second
package); hiding the React Flow attribution (the maintainers ask that only Pro
subscribers do so; it stays, restyled to tokens, 24 px target).

## 0059 · 2026-09-27 · Devicon marks vendored, provider marks stay monograms
**Decision:** Framework and database marks are Devicon 2.17.0 (MIT) "plain"
SVGs (Rust, Deno and MySQL only ship a single-shape "original"), normalised to
`fill="currentColor"` and vendored under `packages/ui/src/icons/vendor/` with
generated path data (`devicon-paths.ts`) so they render inline with no request.
`scripts/vendor-devicons.mjs` regenerates them from the pinned release;
`vendor/LICENSES.md` lists source, license and mark owner per file (including the
Go gopher CC BY 4.0 and Ruby logo CC BY-SA 2.5 attributions). Marks are
monochrome everywhere, including node headers; a `color` prop exists but no
brand tint is shipped. Provider marks are not vendored: `ProviderMark` draws
monogram tiles (`OC AWS GCP AZ HZ DO ?`), widening for three letters rather than
shrinking the type below 11 px.
**Why:** Phase 1 §5 chose Devicon; Signal allows one accent per view, and brand
colors in node headers would compete with it and need color literals outside
the token file. Provider marks require a recorded brand-guideline review first;
none was done, so the §5 fallback applies.
**Open:** owner decides whether to review provider guidelines and whether node
headers should carry brand tints (would add tokens to `colors.css`).

## 0060 · 2026-09-27 · Log viewer semantics: a list plus a separate live region
**Decision:** The scrollable log is `role="list"` (one tab stop, roving focus on
`role="listitem"` rows through arrow keys) and a visually hidden `role="log"`
region announces only the newest line, at most once a second, only while
`live`. Timestamps and `DBG` tags use `text-secondary`, not `text-muted`.
**Why:** `role="log"` cannot own list items (axe `aria-required-parent`), and a
live list of 50,000 lines must not be announced wholesale. Timestamps carry
information, so 0038 (muted text is never informative) wins over the §4.14
proposal.

## 0061 · 2026-09-27 · Log viewer follow mode
**Decision:** Following pins the list to the newest line. Scrolling more than
two rows up (or ArrowUp, Home, Space) pauses it, records where new output starts
(a 1 px accent boundary above that line) and shows "Jump to live" ("Jump to end"
when not live) only while lines exist below the viewport. End, the pill, or
scrolling to within half a row of the end resumes. `followOutput` can be
controlled; `defaultFollowOutput` and `newSinceIndex` set the initial state.
Copy feedback is an inline "Line copied" chip plus a polite announcement.
**Why:** SPEC C7 logs behaviour; the half-row threshold absorbs fractional
scroll offsets on high-density screens (found by the phone e2e run).
**Seam:** the "Line copied" chip stands in for the Toast component being built
in the feedback worktree; swap when it lands.

## 0062 · 2026-09-27 · ANSI colors map to token text tiers; backgrounds dropped
**Decision:** `parseAnsi` handles SGR 0–4, 22–24, 30–37, 39, 90–97, 38;5;n and
38;2;r;g;b and maps every foreground to one of six token classes
(`danger-text`, `success-text`, `warning-text`, `info-text`, `accent-text` for
magenta and cyan, `text-secondary` for black, white and greys). Backgrounds are
parsed and ignored; other CSI and OSC sequences (cursor moves, hyperlinks) are
stripped, and a sequence cut off at the end of a line never leaks an ESC
character. Output is plain segments rendered as spans, never HTML.
**Why:** every text color then holds 4.5:1 in both themes; background colors
from build tools would break contrast and the calm panel.

## 0063 · 2026-09-27 · Canvas opens at 100 % and pauses edge flow while moving
**Decision:** `CanvasFlow` centres the scene at exactly 100 % on first render
(`fitViewOptions` min and max zoom 1), mounts only elements in view, hides the
8 px grid below 60 % zoom, and pauses the Signal edge flow (`.edge-flow`) while
the viewport pans or zooms (`data-moving` toggled on the DOM from React Flow's
move events, no re-render). Nodes are never draggable or selectable in Phase 1.
**Why:** at fitted zoom levels under 100 % node links and group labels shrink
below the 24 px WCAG 2.5.8 target (axe failed the gallery); measured on a
production build, 30+ animated dashes repainting over a moving layer cost
frames while panning (57 → 60 fps with the pause), and the dense 8 px pattern
is noise when zoomed out.
**Seam:** Phase 05 wires selection, dragging, the node context menu (the
component exposes `onContextMenu` for Shift+F10 / right click) and keyboard
nudging.

## 0064 · 2026-09-27 · Decode title
**Decision:** `DecodeText` resolves a display title left to right from glyph
noise in 9 steps over 324 ms (hard cap 360 ms, DECISIONS 0032), once per mount
or `replayKey` change. The server renders the final text; during the decode the
final text is the accessible name (sr-only) and an invisible copy sizes the box
so layout never moves. Reduced motion (OS or `data-reduced-motion="true"`)
shows the text immediately. Every gallery component page title uses it.
**Why:** Signal's "the system is live" arrival, without layout shift or an
unreadable accessible name.

## 0065 · 2026-09-27 · Specialized gallery pages and performance evidence
**Decision:** The gallery gains pages for Log viewer, Canvas, Canvas node,
Volume chip, Canvas group, Canvas edge, Stepper, DNS record card, Port check
card and Decode title, plus two bespoke performance pages, `logs-perf` (50,000
lines streaming five per second) and `canvas-perf` (10 × 10 services, 90
references), both in `registry.json` so axe covers them. Fixture data lives in
`@lumen/ui/fixtures` (not the main barrel). `e2e/scripts/perf-logs.mjs` and
`perf-canvas.mjs` record every animation frame (and optionally a Chrome trace)
into `docs/evidence/phase-01/perf/`.
**Why:** Phase 1 §5 Performance and §8 evidence require fps readouts at the
stated sizes.

## 0066 · 2026-09-27 · Token-only styling enforced by lint and a test
**Decision:** An inline ESLint rule (`lumen/design-tokens-only`) rejects any
string in `packages/ui/src` or `apps/web/src` (tests and `src/tokens` excepted)
that contains a hex color, a Tailwind arbitrary font size (`text-[13px]`) or a
raw z-index (`z-10`, `z-[5]`). `styles/design-guard.test.ts` applies the same
three checks to every stylesheet outside `src/tokens`.
**Why:** Phase 1 §6 asks for proof that no value escapes the token layer.
Tailwind arbitrary values are where a page would invent its own. An esquery
`no-restricted-syntax` selector was tried first; its regex parsing silently
missed bracketed values, so the rule uses plain JavaScript regexes.
**Rejected:** a Stylelint setup (one more tool for three patterns).

## 0067 · 2026-09-27 · React hooks rules apply to the design system
**Decision:** The React hooks rules (including the compiler-era purity,
refs-in-render and set-state-in-effect checks) now run on `packages/ui`, not
only `apps/web`. Browser state is read through `useSyncExternalStore` (theme
preference and OS scheme, density, a shared `useNow` clock); props copied into
state are adopted during render; `Date.now()` is never called during render.
The two TanStack Virtual call sites carry a described disable for
`incompatible-library`, which is informational.
**Why:** Turning the rules on found stale captures in the chart and relative
times that never ticked. The theme provider still renders dark on the server
and keeps a choice in memory when storage is blocked.

## 0068 · 2026-09-27 · Density is a global preference
**Decision:** `data-density="compact"` on `<html>`, stored under
`localStorage["lumen.density"]` and restored by the head script before first
paint. `useDensity()` reads it live; the `density-compact:` Tailwind variant
serves CSS-only pieces (menu rows 32 → 28 px). Tables default to it; an explicit
`dense` prop still wins. Resolves the Phase 1 §10 open question with its default;
Phase 15 adds the account setting that writes the same key.
**Why:** A per-table setting would make every table remember its own choice.

## 0069 · 2026-09-27 · axe-core in the gallery's Run axe button
**Decision:** `axe-core` 4.13.0 (MPL-2.0, maintained by Deque, released
2026-09-23) is a dependency of `@lumen/web`, loaded with a dynamic `import()`
only by the dev gallery's "Run axe" button. It runs the same tags as the CI spec
plus best practices on `<main>` and lists violations in a popover.
**Why:** Phase 1 §4.15. The version matches the one `@axe-core/playwright`
already installs, so there is one copy. MPL-2.0 is file-level copyleft and the
files are used unmodified; the chunk never loads outside `/dev/components`,
which production builds exclude.

## 0070 · 2026-09-27 · Merged kits wired together; stand-ins that stay
**Decision:** After the three Phase 1 branches merged: table row actions use
the shared `DropdownMenu`; the top bar's offline banner is a wrapping `Alert`;
the stepper's state type is `WizardStepState` (progress steps own `StepState`).
Two stand-ins stay on purpose: the port-check card's one-line `$ command` with
its own copy button (a different pattern from the multi-line `CodeBlock`), and
the log viewer's "Copied" button label (the kit's inline copy feedback, as in
`CopyField`).
**Why:** One menu, one banner and one copy-feedback pattern across the kit.

## 0071 · 2026-09-27 · Bundle cost of the kit, measured
**Decision:** `e2e/scripts/bundle-button.mjs` bundles `import { Button }` and the
whole kit with esbuild (minified, React external) and records sizes and
metafiles in `docs/evidence/phase-01/bundle/`. Button alone: 65.8 KB minified,
21.2 KB gzip; whole kit: 896 KB / 304 KB. Of the Button cost, tailwind-merge is
28 KB minified and the 83-icon allowlist 20.6 KB (about 6 KB gzip), because
`<Icon name>` looks icons up in one map. Kept: every page renders icons, so the
set is paid once per app, and the name-based API keeps the vocabulary fixed.
`esbuild` 0.27.7 (MIT) is an e2e dev dependency at the version tsx installs.
**Rejected:** per-icon imports (lets pages reach past the allowlist).

## 0072 · 2026-09-27 · The keyboard pass is automated
**Decision:** `keyboard-walk.spec.ts` tabs through every gallery page (except
forced-open modal pages, covered by the overlay specs) in every project and
fails when a focus stop looks identical focused and unfocused (outline, shadow,
background, border and color of the element and its parent). Examples that force
the focused look with `data-force="focus"` are skipped. It stands in for the
per-group manual pass the phase asks for and runs in the Visual CI job.
**Why:** A manual pass is not repeatable; a suppressed ring without a
replacement is the failure that matters, and this catches it on every change.

## 0073 · 2026-09-27 · Protocol v1 baseline replaces the Phase 00 placeholder
**Decision:** The agent protocol is rebuilt to PHASE-02 §4.1: one proto file per
concern (`common`, `envelope`, `hello`, `heartbeat`, `metrics`, `portcheck`,
`update`) and the envelope with `protocol_version`, `server_id`, `seq`,
`timestamp_ms`, `payload`, `signature` and the `body` oneof (10–21). This breaks
the Phase 00 placeholder (`agent.proto`), which never shipped. CI's `buf breaking`
step now compares against `main` only once `main` has `envelope.proto`, so this
branch establishes the v1 baseline and every later change is checked.
**Why:** The phase document fixes the exact fields; keeping the placeholder's
field numbers would have forced a second envelope design.
**Rejected:** keeping `agent.proto` and appending (field 1/2 types differ); a
`v2` package for the first real protocol.

## 0074 · 2026-09-27 · Envelope signing: body-only payload, both directions
**Decision:** The sender serializes an `Envelope` that carries only `body` and puts
those bytes in the outer envelope's `payload`; the outer `body` stays unset.
The Ed25519 signature covers `protocol_version (u32) || len(server_id) (u16) ||
server_id || seq (u64) || timestamp_ms (i64) || payload`, big-endian (the
length prefix makes the concatenation unambiguous). Agents sign with the
identity key registered at join; the control plane signs with an instance key
(`AGENT_SIGNING_KEY`, a base64 seed; development generates one into
`STATE_DIR/agent-signing.key`), whose public half the join response returns.
Seal/Open live next to the generated code in Go (`envelope.go`) and TypeScript
(`src/envelope.ts`); fixtures prove both produce identical bytes.
**Why:** Signing the transmitted bytes needs no deterministic cross-language
re-serialization; signing both directions means a compromised proxy can't
inject commands (PHASE-02 §5). Resolves the §10 open question in favour of the
default.
**Rejected:** TLS + bearer only (weaker); signing a re-serialized oneof.

## 0075 · 2026-09-27 · Protocol fields added beyond the §4.1 list
**Decision:** `AgentHello.provider` (16) and `region_label` (17) — detection runs
on the agent; `AgentConfig.rotated_credential` (7) — how rotation reaches the
agent; `HostSample.self` (15, `AgentSelf{agent_rss_bytes, goroutines,
send_queue_len, reconnects_total}`) — required by §5 Observability; and
`HostSample.disk_low` (16) — the agent is authoritative for the build refusal in
Phase 03.
**Why:** Each is needed by a §4–§5 requirement that the message list omits.

## 0076 · 2026-09-27 · Minisign "ED" signatures, verified with openssl in the installer
**Decision:** Releases carry a `.sha256` (sha256sum format) and a standard
minisign `.minisig` (prehashed "ED": Ed25519 over BLAKE2b-512, plus the global
signature over the trusted comment). The agent verifies with
`internal/minisign` (golang.org/x/crypto/blake2b); the installer verifies both
signatures with `openssl pkeyutl -rawin` and coreutils only. The release key is
embedded in the agent at build time (`LUMEN_RELEASE_PUBKEY` → ldflags) and
substituted into the installer by the control plane (`AGENT_RELEASE_PUBKEY`).
`lumen-agent/cmd/lumen-release` generates keys and signs; its secret-key file
is unencrypted, so production keys stay offline or in a CI secret. Real
`minisign -V` verifies our signatures (evidence).
**Why:** One small Ed25519 key, a verifier that fits in a shell script with no
extra packages on a fresh VM. Resolves the §10 signature-tooling question.
**Rejected:** cosign/sigstore (heavier, needs network trust roots); GPG.

## 0077 · 2026-09-27 · SHA-256 for random secrets
**Decision:** Join tokens and server credentials are 32 random bytes (base64url)
stored as SHA-256 hex and compared in constant time.
**Why:** Brute force of a 256-bit random secret is infeasible, so a slow KDF
adds cost without security; argon2 stays for passwords (Phase 04).

## 0078 · 2026-09-27 · Reconnect, liveness and logging rules
**Decision:** Backoff 1 → 2 → 4 → 8 → 16 → 30 s cap, ±20 % jitter, reset after
60 s connected; one warn line per backoff step. After the ControlHello wait,
reads have no deadline: liveness is a ping every 10 s whose pong must arrive
within 30 s, plus 30 s write deadlines; the gateway closes sockets idle for 30 s
(pings count as activity).
**Why:** A per-read deadline closes the socket in coder/websocket when the
control plane legitimately says nothing (found on the first host install).

## 0079 · 2026-09-27 · Caddy bootstrap in Phase 02, hardened and pinned
**Decision:** `caddy:2-alpine@sha256:6aeddd44…cb2b` (Caddy 2.11.4, multi-arch
index), container `lumen-caddy`, host network, admin API `127.0.0.1:2019`,
`--cap-drop ALL --cap-add NET_BIND_SERVICE`, read-only root with `/config` and
`/data` mounts under `/var/lib/lumen/caddy`, pids 512, memory 256 MB,
`no-new-privileges`, restart always, label `lumen.role=proxy`. Base config: a
catch-all 404 page on `:80` and `:443`, a self-signed fallback certificate for
`:443` (tag `lumen-fallback`), `automatic_https` disabled on these two base
servers (Phase 03 enables certificates per route). A separate loop re-ensures
the container every heartbeat interval; probes never block heartbeats.
**Why:** The checklist needs "Proxy running" and the port check needs a
listener (resolves §10). Measured: a container removed by hand is back in 9 s.

## 0080 · 2026-09-27 · Queue bounds and rate limits
**Decision:** Agent → control plane queue 1,000 messages: metrics are dropped
first, then heartbeats; acks, errors and results are never dropped (kept even
past the limit) and are the only thing kept while offline. Control plane →
agent 256 in-flight per socket. Gateway: 200 msg/s and 2 MB/s per connection
(`4008 rate_limited`), 60 upgrade attempts per minute per address, join
10 attempts per minute per address (`AGENT_JOIN_RATE_LIMIT`), in-process limiters
(single API process until Phase 04, SPEC_QUESTIONS 20).

## 0081 · 2026-09-27 · Socket ownership in Postgres, commands over NOTIFY
**Decision:** Each API process keeps `server_id → socket` in memory and writes
`servers.gateway_node` / `gateway_connected_at` on connect. Commands for a
socket held elsewhere, replies for waiters elsewhere, and "claimed" notices
(which close an older connection on another process with `4001 superseded`)
travel on the `lumen_agent` NOTIFY channel. Realtime events use `lumen_events`.
**Why:** No Redis (SPEC B2); any replica can serve an API call for any server.
Only the single-process path is exercised by tests so far (see Known gaps).

## 0082 · 2026-09-27 · Clock skew is measured, corrected and surfaced
**Decision:** Every connection starts with the raw local clock, so the control
plane measures the real skew from AgentHello (stored in
`servers.clock_skew_ms`, shown as a CLOCK_SKEW issue over 5 minutes). The agent
then corrects its envelope timestamps with `server_time_ms`. The gateway rejects
envelopes outside −5 min / +1 min with `OpError{CLOCK_SKEW}` (replay window).
**Why:** §5 says a skewed server gets every message rejected; with correction the
server keeps working while the user is told to enable NTP. Deviation recorded
in SPEC questions.

## 0083 · 2026-09-27 · Self-update: trial run, health window, guard, probation
**Decision:** The agent verifies SHA-256 and signature, writes
`lumen-agent.new`, runs it as `run --trial <op_id>` (must connect, be accepted
and see Docker and Caddy healthy within 60 s), then swaps (`current → .prev`,
`.new → current`), records `state.update`, and exits 0. After the restart the
new binary must confirm health within 60 s or rolls back; three starts without
settling roll back; a ten-minute probation follows. The unit also runs
`ExecStartPre=-/usr/local/bin/lumen-agent.prev update-guard`: the previous
binary counts starts while an update is in progress and restores itself after
five, which covers a new binary that crashes before its own checks run.
**Why:** A binary that exits immediately can never roll itself back; the trial
and the guard close that hole (§9 review question). Verified on a systemd host:
good update, exit-immediately build, and crash-after-swap build.

## 0084 · 2026-09-27 · Revoked agents exit 78 and stay stopped
**Decision:** On Revoke the agent deletes its credential and exits 78
(EX_CONFIG); `run` without a credential also exits 78. The unit adds
`RestartPreventExitStatus=78` and `SuccessExitStatus=78` next to
`ConditionPathExists`.
**Why:** On the test host (systemd 255) `ConditionPathExists` did not stop
`Restart=always` from restarting the service after the credential was deleted.

## 0085 · 2026-09-27 · Phase 02 API shape
**Decision:** Server routes use snake_case bodies (0019) and prefixed ids
(`workspace_id: ws_…`, 0012) rather than the camelCase/UUID sketch in §4.11.
`POST /port-check` runs synchronously and returns 200 with the result (no job
queue until Phase 04); `POST /agent-update` returns 202 with `status: sent` and
the result lands on `servers.agent_update` and a `server.update` event. The
server object adds `os_version`, `kernel`, `hostname`, `docker_version`,
`disk_low`, `clock_skew_ms` and `issues` (catalog errors). Routes are guarded by
`LUMEN_ADMIN_TOKEN` (temporary instance-admin bearer, replaced in Phase 04) and
write `audit_log` rows. `/v1/ws` takes the token as the `auth.<token>`
subprotocol (browsers can't set headers) or a bearer header.

## 0086 · 2026-09-27 · Extra Phase 02 tables
**Decision:** Migration 0001 adds, beside `servers` and `server_join_tokens`:
`agent_ops` (24 h de-duplication, composite key `(server_id, op_id)` with the
op id stored as `<kind>:<op_id>` because replies reuse the request's op id),
`notifications` (in-app rows; Phase 08 delivers them), and `audit_log` (SPEC B6
columns). Phase 04 adds foreign keys to `workspaces` and must keep the columns.
**Why:** §5 and §6 require the de-dup table, the notification row and audit
entries; the phase's "two tables only" line predates those requirements.

## 0087 · 2026-09-27 · Automatic port check when the proxy is ready
**Decision:** The automatic check runs on the first heartbeat that reports Caddy
healthy while no result is stored (retried at most every five minutes), not on
the first heartbeat.
**Why:** On a fresh VM the proxy image is still pulling at first heartbeat; the
check would report `not_listening`.

## 0088 · 2026-09-27 · Detected provider wins over the wizard's choice
**Decision:** The join token records the provider the user picked; a provider
detected from the metadata service replaces it unless detection says `other`.

## 0089 · 2026-09-27 · Phase 02 dependencies
**Decision:** Licenses and maintenance checked on 2026-09-27.

| Package | Version | License | Role |
|---|---|---|---|
| github.com/coder/websocket | v1.8.15 | ISC | Agent WebSocket client (context-aware, no deps) |
| golang.org/x/crypto | v0.57.0 | BSD-3-Clause | BLAKE2b for minisign verification |
| ws (npm) | 8.21.3 | MIT | Gateway and `/v1/ws` servers (8.22.0 was one day old; the pnpm release-age guard applies) |
| @types/ws | 8.18.1 | MIT | Types |
| zod (in @lumen/shared) | 4.6.5 | MIT | Already in the catalog; shared request schemas |
| caddy:2-alpine | digest `6aeddd44…` | Apache-2.0 | Platform proxy image |

**Rejected:** gorilla/websocket (no context API); the Docker Go SDK (large; the
agent uses the Engine HTTP API directly); testcontainers (tests use schemas in
the shared dev Postgres instead).

## 0090 · 2026-09-27 · Host verification in systemd containers instead of Multipass
**Decision:** `e2e/vm/` runs the real installer against a bundled control plane
in a Linux container: `host.Dockerfile` is a privileged systemd Ubuntu 24.04
"VM" (no Docker preinstalled; the installer installs it), `/var/lib/docker` and
`/var/lib/containerd` are volumes (overlay can't stack on overlay), a test CA
signs the control plane certificate, and `scenarios.sh` drives port-block,
offline, disk-full, proxy removal, updates and the audit. `build-releases.sh`
signs real and deliberately broken builds.
**Why:** The development machine is Windows with Docker Desktop; Multipass is not
available. The harness exercises systemd, iptables, Docker installation and the
network path the port check uses.

## 0091 · 2026-09-27 · 44 px touch targets under 640 px
**Decision:** Below 640 px, full-width buttons and the buttons and links
directly inside dialog, confirm and sheet footers are 44 px tall
(`TOUCH_FOOTER` in `control-styles.ts`, `max-sm:h-[44px]` on `fullWidth`).
Desktop sizes stay 28 / 32 / 36.
**Why:** 36 px footer buttons in phone-only surfaces (sheets, bottom-sheet
dialogs) are below the comfortable touch size; scoping by breakpoint keeps the
dense desktop rhythm.

## 0092 · 2026-09-27 · Primary button fill is a token; paper in light
**Decision:** `--color-primary-bg` fills the primary button: the 4 % ink wash in
dark, `#ffffff` in light. Frame, brackets and hover are unchanged.
**Why:** In light, 4 % ink on the page read as a pressed grey key; paper with a
full-ink frame reads as the one strong element.

## 0093 · 2026-09-27 · Empty-state tiles are actions or rows, never dead buttons
**Decision:** A tile with `onSelect` or `href` is a framed button or link; a
tile without is a frameless, non-focusable row. When the tiles are actions, the
EmptyState's own `action` renders ghost (the "other" way out).
**Why:** Tiles rendered as buttons without handlers were four competing targets
that did nothing.

## 0094 · 2026-09-27 · Canvas node status moves to the meta row when tight
**Decision:** Node width stays 260. If the name and the full `[ ■ STATUS ]` tag
don't both fit the header (estimated from Geist Mono metrics), the tag moves to
the meta row and the commit message truncates instead.
**Why:** Names are the identifier people scan for; the status word must stay
visible (C11), and the commit message already has a tooltip.
**Rejected:** a marker-only tag with the word in a tooltip (hides the word);
the status on the chip row (squeezed the server badge to "ORAC…").

## 0095 · 2026-09-27 · Tables stack into cards on phones by default
**Decision:** `DataTable` `responsive` defaults to `"cards"`; cards support
selection. `"scroll"` remains as an opt-out.
**Why:** A sideways-scrolling table under 640 px gives no sign that columns are
hidden.
**Amended 2026-09-28:** virtualized tables (over 100 rows by default) keep the
scrolling table on phones, because the card list renders every row; a
virtualized card list is a Phase 5 known gap.

## 0096 · 2026-09-27 · One sealed-value form; Enter as a word
**Decision:** `SealedValue` (lock + "Sealed", sans, text-secondary) is the only
rendering of a sealed value (field, table, diff). `Kbd` renders `enter` as
"Enter" on every platform.
**Why:** Mono caps "SEALED" read as a button; ⏎ is missing from Geist Mono and
fell back to a system font. SPEC C13 and Phase 10 write "⇧⏎"; the Kbd keeps the
`enter` key name, only the glyph changes.

## 0097 · 2026-09-27 · Violet as the second chart series
**Decision:** New solid token `--color-violet` (dark `#8b5cf6`, light `#7c3aed`),
checked at 3:1 against every surface. Chart default series colors are accent,
violet, success, warning.
**Why:** Accent blue and info blue were indistinguishable as neighbouring lines.

## 0098 · 2026-09-27 · Error actions can wait: `availableInS`
**Decision:** A catalog `button` action may carry `availableInS`; ErrorCard
disables it and counts down ("Retry in 12s"). RATE_LIMITED sets it from
`retryAfterS`. VALIDATION_FAILED and FORBIDDEN gained "Show fields" and "View
members" (`show_invalid_fields`, `view_members`).
**Why:** C14: every error carries a way forward, and a retry that is certain to
fail should say when it will work.

## 0099 · 2026-09-28 · Tall gallery examples get a taller viewport for their screenshot
**Decision:** When an example is taller than the viewport, `gallery.spec.ts`
grows the viewport height (never the width) for that one capture.
**Why:** Playwright's retries scroll an element taller than the screen to a new
alignment each time, so it never reads as stable; the phone card tables hit it.
