# Phase 05 — App shell, projects, canvas, inspector

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (UI review with SPEC H2; realtime + staged-changes code with H1) |
| **Depends on** | Phase 01 (design system: tokens, `packages/ui`, `/dev/components`), Phase 04 (control plane: auth, projects, environments, services, variables, deployments API, realtime WebSocket, OpenAPI client) |
| **Unblocks** | Phase 06 (GitHub option in the Add flow), Phase 07 (Networking settings section), Phase 08 (Metrics tab, full Logs modes), Phase 09 (Database tabs, volume panel), Phase 10 (Environments, staged-changes polish), Phase 13 (Template option in Add flow), Phase 15 (Workspace/account settings pages) |
| **Spec sections** | SPEC C3, C4, C6, C7.2, C7.3, C7.4, C7.5, C7.6, C7.7, C7.8, C7.9, C7.11 (runtime mode only), C7.12 (Source · Build · Deploy · Resources only), C7.23, C7.24, C7.26, C8.1–C8.6, C9, C10, C11, C12, C13, C14, B4, B13, B14, J1, J6, J7 |
| **Estimated sessions** | 12 focused sessions (shell · auth · home + projects · add flow · canvas ×2 · inspector header + deployments · variables · logs · settings · palette + notifications + global states · realtime + staged changes + e2e polish) |

## 1. Goal
A user can sign up, create a project, add a Docker-image service, watch it deploy live on the canvas, read its runtime logs, change its memory limit through staged changes, and redeploy, entirely from the dashboard, with every screen passing the SPEC C14 quality bar at 390 / 1024 / 1440 px in dark and light themes.

## 2. Why this phase exists
The UI is the product (SPEC `<why_ui_matters>`). Phases 02–04 built a correct platform that nobody but an API client can use. This phase turns it into the thing a beginner sees: the shell that frames every later page, the canvas that gives services spatial memory, and the inspector that holds every per-service surface added by later phases. The structural parity target is a canvas-plus-right-inspector product like Railway: a project is a canvas of service nodes, clicking a node opens a right-hand panel with Deployments / Variables / Metrics / Logs / Settings tabs, config edits collect in a bottom staged-changes bar, ⌘K reaches everything, and an environment switcher in the top bar swaps the whole canvas. Get the shell, the canvas and the inspector right here and every later page inherits the feel; get them wrong and every later phase pays for it. Visual identity stays Lumen's own (SPEC C2, C4): graphite surfaces, aurora-teal accent, Geist type. Nothing in this phase copies another product's copy, names, logos or brand assets.

Every screen in this phase must answer one question for a first-time user: "what do I click next?" (C1, C3.2). Everything is live (C3.4): there is no refresh button anywhere in the dashboard, and a status change must be visible within 1 s (B14).

## 3. Scope
### In scope
- App shell (C6): left rail (56 px collapsed, 220 px pinned), top bar (48 px), content area (full-bleed canvas or centered 1200 px), inspector panel (480–880 px, resizable, remembered), staged-changes bar, global banners.
- Auth pages (C7.2): login, sign up, accept invite, forgot password, reset password, 2FA challenge, verify email. Wired to Phase 04 auth routes. "Continue with GitHub" renders only when the GitHub App exists (button wiring lands in Phase 06).
- Home (C7.3): greeting, onboarding checklist with progress ring, recent projects, recent deploys (live), servers health strip, hero empty state.
- Projects list (C7.4): card grid, search, sort, empty state with three quick starts.
- New project / Add flow (C7.5): the command-palette-style modal with all 8 options. Working in this phase: Database (Postgres / MySQL / Redis / MongoDB image presets with volume; the full database experience is Phase 09), Docker image (with autocomplete and optional registry credential), Empty service, Cron job (schedule builder), Import `.env` into a chosen service. Rendered but routed to a "coming in a later phase" panel: GitHub repository (Phase 06), Template (Phase 13), Import `docker-compose.yml` (Phase 10).
- Project canvas (C7.6): React Flow (`@xyflow/react`) infinite canvas, dot grid, pan/zoom, minimap, auto-layout, snap-to-grid, service node, volume chip, edges from variable references, groups, context menu, multi-select and bulk actions, keyboard navigation, position persistence per environment, crossfade on environment switch, offline warning ring, mobile list view.
- Service inspector header (C7.7) and tabs Deployments (C7.8, including the deployment detail view with timeline, Build / Deploy / Details tabs, error card, rollback dialog), Variables (C7.9: table, masked values, reference chips with autocomplete, sealed toggle, platform variables section, shared variables link; raw editor and `.env.example` banner are Phase 10), Logs (C7.11 runtime mode only: live tail, pause on scroll, "Jump to live", free-text and `level:` filters, timestamps / wrap / dense toggles, download; HTTP and Build modes and the full filter grammar are Phase 08), Settings (C7.12 sections Source, Build, Deploy, Resources; Networking is Phase 07, Scaling & placement is Phase 12, Sleep is Phase 16, Cron section appears here for cron services; Danger zone lands here).
- Command palette (C7.23), notifications center popover (C7.24), global states catalog (C7.26).
- Interaction patterns C8.1 staged changes (basic: collect, review diff, apply; persistence and polish in Phase 10), C8.2 optimistic updates, C8.3 realtime layer, C8.4 toasts, C8.5 confirmations, C8.6 deep links.
- Keyboard shortcuts (C13) and the `?` shortcut sheet.
- Responsive behavior (C12) including the mobile bottom tab bar and the canvas list view.
- Playwright e2e for every user-visible flow above, visual regression baselines, axe on every page.

### Out of scope
- GitHub repo/branch pickers, push-to-deploy, commit metadata from GitHub (Phase 06). The Deployments tab renders commit fields when present; image deploys show "Image" instead.
- Networking settings section, domains, TCP proxy, HTTP logs (Phase 07).
- Metrics tab, HTTP and Build log modes, full filter grammar, observability page (Phase 08).
- Database tabs (Data · Connect · Backups), volume panel actions beyond display (Phase 09).
- Environment creation/management page, PR environments, compare & sync, raw `.env` editor, `.env.example` banner, `lumen.toml` locks, compose import (Phase 10). This phase renders the environment switcher against the environments Phase 04 already creates (production only by default).
- Setup wizard and instance admin (Phase 11). Multi-server placement UI, replicas (Phase 12). Templates gallery (Phase 13). Web terminal / Open shell (Phase 14; the menu item renders disabled with tooltip "Available soon"). Workspace and account settings pages beyond theme preference (Phase 15). Sleep, cron run history, cost (Phase 16).

## 4. Work breakdown

### 4.1 Web app foundation and API client
- **What:** Generate the typed API client from the Phase 04 OpenAPI document, set up TanStack Query with the key factory, an auth-aware fetch wrapper (httpOnly cookie session, CSRF header), error normalization into `packages/shared/errors` shapes, and the Next.js App Router layout tree. Install `@xyflow/react`, `motion`, `@xterm/xterm` (not used until Phase 14, do not install yet), `cmdk` (or build the palette on Radix `Dialog` + own list; record the choice), `zustand` for client UI state, `uplot` (Phase 08, do not install yet). Verify license and maintenance status of every dependency before adding it and record in `docs/DECISIONS.md`.
- **Files:** `apps/web/lib/api/client.ts` (generated), `apps/web/lib/api/fetch.ts`, `apps/web/lib/api/errors.ts`, `apps/web/lib/query/keys.ts`, `apps/web/lib/query/provider.tsx`, `apps/web/app/layout.tsx`, `apps/web/app/(auth)/layout.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/middleware.ts` (redirect unauthenticated users to `/login?next=`), `apps/web/package.json`, `docs/DECISIONS.md`.
- **Done when:** `pnpm --filter web typecheck` passes with the generated client; a request to `GET /v1/me` from a client component renders the user's name; a 401 redirects to `/login?next=<path>`; every API error surfaces as `{ code, title, explanation, fix, action }`.

Query key factory (every hook in the app uses these; no ad-hoc keys):

```ts
export const qk = {
  me: () => ['me'] as const,
  workspaces: () => ['workspaces'] as const,
  workspace: (wid: string) => ['workspace', wid] as const,
  projects: (wid: string) => ['workspace', wid, 'projects'] as const,
  project: (pid: string) => ['project', pid] as const,
  canvas: (pid: string, eid: string) => ['project', pid, 'env', eid, 'canvas'] as const,
  environments: (pid: string) => ['project', pid, 'environments'] as const,
  services: (eid: string) => ['env', eid, 'services'] as const,
  service: (sid: string, eid: string) => ['service', sid, 'env', eid] as const,
  variables: (sid: string, eid: string) => ['service', sid, 'env', eid, 'variables'] as const,
  sharedVariables: (eid: string) => ['env', eid, 'shared-variables'] as const,
  deployments: (sid: string, eid: string) => ['service', sid, 'env', eid, 'deployments'] as const,
  deployment: (did: string) => ['deployment', did] as const,
  deploymentLogs: (did: string, phase: 'build' | 'deploy') => ['deployment', did, 'logs', phase] as const,
  runtimeLogs: (sid: string, eid: string, filter: string, range: string) => ['service', sid, 'env', eid, 'logs', filter, range] as const,
  staged: (eid: string) => ['env', eid, 'staged'] as const,
  servers: (wid: string) => ['workspace', wid, 'servers'] as const,
  server: (srvId: string) => ['server', srvId] as const,
  notifications: () => ['notifications'] as const,
  recentDeploys: (wid: string) => ['workspace', wid, 'recent-deploys'] as const,
} as const;
```

### 4.2 Realtime layer (C8.3)
- **What:** One multiplexed WebSocket to `GET /v1/ws` per browser tab, opened after login, with subscribe/unsubscribe messages keyed by topic. Reconnect with exponential backoff (500 ms, 1 s, 2 s, 4 s, capped at 10 s, with ±20 % jitter). Server events patch the TanStack Query cache directly where the payload is a full row (`setQueryData`), and invalidate where it is a hint. A `useTopic(topic)` hook subscribes on mount and unsubscribes on unmount with reference counting so two components on the same topic share one subscription. Expose connection state to the shell for the "Reconnecting…" bar (C7.26).
- **Files:** `apps/web/lib/realtime/socket.ts`, `apps/web/lib/realtime/topics.ts` (topic names imported from `packages/shared/src/realtime.ts` so web and api can never drift), `apps/web/lib/realtime/use-topic.ts`, `apps/web/lib/realtime/apply-event.ts`, `apps/web/lib/realtime/provider.tsx`.
- **Done when:** with two browser tabs open, a deploy triggered in one shows status changes in the other within 1 s (B14) with no polling; killing the API for 15 s shows "Reconnecting…" and recovers automatically with resubscription; the unit test proves reference counting closes the subscription only when the last subscriber leaves.

Realtime topic → cache action map (the single source of truth for this phase; Phase 04 must emit exactly these):

| Topic | Event payload | Cache action |
|---|---|---|
| `service.status` scoped to `env:{eid}` | `{ serviceId, environmentId, status, activeDeploymentId, updatedAt }` | `setQueryData(qk.services(eid))` patch row; `setQueryData(qk.service(sid, eid))` patch |
| `deployment` scoped to `service:{sid}:env:{eid}` | full deployment row | `setQueryData(qk.deployments(sid, eid))` upsert at top; `setQueryData(qk.deployment(did))`; `invalidate(qk.recentDeploys(wid))` |
| `deployment.log` scoped to `deployment:{did}:{phase}` | `{ seq, ts, line }` chunks | append to `qk.deploymentLogs(did, phase)` ring buffer (max 50 000 lines in memory) |
| `runtime.log` scoped to `service:{sid}:env:{eid}` with filter | `{ ts, line, level?, attrs? }` | append to the live buffer of the Logs tab; not stored in Query cache |
| `staged.changed` scoped to `env:{eid}:user:{uid}` | full staged document | `setQueryData(qk.staged(eid))` |
| `server.status` scoped to `workspace:{wid}` | `{ serverId, status, lastHeartbeatAt }` | patch `qk.servers(wid)` and `qk.server(id)`; drives offline banner and canvas warning rings |
| `canvas.layout` scoped to `project:{pid}:env:{eid}` | `{ layout, updatedBy }` | `setQueryData(qk.canvas(pid, eid))` only if `updatedBy !== me` (avoid fighting the local drag) |
| `notification` scoped to `user:{uid}` | notification row | prepend to `qk.notifications()`; increment unread badge; ARIA live announce for deploy status |
| `variables.changed` scoped to `service:{sid}:env:{eid}` | `{ keys: string[] }` | `invalidate(qk.variables(sid, eid))` |

### 4.3 App shell (C6)
- **What:** Build the persistent shell: left rail, top bar, content slot, inspector slot, staged-changes bar slot, banner stack. Rail pin state and inspector width persist in `localStorage` (keys `lumen.rail.pinned`, `lumen.inspector.width`) and mirror to the account preferences endpoint when logged in. Theme (system / dark / light) is applied via `data-theme` on `<html>` before first paint (inline script in `app/layout.tsx` to avoid a flash), using the Phase 01 mechanism.
- **Files:** `apps/web/components/shell/app-shell.tsx`, `apps/web/components/shell/rail.tsx`, `apps/web/components/shell/rail-item.tsx`, `apps/web/components/shell/workspace-switcher.tsx`, `apps/web/components/shell/top-bar.tsx`, `apps/web/components/shell/breadcrumbs.tsx`, `apps/web/components/shell/environment-switcher.tsx`, `apps/web/components/shell/deploy-activity.tsx`, `apps/web/components/shell/theme-toggle.tsx`, `apps/web/components/shell/banner-stack.tsx`, `apps/web/components/shell/mobile-tab-bar.tsx`, `apps/web/components/shell/reconnecting-bar.tsx`, `apps/web/stores/ui.ts` (zustand: railPinned, railHovered, inspectorWidth, theme), `apps/web/app/(app)/layout.tsx`.
- **Done when:** the rail expands on hover after 150 ms and pins on click of the pin control; the top bar shows correct breadcrumbs on every route; the deploy activity indicator reads "2 deploying" and opens a popover with two live progress rows during two concurrent deploys; the theme toggle switches without flash and persists across reloads; at 768–1023 px the rail collapses to icons only and at <768 px it is replaced by the bottom tab bar.

### 4.4 Auth pages (C7.2)
- **What:** Login, sign up (only when instance registration is open; otherwise the page says "Sign-ups are invite-only. Ask your admin for an invite."), accept invite (`/invite/:token`), forgot password, reset password (`/reset/:token`), 2FA challenge (TOTP code with recovery-code link), verify email (`/verify/:token`). Centered card, product mark, single column, inline field errors, "Continue with GitHub" divider rendered only when `GET /v1/instance/public` says a GitHub App exists.
- **Files:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/signup/page.tsx`, `apps/web/app/(auth)/invite/[token]/page.tsx`, `apps/web/app/(auth)/forgot-password/page.tsx`, `apps/web/app/(auth)/reset/[token]/page.tsx`, `apps/web/app/(auth)/2fa/page.tsx`, `apps/web/app/(auth)/verify/[token]/page.tsx`, `apps/web/components/auth/auth-card.tsx`, `apps/web/components/auth/password-strength.tsx`, `apps/web/components/auth/github-button.tsx`, `apps/web/lib/auth/use-session.ts`.
- **Done when:** every page renders its success, inline-error and loading states; password strength meter reflects zxcvbn-style scoring (implement a small local estimator: length, classes, common-list check of the top 10 000; record library choice if any); rate-limit responses from Phase 04 render "Too many attempts. Try again in 30 s." with a live countdown; the e2e test signs up, verifies email via the test mailbox endpoint, logs out, logs in, and reaches Home.

### 4.5 Home (C7.3)
- **What:** Greeting by time of day and first name, onboarding checklist with a progress ring (six items, each deep-linked: Connect a server → `/servers/new`; Connect GitHub → `/settings/instance/github` (renders the Phase 06 placeholder until then); Deploy your first service → opens the Add flow; Add a database → opens the Add flow on the Database option; Add a custom domain → Phase 07 route with placeholder; Invite a teammate → `/settings/workspace/members`), dismissible with an undo toast. Recent projects (up to 6 cards), recent deploys (live list of 10, subscribed to `deployment` events for the workspace), servers health strip (mini cards with CPU/RAM bars from `qk.servers`). Hero empty state when the workspace has no servers.
- **Files:** `apps/web/app/(app)/page.tsx`, `apps/web/components/home/greeting.tsx`, `apps/web/components/home/onboarding-checklist.tsx`, `apps/web/components/home/progress-ring.tsx`, `apps/web/components/home/recent-projects.tsx`, `apps/web/components/home/recent-deploys.tsx`, `apps/web/components/home/servers-strip.tsx`, `apps/web/components/home/no-servers-hero.tsx`.
- **Done when:** checklist completion is computed from real data (servers count > 0, GitHub installation exists, any ACTIVE deployment exists, any database-kind service exists, any custom domain exists, workspace members > 1) and the ring animates from the previous value to the new one; the recent deploys list updates live with no refresh; the hero empty state shows provider tiles (Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, Other) that route to `/servers/new?provider=<id>`.

### 4.6 Projects list (C7.4)
- **What:** Grid of project cards with name, icon, environment count, service status summary ("4 active · 1 failed"), a mini canvas thumbnail (SVG rendered from the saved canvas layout: rectangles at scaled positions with status-colored dots), last deploy relative time. Search (client-side over name and description, `/` focuses it), sort (Recent / Name) as a segmented control persisted in the URL `?sort=`, "New project" primary button opening the Add flow. Empty state with three quick starts.
- **Files:** `apps/web/app/(app)/projects/page.tsx`, `apps/web/components/projects/project-card.tsx`, `apps/web/components/projects/canvas-thumbnail.tsx`, `apps/web/components/projects/projects-toolbar.tsx`, `apps/web/components/projects/projects-empty.tsx`.
- **Done when:** 50 projects render without layout shift (skeleton cards match final card height 148 px); status summary updates live from `service.status` events; the thumbnail matches the real canvas positions; search and sort survive reload via the URL.

### 4.7 New project / Add flow (C7.5)
- **What:** One modal, two entry points: "New project" (creates a project then the first service) and "Add" on the canvas (⌘J or `N`, or the `+` button; adds to the current environment). The modal is command-palette shaped: a search input at top filters the 8 options; arrow keys move; Enter selects; Esc backs out one level then closes. Each option is a multi-step panel inside the same modal with a step indicator and Back. After creation the canvas opens with the new node already deploying and the inspector open on the Deployments tab.
  - **GitHub repository:** in this phase renders the option with subtitle "Connect GitHub in Phase 06" replaced at runtime by a panel: "GitHub isn't connected yet. An instance admin can connect it in Settings." with a button "Open instance settings". (Phase 06 replaces this panel.)
  - **Database:** four tiles Postgres / MySQL / Redis / MongoDB. One click creates an image service (`postgres:16`, `mysql:8`, `redis:7`, `mongo:7`, pinned to the digests recorded in `packages/templates/presets/databases.json`), a volume with the engine's data path, auto variables (`POSTGRES_USER`, `POSTGRES_PASSWORD=${{ secret(32) }}`, `POSTGRES_DB`, `DATABASE_URL` composed from `self.*` and `self.LUMEN_PRIVATE_DOMAIN`; equivalent sets for the other engines), and places the node next to the last-added node on the canvas.
  - **Template:** renders "Templates arrive in a later phase" panel with a link to the roadmap (Phase 13 replaces it).
  - **Docker image:** an input with autocomplete over a bundled list of 60 popular images (`packages/templates/presets/popular-images.json`: name, description, default port, default volume path if any), an optional "Private registry" disclosure with a registry-credential select (from Phase 04 `registry_credentials`) and "Add credential" inline, server select (auto-picked and hidden when the workspace has exactly one online server; shown as a select when more), Deploy button.
  - **Empty service:** name input only; creates a service instance with no source, status "Not deployed", inspector opens on Settings › Source.
  - **Cron job:** source (image only in this phase; repo in Phase 06), schedule builder with presets ("Every 5 minutes", "Every hour", "Every day at 3:00", "Every Monday at 9:00", "Custom") and a cron expression field with a human-readable preview ("Runs every day at 03:00 UTC · next run in 5 h 12 min"), command field.
  - **Import docker-compose.yml:** renders a "Compose import arrives in a later phase" panel (Phase 10 replaces it).
  - **Import .env:** file drop zone or paste textarea, target service select (existing services in the environment or "New empty service"), parses `KEY=value` lines with quotes and `export` prefixes, shows a table preview with a count, "Add 12 variables" button that stages them (C8.1).
- **Files:** `apps/web/components/add/add-modal.tsx`, `apps/web/components/add/option-list.tsx`, `apps/web/components/add/panels/github-panel.tsx`, `apps/web/components/add/panels/database-panel.tsx`, `apps/web/components/add/panels/template-panel.tsx`, `apps/web/components/add/panels/image-panel.tsx`, `apps/web/components/add/panels/empty-panel.tsx`, `apps/web/components/add/panels/cron-panel.tsx`, `apps/web/components/add/panels/compose-panel.tsx`, `apps/web/components/add/panels/env-import-panel.tsx`, `apps/web/components/add/schedule-builder.tsx`, `apps/web/components/add/image-autocomplete.tsx`, `apps/web/lib/cron/humanize.ts`, `apps/web/lib/env/parse-dotenv.ts`, `packages/templates/presets/databases.json`, `packages/templates/presets/popular-images.json`, `packages/shared/src/cron.ts` (parser + next-run, unit tested).
- **Done when:** each working option creates the right rows via the public API only (never a private route); the canvas shows the new node within 1 s; the inspector opens on Deployments with the build log streaming; the `.env` parser passes the fixture suite (quotes, escapes, comments, multiline values, CRLF); the schedule builder round-trips presets ↔ expressions.

### 4.8 Project canvas: base (C7.6)
- **What:** React Flow canvas with a custom background (dot grid 24 px, dot color `bg-canvas` dots token), pan (drag on empty space, space+drag, trackpad two-finger), zoom (⌘ + scroll, `⌘+` / `⌘-`, `⌘0` fit view with 48 px padding), min zoom 0.25, max zoom 2, minimap toggle (bottom-right, 160×100 px, node rectangles in status colors), auto-layout button (dagre or elkjs, left-to-right ranks following variable-reference edges, 48 px node gap, 96 px rank gap; record the choice), snap-to-grid (8 px) toggle in the canvas toolbar, fit on first load, positions read from `GET /projects/:id` `canvas_layout[environmentId]` and written with `PUT /projects/:id/canvas` debounced 400 ms after the last drag end (autosave with the "Saved" tick, C8.8).
- **Files:** `apps/web/app/(app)/p/[project]/[env]/layout.tsx` (canvas lives in the layout so the inspector route renders as a child without remounting the canvas), `apps/web/app/(app)/p/[project]/[env]/page.tsx`, `apps/web/components/canvas/canvas.tsx`, `apps/web/components/canvas/background.tsx`, `apps/web/components/canvas/toolbar.tsx`, `apps/web/components/canvas/minimap.tsx`, `apps/web/components/canvas/auto-layout.ts`, `apps/web/components/canvas/use-layout-persistence.ts`, `apps/web/components/canvas/canvas-empty.tsx`, `apps/web/stores/canvas.ts` (selection, zoom, snap, minimap visible).
- **Done when:** 100 nodes pan and zoom at 60 fps on a 2020-era laptop (measured with the Chrome performance panel and recorded in `UI_DECISIONS.md`); positions survive reload and are per environment; a second user's drag arrives via `canvas.layout` and animates the node to the new position with the spring; the empty canvas shows the "Add your first service" tiles.

### 4.9 Project canvas: nodes, chips, edges, groups, interactions (C7.6)
- **What:** The service node (~260×120 px) with framework icon + name, status (C4 status language), public URL (truncated, opens in a new tab), last deploy relative time + commit message snippet (or image ref for image services), replica chip ("×3"), server chip. Attached volume chip below the node as a connected sub-card with its mount path (clicking opens the volume panel: read-only display in this phase; actions in Phase 09). Edges: dashed lines from a service to services it references via `${{ service.KEY }}` variables, computed client-side from the variables of all services in the environment, labeled on hover with the variable names. Groups: user-created labeled regions (React Flow parent nodes) with rename, color tag (8 hues from the Phase 01 tag palette), drag in/out. Click opens the inspector; double-click renames inline; right-click context menu (Redeploy, Restart, View logs, Open URL, Duplicate, Move to group, Delete); multi-select with shift-drag and shift-click; bulk actions bar (Redeploy, Restart, Move to group, Delete) floating above the selection. Offline server: warning ring and tooltip "Server 'oracle-1' is offline". Environment switch: 200 ms crossfade of the whole canvas.
- **Files:** `apps/web/components/canvas/nodes/service-node.tsx`, `apps/web/components/canvas/nodes/volume-chip.tsx`, `apps/web/components/canvas/nodes/group-node.tsx`, `apps/web/components/canvas/edges/reference-edge.tsx`, `apps/web/components/canvas/compute-edges.ts`, `apps/web/components/canvas/context-menu.tsx`, `apps/web/components/canvas/selection-bar.tsx`, `apps/web/components/canvas/framework-icon.tsx` (maps `detected_framework` to the Phase 01 framework icon set), `apps/web/components/canvas/status-dot.tsx` (re-exports `packages/ui` StatusDot), `apps/web/components/canvas/use-canvas-keyboard.ts`, `apps/web/components/canvas/list-view.tsx` (mobile).
- **Done when:** node content truncates cleanly at 40-character names and 120-character commit messages; edges recompute when variables change; groups persist in the same layout document; context menu actions call the same mutations as the inspector; keyboard-only users can Tab through nodes, Enter to open, arrow keys to nudge 8 px (Shift+arrow 24 px), Delete to delete with confirmation; the mobile list view shows the same information per card and tapping opens the inspector as a full-screen sheet.

### 4.10 Inspector shell and header (C6, C7.7)
- **What:** Right-hand panel sliding in over the canvas (200 ms, `cubic-bezier(.2,.8,.2,1)`), width resizable 480–880 px by a 6 px drag handle on the left edge (cursor `col-resize`, double-click resets to 560 px), width remembered, `Esc` closes, deep-linked as `/p/:project/:env/s/:service/:tab` with `:tab ∈ deployments | variables | metrics | logs | settings` and `/p/:project/:env/s/:service/deployments/:deploymentId` for the detail view. Header: framework icon, name (inline editable on click, Enter saves, Esc cancels, autosaves with "Saved" tick), status pill, public URL with copy and open buttons (hidden when none, replaced by "No public URL · Add domain" link to Settings › Networking placeholder), primary split button Redeploy (main: Redeploy; menu: Restart, Deploy specific commit (disabled until Phase 06 with tooltip "Connect GitHub to deploy a specific commit")), overflow menu (Open shell — disabled, tooltip "Available soon"; Stop; Sleep now — disabled until Phase 16; Duplicate; Delete), close button. Tabs row: Deployments · Variables · Metrics · Logs · Settings, with counts where meaningful (Variables count). Database-kind services show Data · Connect · Backups · Metrics · Logs · Settings; Data / Connect / Backups render a Phase 09 placeholder panel in this phase.
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/layout.tsx`, `apps/web/app/(app)/p/[project]/[env]/s/[service]/[tab]/page.tsx`, `apps/web/app/(app)/p/[project]/[env]/s/[service]/deployments/[deploymentId]/page.tsx`, `apps/web/components/inspector/inspector.tsx`, `apps/web/components/inspector/resize-handle.tsx`, `apps/web/components/inspector/header.tsx`, `apps/web/components/inspector/inline-name.tsx`, `apps/web/components/inspector/url-field.tsx`, `apps/web/components/inspector/primary-action.tsx`, `apps/web/components/inspector/overflow-menu.tsx`, `apps/web/components/inspector/tabs.tsx`, `apps/web/components/inspector/mobile-sheet.tsx`.
- **Done when:** the URL is the source of truth for open state, width persists, Esc closes and returns focus to the node that opened it, tabs are keyboard reachable (Radix Tabs), the mobile sheet swipes between tabs, and the panel never causes canvas remount (verified by React DevTools highlight and a test asserting canvas viewport is unchanged after opening).

### 4.11 Deployments tab (C7.8)
- **What:** Active deployment pinned as a highlighted card (commit message or image ref, short SHA linking to GitHub when present, author avatar, branch, trigger phrase, duration, servers, View logs). History list (virtualized beyond 50 rows) with status, commit, trigger, time, duration; row menu (View logs, Rollback to this, Redeploy this commit, Copy image digest). Watch-path skips as muted rows ("Skipped — no changes in watched paths"). Detail view within the inspector with a back arrow: timeline Queued → Building → Pre-deploy → Deploying → Health check → Live with per-step durations and a live-ticking current step; tabs Build logs · Deploy logs · HTTP logs (placeholder until Phase 07) · Details (image digest, builder, detected framework, config snapshot read-only, variable keys at deploy time). Failure error card at the top from the error catalog (title, explanation, fix button, "Show raw error"). Rollback confirm dialog with the "Also restore variables from that time" checkbox unchecked by default. Cancel button on pre-ACTIVE deployments.
- **Files:** `apps/web/components/inspector/deployments/active-card.tsx`, `apps/web/components/inspector/deployments/history-list.tsx`, `apps/web/components/inspector/deployments/history-row.tsx`, `apps/web/components/inspector/deployments/detail.tsx`, `apps/web/components/inspector/deployments/timeline.tsx`, `apps/web/components/inspector/deployments/log-pane.tsx` (uses `packages/ui` LogViewer), `apps/web/components/inspector/deployments/details-tab.tsx`, `apps/web/components/inspector/deployments/error-card.tsx` (uses `packages/ui` ErrorCard with the catalog), `apps/web/components/inspector/deployments/rollback-dialog.tsx`, `apps/web/components/inspector/deployments/trigger-label.ts`.
- **Done when:** a running deploy ticks its current step every second and moves to the next step within 1 s of the server event; a failed deploy with `OOM_KILLED` shows "Your app ran out of memory" with the fix button "Give it 1 GB" that stages a memory change and opens the staged bar; rollback creates a deployment with trigger `rollback` and the history shows it; the build log pane streams via `deployment.log` with ANSI colors.

### 4.12 Variables tab (C7.9, basic)
- **What:** Table Name · Value · Source. Values masked (`••••••••`) with reveal (eye) and click-to-copy; sealed values show a lock and no reveal. References render as chips (`postgres.DATABASE_URL`) with a hover popover showing the resolved value masked. Source column: Service / Shared / Generated / Platform. Add-variable inline row at the top: typing `${{` opens reference autocomplete (services in the environment, then their variable keys, then `shared.*`). Sealed toggle per variable with the explanation text. Platform variables collapsible read-only section (B13 keys with example values). "Manage shared variables for this environment" link (opens the shared variables page: a minimal table in this phase; full page polish in Phase 10). Every edit is a staged change (C8.1) unless the "Apply immediately" preference is on. Delete with undo toast (8 s).
- **Files:** `apps/web/components/inspector/variables/variables-table.tsx`, `apps/web/components/inspector/variables/variable-row.tsx`, `apps/web/components/inspector/variables/add-row.tsx`, `apps/web/components/inspector/variables/reference-chip.tsx`, `apps/web/components/inspector/variables/reference-autocomplete.tsx`, `apps/web/components/inspector/variables/platform-section.tsx`, `apps/web/components/inspector/variables/sealed-toggle.tsx`, `apps/web/app/(app)/p/[project]/[env]/shared-variables/page.tsx`, `apps/web/lib/variables/parse-reference.ts` (shared with `packages/shared/src/variables.ts`).
- **Done when:** adding, editing, sealing and deleting all produce staged entries visible in the bar; the autocomplete lists exactly the services and keys present; a reference to a missing key shows the `VARIABLE_REF_MISSING` error inline before staging; masked values never appear in the DOM until revealed (test asserts the DOM text is the mask).

### 4.13 Logs tab, runtime mode (C7.11)
- **What:** Mode switch Runtime · HTTP · Build (HTTP disabled with tooltip "Available after networking is set up" until Phase 07; Build opens the latest deployment's build logs). Filter bar: free text and `level:error|warn|info|debug` chips (full grammar in Phase 08). Time range picker (Live · 15 min · 1 h · 6 h · 24 h · Custom). Deployment selector (default active). Live tail on by default; scrolling up pauses and shows a floating "Jump to live" button; toggles for timestamps, wrap, dense; download current filter (max 50 000 lines) as `.log`; clicking a line copies it; JSON lines expand into a key-value tree. Empty state "No logs yet. Your app hasn't printed anything since this deploy started." Offline server state "Server offline — showing logs up to 14:02" with the cached tail.
- **Files:** `apps/web/components/inspector/logs/logs-tab.tsx`, `apps/web/components/inspector/logs/mode-switch.tsx`, `apps/web/components/inspector/logs/filter-bar.tsx`, `apps/web/components/inspector/logs/filter-chip.tsx`, `apps/web/components/inspector/logs/range-picker.tsx`, `apps/web/components/inspector/logs/deployment-select.tsx`, `apps/web/components/inspector/logs/live-buffer.ts`, `apps/web/components/inspector/logs/download.ts`, `apps/web/lib/logs/parse-filter.ts` (level and free text only in this phase; Phase 08 extends), `packages/ui/src/log-viewer/*` (Phase 01 component; extend with the `jump-to-live` and JSON tree if missing).
- **Done when:** a container printing 100 lines/s renders without dropped frames (virtualized rows, batched appends every 50 ms); pausing on scroll holds position and the button count reads "Jump to live · 340 new"; a log line becomes visible within 1 s of being printed (B14, measured with a timestamp echo test); download produces exactly the filtered lines.

### 4.14 Settings tab: Source · Build · Deploy · Resources (C7.12)
- **What:** Grouped sections with a sticky section nav on the left of the tab (at ≥ 640 px inspector width; a select at narrower widths). Every field has a default, helper text and, when Phase 10 lands, a "Managed by lumen.toml" lock (render the lock slot now, data arrives in Phase 10). Sections in this phase: Source (image or repo display, root directory, watch paths glob list with three example chips, deploy on push toggle, wait for CI toggle, disconnect source), Build (builder Auto / Dockerfile / Image segmented control, Dockerfile path, custom build command, build-time variables note), Deploy (start command, pre-deploy command, healthcheck path and timeout, restart policy and max retries, drain timeout), Resources (Memory slider 128 MB → server max in steps 128 / 256 / 512 / 1024 / 2048 / 4096 / 8192 / server max, CPU slider 0.1 → server cores in 0.1 steps, numeric inputs beside each, "Server 'oracle-1' has 18 GB free" line, warning banner before exceeding, "Need more?" line with disabled Resize / Move buttons until Phases 12 and 16), Cron (schedule builder, only for cron services), Danger zone (Stop service; Delete service with typed confirmation of the service name and a separate "Also delete its volume" checkbox). Networking, Scaling & placement, Sleep sections render as collapsed placeholders naming their phase.
- **Files:** `apps/web/components/inspector/settings/settings-tab.tsx`, `apps/web/components/inspector/settings/section-nav.tsx`, `apps/web/components/inspector/settings/field.tsx`, `apps/web/components/inspector/settings/source-section.tsx`, `apps/web/components/inspector/settings/build-section.tsx`, `apps/web/components/inspector/settings/deploy-section.tsx`, `apps/web/components/inspector/settings/resources-section.tsx`, `apps/web/components/inspector/settings/resource-slider.tsx`, `apps/web/components/inspector/settings/cron-section.tsx`, `apps/web/components/inspector/settings/danger-zone.tsx`, `apps/web/components/inspector/settings/managed-lock.tsx`.
- **Done when:** every field change becomes a staged change with the correct diff; the memory slider snaps to steps and refuses to exceed server free memory with the `SERVER_CAPACITY` message; the danger zone requires the typed name and lists consequences ("Stops and removes 1 container on oracle-1", "Keeps the volume 'data' (12 MB)"); the section nav highlights the section in view (IntersectionObserver).

### 4.15 Staged changes (C8.1), optimistic updates (C8.2), toasts (C8.4), confirmations (C8.5)
- **What:** A `useStagedChanges(eid)` hook backed by `GET/PUT/DELETE /environments/:id/staged` and the `staged.changed` topic. The floating bar at bottom center: "3 changes to 2 services · Discard · Review & deploy (⇧⏎)". Review modal: diff grouped by service (old → new; variables show keys and "value changed", sealed values never shown), optional note field, Deploy button applying via `POST /environments/:id/staged/apply`, which redeploys only affected services. "Apply immediately" preference bypasses staging with a confirm the first time. Optimistic updates for rename, canvas layout, checklist dismiss, notification read, variable add; rollback with an error toast on rejection. Toasts bottom-right, stack up to 3, undo for reversible actions with 8 s timers, pause timer on hover. Confirmations: none for reversible, simple confirm for impactful (Restart, Stop, Rollback), typed confirm for destructive (Delete service, Delete project).
- **Files:** `apps/web/components/staged/staged-bar.tsx`, `apps/web/components/staged/review-modal.tsx`, `apps/web/components/staged/diff-group.tsx`, `apps/web/lib/staged/use-staged.ts`, `apps/web/lib/staged/diff.ts`, `apps/web/lib/toast/toaster.tsx` (wraps `packages/ui` Toast), `apps/web/lib/toast/use-toast.ts`, `apps/web/lib/confirm/confirm-provider.tsx`, `apps/web/lib/confirm/use-confirm.ts`.
- **Done when:** two staged edits to the same field collapse to one entry showing original → latest; the bar appears with a 200 ms rise and disappears on Discard with an undo toast ("Discarded 3 changes · Undo"); apply creates one deployment per affected service with trigger `config_change` or `variable_change`; a rejected optimistic rename reverts within one frame and toasts the catalog error.

### 4.16 Command palette (C7.23) and shortcuts (C13)
- **What:** ⌘K palette: fuzzy search across projects, services, environments, servers, deployments by SHA prefix, templates (placeholder until Phase 13), settings pages, docs entries (static index). Actions: Deploy, Redeploy, Restart, Rollback, Add variable, Open logs, Open shell (disabled), Switch environment, Toggle theme, Create project, Add server, Invite member. Context-aware ordering: inside a service its actions come first; recent items on open (last 8, `localStorage` `lumen.palette.recent`). Every action shows its shortcut as a `Kbd`. Global shortcut handler with sequence support (`G` then `H` / `P` / `S` / `T`), scoped so shortcuts never fire inside inputs, textareas, contenteditable or when a modal other than the palette is open. `?` opens the shortcut sheet.
- **Files:** `apps/web/components/palette/command-palette.tsx`, `apps/web/components/palette/palette-item.tsx`, `apps/web/components/palette/sources/*.ts` (one file per entity source), `apps/web/components/palette/actions.ts`, `apps/web/lib/shortcuts/registry.ts`, `apps/web/lib/shortcuts/use-shortcuts.ts`, `apps/web/lib/shortcuts/sequence.ts`, `apps/web/components/shortcuts/shortcut-sheet.tsx`, `apps/web/lib/search/fuzzy.ts` (own implementation: subsequence match with bonus for word starts; unit tested).
- **Done when:** every C13 shortcut works and is listed in the sheet; the palette opens in under 50 ms with warm caches; typing "prod" ranks the production environment above a project named "Product API" when inside that project; Enter on a deployment SHA deep-links to its detail view.

### 4.17 Notifications center (C7.24) and global states (C7.26)
- **What:** Bell with unread badge; popover with tabs All / Deploys / Alerts; items with icon, text, relative time, deep link; Mark all read; link to preferences (Phase 15 page, placeholder). Global states: "Reconnecting…" top bar with actions disabled and tooltip; Permission denied card naming the needed role and "Ask an admin"; 404 card; maintenance full-screen page (rendered when the API returns 503 with `maintenance: true`). Global banners: server offline (per server, with link to the server page), instance update available (Phase 11 sets the data; render now from `instance_settings`), cert problems (Phase 07).
- **Files:** `apps/web/components/notifications/bell.tsx`, `apps/web/components/notifications/popover.tsx`, `apps/web/components/notifications/item.tsx`, `apps/web/app/(app)/not-found.tsx`, `apps/web/app/(app)/error.tsx`, `apps/web/components/states/permission-denied.tsx`, `apps/web/components/states/maintenance.tsx`, `apps/web/components/shell/banners/server-offline.tsx`, `apps/web/components/shell/banners/update-available.tsx`.
- **Done when:** a deploy failure notification arrives live, the badge increments, screen readers hear "Deployment of api failed" via the live region, clicking it opens the deployment detail; the 404 and permission cards render with the right copy for both a missing project and a viewer trying to deploy.

### 4.18 Responsive and mobile (C12)
- **What:** Bottom tab bar (Home, Projects, Deploys, Servers, More) at < 768 px; the canvas becomes the list view; the inspector becomes a full-screen sheet with swipeable tabs; logs fully usable; redeploy, rollback, restart and variable edits work; no hover-only affordances (context-menu actions are reachable from a "…" button on each card; edge labels appear on tap). At 768–1023 px the rail is icons only and the inspector is full-width over the canvas; at 1024–1279 px the inspector overlays the canvas; at ≥ 1280 px the canvas shrinks to make room (no overlay).
- **Files:** `apps/web/components/shell/mobile-tab-bar.tsx`, `apps/web/app/(app)/deploys/page.tsx` (mobile-first list of recent deploys across the workspace; also reachable on desktop from the deploy activity popover "See all"), `apps/web/components/canvas/list-view.tsx`, `apps/web/components/inspector/mobile-sheet.tsx`, `apps/web/lib/media/use-breakpoint.ts`.
- **Done when:** the e2e mobile suite at 390×844 completes: log in, open a project, open a service, read logs, stage a memory change, apply, watch the redeploy complete.

### 4.19 Tests, screenshots, review
- **What:** Playwright e2e suites for onboarding, add-image-service, canvas interactions, inspector tabs, staged changes, palette, mobile. Visual regression baselines for every page × 3 widths × 2 themes × key states (table in §8). axe on every page. Self-critique against C14 for every screenshot before requesting the H2 review.
- **Files:** `e2e/tests/auth.spec.ts`, `e2e/tests/home.spec.ts`, `e2e/tests/projects.spec.ts`, `e2e/tests/add-flow.spec.ts`, `e2e/tests/canvas.spec.ts`, `e2e/tests/inspector-deployments.spec.ts`, `e2e/tests/inspector-variables.spec.ts`, `e2e/tests/inspector-logs.spec.ts`, `e2e/tests/inspector-settings.spec.ts`, `e2e/tests/staged-changes.spec.ts`, `e2e/tests/palette.spec.ts`, `e2e/tests/mobile.spec.ts`, `e2e/visual/*.spec.ts`, `e2e/a11y/*.spec.ts`, `e2e/fixtures/*.ts`, `docs/UI_DECISIONS.md`.
- **Done when:** all suites are green in CI on the Phase 00 harness; every C14 checkbox is ticked per page in `UI_DECISIONS.md` with screenshot links.

## 5. Detail checklist

### Typography
- Font stack: `Geist Sans` (UI), `Geist Mono` (logs, variables, IDs, SHAs, ports, paths, cron expressions, kbd). Loaded through `next/font/local` from the Phase 01 package; `font-display: swap` with size-adjusted fallback (`Inter`-metric fallback generated by `next/font`) so no layout shift on font load.
- Usage classes (from Phase 01; never use raw sizes in this phase):
  - `title-page` 24 / 600 / 1.25 / letter-spacing −0.01em — Home greeting, Projects heading, Servers heading.
  - `title-section` 16 / 600 / 1.25 — settings section headings, "Recent projects", "Active deployment".
  - `title-card` 14 / 600 / 1.25 — project card name, service node name, deployment active card first line.
  - `body` 14 / 400 / 1.5 — paragraphs, helper text in forms, empty state sentence.
  - `label` 13 / 500 / 1.25 — form labels, table headers (uppercase never; sentence case), tab labels, rail labels when pinned.
  - `meta` 13 / 400 / 1.5 `text-secondary` — relative times, commit snippets, "Pushed to main", server chips.
  - `caption` 12 / 400 / 1.5 `text-muted` — status pill text, chip text, footer notes, "Saved" tick.
  - `button-md` 14 / 500, `button-sm` 13 / 500.
  - `input` 14 / 400 / 1.5.
  - `cell` 13 / 400 / 1.5 — table cells; numbers and durations use `font-variant-numeric: tabular-nums`.
  - `code` 13 / 400 / 1.5 Geist Mono — log lines (dense mode 1.35), variable values, SHAs, URLs in fields.
  - `kbd` 12 / 500 Geist Mono, `letter-spacing 0.02em`, in the Kbd component.
- Breadcrumbs: `label`, separators are a 12 px `chevron-right` in `text-muted`; the current segment is `text` color, ancestors `text-secondary`.
- Numbers in metrics, durations and counts are tabular (`tabular-nums`) so live-ticking values never jitter horizontally.
- Truncation: single-line `text-overflow: ellipsis` with `title` attribute and a tooltip on hover/focus for node names (max 40 chars visible at default zoom), URLs (middle-truncate: keep the host and the last 8 chars), commit messages (one line, 120 chars).
- Never letter-space body text; headings ≥ 20 px use −0.01em.
- Line lengths in settings helper text capped at 64ch.

### Spacing & layout
- 4 px grid everywhere: gaps 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64. No magic numbers; every value comes from the Phase 01 spacing tokens.
- Left rail: 56 px collapsed; 220 px pinned; item height 40 px; icon 20 px centered; label appears at 220 px with 12 px gap; workspace switcher 40 px tall at top with 8 px margin; avatar and help at bottom, 8 px from the edge; a 1 px `border` on the right edge.
- Top bar: 48 px tall; 16 px horizontal padding; 12 px gap between groups; breadcrumbs left; right cluster: environment switcher (32 px tall pill), ⌘K button (32 px, shows "Search" label and Kbd at ≥ 1024 px, icon only below), deploy activity (32 px), bell (32 px icon button), theme toggle (32 px icon button).
- Content: full-bleed on canvas routes; centered `max-width: 1200px` with 24 px side padding on list and settings routes (16 px at < 768).
- Inspector: default 560 px, min 480 px, max 880 px; internal padding 20 px; header height 64 px + tabs row 40 px; sticky header; content scrolls independently.
- Service node: 260 × 120 px at zoom 1; padding 12 px; radius 10 px; icon 20 px; name row 20 px tall; status row 20 px; URL row 20 px; footer meta row 20 px; chips 20 px tall with 6 px horizontal padding, radius full.
- Volume chip: 220 × 36 px, offset 8 px below the node, connected by a 1 px `border-strong` vertical line 8 px long, radius 8 px.
- Group node: 12 px inner padding, label 28 px tall at the top-left, radius 14 px, dashed 1 px border in the group's tag color at 60 % alpha, fill at 6 % alpha.
- Cards (project cards, active deployment card): radius 10 px, padding 16 px, 1 px `border`, `surface` background; hover `surface-hover`.
- Modals: radius 14 px, padding 24 px, max-width 640 px (Add flow 720 px), `surface-raised`.
- Staged bar: 48 px tall, radius full, padding 8 px 8 px 8 px 16 px, bottom 24 px, centered, max-width 720 px.
- Toasts: 360 px wide, radius 10 px, padding 12 px 16 px, bottom-right 24 px, 8 px stack gap.
- Tables: row height 40 px; header 36 px; cell padding 0 12 px; first column padding-left 16 px.
- Forms: field label above input with 6 px gap; helper text 4 px below; fields stacked with 20 px gap; sections separated by 32 px and a 1 px `border`.
- Empty states: icon 40 px in `text-muted`, 12 px to title, 4 px to sentence, 20 px to primary button; max-width 420 px centered.

### Color & theme
- Regions: page `bg`; canvas `bg-canvas` with dot grid `#1A1E23` (dark) / `#DEDDD8` (light) at 24 px; rail and top bar `surface` with `border` edges; cards and nodes `surface`; popovers, menus, modals, palette `surface-raised`; row and card hover `surface-hover`; selected node border `border-strong` plus a 2 px `accent` outline at 2 px offset.
- Exactly one accent-colored element competes per view (C14): the primary button. Links use `accent` text only inside body copy. Tabs use a 2 px `accent` underline on the active tab, text otherwise `text-secondary` → `text` on hover/active.
- Status colors only through the StatusDot / StatusPill components, always paired with glyph and text (C4).
- Light theme uses shadows for elevation (`0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06)`); dark theme uses borders plus a 1 px inner highlight `rgba(255,255,255,.04)` on raised surfaces.
- Focus ring: 2 px `accent`, 2 px offset, on every interactive element including canvas nodes (`outline` on the node wrapper) and the resize handle.
- Warning ring on offline-server nodes: 2 px `warning` at 40 % alpha plus the warning glyph in the status row.
- Selection on the canvas: `accent-subtle` fill on the marquee, 1 px `accent` border.
- Contrast: every text/background pair in this phase is re-checked against the Phase 01 contrast table; new pairs (group fills, chips on nodes) are added to the table with measured ratios ≥ 4.5:1.
- Theme switch: `data-theme` on `<html>`, applied pre-paint; canvas dot color, minimap colors and React Flow edge colors read CSS variables so the crossfade covers them too.

### Motion
- Hover and press: 120 ms ease-out on background, border and transform (`scale(0.98)` on press for buttons and nodes).
- Panels and modals: 200 ms `cubic-bezier(.2,.8,.2,1)`; inspector slides in from `translateX(24px)` + opacity 0; modals scale from 0.98 + opacity 0 with the backdrop fading 200 ms; menus and popovers 120 ms from `translateY(-4px)`.
- Rail expand: width 56 → 220 px in 200 ms with the same curve; labels fade in over the last 120 ms; hover intent delay 150 ms; collapse on mouse leave after 300 ms.
- Canvas: node position changes from server events or auto-layout use a spring (`motion` `type: 'spring', stiffness: 400, damping: 30, mass: 1`); user drags are immediate; environment switch is a 200 ms crossfade of the canvas layer (old fades out, new fades in with a 40 ms overlap); fit view animates 300 ms.
- Status dot pulses softly while building / deploying: scale 1 → 1.35 ring with opacity 0.6 → 0 over 1.6 s, infinite, `ease-out`; stops the moment status leaves the pulsing set.
- Deploy timeline: the current step's duration ticks every 1 s with tabular numerals; step completion fills the connector line 300 ms ease-out.
- Progress ring on the onboarding checklist animates `stroke-dashoffset` over 600 ms from the previous value.
- Staged bar: rises 24 px + fade in 200 ms; the count badge bumps (scale 1 → 1.15 → 1, 200 ms) on change.
- Toasts: enter from the right 24 px + fade 200 ms; exit 120 ms; the undo timer draws as a thin 2 px `accent` line shrinking over 8 s, paused on hover.
- Skeleton shimmer: 1.4 s linear gradient sweep; disabled under reduced motion (static `surface-hover` blocks).
- Live log rows: no per-row animation (performance); the "Jump to live" button fades in 120 ms.
- `prefers-reduced-motion`: all durations become 0 ms except opacity fades capped at 80 ms; springs become 0 ms; the pulse becomes a static ◐ glyph; the shimmer becomes static; crossfade becomes a cut.

### Iconography & symbols
- Lucide, 16 px inside text and table rows, 20 px in the rail, node header and inspector header, 24 px never (except the empty-state 40 px display icons). Stroke width 1.75 at 16 px, 1.5 at 20 px.
- Rail: `house` Home, `layout-grid` Projects, `server` Servers, `layout-template` Templates, `activity` Observability, `settings` Settings, `circle-help` help, `pin` / `pin-off` pin control.
- Top bar: `chevron-right` breadcrumb separators, `search` ⌘K, `loader-circle` (spinning) deploy activity when > 0 deploying else `rocket`, `bell` notifications (with a 6 px `accent` dot when unread), `sun` / `moon` / `monitor` theme.
- Status glyphs (C4; rendered by StatusDot, text always adjacent): ● Active `success`; ◐ Building / Deploying `warning`, pulsing; ✕ Failed `danger`; ⟳ Crashed, restarting `danger` (Lucide `refresh-cw`); ☾ Sleeping `sleeping` (Lucide `moon`); ■ Stopped `text-muted`; … Queued `text-muted`; ⚠ Offline server `warning` (Lucide `triangle-alert`). Glyphs are drawn as 8 px SVG shapes for ● ◐ ■ and Lucide icons for the rest so they align on the same 16 px box.
- Node chips: `copy` replica count prefix is the literal "×"; `server` for the server chip; `hard-drive` for the volume chip; `link` on the URL row; `git-commit-horizontal` before the SHA, `box` before an image ref.
- Framework icons: from the Phase 01 framework icon set (Node, Python, Go, Rust, Ruby, PHP, Java, .NET, Deno, Bun, static → `file-code`), database engines (Postgres, MySQL, Redis, MongoDB) from the same set; unknown → `box`. Rendered monochrome in `text-secondary` at 20 px, brand color only on hover of the node header.
- Inspector header actions: `rocket` Redeploy, `rotate-cw` Restart, `git-commit-horizontal` Deploy specific commit, `terminal` Open shell, `square` Stop, `moon` Sleep now, `copy` Duplicate, `trash-2` Delete, `x` close, `external-link` open URL, `copy` copy URL (turns into `check` for 1.2 s after copying).
- Deployments: `rotate-ccw` Rollback, `rocket` Redeploy this commit, `fingerprint` Copy image digest, `arrow-left` back from detail, `skip-forward` for skipped rows.
- Variables: `eye` / `eye-off` reveal, `copy` copy, `lock` sealed, `link-2` reference chip prefix, `plus` add row, `trash-2` delete.
- Logs: `radio` live indicator (pulsing dot in `success` when live, static `text-muted` when paused), `arrow-down-to-line` Jump to live, `download` download, `clock` timestamps toggle, `wrap-text` wrap, `rows-3` dense, `chevron-right` / `chevron-down` JSON expand.
- Palette: `corner-down-left` Enter hint, `arrow-up` / `arrow-down` navigation hints, `command` in the Kbd for ⌘ on macOS (rendered as "Ctrl" text on other platforms, detected once from `navigator.platform`).
- Empty states: `server` (no servers), `folder-plus` (no projects), `plus-square` (empty canvas), `scroll-text` (no logs), `inbox` (no notifications).

### Copy
- Voice: calm, friendly, precise, brief; second person; active voice; no exclamation marks except the first successful deploy ("Your app is live!" appears once as a toast on the first ACTIVE deployment of a workspace).
- Buttons are verbs: "Deploy", "Redeploy", "Restart", "Add variable", "Review & deploy", "Discard", "Create project", "Connect server", "Roll back", "Delete service". Never "Submit", "OK", "Confirm".
- Shell: rail tooltips "Home", "Projects", "Servers", "Templates", "Observability", "Settings", "Help", "Pin sidebar" / "Unpin sidebar"; ⌘K button label "Search"; deploy activity "2 deploying" / "1 deploying" / none; bell tooltip "Notifications"; theme toggle tooltip "Theme: Dark" / "Theme: Light" / "Theme: System".
- Reconnecting bar: "Reconnecting…" then "Connection lost. Trying again in 4 s." after the third failure; disabled action tooltip "Unavailable while reconnecting".
- Home: "Good morning, Shagee" (morning < 12:00, afternoon < 18:00, evening otherwise, local time); checklist title "Get set up" with "3 of 6 done"; dismiss "Hide checklist" with undo toast "Checklist hidden · Undo"; hero empty state title "Connect your first server", sentence "Any VM from any cloud works. Paste one command and it joins in under three minutes.", button "Connect server".
- Projects: search placeholder "Search projects"; sort labels "Recent" / "Name"; empty title "Create your first project", sentence "A project groups the services that work together.", quick starts "Deploy from GitHub", "Deploy a template", "Deploy a database".
- Add flow: search placeholder "What do you want to add?"; option titles "GitHub repository", "Database", "Template", "Docker image", "Empty service", "Cron job", "Import docker-compose.yml", "Import .env"; option subtitles "Deploy any branch, redeploy on push", "Postgres, MySQL, Redis or MongoDB in one click", "Ready-made sets of services", "Any public or private image", "Configure first, deploy later", "Run a command on a schedule", "Turn a compose file into services", "Add variables from a file"; database tiles subtitle "With a volume and connection variables"; image panel placeholder "nginx, ghcr.io/org/app:tag"; server select label "Deploy to"; cron preview "Runs every day at 03:00 UTC · next in 5 h 12 min"; `.env` import button "Add 12 variables".
- Canvas: empty title "Add your first service", sentence "Pick a source and Lumen builds and runs it for you."; offline tooltip "Server 'oracle-1' is offline"; context menu "Redeploy", "Restart", "View logs", "Open URL", "Duplicate", "Move to group", "Delete"; selection bar "3 selected"; group default name "New group"; autosave tick "Saved".
- Node: last deploy "Deployed 3 min ago · Fix login redirect"; failed "Failed 2 min ago · Add caching"; building "Building · 42 s"; no deploy "Not deployed yet"; URL row when none "No public URL".
- Inspector header: URL copy tooltip "Copy URL" → "Copied"; open tooltip "Open in new tab"; Redeploy tooltip "Redeploy (D)"; disabled shell tooltip "Available soon"; close tooltip "Close (Esc)".
- Deployments: active card badge "Live"; trigger phrases "Pushed to main", "Deployed manually", "Rolled back", "Config change", "Variable change", "From template", "Pull request #42", "From CLI", "From API", "Scheduled run"; durations "Deployed in 42 s" / "Building for 1 min 12 s"; skipped row "Skipped — no changes in watched paths"; timeline steps "Queued", "Building", "Pre-deploy", "Deploying", "Health check", "Live"; rollback dialog title "Roll back to this deployment?", body "Lumen restores the image and settings from this deployment and redeploys.", checkbox "Also restore variables from that time", button "Roll back"; cancel "Cancel deployment"; empty "No deployments yet. Deploy to see them here."
- Error cards (J6 titles verbatim): "Your app ran out of memory" with fix "Give it 1 GB"; "Your app keeps crashing on start" with fix "Show last errors"; "Your app didn't respond in time" with fix "Set healthcheck path"; "We couldn't figure out how to start your app" with fix "Set start command"; "Your build failed" with fix "Show first error"; "Your pre-deploy command failed. Your previous version is still live." with fix "View logs"; "We couldn't pull this private image" with fix "Add registry credentials"; "This server doesn't have enough memory for that" with fix "Lower the limit"; raw toggle "Show raw error"; "Copy for support".
- Variables: table headers "Name", "Value", "Source"; add row placeholders "KEY" and "value or ${{ reference }}"; sealed helper "Sealed values can't be viewed again, even by admins."; sources "Service", "Shared", "Generated", "Platform"; reference popover "Resolves to ••••••••"; platform section title "Variables Lumen provides"; link "Manage shared variables for this environment"; delete undo toast "Removed DATABASE_URL · Undo"; missing reference error "A variable references something that doesn't exist" with fix "Jump to the variable".
- Logs: modes "Runtime", "HTTP", "Build"; filter placeholder "Search logs, or try level:error"; range labels "Live", "15 min", "1 h", "6 h", "24 h", "Custom"; live indicator "Live"; paused "Paused"; button "Jump to live · 340 new"; empty "No logs yet. Your app hasn't printed anything since this deploy started."; offline "Server offline — showing logs up to 14:02"; toggles "Timestamps", "Wrap", "Dense"; download "Download"; copied line toast "Line copied".
- Settings: section names "Source", "Build", "Deploy", "Networking", "Resources", "Scaling and placement", "Sleep when idle", "Cron", "Danger zone"; helper lines "Only redeploy when files in these paths change.", "Wait for GitHub checks to pass before deploying.", "Lumen picks the builder automatically. Change it only if you know why.", "Runs before each deploy. A failure keeps the previous version live.", "Server 'oracle-1' has 18 GB free", capacity warning "That's more than oracle-1 has free. Lower the limit, or move the service."; danger zone "Stop service", "Delete service", typed prompt "Type api to confirm", consequences list; placeholders for later sections "Networking arrives with domains and HTTPS", "Scaling arrives with multi-server support", "Sleeping arrives with cron and cost features".
- Staged bar: "3 changes to 2 services", "1 change to api"; "Discard"; "Review & deploy"; modal title "Review changes"; note placeholder "What changed? (optional, shown in the deploy history)"; button "Deploy 2 services"; empty diff row "value changed" for variables.
- Palette: placeholder "Search or run a command"; group headers "Actions", "Recent", "Projects", "Services", "Environments", "Servers", "Deployments", "Settings", "Docs"; no results "Nothing matches. Try a service name or a command."
- Notifications: tabs "All", "Deploys", "Alerts"; "Mark all read"; empty "You're all caught up."; items "api is live in production", "api failed to deploy in production", "Server oracle-1 went offline".
- Global states: permission "You need the Member role to do that", sentence "Ask a workspace admin to change your role.", button "Copy request"; 404 "This project doesn't exist or you don't have access", links "Go home" and "See all projects"; maintenance "Lumen is updating. Back in a moment."; toast on optimistic failure uses the catalog title.
- First deploy success toast: "Your app is live!" with action "Open" (the only exclamation mark in the product).

### States (empty · loading · error · success · partial)
- Every list and page has all five states designed; skeletons match the final layout exactly so there is zero layout shift (C14).
- Home: loading = greeting text with 3 skeleton project cards (148 px), 5 skeleton deploy rows (40 px), 3 skeleton server minis (72 px); empty (no servers) = hero; partial = servers exist but no projects → checklist plus "Create your first project" card; error = catalog error card in place of each block that failed, the rest still render.
- Projects: loading = 6 skeleton cards; empty = quick starts; error = card; partial = some cards with offline warning chip.
- Canvas: loading = the dot grid renders immediately, nodes fade in as data arrives (no skeleton nodes; a centered small spinner-free "Loading services" caption for up to 400 ms, then nodes); empty = tiles; error = centered card with "Try again"; partial = offline rings.
- Inspector: loading = header skeleton (icon 20, name 160×16, status 80×20, URL 240×14) and tab-specific skeleton (deployments: 1 active card 96 px + 6 rows; variables: 5 rows 40 px; logs: 12 lines of varying width; settings: 4 sections of 3 fields); error = card in the tab body; empty per tab as specified in Copy.
- Deploy detail: while running, steps ahead of the current one are `text-muted`, the current pulses, done steps are `success`; on failure the failed step is `danger` and the error card sits above the timeline.
- Variables: partial = a value failed to decrypt → row shows "Unavailable" in `danger` with a tooltip and a "Copy for support" action.
- Logs: partial = server offline banner with cached tail; paused state; filter with zero matches "No lines match. Clear filters?" with button "Clear filters".
- Settings: partial = a field managed by `lumen.toml` (Phase 10) renders locked; a field whose server is offline still edits but the apply button warns "oracle-1 is offline; changes deploy when it's back".
- Add flow: each panel has loading (server list, images), error (creation failed → catalog card inside the panel, inputs preserved), success (modal closes, canvas focuses the new node).
- Auth: loading on submit (button spinner, inputs disabled), field errors, expired invite / reset token cards with "Request a new link".

### Keyboard & accessibility
- Every C13 shortcut: `⌘K` palette · `⌘J` or `N` add service · `G` then `H` / `P` / `S` / `T` · `E` environment switcher · `D` redeploy selected · `L` logs · `V` variables · `M` metrics · `,` settings · `⇧⏎` apply staged · `Esc` close panel · `⌘0` fit canvas · `?` shortcut sheet. Windows/Linux map ⌘ to Ctrl and the Kbd renders "Ctrl".
- Canvas keyboard: Tab cycles nodes in reading order (top-left to bottom-right), Enter opens the inspector, arrow keys nudge 8 px (Shift 24 px), Space+arrows pan, `+` / `-` zoom, Delete opens the delete confirm, `⌘A` selects all, Esc clears selection. The focused node has the focus ring and is scrolled into view.
- Roles: rail `nav` with `aria-label="Main"`; top bar `header`; inspector `complementary` with `aria-labelledby` the service name; tabs use Radix Tabs (`tablist` / `tab` / `tabpanel`); canvas wrapper `application` with `aria-roledescription="service canvas"` and an off-screen list of services for screen readers (name, status, URL) updated live; nodes `button` with `aria-label="api, Active, opens details"`; staged bar `region` `aria-label="Staged changes"`; toasts `status`; deploy status changes announced through one global `aria-live="polite"` region ("api is now live in production").
- Focus management: opening the inspector moves focus to its close button; closing returns focus to the node; modals trap focus (Radix); the palette returns focus to the previously focused element; toasts never steal focus.
- Contrast ≥ 4.5:1 for all text in both themes, including `text-muted` on `surface` (verified in the Phase 01 table; `#646C76` on `#14171B` must be re-measured; if under 4.5:1 for body-size text, `text-muted` is restricted to ≥ 13 px 500 weight and placeholder text, and the exception is recorded in `UI_DECISIONS.md`).
- Status never by color alone (glyph + text everywhere).
- Reduced motion respected (see Motion).
- axe clean on every page in both themes; a manual keyboard pass is recorded per page in `UI_DECISIONS.md`.

### Responsive
- ≥ 1280 px: rail + canvas + inspector side by side (canvas shrinks); content pages centered 1200 px.
- 1024–1279 px: inspector overlays the canvas (backdrop 20 % `bg` alpha, click outside closes); rail as usual.
- 768–1023 px: rail collapses to icons only (no hover expand; pin disabled); inspector full width over the canvas; top bar hides the "Search" label.
- < 768 px: bottom tab bar (Home, Projects, Deploys, Servers, More) 56 px tall with safe-area inset; no rail; top bar shows a back button plus the page title and the environment switcher; canvas → list view (cards 88 px tall, full width, 12 px gap); inspector → full-screen sheet with swipeable tabs and a 4 px drag handle at the top; logs full-screen with sticky filter bar; staged bar becomes a full-width bottom sheet above the tab bar; toasts full width bottom; modals become bottom sheets; tables collapse to stacked rows with the label above each value.
- Hover-only affordances are forbidden: every hover action has a tap equivalent (per-card "…" button, tap on edge to show labels, long-press on a node opens the context menu).
- Touch targets ≥ 44 × 44 px on mobile.

### Performance
- Route transitions feel < 150 ms: every rail link and card prefetches on hover/focus (`next/link` prefetch plus `queryClient.prefetchQuery` of the target's primary query); skeletons render instantly from the layout.
- Canvas: React Flow `nodesDraggable` with `onNodeDragStop` persistence; `memo` on nodes; edges computed with a memoized selector; no per-frame state in React (viewport in React Flow's store); 100 services at 60 fps verified.
- Logs: virtualized rows; batched appends (50 ms); ring buffer of 50 000 lines; line rendering avoids regex per frame by pre-parsing on receipt.
- Realtime: one socket per tab; events coalesced per animation frame before cache writes.
- Bundle: the canvas and log viewer are dynamically imported; the initial route (Home) JS ≤ 250 kB gzip; measured in CI with a size budget check.
- No layout shift on load (CLS 0 on every page in Lighthouse CI).

### Security
- The web app talks only to the public API (`/v1/*`); no server actions that bypass RBAC.
- Session cookie httpOnly SameSite=Lax; CSRF token header on every mutation; the fetch wrapper refuses to send credentials to a different origin.
- Sealed and masked values never enter the DOM until explicitly revealed; copied values come from a fresh `GET` so a stale cache cannot leak.
- Deep links never carry secrets; log downloads pass through the API with scrubbing.
- External URLs (public URL open, GitHub SHA links) use `rel="noopener noreferrer"`.
- `.env` import parsing happens client-side and posts keys/values through the variables API; no file upload endpoint in this phase.

### Data integrity & idempotency
- Staged changes are keyed by `(serviceId, field)` so repeated edits collapse; apply is idempotent by a client-generated `idempotencyKey` header supported by Phase 04.
- Canvas layout writes carry a `version` and the server rejects stale writes (409) → the client refetches and re-applies the local drag on top.
- Optimistic updates snapshot the previous cache value and restore it exactly on failure.
- Redeploy / Restart buttons debounce 800 ms and disable while the mutation is in flight.

## 6. Acceptance criteria
- [ ] A user can sign up, create a project, add an image service, watch it deploy live on the canvas, read logs, change RAM via staged changes, and redeploy, entirely in the UI (SPEC Phase 5 AC).
- [ ] The C14 checklist passes on every page in this phase, recorded in `docs/UI_DECISIONS.md` with screenshot links.
- [ ] Status change → visible in the UI < 1 s; log line → visible in live tail < 1 s (B14, measured).
- [ ] Canvas with 100 services pans and zooms at 60 fps (B14, measured and recorded).
- [ ] Dashboard route transitions feel < 150 ms (prefetch + skeletons, no spinners on navigation).
- [ ] Canvas positions persist per environment and survive reload; things stay where the user put them (C3.9).
- [ ] Every screen has exactly one primary action whose label is a verb (C3.2, C14).
- [ ] There is no refresh button anywhere; nothing requires a manual refresh (C3.4).
- [ ] Every error rendered comes from the catalog with a fix action (C3.6, C10).
- [ ] Staged changes bar shows "N changes to M services"; review shows a diff; apply redeploys only affected services (C8.1).
- [ ] Toasts stack to 3, bottom-right, with 8 s undo for delete variable (C8.4).
- [ ] Destructive actions require typed confirmation; reversible ones offer undo instead (C8.5).
- [ ] Every tab, deployment and log filter is in the URL and restores on reload (C8.6).
- [ ] All C13 shortcuts work and are listed in the `?` sheet.
- [ ] axe clean on every page, both themes; keyboard-only completes the full flow.
- [ ] Works at 390 / 1024 / 1440 px in dark and light; the mobile e2e suite passes.
- [ ] Alignment on the 4 px grid; only tokens, no magic numbers (checked by a stylelint rule forbidding raw px in `apps/web` except in the token file).
- [ ] No more than one accent-colored element competes per view.
- [ ] Sealed variables are never returned to or rendered by the client.

## 7. Test plan
- **Unit (Vitest):** query key factory shape; realtime `apply-event` for every topic in the map; reference-count subscription logic; `parse-dotenv` fixture suite; `cron` parser and humanizer; fuzzy search ranking; staged diff collapsing; shortcut sequence matcher (including "never inside inputs"); URL builders for deep links; relative time formatter ("3 min ago", "Deployed in 42 s"); middle-truncate.
- **Integration:** web against a real Phase 04 API in the Phase 00 docker-compose harness: auth flow, project + service creation through the public API only, staged apply creating one deployment per service.
- **E2E (Playwright):** suites listed in §4.19; each asserts realtime updates without reload by triggering server-side changes through the API in the test and waiting ≤ 1 s for the DOM.
- **Visual regression:** baselines per the matrix in §8; threshold 0.1 % pixel diff fails CI.
- **Accessibility (axe + keyboard pass):** axe on every route in both themes; a scripted keyboard-only run of the golden path; manual checklist per page in `UI_DECISIONS.md`.
- **Performance:** Playwright trace of 100-node canvas pan for 3 s → frames ≥ 58 fps average; Lighthouse CI on Home and Canvas (CLS 0, TBT < 200 ms); bundle size budget check.
- **Manual / on a real VM:** run the golden path against a control plane on a VM with the Phase 02 agent: sign up → project → image service → live → logs → memory change → redeploy; time it and record it.

## 8. Evidence required to close
- Test output for unit, integration, e2e, visual, axe, performance.
- The golden-path run recorded as a Playwright trace and a short screen recording (≤ 60 s).
- Measurements: status→UI latency, log→tail latency, canvas fps, route transition timing, bundle size.
- Screenshot matrix (each cell captured in dark and light):

| Page / surface | 390 | 1024 | 1440 | States captured |
|---|---|---|---|---|
| Login, Sign up, Invite, Forgot, Reset, 2FA, Verify | ✓ | ✓ | ✓ | default · loading · field error · expired token |
| Home | ✓ | ✓ | ✓ | loading · no servers hero · checklist 3/6 · full · error block |
| Projects list | ✓ | ✓ | ✓ | loading · empty · 6 cards · 50 cards · search no match |
| Add flow modal | ✓ | ✓ | ✓ | option list · database · image (+ private registry) · empty · cron · .env import · placeholder panels |
| Canvas | ✓ (list view) | ✓ | ✓ | loading · empty · 5 nodes with volume and edges · 100 nodes · selection · context menu · group · offline ring · env crossfade mid-frame |
| Inspector header | ✓ (sheet) | ✓ | ✓ | active · building · failed · no URL · inline rename |
| Deployments tab | ✓ | ✓ | ✓ | loading · empty · active + history · skipped row · detail running · detail failed with error card · rollback dialog |
| Variables tab | ✓ | ✓ | ✓ | loading · empty · table with chips · add row autocomplete · sealed · platform section · decrypt failure |
| Logs tab | ✓ | ✓ | ✓ | loading · empty · live · paused with jump button · filter no match · JSON expanded · offline banner · dense |
| Settings tab | ✓ | ✓ | ✓ | each section · capacity warning · danger zone typed confirm · placeholder sections |
| Staged bar + review modal | ✓ | ✓ | ✓ | 1 change · 3 changes 2 services · review diff · applying |
| Command palette | ✓ | ✓ | ✓ | empty recent · results · no match · in-service context |
| Notifications | ✓ | ✓ | ✓ | empty · items · unread badge |
| Global states | ✓ | ✓ | ✓ | reconnecting bar · permission denied · 404 · maintenance · server offline banner |
| Shortcut sheet | ✓ | ✓ | ✓ | default |
| Mobile tab bar + sheet | ✓ | — | — | canvas list · inspector sheet each tab · staged bottom sheet |

## 9. Review
- **SPEC H2 (UI review)** by Fable 5.1 with the full screenshot matrix attached. Probe: first-click clarity on Home, Projects, Canvas and the Add flow; hierarchy between the status pill, URL and meta on nodes; accent competition per view; copy against C9; missing states (long names, 0 items, 500 items); originality (nothing reads as another product's design).
- **SPEC H1 (code review)** by Fable 5.1 for `apps/web/lib/realtime/*`, `apps/web/lib/staged/*`, `apps/web/lib/shortcuts/*` and the canvas persistence. Probe: subscription leaks, cache write races between optimistic updates and server events, stale layout writes, shortcut handlers firing inside inputs, secrets in the DOM, deep links carrying state that should not be in a URL.

## 10. Risks & open questions
- **Risk:** React Flow performance with 100 nodes plus edge labels and volume chips. → **Mitigation:** memoized nodes, edges without labels until hover, chips rendered inside the node component, measured early in session 5 before building interactions.
- **Risk:** the inspector as a nested route causing canvas remounts on navigation. → **Mitigation:** canvas in `layout.tsx`, inspector in the child route; a test asserts the viewport is unchanged after opening and closing.
- **Risk:** realtime cache patches racing with optimistic updates. → **Mitigation:** events carry `updatedAt`; patches are applied only when newer than the cached row; unit tests cover both orders.
- **Risk:** shortcut collisions with browser and OS shortcuts (`⌘J` opens downloads in some browsers). → **Mitigation:** `preventDefault` only when the app handles it; `N` is the documented alternative; recorded in `UI_DECISIONS.md`.
- **Risk:** `text-muted` (`#646C76`) on `surface` (`#14171B`) may fall under 4.5:1. → **Mitigation:** measured in Phase 01; this phase applies the recorded exception rule.
- **Open question:** palette library (`cmdk`) vs. own list on Radix Dialog. Default: own implementation on Radix Dialog to keep the fuzzy ranking and grouping under control; decided by the implementer and recorded in `DECISIONS.md`.
- **Open question:** auto-layout engine (dagre vs. elkjs). Default: dagre (smaller, sufficient for left-to-right ranks); recorded in `DECISIONS.md`.
- **Open question:** whether the Add flow "New project" path should ask for a project name first or derive it from the first service. Default: derive ("api" → project "api"), editable inline afterwards; the user can override with the name field shown in the panel footer.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added for every choice made (dependencies, palette implementation, layout engine, shortcut mapping)
- [ ] `docs/UI_DECISIONS.md` updated with screenshots, C14 checklists per page, measured performance numbers
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 05 — App shell, projects, canvas, inspector</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/UI_DECISIONS.md,
docs/phases/PHASE-05-shell-canvas-inspector.md, and these SPEC sections:
C3, C4, C6, C7.2–C7.9, C7.11 (runtime mode), C7.12 (Source/Build/Deploy/Resources),
C7.23, C7.24, C7.26, C8, C9, C10, C11, C12, C13, C14, B4, B13, B14, J1, J6, J7.
Use only packages/ui components and tokens from Phase 01; propose new components
separately before building them. The structural parity target is a canvas plus
right-side inspector product; the visual identity is Lumen's own (SPEC C2, C4).
</context>
<goal>
A user can sign up, create a project, add an image service, watch it deploy live on
the canvas, read logs, change RAM via staged changes, and redeploy, entirely in the
UI, with every page passing SPEC C14 at 390/1024/1440 in dark and light.
</goal>
<scope>
- App shell (rail 56/220, top bar 48, content, inspector 480–880, staged bar, banners)
- Auth pages; Home; Projects list; Add flow (8 options, GitHub/Template/Compose as placeholders)
- Canvas: React Flow, dot grid 24px, nodes 260×120, volume chips, reference edges, groups,
  context menu, multi-select, minimap, auto-layout, snap, keyboard nav, persistence, crossfade
- Inspector header; Deployments (incl. detail timeline + error card + rollback); Variables
  (table, chips, autocomplete, sealed, platform); Logs runtime mode; Settings Source/Build/
  Deploy/Resources/Cron/Danger zone
- Command palette, notifications, global states, staged changes, optimistic updates,
  toasts, confirmations, deep links, C13 shortcuts, C12 responsive incl. mobile tab bar
- Realtime layer: one multiplexed WebSocket, topic → query cache map from the phase doc
</scope>
<out_of_scope>
GitHub pickers and push-to-deploy (Phase 06); Networking section, domains, HTTP logs
(Phase 07); Metrics tab, HTTP/Build log modes, full filter grammar (Phase 08); database
tabs and volume actions (Phase 09); environment management, PR envs, raw .env editor,
lumen.toml locks, compose import (Phase 10); setup wizard (Phase 11); placement and
replicas (Phase 12); templates (Phase 13); web terminal (Phase 14); workspace/account
settings pages (Phase 15); sleep, cron history, cost (Phase 16).
</out_of_scope>
<acceptance_criteria>
All items in docs/phases/PHASE-05-shell-canvas-inspector.md §6, including measured
B14 budgets (status→UI < 1 s, log→tail < 1 s, 100-node canvas 60 fps), axe clean on
every page, C13 shortcuts complete, mobile e2e suite green.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, query keys, realtime map, risks, test plan,
   open questions. STOP and wait for approval.
2. Implement in the session order from the phase doc header; run code and tests after
   each step; commit after every green step.
3. For UI: screenshots at 390/1024/1440 × dark/light × the states in §8; critique
   against SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
