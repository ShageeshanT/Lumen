# Phase 10 — Environments, staged changes, config as code

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (PR environment safety, compose conversion, toml precedence) |
| **Depends on** | Phase 6 (pull_request events, repo file reads, installation client), Phase 5 (staged changes bar, Variables tab, canvas), Phase 4 (environments, staged_changes, variables encryption) |
| **Unblocks** | Phase 13 (template deploy reuses the compose-to-services conversion and generators), Phase 14 (`lumen environment`, `lumen variables import/export` reuse the .env parser), Phase 16 (per-environment cron/sleep overrides via lumen.toml) |
| **Spec sections** | SPEC B4 (SKIPPED), B6 (environments, staged_changes, variables), B7 (references, generators, sealed), B8 (builder priority: lumen.toml wins), C7.5 options 7–8, C7.9, C7.12 ("Managed by lumen.toml" lock), C7.15, C7.16 Environments, C8.1, C8.7, C8.8, C9, D2 config as code, D3, D7, J3 |
| **Estimated sessions** | 6 focused sessions: (1) environments CRUD + switcher + copy/empty, (2) staged changes polish + persistence + diff modal, (3) PR environments lifecycle + PR comment + TTL worker, (4) compare & sync, (5) lumen.toml + locks + `.env.example` + raw editor + import/export, (6) compose import + drag-and-drop |

## 1. Goal
A user creates a staging environment as a copy of production in one click, opens a pull request and gets a preview environment with its URLs posted as a PR comment, compares two environments and syncs the differences as staged changes, and sees a lock icon on every setting their repository's `lumen.toml` controls.

## 2. Why this phase exists
Environments are how a project stops being a toy. Until now every service has exactly one configuration; this phase makes configuration per-environment, safely copyable, diffable and syncable, and lets it live in the repository as code. Four principles guide the details:

- **Copy is cheap, data is not.** Copying an environment duplicates services, config and variables (optionally excluding sealed ones) but never volumes or data. The UI says so in one sentence every time.
- **Nothing deploys by accident.** Every edit in this phase is a staged change. The floating bar, the diff modal and the optional note are the user's last look before traffic moves. "Apply immediately" is an explicit preference, off by default.
- **PR environments must not leak secrets.** Fork PRs are off by default with a warning that explains why; preview environments inherit variables from the base environment except sealed ones unless the user opts in; they expire.
- **The file wins, and the UI says so.** When `lumen.toml` sets a field, the corresponding control is locked with a tooltip that names the file and the key. There is never a silent override in either direction.

Docker Compose import exists because most self-hosters already have a `docker-compose.yml`; converting it into services, variables and volumes on the canvas is the fastest path from "I have this" to "it runs on Lumen".

## 3. Scope
### In scope
- Environments CRUD, the top-bar switcher, "New environment" (copy from production or empty), the Manage page, delete with typed confirmation.
- Staged changes polish: persistence per user per environment, floating bar, diff modal grouped by service, optional note → trigger description, ⇧⏎, apply only affected services, "Apply immediately" preference.
- PR preview environments: settings, lifecycle on `pull_request` events, `-pr-<n>` env slug, PR comment with URLs and statuses, TTL and auto-delete worker, fork safety.
- Compare & sync between two environments (services, config, variable keys) with per-item copy and bulk sync into staged changes.
- `lumen.toml` parsing (J3 schema as Zod), precedence (file over UI), per-environment overrides, "Managed by lumen.toml" locks, parse-error card.
- `.env.example` suggestions banner, raw `.env` editor with validation and diff preview, import/export `.env`.
- `docker-compose.yml` import (paste or upload, conversion, preview canvas, warnings, Create).
- Drag-and-drop of `.env` onto the Variables tab and `docker-compose.yml` onto the canvas.
### Out of scope
- Template deploy form and template schema (Phase 13), though compose conversion is written to be reused there.
- CLI commands (`lumen environment`, `lumen variables import`), Phase 14.
- Shared variables encryption and reference resolution engine (Phase 4); this phase only adds UI and copy semantics on top.
- Cron/sleep semantics themselves (Phase 16); `lumen.toml` keys for them are parsed and stored here but only take effect in Phase 16.
- Volume data copy between environments (never; SPEC C7.15).

## 4. Work breakdown

### 4.1 Environments CRUD and switcher
- **What:** `GET/POST /v1/projects/:id/environments`, `PATCH/DELETE /v1/environments/:id`. Fields: name (1–32 chars, unique per project, slug derived), kind (`production` | `staging` | `custom` | `preview`), `base_environment_id`, `ephemeral`, `expires_at`, `color` (one of 8 named tokens: teal, blue, violet, amber, rose, lime, slate, orange — production is always teal and marked). The top-bar switcher (Phase 5 stub) becomes real: a Radix dropdown listing environments with 8px color dots, production first with a "production" caption, then others by name, then "New environment" and "Manage" separated by a divider. Switching updates the URL (`/p/:project/:env/…`) and crossfades the canvas (200ms). Keyboard `E` opens it (C13).
- **Files:** `apps/api/src/routes/environments.ts`, `packages/db/src/schema/environments.ts` (add `color`, `slug`), `apps/web/components/shell/environment-switcher.tsx`, `apps/web/app/(app)/p/[project]/[env]/layout.tsx`
- **Done when:** creating, renaming (inline on Manage) and deleting update the switcher without reload (`environment.updated` topic); the URL slug changes on rename with a redirect from the old slug for 24 h; screenshots of the switcher in both themes.

### 4.2 New environment: copy or empty
- **What:** "New environment" opens a dialog: name input, then two large radio cards — "Copy everything from production" (default; sub-copy "Services, settings and variables. Never data.") with a nested checkbox "Include sealed variables" (unchecked; helper "Sealed values are copied without ever being shown.") — and "Start empty". Copy runs in a worker: for every service in the source environment create a `service_instances` row with the same config (builder, commands, healthcheck, resources, placement cleared to the default server, `deploy_on_push` on, `watch_paths` copied), copy variables re-encrypted under the same project data key (sealed ones only if the checkbox is on), copy shared variables, copy canvas layout, create generated domains (Phase 7) for web services, and create empty volumes with the same mount paths (no data). New services in the copy start in `STOPPED` with a banner on the canvas "Deploy staging when you're ready" and a "Deploy all" button, so nothing runs before the user looks at variables.
- **Files:** `apps/api/src/environments/copy.ts` (+ tests), `apps/api/src/workers/environment-copy.ts`, `apps/web/components/environments/new-environment-dialog.tsx`, `apps/web/components/canvas/environment-banner.tsx`
- **Done when:** copying a 6-service production with 40 variables produces an identical canvas (positions preserved), sealed variables absent unless opted in, no volumes contain data, and the copy completes in under 5 s with a progress state in the dialog.

### 4.3 Manage environments page
- **What:** `/p/:project/settings/environments` (C7.16 Environments): a table with color dot, name (inline editable except production), kind caption, service count, last activity ("Deployed 3 min ago"), PR number for previews, expiry countdown for ephemeral ones, and a row menu (Rename, Change color, Compare with…, Delete). Delete uses typed confirmation of the environment name and lists consequences: "Stops and removes 6 services, 2 volumes (data deleted), 3 domains." Production cannot be deleted (menu item disabled with tooltip "Production can't be deleted. Delete the project instead."). Below the table: the **PR environments** settings card (4.4).
- **Files:** `apps/web/app/(app)/p/[project]/settings/environments/page.tsx`, `apps/web/components/environments/environments-table.tsx`, `apps/web/components/environments/delete-environment-dialog.tsx`
- **Done when:** the table updates live; deleting a preview environment removes its containers within 10 s (agent reconciliation) and its rows; axe clean.

### 4.4 PR preview environments
- **What:** Settings card fields: Enable (switch), Base environment (select, default production), Auto-delete after merge or close (switch, default on), TTL (select: 1 day, 3 days, 7 days, 14 days, never; default 7 days), Allow pull requests from forks (switch, default off; when turned on, an inline warning: "Code from forks runs with this environment's variables. Only enable this if you trust every contributor." with a "Turn on anyway" confirm). Lifecycle handled by the Phase 6 `pull_request` events: `opened`/`reopened` → if enabled and (not a fork or forks allowed) create environment `kind = preview`, `name = "PR #<n>"`, `slug = "pr-<n>"`, `pr_number`, `base_environment_id`, `ephemeral = true`, `expires_at = now + TTL`, copy from base (sealed excluded unless the setting "Copy sealed variables to previews" is on — default off), then set every repo-sourced service instance's branch to the PR head ref and deploy; `synchronize` → redeploy affected services with the new head sha; `closed` → if auto-delete is on, delete the environment (with a 10-minute grace so a reopen restores it: mark `expires_at = now + 10 min` instead of deleting immediately); `reopened` within grace → clear expiry. Fork PRs when disallowed: no environment; a muted row appears in the project's Deploy timeline "PR #12 from a fork — previews disabled for forks" (no PR comment, to avoid leaking that Lumen exists to strangers). Generated domains for previews: `<service>-pr-<n>-<4char>.<base>`. The expiry worker runs every 5 minutes and deletes environments with `expires_at < now`, posting a final PR comment update.
- **PR comment (exact markdown, posted once on create and edited in place on every change; identified by a hidden marker `<!-- lumen-preview -->`):**

  ```markdown
  <!-- lumen-preview -->
  ### Preview environment for PR #12

  | Service | Status | URL |
  |---|---|---|
  | web | ● Active | https://web-pr-12-k3n8.apps.example.com |
  | api | ◐ Building | https://api-pr-12-x2p4.apps.example.com |
  | postgres | ● Active | private |

  Updated 2026-09-26 14:32 UTC · Expires in 6 days · [Open in Lumen](https://lumen.example.com/p/shop/pr-12)
  ```

  Statuses use the C4 glyphs and words. When the environment is deleted, the comment is edited to: "### Preview environment for PR #12\n\nRemoved on 2026-09-28 09:10 UTC (pull request closed)."
- **Files:** `apps/api/src/routes/projects/pr-settings.ts`, `apps/api/src/github/handlers/pull-request.ts`, `apps/api/src/environments/preview.ts` (+ tests), `apps/api/src/github/pr-comment.ts` (+ golden test), `apps/api/src/workers/preview-expiry.ts`, `apps/web/components/environments/pr-settings-card.tsx`
- **Done when:** opening a PR on the test repo creates the environment and the comment within 30 s; a push to the PR updates the comment's statuses; closing removes it after grace; a fork PR creates nothing; the TTL worker deletes an expired preview and edits the comment.

### 4.5 Compare and sync
- **What:** `/p/:project/compare?from=<env>&to=<env>` (also reachable from the switcher "Manage" page row menu "Compare with…"). Two selects at the top (from / to, swap button). Three sections with counts: **Services** (only in from / only in to / in both), **Settings** (per service in both: each differing field with from → to values; resources, commands, healthcheck, builder, root dir, watch paths, restart policy, placement replicas), **Variables** (per service and shared: keys only in from / only in to / keys in both with "value differs" — values never shown, sealed marked). Each differing item has a "Copy to →" button (direction follows the header); the header has "Sync all →" which stages every difference. Copying a service that exists only in `from` stages a "create service" change in `to`; copying a variable stages an upsert with the `from` value (re-encrypted server-side; the browser never sees the value); sealed values are copied server-side too and labelled "sealed value copied". The result lands in the staged changes of `to` (bar appears, review modal shows the items grouped by service).
- **Files:** `apps/api/src/routes/environments/compare.ts` (`GET /v1/projects/:id/compare?from=&to=`), `apps/api/src/routes/environments/sync.ts` (`POST /v1/environments/:id/sync` per SPEC J1, body `{ from_environment_id, items[] }` → staged changes), `apps/web/app/(app)/p/[project]/compare/page.tsx`, `apps/web/components/environments/compare-section.tsx`, `packages/shared/src/environments/diff.ts` (+ tests)
- **Done when:** comparing production and staging after changing 3 settings and 2 variables shows exactly 5 differences; "Sync all →" stages 5 changes; applying deploys only the 2 affected services; the diff helper has unit tests for every field type.

### 4.6 Staged changes polish
- **What:** Extend the Phase 5 staged changes: (a) **persistence** in `staged_changes(project_id, environment_id, user_id, changes jsonb, updated_at)`, one row per user per environment, upserted on every edit (debounced 300 ms) and loaded on page open, so a reload or a different device shows the same pending edits; (b) **bar copy** "3 changes to 2 services · Discard · Review & deploy (⇧⏎)" with correct pluralization ("1 change to 1 service"); (c) **review modal**: grouped by service (and "Shared variables"), each group a card with the service icon and name, rows "Memory 512 MB → 1 GB", "Start command `npm start` → `node dist/server.js`", "Variable `API_KEY` value changed", "Variable `NEW_FLAG` added", "Variable `OLD` removed", "Domain app.example.com added"; a textarea "Note (optional)" placeholder "Why this change? Shows in the deployment history." whose text becomes `deployments.trigger_description`; buttons "Discard all" (ghost, confirm if > 5 changes) and "Deploy 2 services" (primary; label counts affected services; changes that need no deploy — canvas position, names — apply silently and are excluded from the count and listed under "Applies without a deploy"); (d) **apply**: `POST /v1/environments/:id/staged/apply` writes all changes in one transaction, creates one deployment per affected service instance with `trigger = 'config_change'` or `'variable_change'`, clears the row, publishes `staged.cleared`; (e) **"Apply changes immediately"** preference (Account → Preferences, default off): when on, edits skip staging and the bar never appears; a one-time toast explains "Changes deploy immediately. Turn this off in Preferences."; (f) conflicts: if the underlying value changed on the server since staging (another user applied), the row shows "Changed by <name> since you staged this" with "Keep mine" / "Take theirs".
- **Files:** `apps/api/src/routes/staged.ts` (`GET/PUT/DELETE /v1/environments/:id/staged`, `POST …/staged/apply`), `apps/api/src/staged/apply.ts` (+ tests), `apps/web/components/staged/staged-bar.tsx`, `apps/web/components/staged/review-modal.tsx`, `apps/web/components/staged/change-row.tsx`, `apps/web/lib/staged-store.ts`
- **Done when:** staging 3 changes, reloading, and opening on a second browser shows the same bar; ⇧⏎ opens the modal from anywhere in the project; applying creates deployments only for affected services with the note visible in their history rows; a conflict renders with both resolutions working.

### 4.7 lumen.toml
- **What:** On every push (Phase 6 handler) and on manual deploy, the API reads `<root_dir>/lumen.toml` from the repo at the commit (`GET /repos/{o}/{r}/contents/{path}?ref=`) and parses it with a TOML parser (`smol-toml`, MIT) into the J3 schema as Zod:

  ```
  build:      builder ('auto'|'dockerfile'|'image'), dockerfile (string), command (string), watch (string[])
  deploy:     start, pre_deploy, healthcheck_path, healthcheck_timeout (int s), restart ('always'|'on_failure'|'never'),
              restart_max_retries (int), drain_timeout (int s), sleep_when_idle (bool), cron (string)
  resources:  memory (string with MB/GB → memory_limit_mb), cpu (number → cpu_limit)
  placement:  [{ server (name), replicas (int) }]
  environments.<name>.<section>: any of the above, overriding for that environment
  ```

  The parsed, environment-resolved document is stored on the service instance as `config_file(jsonb)` and `config_file_path`; each managed key maps to a `service_instances` column, and the desired-state compiler reads the file value over the column value. Precedence: file > UI, per key; keys absent from the file are UI-managed. Unknown keys produce a warning list (not an error). Parse errors produce a deployment `FAILED` with a new catalog entry `CONFIG_FILE_INVALID` — title "Your lumen.toml has a problem", explanation with line/column and message, fix "Open the file on GitHub" (deep link to the blob at the commit) — and the previous deployment stays live. In Settings, every managed field renders disabled with a `lock` 14 icon and tooltip "Managed by lumen.toml (`[deploy] start`). Edit the file to change it." and the section header shows "3 settings managed by lumen.toml · View file". Placement server names resolve to server ids by `servers.name` in the workspace; an unknown name warns and is ignored.
- **Files:** `packages/shared/src/config-file/schema.ts` (Zod), `packages/shared/src/config-file/parse.ts` (+ 25 tests incl. memory units, env overrides, unknown keys, invalid TOML), `apps/api/src/config-file/load.ts`, `apps/api/src/desired-state/precedence.ts`, `apps/web/components/settings/managed-field.tsx`, `packages/shared/src/errors/catalog.ts` (`CONFIG_FILE_INVALID`)
- **Done when:** a repo with `[resources] memory = "1GB"` shows the Memory slider locked at 1 GB with the tooltip; `[environments.staging.resources] memory = "256MB"` yields 256 MB in staging and 1 GB in production; an invalid file fails the deploy with the card and keeps the old deployment live.

### 4.8 `.env.example` suggestions
- **What:** When a repo-sourced service is created or its branch changes, the API reads `<root_dir>/.env.example` (also `.env.sample`, `.env.template`) and stores the parsed keys (never values from the example beyond defaults) on the service instance as `env_example_keys[]`. The Variables tab shows a dismissible banner when there are keys not yet defined: "We found `.env.example` in your repo with 5 variables. Add them?" → "Add variables" opens a form listing every missing key with an input (empty ones highlighted with a `--color-warning` left border and the caption "needs a value"), defaults from the example pre-filled and marked "from example", a "Sealed" checkbox per row, and "Stage 5 variables". Dismissal is stored per service instance and re-surfaces only when new keys appear.
- **Files:** `apps/api/src/config-file/env-example.ts`, `apps/web/components/variables/env-example-banner.tsx`, `apps/web/components/variables/add-from-example-form.tsx`
- **Done when:** the banner appears within 2 s of creating a service from a repo with `.env.example`, the form stages the variables, and the banner disappears after apply.

### 4.9 Raw `.env` editor, import and export
- **What:** Variables tab toolbar gains "Raw editor" (toggle). The editor is a monospace textarea (Geist Mono 13, 1.6 line-height, tab inserts two spaces) pre-filled with `KEY=value` lines (masked values shown as `KEY=••••••` unless revealed per line with the eye toggle in the gutter; sealed keys render as `KEY=<sealed>` and are read-only). Parse rules (`packages/shared/src/dotenv/parse.ts`): `KEY=value`, `export KEY=value`, single/double quoted values with escapes (`\n` in double quotes), multi-line double-quoted values, `#` comments (full line or after an unquoted value), blank lines ignored, keys must match `/^[A-Za-z_][A-Za-z0-9_]*$/`; references `${{ … }}` preserved verbatim. Invalid lines show a gutter marker and a message under the editor ("Line 4: keys can't start with a number"). "Preview changes" computes a diff against current variables (added / removed / changed keys, values hidden) and "Stage changes" stages it. **Import .env** (toolbar button or drop) opens a file picker, parses, and shows the same diff preview with a "Replace all" vs "Merge" segmented control (default Merge). **Export .env** downloads `KEY=value` for non-sealed variables (sealed listed as comments `# SEALED_KEY (sealed)`), after a confirm "This file contains secrets. Keep it safe." Export is audited.
- **Files:** `packages/shared/src/dotenv/parse.ts` (+ 30 tests), `packages/shared/src/dotenv/serialize.ts`, `apps/web/components/variables/raw-editor.tsx`, `apps/web/components/variables/import-env-dialog.tsx`, `apps/api/src/routes/variables.ts` (export endpoint with audit)
- **Done when:** round-tripping export → import produces zero diff; a malformed file shows line errors and no partial import; Merge and Replace behave as described in tests.

### 4.10 docker-compose.yml import
- **What:** Add flow option 7 and the canvas drop target. Input: paste (textarea) or upload (`.yml`/`.yaml`, max 1 MB). Parser: `yaml` (ISC) → Zod schema for the supported subset. Conversion rules per top-level `services.<name>`: `image` → image service; `build` (string or `{context, dockerfile}`) → repo service placeholder requiring the user to pick the repo (the context path becomes `root_dir`, `dockerfile` becomes `dockerfile_path`); `ports` (`"8080:80"`, `"80"`, long syntax) → first mapping's container port becomes `target_port` and a generated domain is planned (for known database images the port becomes a TCP proxy suggestion instead); `environment` (list or map, `${VAR}` and `${VAR:-default}` interpolations resolved against the compose file's `.env` if uploaded alongside, else left as required inputs) → service variables; `env_file` → listed as a warning "env_file ./api.env — upload it or add the variables after import"; `volumes` (`named:/path`, `./host:/path`, long syntax) → a volume with the mount path (host paths become named volumes with a warning that host data is not imported); `depends_on` → canvas edges and a `${{ <dep>.LUMEN_PRIVATE_DOMAIN }}` hint in variables that reference the service name as a host (best-effort: values equal to a service name are rewritten to the private domain reference); `command` (string or list) → start command; `healthcheck.test` (`CMD-SHELL` or `CMD`) → if it looks like an HTTP check (`curl`/`wget` with a path) → `healthcheck_path`, else ignored with a warning; `restart` → restart policy mapping (`always`→always, `on-failure`→on_failure, `no`/`unless-stopped`→never/always with note); `deploy.resources.limits` (`memory`, `cpus`) → resource limits. Unsupported keys (`networks` beyond default, `privileged`, `cap_add`, `devices`, `secrets`, `configs`, `extends`, `profiles`, `build.args`, `labels`) are listed in a warnings panel with a one-line reason each; `privileged: true` and the Docker socket in `volumes` are rejected with the SPEC B12 note. Preview: a read-only mini canvas (React Flow, non-interactive, 480px tall) showing the resulting nodes, volume chips and edges, next to a summary "4 services · 2 volumes · 11 variables · 3 warnings". "Create" builds everything as one staged batch applied immediately (project creation is not staged) and opens the canvas with the new nodes deploying.
- **Files:** `packages/shared/src/compose/schema.ts`, `packages/shared/src/compose/convert.ts` (+ 40 tests from real-world compose files: WordPress+MySQL, n8n+Postgres, Plausible stack, a Node monorepo build), `apps/api/src/routes/import.ts` (`POST /v1/import/compose` → preview; `POST /v1/import/compose/apply`), `apps/web/components/add-flow/option-compose.tsx`, `apps/web/components/import/compose-preview.tsx`, `apps/web/components/import/warnings-panel.tsx`
- **Done when:** the four fixture files convert with the expected services/variables/volumes (golden JSON), the preview renders in under 300 ms, and creating from the WordPress fixture yields a running WordPress reachable on its generated domain.

### 4.11 Drag and drop
- **What:** Two drop zones (C8.7): the Variables tab accepts `.env` files (any name matching `/^\.env(\..+)?$/` or content type text) and opens the import dialog at the diff preview; the canvas accepts `docker-compose.yml`/`compose.yaml` and opens the compose import at the preview step. While a file is dragged over the window, the eligible zone shows an overlay: 2px dashed `--color-accent` border at 10px radius inset 8px, `--color-accent-subtle` fill, centered icon (`file-input` 24) and text "Drop your .env to import variables" / "Drop docker-compose.yml to import services". Dropping an unsupported file shows a toast "That file isn't supported here. Drop a .env file on Variables or a docker-compose.yml on the canvas." Drag events are handled at the window level with a counter to avoid flicker on child enter/leave.
- **Files:** `apps/web/lib/use-file-drop.ts`, `apps/web/components/variables/env-drop-zone.tsx`, `apps/web/components/canvas/compose-drop-zone.tsx`
- **Done when:** dropping each file type opens the right dialog; the overlay appears within one frame of dragenter and never flickers; keyboard users have the equivalent buttons ("Import .env", "Import docker-compose.yml").

## 5. Detail checklist

### Typography
- Environment switcher trigger: `label` 13 / 500 for the environment name, 8 px color dot before it, and a `caption` 12 / 400 `text-muted` "production" suffix on the production entry. Menu items are `body` 14 / 400; the current environment is 14 / 500 with a `check` 16 icon at the right edge.
- New environment dialog: title `title-section` 16 / 600 "New environment"; radio card titles `title-card` 14 / 600; card sub-copy `meta` 13 / 400 `text-secondary`; checkbox helper `caption` 12 / 400 `text-muted`.
- Manage environments table: headers `label` 13 / 500 `text-secondary`, sentence case, never uppercase; cells `body` 14 / 400; kind and PR captions `caption` 12 / 400 `text-muted`; relative times and expiry countdowns `meta` 13 / 400 with `font-variant-numeric: tabular-nums`.
- Compare page: page title `title-page` 24 / 600 "Compare environments"; section titles `title-section` 16 / 600 with a count pill (`caption` 12 / 500); row field names `label` 13 / 500; from / to values in Geist Mono 13 / 400; variable keys in Geist Mono 13 / 500.
- Staged changes bar: count text `label` 13 / 500; the `Kbd` chip renders "⇧⏎" in Geist Mono 12.
- Review modal: title 20 / 600 "Review changes"; group headers `title-card` 14 / 600 next to a 16 px service icon; change rows `body` 14 / 400 with old and new values in Geist Mono 13; the note textarea is `input` 14 / 400 with `body` line-height 1.5.
- Managed-by-file lock: tooltip text 13 / 400; the section header note "3 settings managed by lumen.toml" is `meta` 13 / 400 `text-secondary` with the key path in Geist Mono 12.
- `.env.example` banner: `body` 14 / 400 with the filename and key names in Geist Mono 13.
- Raw editor: Geist Mono 13 / 400, line-height 1.6, tab size 2; gutter line numbers Geist Mono 12 `text-muted` tabular; error messages under the editor `caption` 12 / 400 `danger-text`.
- Compose import: summary line "4 services · 2 volumes · 11 variables · 3 warnings" is `meta` 13 / 500 tabular; warning rows `body` 13 / 400; the preview canvas reuses the Phase 5 node type at zoom 0.75, so node names render at 14 / 600 scaled.
- Drop overlay text 14 / 500 in the Phase 1 `accent-text` tier.
- PR environments settings card: field labels `label` 13 / 500; helpers `caption` 12 / 400 `text-muted`; the fork warning is `body` 13 / 400 inside the inline alert.
- Letter-spacing follows Phase 1: −0.01em at 20 px and 24 px titles, 0 elsewhere.

### Spacing & layout
- Switcher menu: min-width 240 px, 8 px vertical padding, items 32 px tall with 12 px horizontal padding, 8 px gap between dot and label, dividers 1 px `border` with 4 px vertical margin before "New environment" and "Manage environments".
- Dialogs: 24 px padding, radius 14; max-width 480 px (new environment, delete), 720 px (review modal), 960 px (compose import); footer buttons right-aligned with 8 px gap; the primary button is the last one.
- Radio cards: 2 columns, 12 px gap, 16 px padding, radius 10, 1 px `border`; selected state uses `border-strong` plus `accent-subtle` fill and a `check` 16 icon at top-right inset 12 px; the nested checkbox sits 12 px below the sub-copy with a 20 px left inset.
- Manage table: rows 44 px, 12 px horizontal cell padding, a fixed 32 px color-dot column, the row menu button 28 px square right-aligned.
- Compare page: content max-width 1200 px centered; a 48 px toolbar holds the two selects (each 240 px wide) and the 32 px swap button with 8 px gaps; sections stack with 24 px gaps; rows are 36 px tall on a `1fr 16px 1fr 96px` grid (from, arrow, to, action).
- Staged bar: fixed bottom 24 px, horizontally centered, 44 px tall, 12 px horizontal padding, radius full, `surface-raised` with 1 px `border` and the light-theme shadow token; 12 px gap between text, "Discard" and "Review & deploy"; width hugs content up to 640 px.
- Review modal: groups 16 px apart; each group card 16 px padding, radius 10; rows on a `1fr auto 1fr` grid with a 16 px arrow column and 8 px row gap; the note textarea is 72 px tall, full width, 16 px above the footer.
- Managed field: the `lock` 14 icon sits left of the label with 6 px gap; disabled controls use opacity 0.6 so the value stays legible; the "View file" link is right-aligned in the section header.
- Raw editor: min-height 240 px, max-height 60vh, 12 px padding, 40 px gutter; a 40 px toolbar above with "Preview changes" and "Stage changes" right-aligned.
- Compose import: at ≥1024 px a 60 / 40 split (preview left, summary and warnings right) with a 24 px gap; the preview is 480 px tall; below 1024 px they stack and the preview is 320 px tall.
- Drop overlay: inset 8 px from the zone, radius 10, 2 px dashed border, icon 24 centered with 8 px gap above the text.
- Everything sits on the 4 px grid; no magic numbers outside the tokens.

### Color & theme
- Environment colors are the 8 named tag tokens from Phase 1 (teal, blue, violet, amber, rose, lime, slate, orange). Production is always teal and is the only entry with the "production" caption. Dots are 8 px filled circles with a 1 px inner ring in `surface` so they read on hover rows.
- Selected radio card: `accent-subtle` fill and `border-strong`; focus ring 2 px `accent` with 2 px offset.
- Compare and review diffs never rely on color alone: added rows have a 2 px `success` left border and a "+" glyph plus the word "added"; removed rows a 2 px `danger` border, "−" and "removed"; changed rows a 2 px `warning` border, "→" and "changed". Row text stays `text`.
- The staged bar has exactly one accent element, the "Review & deploy" button; "Discard" is ghost.
- Lock icons are `text-muted`; tooltips use `surface-raised` with 1 px `border`.
- Inline warnings (fork PRs, compose warnings) use the warning-subtle fill, a `warning` icon and `text` for the body. The fork confirm button is the `danger` variant.
- Compose rejections (privileged, Docker socket) use the danger-subtle fill and `danger` icon.
- Drop overlay: `accent-subtle` fill, `accent` dashed border, `accent-text` copy.
- All of the above are screenshot-verified in dark and light; nothing in this phase introduces a new color token.

### Motion
- Switcher menu opens with a 120 ms ease-out fade and scale from 0.96; closes in 120 ms.
- Switching environments crossfades the canvas in 200 ms `cubic-bezier(.2,.8,.2,1)`: the old layout fades out while the new one fades in; nodes never slide because positions are per environment. With reduced motion the swap is instant.
- Staged bar enters with translateY(16 px) → 0 plus fade over 200 ms and leaves in reverse; the count text crossfades in 120 ms when it changes. Reduced motion keeps a 120 ms fade only.
- Review modal: 200 ms scale 0.98 → 1 with fade; reduced motion fades only.
- "Copy to →" turns into a "Staged" state with a `check` icon in 120 ms; no bounce.
- Lock tooltip: 120 ms fade after a 300 ms hover delay; shown immediately on keyboard focus.
- Drop overlay fades in within 120 ms; the dashed border is static (no marching ants).
- Compose preview nodes fade in over 120 ms with no springs because the preview is non-interactive.
- Copy progress: an indeterminate 2 px progress bar in the dialog header while the worker runs, then a 200 ms fade to the canvas on success.
- Nothing in this phase animates longer than 300 ms except progress indicators; the account-level reduced-motion preference overrides the OS setting (Phase 1 decision).

### Iconography & symbols
- Switcher trigger: `layers` 16 before the color dot; preview environments show `git-pull-request` 14 before "PR #12"; ephemeral environments show `timer` 14 before the countdown.
- New environment cards: `copy` 20 on "Copy everything from production", `file` 20 on "Start empty"; selection `check` 16.
- Manage row menu: `ellipsis` 16 trigger; items `pencil` 16 (Rename), `palette` 16 (Change color), `git-compare` 16 (Compare with…), `trash-2` 16 in `danger` (Delete).
- Compare: `arrow-left-right` 16 swap button; section icons `box` (Services), `sliders-horizontal` (Settings), `key-round` (Variables) at 16; `arrow-right` 14 on "Copy to →"; `check` 14 in the staged state; `lock` 14 next to sealed keys.
- Staged bar: `pencil-line` 16 before the count; the shortcut chip uses the `Kbd` component with "⇧⏎".
- Review modal rows: `plus`, `minus`, `arrow-right` at 14 as glyphs, always paired with the words added / removed / changed.
- Managed fields: `lock` 14; section note `file-code` 16; "View file" `external-link` 14.
- `.env.example` banner: `file-text` 16 in `info`.
- Raw editor: gutter `eye` / `eye-off` 14; error markers `circle-alert` 14 in `danger`; toolbar toggle `code` 16.
- Import / export: `upload` 16 / `download` 16.
- Compose import: `file-input` 24 in the drop overlay; `triangle-alert` 16 `warning` on warnings; `octagon-x` 16 `danger` on rejections.
- PR comment statuses use the C4 Unicode glyphs and words (● Active, ◐ Building, ✕ Failed, ☾ Sleeping, ■ Stopped, … Queued) because GitHub markdown cannot render icons.
- All Lucide icons use stroke-width 1.75 per Phase 1.

### Copy
Every string below is final; buttons are verbs; no exclamation marks.
- Switcher: "New environment" · "Manage environments".
- New environment dialog: title "New environment"; name placeholder "staging"; cards "Copy everything from production" / "Services, settings and variables. Never data." and "Start empty" / "Add services one by one."; checkbox "Include sealed variables" with helper "Sealed values are copied without ever being shown."; primary "Create environment"; progress "Copying 6 services…"; name conflict "An environment named staging already exists."
- Canvas banner after a copy: "Deploy staging when you're ready." with the button "Deploy all".
- Delete dialog: title "Delete staging?"; body "This stops and removes 6 services, 2 volumes (data deleted) and 3 domains. Type staging to confirm."; button "Delete environment". Production tooltip: "Production can't be deleted. Delete the project instead."
- PR environments card: title "Preview environments"; description "Create a preview environment for every pull request."; fields "Base environment", "Delete after merge or close", "Keep previews for", "Allow pull requests from forks"; warning "Code from forks runs with this environment's variables. Only enable this if you trust every contributor."; confirm "Turn on anyway"; GitHub not connected: "Connect GitHub to use preview environments." with a "Connect GitHub" link.
- Compare page: title "Compare environments"; same environment twice: "Pick two different environments."; identical: "These environments match."; buttons "Copy to →" and "Sync all →"; staged state "Staged"; hidden values "value differs"; sealed keys "sealed".
- Staged bar: "3 changes to 2 services" (singular "1 change to 1 service") · "Discard" · "Review & deploy". Review modal: title "Review changes"; note placeholder "Why this change? Shows in the deployment history."; buttons "Discard all" and "Deploy 2 services"; secondary section "Applies without a deploy"; conflict row "Changed by Maya since you staged this" with "Keep mine" / "Take theirs". Immediate mode toast: "Changes deploy immediately. Turn this off in Preferences."
- Managed fields: tooltip "Managed by lumen.toml ([deploy] start). Edit the file to change it."; header "3 settings managed by lumen.toml" · "View file"; unknown keys banner "lumen.toml has 2 keys Lumen doesn't understand: build.cache, deploy.region". Error card `CONFIG_FILE_INVALID`: title "Your lumen.toml has a problem"; explanation "Line 12, column 5: expected a string."; fix "Open the file on GitHub". The previous deployment stays live and the card says so: "Your previous version is still live."
- `.env.example` banner: "We found .env.example in your repo with 5 variables. Add them?" · "Add variables" · "Not now"; form captions "needs a value" and "from example"; button "Stage 5 variables".
- Raw editor: toggle "Raw editor"; buttons "Preview changes", "Stage changes"; error "Line 4: keys can't start with a number."; unsaved guard "Discard your edits?"; export confirm "This file contains secrets. Keep it safe." with "Download .env"; import mode segmented control "Merge" / "Replace all".
- Compose import: title "Import docker-compose.yml"; help "Paste your file or upload it."; summary "4 services · 2 volumes · 11 variables · 3 warnings"; warnings "env_file ./api.env — upload it or add the variables after import." and "./data is a host folder. We created a volume instead; existing data isn't imported."; rejection "privileged: true isn't allowed. Lumen never runs privileged containers."; empty "No services found in this file."; too large "Files over 1 MB aren't supported."; button "Create 4 services".
- Drop overlays: "Drop your .env to import variables" / "Drop docker-compose.yml to import services"; unsupported toast "That file isn't supported here. Drop a .env file on Variables or a docker-compose.yml on the canvas."
- Deploy timeline row for a disallowed fork PR: "PR #12 from a fork — previews are off for forks".

### States (empty · loading · error · success · partial)
- Switcher: loading shows three 32 px skeleton rows; error shows "Couldn't load environments" with "Retry"; a project with only production still shows the list.
- New environment: conflict error inline under the name; copy in progress disables the form and shows the progress bar; copy failure shows the error card "Couldn't copy production" with "Try again", and partially created rows are rolled back by the transaction plus a cleanup job for any domains already sent to agents.
- Manage page: never empty (production always exists); loading skeleton of three rows matching the final row height; expiry countdowns re-render every 60 s.
- Compare: loading skeletons per section (three rows each); a section can fail independently and shows its own inline error with "Retry" while the others render (partial state).
- Staged bar: hidden at zero changes; disabled with a spinner on the primary button while applying; apply failure shows a toast with "See details" opening the error card; while the control plane is unreachable the bar shows "Reconnecting…" and its actions are disabled with a tooltip (C7.26).
- Managed fields: no file → nothing shown; invalid file → error card on the deployment and a warning banner at the top of Settings; unknown keys → dismissible banner, re-shown on the next commit that changes the set.
- `.env.example`: absent → nothing; all keys already defined → nothing; dismissed → hidden until new keys appear.
- Raw editor: parse errors block "Stage changes" and list every bad line; switching tabs with unsaved edits asks "Discard your edits?".
- Compose import: invalid YAML → error under the textarea with the line number; empty → "No services found in this file."; oversized → "Files over 1 MB aren't supported."; preview loading → a 480 px skeleton with three node-shaped blocks.
- PR previews: enabling without GitHub connected shows the inline "Connect GitHub" state; a fork PR with forks disallowed produces the muted timeline row and nothing else.

### Keyboard & accessibility
- `E` opens the switcher (C13); arrow keys move, Enter selects, typing jumps to the first match, Esc closes.
- `⇧⏎` opens the review modal from anywhere in a project except while focus is in a textarea; inside the modal `⌘⏎` deploys and Esc closes.
- Radio cards implement the Radix RadioGroup pattern: roving tabindex, arrow keys move selection, Space selects, `role="radiogroup"` with a visible label.
- "Copy to →" buttons carry an `aria-label` naming the item and target ("Copy memory setting to staging"); the staged state is announced through a polite live region.
- Diff meaning is carried by glyph + word, never color alone (C11).
- Managed fields are `aria-disabled` with `aria-describedby` pointing at the lock explanation; the tooltip opens on focus as well as hover.
- The raw editor textarea has an `aria-label`; validation errors render in an `aria-live="polite"` region; gutter numbers are `aria-hidden`.
- Drop zones have keyboard equivalents ("Import .env", "Import docker-compose.yml"); the overlay is `aria-hidden`.
- The staged bar is `role="status"` with `aria-live="polite"` so count changes are announced ("3 changes staged").
- Dialogs trap focus (Radix Dialog), return focus on close, and set initial focus on the first meaningful control (name input, first radio card, textarea).
- Every page and dialog in this phase passes axe in CI and a manual keyboard pass.

### Responsive
- ≥1280 px: compare page in two columns per row; review modal 720 px; compose import side by side.
- 1024–1279 px: same layouts; the inspector overlay rules from Phase 5 apply to the Variables and Settings tabs.
- 768–1023 px: compare rows stack from and to on two lines with the action button below; the staged bar spans the width minus 16 px gutters.
- <768 px: the switcher becomes a bottom sheet; the review modal is a full-screen sheet with a sticky footer; compare rows become cards; the raw editor toolbar wraps to two lines; compose import offers paste plus a native file button (no drag on touch); drop zones are disabled and the buttons remain; the staged bar sits 16 px above the mobile tab bar.
- No hover-only affordances: row menus and copy buttons are always visible on touch devices.

### Performance
- Compare diffs are computed server-side and return in under 100 ms p95 for 50 services × 100 variables (B14 CRUD budget).
- Staged persistence is debounced 300 ms and sends only the changed entries; a full snapshot stays under 64 KB.
- Compose conversion completes in under 300 ms for 50 services; the preview canvas runs React Flow with dragging, selection and zoom disabled.
- Environment copy of 6 services and 40 variables completes in under 5 s using batched inserts in one transaction.
- The raw editor is a plain textarea with no highlighting library and handles 500 lines without input lag.
- Route transitions between environments stay under the 150 ms perceived budget because environment data is prefetched on switcher open.

### Security
- Sealed values never leave the server: copy, sync and compare re-encrypt server-side; compare returns keys and a "differs" flag only.
- `.env` export requires the member role, excludes sealed values, and writes an `audit_log` row (`variables.export`).
- Fork PRs default to off; when on, previews still exclude sealed variables unless "Copy sealed variables to previews" is also on; both toggles are audited.
- PR comments are posted with the installation token scoped to that repository and edited in place by the hidden marker; Lumen never posts a second comment.
- `lumen.toml` is read with the installation token at the exact commit, capped at 64 KB, and parsed by a data-only parser (`smol-toml`); no code execution.
- Compose import rejects `privileged`, `cap_add`, `devices`, `security_opt` and any Docker socket mount (B12); host paths are never bind-mounted.
- Uploaded `.env` files are parsed in the browser and sent as key/value pairs over HTTPS; raw files are never stored.
- Preview environment lifecycle actions are authorized by the verified webhook delivery, never by a user session.

### Data integrity & idempotency
- `pull_request` handlers are keyed by delivery id (Phase 6) and idempotent on (project, pr_number): a duplicate `opened` finds the existing environment instead of creating a second one.
- Environment copy runs in one transaction; domains already pushed to agents are cleaned up by a compensating job if the transaction fails.
- Staged apply is a single transaction that creates deployments from the staged snapshot and clears the row only on commit; concurrent applies by two users serialize with `SELECT … FOR UPDATE` on the environment row.
- Conflicts are detected by comparing each field's `updated_at` against the time it was staged.
- The expiry worker deletes previews with `expires_at < now()` ten per tick and tolerates environments that are already gone.
- The `lumen.toml` values in force are stored in each deployment's `config_snapshot`, so rollback restores the file-managed values from that time.

## 6. Acceptance criteria
From SPEC Part D, verbatim, plus phase-specific criteria.

- [ ] D7: Production plus custom environments; copy or empty creation; per-environment config and variables.
- [ ] D7: PR preview environments: auto create/destroy, PR comment with URLs, fork safety, TTL.
- [ ] D7: Compare and sync environments.
- [ ] D2: Config as code (`lumen.toml`). AC: fields set in the file show a lock in the UI.
- [ ] D3: Service, shared and platform variables; references with autocomplete; generators; sealed variables; raw `.env` editor; `.env.example` suggestions; import/export `.env`. AC: a reference cycle blocks the deploy with an error naming the cycle. (References, generators and autocomplete were built in Phases 4 and 5; this phase verifies them end to end.)
- [ ] D3: Staged changes with a diff review, applied as a single deploy per affected service.
- [ ] D3: Secret scrubbing in logs. AC: printing a sealed value in build output shows `••••••`. (Built in Phase 3; verified here with a sealed variable copied into a new environment.)
- [ ] Creating "staging" as a copy of a 6-service production reproduces every service, setting, canvas position and non-sealed variable, creates empty volumes, copies no data, and finishes in under 5 s.
- [ ] Opening a pull request on the test repository creates a preview environment and posts the PR comment within 30 s; a push updates the comment in place; closing the PR removes the environment after the 10-minute grace and edits the comment to the removed state.
- [ ] A pull request from a fork creates nothing while "Allow pull requests from forks" is off, and the deploy timeline shows the muted row.
- [ ] A preview past its TTL is deleted by the worker within 5 minutes of expiry.
- [ ] Comparing production and staging after 3 setting changes and 2 variable changes lists exactly 5 differences; "Sync all →" stages 5 changes; applying deploys only the 2 affected services.
- [ ] Staged changes survive a reload and appear in a second browser session for the same user.
- [ ] A repository with `[resources] memory = "1GB"` shows the Memory slider locked with the tooltip, and `[environments.staging.resources] memory = "256MB"` yields 256 MB in staging only.
- [ ] An invalid `lumen.toml` fails the deployment with the `CONFIG_FILE_INVALID` card and the previous deployment stays live.
- [ ] The `.env.example` banner appears within 2 s of creating a repo service that has one, and the form stages the variables.
- [ ] Raw editor round trip (export → import) produces zero differences; a malformed file imports nothing and lists every bad line.
- [ ] Importing the WordPress + MySQL compose fixture yields a running WordPress on its generated domain; the other three fixtures match their golden JSON.
- [ ] Dropping a `.env` on the Variables tab and a compose file on the canvas opens the correct dialog at the preview step.
- [ ] Every screen in this phase passes the SPEC C14 checklist at 390 / 1024 / 1440 in dark and light, and axe reports zero violations.

## 7. Test plan
- **Unit (Vitest, `packages/shared`):** `dotenv/parse` (30 cases: quotes, escapes, multi-line, comments, invalid keys, references preserved), `dotenv/serialize` round trip, `config-file/parse` (25 cases: every J3 key, memory units MB/GB, environment overrides, unknown keys, invalid TOML with line/column), `environments/diff` (every field type, sealed handling, only-in-from / only-in-to), `compose/convert` (40 cases from the four fixtures plus edge cases: long-syntax ports and volumes, `${VAR:-default}`, `depends_on` rewrite, rejected keys).
- **Unit (`apps/api`):** `environments/copy` (sealed excluded / included, no data, transaction rollback), `environments/preview` (opened / synchronize / closed / reopened within grace, fork rejection, TTL), `github/pr-comment` golden markdown test, `staged/apply` (single transaction, affected-services set, conflicts, concurrent apply serialization).
- **Integration (API against Postgres via testcontainers):** environment CRUD with RBAC per role; copy end to end; staged persistence per user per environment; `POST /v1/environments/:id/sync` produces staged changes; `POST /v1/import/compose` preview and apply; export audit row written.
- **E2E (Playwright):** suite `environments`: create staging by copy, switch with `E`, delete with typed confirmation; suite `pr-previews`: open a PR on the test repo, assert the comment and environment, push, close; suite `compare-sync`: make 5 differences, sync, review, deploy; suite `config-as-code`: repo with `lumen.toml`, assert locks and per-environment values, break the file and assert the error card; suite `variables-raw`: raw editor edit, preview, stage, export, import; suite `compose-import`: paste the WordPress fixture, assert the preview and a live site; suite `mobile`: switcher sheet, review sheet, compare cards at 390 px.
- **Visual regression:** every page and dialog in this phase × 390 / 1024 / 1440 × dark / light × the states in §5; diff threshold from Phase 1.
- **Accessibility (axe + keyboard pass):** switcher, both dialogs, manage page, compare page, review modal, raw editor, compose import, PR settings card; keyboard script: create an environment, stage a change, review and deploy without a pointer.
- **Manual / on a real VM:** run the WordPress compose import against a real server; open a real PR from a fork and confirm nothing is created; let a preview expire and confirm the worker removes it and edits the comment.

## 8. Evidence required to close
- Vitest and Go test output with counts for the suites in §7 (all green), and the Playwright report for the seven suites.
- Screenshots under `docs/evidence/phase-10/`: switcher open, new environment dialog (both cards, checkbox on), copy progress, manage page with a preview and an expiring environment, delete dialog, PR settings card with the fork warning, compare page with 5 differences and after "Sync all →", staged bar at 1 and 3 changes, review modal with a conflict row, a locked Settings section with the tooltip open, the `CONFIG_FILE_INVALID` card, the `.env.example` banner and form, the raw editor with two errors, export confirm, compose import preview with warnings, both drop overlays, and the mobile sheets, each at 390 / 1024 / 1440 in dark and light.
- A link to the test PR showing the comment in its created, updated and removed states, with timestamps.
- Timings: environment copy duration, compare p95 from the integration run, compose conversion time for the 50-service fixture.
- The commands run for the real-VM checks with their output.

## 9. Review
Opus 5.5 builds this phase, so Fable 5.1 reviews it. Run SPEC H1 (code review) on the API and shared packages and SPEC H2 (UI review) on the screenshot set in §8. The reviewer should probe these specifically:

- **Secret paths.** Trace every route by which a sealed or plain variable value could reach a browser or a PR from a fork: compare responses, sync payloads, environment copy, preview creation, `.env` export, the PR comment. Confirm each is server-side only or role-gated and audited.
- **Preview lifecycle races.** `closed` followed by `reopened` inside the grace window; `synchronize` arriving while the environment is still being created; two `opened` deliveries for the same PR; manual delete racing the expiry worker.
- **Staged apply concurrency.** Two users applying the same environment at once; a user applying while another user's edit lands; the conflict row's "Take theirs" path.
- **Precedence correctness.** `lumen.toml` values versus UI values per key, per environment override, on rollback (snapshot), and when the file is removed in a later commit (fields unlock and the last UI value applies).
- **Compose conversion safety.** `${VAR}` interpolation cannot inject references or shell; rejected keys cannot be smuggled through YAML anchors or `extends`; host-path volumes never bind-mount.
- **GitHub API budget.** Contents reads for `lumen.toml` and `.env.example` use conditional requests and per-commit caching; a busy repository does not exhaust the installation rate limit.
- **Copy against C9.** Every string in §5 Copy: verbs on buttons, no exclamation marks, no jargon without a tooltip, consequences listed before destructive actions.
- **C14 per screen.** One primary action per view; the staged bar never competes with a dialog's primary button; skeletons match final layouts; nothing requires a refresh.
- **Originality.** The compare page, review modal and compose preview must not read as a copy of another product's screens.

## 10. Risks & open questions
- **Risk:** Reading `lumen.toml` and `.env.example` on every push adds two GitHub API calls per deploy and can hit the installation rate limit on active monorepos. → **Mitigation:** conditional requests with ETags, a per-commit cache in Postgres, and a single tree read when both files are needed.
- **Risk:** Real-world compose files use features outside the supported subset (profiles, extends, anchors, build args). → **Mitigation:** every unsupported key is listed in the warnings panel with a reason; the fixture corpus grows from reported files; conversion never silently drops a key.
- **Risk:** Preview environments can exhaust server capacity on busy repositories. → **Mitigation:** a per-project cap on concurrent previews (default 5); beyond the cap the oldest preview is stopped with a PR comment note "Paused: this project has 5 active previews" and a "Resume" action.
- **Risk:** Two users staging changes to the same environment get confused by conflicts. → **Mitigation:** the conflict row with both resolutions and the actor's name; staging stays per user (no environment lock).
- **Risk:** `.env` export is a secret exfiltration path. → **Mitigation:** member role required, sealed values excluded, audit row written, and the confirm dialog names the risk.
- **Open question:** Default concurrent-preview cap. Owner decides; default 5 per project.
- **Open question:** Whether admins can disable `.env` export per workspace. Owner decides; default allowed for members and above.
- **Open question:** Whether preview environments respect each service's "wait for CI" setting or always deploy immediately. Default: respect the setting, so a failing check suite skips the preview deploy with the same SKIPPED row as production.
- **Open question:** Whether the PR comment should link to build logs per service. Default: only the "Open in Lumen" link, to keep the comment short.
- **Open question (spec):** SPEC C7.21 places "Apply changes immediately" under account preferences, while a workspace admin may want to force staging for everyone. Default: account-level only, as specified; a workspace override is noted for Phase 15 if requested.
- **Open question (spec):** SPEC J3 uses `[environments.staging.resources]` for overrides; the doc keeps this exact key path. If the owner prefers a shorter form, only `packages/shared/src/config-file/schema.ts` changes.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: TOML parser choice, YAML parser choice, preview cap default, grace window, compose subset boundaries, `.env` export policy
- [ ] `docs/UI_DECISIONS.md` updated with the §8 screenshots
- [ ] Cross-model review done (H1 by Fable 5.1 on code, H2 on screenshots) and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 10 — Environments, staged changes, config as code</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md,
docs/phases/PHASE-10-environments-config-as-code.md, and these SPEC sections:
B4 (SKIPPED), B6 (environments, staged_changes, variables), B7, B8 (builder
priority), C7.5 options 7–8, C7.9, C7.12 ("Managed by lumen.toml"), C7.15, C7.16
Environments, C8.1, C8.7, C8.8, C9, C14, D2 config as code, D3, D7, J3.
Phases 4, 5 and 6 are done: environments, variables encryption, staged_changes,
the Variables tab, the staged-changes bar and GitHub pull_request events exist.
</context>
<goal>
A user creates a staging environment as a copy of production in one click, opens a
pull request and gets a preview environment with its URLs posted as a PR comment,
compares two environments and syncs the differences as staged changes, and sees a
lock on every setting their repository's lumen.toml controls.
</goal>
<scope>
- Environments CRUD, the top-bar switcher, new environment (copy or empty), manage
  page, delete with typed confirmation
- Staged changes polish: persistence per user per environment, floating bar copy,
  review modal grouped by service, optional note as trigger description, ⇧⏎,
  apply only affected services, "Apply immediately" preference, conflict rows
- PR preview environments: settings card, lifecycle on pull_request events, PR
  comment edited in place, TTL and expiry worker, fork safety default off
- Compare and sync between two environments into staged changes
- lumen.toml parsing (J3 as Zod), file-over-UI precedence per key, per-environment
  overrides, "Managed by lumen.toml" locks, CONFIG_FILE_INVALID error card
- .env.example suggestions banner and one-click form
- Raw .env editor with validation and diff preview; import and export .env
- docker-compose.yml import: paste or upload, conversion, preview canvas,
  warnings, Create
- Drag and drop of .env onto Variables and docker-compose.yml onto the canvas
</scope>
<out_of_scope>
- Template schema and deploy form (Phase 13)
- CLI commands lumen environment and lumen variables import/export (Phase 14)
- Reference resolution engine and encryption internals (Phase 4)
- Cron and sleep behavior (Phase 16); their lumen.toml keys are parsed only
- Copying volume data between environments (never)
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-10-environments-config-as-code.md §6, including
the SPEC D7, D2 config-as-code and D3 items copied there, verified with the
evidence listed in §8.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, schema changes (environments.color and
   slug, service_instances.config_file and env_example_keys, staged_changes
   shape), the preview lifecycle state machine, the compose conversion rules,
   risks, test plan, open questions. STOP and wait for approval.
2. Implement in the six session order from the header table; run code and tests
   after each step.
3. For UI: screenshots at 390/1024/1440 × dark/light × the states listed in §5;
   critique against SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next
   steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
