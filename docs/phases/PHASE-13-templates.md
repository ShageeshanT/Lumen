# Phase 13 — Templates

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 (parallelizable across sessions) → reviewed by Fable 5.1 (schema, resolver, license audit) |
| **Depends on** | Phase 4 (control plane, variables, generators, references), Phase 5 (add flow, canvas, inspector), Phase 7 (generated domains, target port), Phase 9 (engine catalog, volumes), Phase 10 (`docker-compose.yml` import shares the service-creation transaction; env copy semantics) |
| **Unblocks** | Phase 14 (MCP `deploy_template` tool, `lumen template deploy`), Phase 17 (HA Postgres ships as a template), Phase 18 (docs site lists every template) |
| **Spec sections** | SPEC B6 (`templates`), B7 (generators, references), B8 (image sources, private registries), B9 (generated domains), C4, C5 (Stepper wizard, Combobox, Key-value editor, Code block), C7.4 (quick starts), C7.5 (Template option), C7.19, C8.1, C9, C10, C11, C12, D9, J1 (templates), J4, J7 |
| **Estimated sessions** | 8 focused sessions, 4 of them parallelizable: (1) schema + registry + resolver, (2) gallery + detail + deploy form, (3) create-from-project + export/import, (4–7) templates in four parallel sessions (split in §4.11), (8) deploy tests for all 21, screenshots, license audit, review fixes |

## 1. Goal
A user opens the template gallery, picks "n8n" or "Next.js starter", fills in the one or two values that cannot be generated, clicks Deploy, and watches a complete multi-service project appear on the canvas and go live, and a user who has built something good can turn their own project into a template that others in the workspace deploy the same way.

## 2. Why this phase exists
Templates are how beginners get from "I want an analytics dashboard" to a running Umami without knowing what a Postgres volume is. They are also how the platform earns trust: twenty-one templates that all deploy cleanly prove the deploy engine, the variable resolver, the domain system and the volume system work together. Every template is therefore an integration test disguised as a feature, and the acceptance criterion is blunt: each one is deployed for real, by the model, before it ships.

The J4 schema is the contract. It has to express everything the D9 apps need (multiple services, volumes, generated secrets, cross-service references, required user inputs, a public domain, healthchecks, resource sizes, and for a few apps a cron or a pre-deploy command) while staying small enough that a user can author one by hand. Templates are JSON, not code, so the resolver can validate them, diff them, and render a mini-diagram without executing anything.

Feature parity target: a marketplace with categories, search, per-template detail with a services diagram and required inputs, one-click deploy, and create-from-project publishing, structurally comparable to mature platforms. The visual identity is Lumen's own (C2, C4), and no third-party product names, marks or copy are reproduced beyond the factual app name in each template card.

## 3. Scope
### In scope
- The template definition schema (J4) as Zod, extended with the fields D9 apps need, with a `schemaVersion` and a migration path.
- Built-in template registry: one JSON file per template under `packages/templates`, validated at build time, seeded into the `templates` table (workspace_id null) on API boot and re-synced on version bump.
- Template resolver and deploy engine: generators, `self.*` and `<key>.*` references, required inputs, dependency ordering, one transaction that creates the project or adds to an existing one, then triggers deploys.
- All 21 D9 templates: Postgres, MySQL, Redis, MongoDB, MinIO, n8n, Uptime Kuma, Umami, Plausible, Ghost, WordPress, Directus, Strapi, Meilisearch, Metabase, Grafana + Prometheus, Next.js starter, Express starter, FastAPI starter, Django starter, Laravel starter — each with pinned images, required inputs, volumes, a healthcheck, and a per-template deploy test.
- The five starter repositories (Next.js, Express, FastAPI, Django, Laravel) as public GitHub repos under the product organization, each with a `lumen.toml`, a `/health` route and a README.
- License and self-hosting-terms audit for every third-party app, recorded in DECISIONS.md, with any template that cannot ship removed or replaced.
- Gallery (C7.19): search, categories, cards; template detail with a services mini-diagram, required inputs and Deploy; the deploy form (generated values pre-filled and marked "auto", create a new project or add to the current one).
- Create-from-project wizard: pick services, classify variables as required / generated / fixed, name, icon and description, JSON preview, publish private to the workspace or instance-wide (admins).
- Export and import of template JSON, with validation errors shown at the exact JSON path.
- "Used by N" per template on this instance.
- Template option in the Add flow (C7.5 option 3) opening the gallery inline, and the Projects-empty quick start "Deploy a template" (C7.4).
- Template categories per C7.19: Databases, Starters, AI, CMS, Analytics, Automation, Storage, Monitoring, Dev tools.

### Out of scope
- `docker-compose.yml` import (Phase 10 owns it; this phase reuses its service-creation transaction and adds "Save as template" on the compose preview as a stretch item tracked in PROGRESS.md).
- The MCP `deploy_template` tool and the `lumen template deploy` CLI command (Phase 14 calls `POST /v1/templates/:slug/deploy`).
- HA Postgres template (Phase 17).
- A public, cross-instance template marketplace or template ratings.
- An AI-category built-in template (D9 lists none; the category exists in the gallery and shows an empty state until a workspace publishes one; a candidate is tracked in PROGRESS.md).

## 4. Work breakdown

### 4.1 Template schema (Zod) and versioning
- **What:** Encode J4 and extend it. Top level: `schemaVersion: 1`, `slug` (kebab-case, unique per scope), `name`, `description` (≤ 140 characters), `longDescription` (markdown, ≤ 4,000 characters), `icon` (an id from the framework/app icon registry or `lucide:<name>`), `category` (enum of the nine C7.19 categories), `version` (integer), `tags[]`, `links {docs?, source?, license?}`, `license {name, url}` (required for third-party apps), `minLumenVersion?`, `services[]`. Per service: `key` (identifier, unique), `name`, `icon?`, `kind` (`web|worker|cron|database`), `source` (`{image, registryCredential?}` or `{repo, branch?, rootDir?}`), `build? {builder, dockerfilePath?, buildCommand?}`, `deploy? {startCommand?, preDeployCommand?, healthcheckPath?, healthcheckTimeoutS?, restartPolicy?, cron?, targetPort?}`, `resources? {memoryMb, cpu}`, `volume? {mountPath, sizeLimitMb?}`, `domain? {generate: boolean, targetPort?}`, `tcpProxy? {enable: boolean}`, `variables` (map of key → string template or `{required: true, description, default?, secret?}` or `{generated: "secret(32)" | "uuid()" | "port()" | ...}` or `{fixed: string}`), `dependsOn?[]` (service keys; inferred from references when omitted). Expression grammar: `${{ secret(N) }}`, `${{ secret(N, "alphabet") }}`, `${{ uuid() }}`, `${{ port() }}`, `${{ self.KEY }}`, `${{ <serviceKey>.KEY }}`, `${{ input.KEY }}` (an explicit required input shared across services), plus the platform variables `LUMEN_PRIVATE_DOMAIN`, `LUMEN_PUBLIC_DOMAIN`, `PORT` reachable via `self.`/`<key>.`.
- **Files:** `packages/shared/src/templates/schema.ts`, `packages/shared/src/templates/expressions.ts` (tokenizer + evaluator, shared with the variables resolver from Phase 4 via a common module `packages/shared/src/variables/expr.ts`), `packages/shared/src/templates/schema.test.ts`, `packages/shared/src/templates/expressions.test.ts`, `packages/shared/src/templates/migrate.ts` (schemaVersion upgrades), `docs/user/templates/schema.md` (human-readable reference generated from the Zod schema with `zod-to-json-schema`).
- **Done when:** the J4 example validates unchanged, every invalid case in the test file fails with a JSON-path error, and the generated JSON Schema is committed and used by editor autocompletion in the create wizard.

### 4.2 Built-in registry and seeding
- **What:** `packages/templates/templates/<slug>.json` for each built-in; an `index.ts` that imports and validates all of them at build time (the package fails to build on an invalid template); a `scripts/pin-template-images.ts` that resolves every `source.image` tag to a digest and writes `imageDigest` beside it; on API boot, upsert each built-in into `templates` keyed by `(workspace_id IS NULL, slug)` when `version` is newer; a `GET /v1/templates` route with `?q=&category=&scope=builtin|workspace|all` returning cards with `usedBy` counts; `GET /v1/templates/:slug` returning the full definition plus the resolved list of required inputs.
- **Files:** `packages/templates/templates/*.json`, `packages/templates/src/index.ts`, `packages/templates/src/index.test.ts`, `scripts/pin-template-images.ts`, `packages/db/src/schema/templates.ts` (add `used_count`, `image_digests`, `published_scope workspace|instance`), `apps/api/src/templates/seed.ts`, `apps/api/src/routes/templates.ts`, `apps/api/src/routes/templates.test.ts`.
- **Done when:** the seed runs idempotently twice with no duplicate rows, and the list route returns all 21 built-ins with categories and counts.

### 4.3 Resolver and deploy engine
- **What:** `POST /v1/templates/:slug/deploy` with `{target: {newProject: {name, environmentName?}} | {projectId, environmentId}, serverId?, inputs: {KEY: value}}`. Steps inside one Postgres transaction: validate inputs against the template's required set; evaluate generators once per template deploy (so `self.POSTGRES_PASSWORD` used twice yields one value); topologically sort services by `dependsOn` and inferred references (databases first); create the project and environment (or verify membership and RBAC on the existing ones); create each service, its instance (source, build, deploy, resources, placement on `serverId` or the auto-picked server), its volume, its variables with references rewritten from template keys to real service names (`${{ postgres.DATABASE_URL }}` stays a live reference so later edits propagate), its generated domain and TCP proxy; write `template_deployments(template_id, project_id, environment_id, inputs_keys[], created_by)` and increment `used_count`; commit; then enqueue deployments in dependency order with `trigger = template`. Return the project, environment and the created service ids so the UI can navigate. Errors map to the catalog: `TEMPLATE_INPUT_MISSING` (new entry: "Fill in the required values"), `VARIABLE_REF_MISSING`, `VARIABLE_REF_CYCLE`, `SERVER_CAPACITY`.
- **Files:** `apps/api/src/templates/resolve.ts`, `apps/api/src/templates/deploy.ts`, `apps/api/src/templates/order.ts`, `apps/api/src/templates/deploy.test.ts` (uses the Phase 4 test harness and a fake agent), `packages/db/src/schema/template_deployments.ts`, `packages/shared/src/errors/catalog.ts` (`TEMPLATE_INPUT_MISSING`).
- **Done when:** the J4 two-service example deploys to the test VM end to end from an API call and the API's `DATABASE_URL` resolves to the Postgres private domain with the generated password; a cycle between two template services is rejected with the cycle named.

### 4.4 Gallery page
- **What:** `/templates` (workspace-level route from the rail) and the same component inline inside the Add flow modal. Layout: search input (debounced 150ms, matches name, description, tags), a category rail on the left at ≥1024 (All plus the nine categories with counts) that becomes a horizontal scrollable chip row below 1024, and a responsive card grid (3 columns ≥1280, 2 at 768–1279, 1 below). Card: icon (24px), name, one-line description, service count chip ("3 services"), "Used by 12" meta (hidden when 0), and a `Workspace` badge for workspace-published templates; whole card is a link to the detail; hover raises the surface. Sort: Popular (used_count desc), Name, Newest. URL: `/templates?q=analytics&category=analytics&sort=popular`.
- **Files:** `apps/web/app/(app)/templates/page.tsx`, `apps/web/components/templates/Gallery.tsx`, `apps/web/components/templates/CategoryRail.tsx`, `apps/web/components/templates/TemplateCard.tsx`, `apps/web/components/templates/GallerySearch.tsx`, `apps/web/components/add/AddTemplate.tsx` (inline variant), `apps/web/lib/url-state/templates.ts`.
- **Done when:** 21 built-ins render with correct categories, search narrows live, the URL round-trips, and screenshots exist for every breakpoint and both themes.

### 4.5 Template detail
- **What:** `/templates/:slug`. Header: icon (32px), name (page title), category chip, version, license link, "Used by N", primary button Deploy, overflow menu (Export JSON, and for workspace templates Edit, Unpublish, Delete). Body: description (markdown rendered with the same typography as the docs), a **services mini-diagram** (an SVG or a read-only React Flow instance: one small node per service with icon, name, kind, a volume glyph when it has one, and dashed edges for references), a **Required inputs** list (key, description, whether it is secret), a **What gets created** list (services with image or repo, volumes with mount paths, domains), and a collapsible **Definition** code block (JSON, copy button).
- **Files:** `apps/web/app/(app)/templates/[slug]/page.tsx`, `apps/web/components/templates/TemplateDetail.tsx`, `apps/web/components/templates/ServicesDiagram.tsx`, `apps/web/components/templates/RequiredInputs.tsx`, `apps/web/components/templates/WhatGetsCreated.tsx`.
- **Done when:** every built-in's detail renders without layout breakage (long descriptions, 6 services, zero required inputs), and the diagram matches the definition in a snapshot test.

### 4.6 Deploy form
- **What:** Opened by Deploy as a modal (side sheet on mobile) with a 3-step stepper: (1) **Where** — radio cards "New project" (name input defaulting to the template name, environment "production") or "Add to current project" (only when opened from inside a project; shows the project and environment), and a server select when the workspace has more than one server (auto-picked with "Auto" when one); (2) **Values** — one field per template variable that is required or generated: required fields are inputs (secret fields use the Secret component) with the description as helper text and empty ones highlighted; generated fields are pre-filled, read-only by default with an "auto" chip and a "Customize" link that unlocks them; fixed values are not shown; a "Show all variables" toggle reveals the fixed ones read-only; (3) **Review** — the What-gets-created list plus the estimated memory total against the chosen server's free memory ("Uses about 1.5 GB of oracle-1's 18 GB free"), then the primary button "Deploy template". On submit: optimistic navigation to the new project's canvas with the nodes already present in the Queued state and the inspector open on the first web service's Deployments tab (C7.5 last bullet).
- **Files:** `apps/web/components/templates/DeployTemplateDialog.tsx`, `apps/web/components/templates/steps/{WhereStep,ValuesStep,ReviewStep}.tsx`, `apps/web/components/templates/GeneratedField.tsx`, `apps/web/lib/mutations/deploy-template.ts`, `apps/web/components/templates/capacity.ts` (memory estimate).
- **Done when:** e2e deploys "Umami" into a new project and "Redis" into an existing project; a missing required value blocks step 2 with the field focused and the message "This value is required"; the capacity warning appears when the total exceeds free memory.

### 4.7 Create-from-project wizard
- **What:** Project settings → "Create template from this project" and the canvas overflow menu. Stepper: (1) **Services** — checklist of the environment's services with icons; selecting a database includes its volume automatically; (2) **Variables** — a table of every variable across the chosen services with a per-row classification: Required (user will fill it; add a description), Generated (pick a generator; secrets default here when the value looks random), Fixed (keep the current value; references to other selected services are kept as references and shown as chips), Exclude; sealed variables can only be Required or Generated (their values are unreadable, C7.9); (3) **Details** — name, slug (auto from name, editable), category, icon picker (the app icon registry plus Lucide search), description, long description (markdown), license fields when any service uses a third-party image; (4) **Preview** — the JSON in a read-only editor with the diagram beside it, validation errors inline at their JSON path; (5) **Publish** — radio "Private to this workspace" (default) or "Everyone on this instance" (instance admins only), then "Publish template". Editing an existing workspace template re-enters the wizard with values pre-filled and bumps `version` on publish.
- **Files:** `apps/web/app/(app)/p/[project]/settings/template/page.tsx`, `apps/web/components/templates/create/CreateTemplateWizard.tsx`, `apps/web/components/templates/create/steps/{ServicesStep,VariablesStep,DetailsStep,PreviewStep,PublishStep}.tsx`, `apps/web/components/templates/create/VariableClassifier.tsx`, `apps/web/components/templates/create/IconPicker.tsx`, `apps/api/src/templates/from-project.ts` (server-side extraction so sealed values never leave the API), `apps/api/src/routes/templates.ts` (`POST /v1/templates`, `PATCH /v1/templates/:id`, `DELETE`), `apps/api/src/templates/from-project.test.ts`.
- **Done when:** a project with an API and a Postgres becomes a template whose JSON matches a snapshot, deploying that template into a new project produces an equivalent canvas, and a sealed variable cannot be classified as Fixed.

### 4.8 Export and import
- **What:** Export: "Export JSON" downloads `<slug>.template.json` (pretty-printed, 2-space) and "Copy JSON" copies it. Import: Templates page overflow → "Import template" opens a dialog with a drop zone, file picker and a paste area; the JSON is validated client-side with the shared Zod schema, errors listed with their path ("services[1].volume.mountPath must start with /"), then a slug-conflict check ("A template named 'umami' already exists in this workspace. Import as 'umami-2'?"), then Import creates a workspace-private template. Drag-and-drop of a `.template.json` file onto the gallery also opens the dialog (C8.7 pattern).
- **Files:** `apps/web/components/templates/ImportTemplateDialog.tsx`, `apps/web/components/templates/ExportMenu.tsx`, `apps/web/lib/templates/download.ts`, `apps/api/src/routes/templates.ts` (`POST /v1/templates/import`), `e2e/templates/import-export.spec.ts`.
- **Done when:** exporting a built-in and importing it into a workspace round-trips byte-for-byte except for `slug`, `version`, `usedBy` and timestamps.

### 4.9 Icon registry
- **What:** A single registry that maps icon ids to SVG components for frameworks and apps used by services, nodes, templates and the create wizard: `nodejs`, `python`, `go`, `rust`, `ruby`, `php`, `java`, `dotnet`, `deno`, `bun`, `static`, plus engine glyphs from Phase 9 and generic app glyphs. Source: Simple Icons (CC0 1.0; verify at build time and record) for language marks that are not trademark-restricted in that set's usage guidance, and Lucide for everything else; the registry exposes `getIcon(id): React.FC` and a fallback (`Box` from Lucide). Every icon is rendered monochrome in `currentColor` so it fits both themes.
- **Files:** `packages/ui/src/icons/registry.ts`, `packages/ui/src/icons/app-icons/*.tsx`, `packages/ui/src/icons/registry.test.ts`, `docs/DECISIONS.md` (icon set, license, trademark note).
- **Done when:** every icon id referenced by a built-in template resolves, the gallery route at `/dev/components#icons` shows them all in both themes, and no icon renders in a vendor color.

### 4.10 The 21 built-in templates
- **What:** Write each JSON per the table. Every image is pinned by tag and digest; every service has a healthcheck; every web app has `domain.generate: true`; every database has a volume at its data path and generated credentials; required inputs are only what cannot be generated (an admin email, a site URL that must equal the generated domain is filled from `${{ self.LUMEN_PUBLIC_DOMAIN }}` rather than asked).

| Slug | Category | Services | Volumes | Required inputs | License (verify at build time) |
|---|---|---|---|---|---|
| `postgres` | Databases | postgres (`postgres:16-alpine`) | `/var/lib/postgresql/data` | none | PostgreSQL License |
| `mysql` | Databases | mysql (`mysql:8.4`) | `/var/lib/mysql` | none | GPL-2.0 (Community) |
| `redis` | Databases | redis (`redis:7.4-alpine`; evaluate `valkey/valkey:8` as the default) | `/data` | none | RSALv2 / SSPL (Redis) or BSD-3 (Valkey) |
| `mongodb` | Databases | mongo (`mongo:8.0`) | `/data/db` | none | SSPL-1.0 |
| `minio` | Storage | minio (`minio/minio:RELEASE.<pinned>`), API on 9000 with a TCP proxy option and console on 9001 behind a second generated domain | `/data` | none (root user and password generated) | AGPL-3.0; confirm console availability in the pinned release |
| `n8n` | Automation | n8n (`n8nio/n8n:<pinned>`), postgres | n8n `/home/node/.n8n`, postgres data | none (`N8N_ENCRYPTION_KEY` generated, `WEBHOOK_URL` from the public domain) | Sustainable Use License; self-hosting for internal use permitted, confirm terms |
| `uptime-kuma` | Monitoring | uptime-kuma (`louislam/uptime-kuma:1`) | `/app/data` | none | MIT |
| `umami` | Analytics | umami (`ghcr.io/umami-software/umami:postgresql-latest` pinned), postgres | postgres data | none (`APP_SECRET` generated) | MIT |
| `plausible` | Analytics | plausible (`ghcr.io/plausible/community-edition:<pinned>`), postgres, clickhouse (`clickhouse/clickhouse-server:<pinned>`) | postgres data, clickhouse `/var/lib/clickhouse` | none (`SECRET_KEY_BASE` generated, `BASE_URL` from the domain) | AGPL-3.0 (Community Edition) |
| `ghost` | CMS | ghost (`ghost:5-alpine`), mysql | ghost `/var/lib/ghost/content`, mysql data | none (`url` from the domain) | MIT |
| `wordpress` | CMS | wordpress (`wordpress:6-php8.3-apache`), mysql | wordpress `/var/www/html`, mysql data | none | GPL-2.0-or-later |
| `directus` | CMS | directus (`directus/directus:<pinned>`), postgres | directus `/directus/uploads`, postgres data | `ADMIN_EMAIL` (required) | BSL 1.1 (free below the revenue threshold); confirm terms |
| `strapi` | CMS | strapi (repo starter built with Railpack; Node 20), postgres | strapi `/app/public/uploads`, postgres data | none (`APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `JWT_SECRET`, `TRANSFER_TOKEN_SALT` generated) | MIT |
| `meilisearch` | Dev tools | meilisearch (`getmeili/meilisearch:v1.<pinned>`) | `/meili_data` | none (`MEILI_MASTER_KEY` generated) | MIT |
| `metabase` | Analytics | metabase (`metabase/metabase:<pinned>`), postgres (app database) | postgres data | none | AGPL-3.0 (OSS) |
| `grafana-prometheus` | Monitoring | grafana (`grafana/grafana-oss:<pinned>`), prometheus (`prom/prometheus:<pinned>`) with a fixed scrape config for itself | grafana `/var/lib/grafana`, prometheus `/prometheus` | none (admin password generated) | AGPL-3.0 (Grafana), Apache-2.0 (Prometheus) |
| `nextjs-starter` | Starters | web (repo `<org>/nextjs-starter`) | none | none | MIT (starter repo) |
| `express-starter` | Starters | api (repo `<org>/express-starter`), postgres | postgres data | none | MIT |
| `fastapi-starter` | Starters | api (repo `<org>/fastapi-starter`), postgres | postgres data | none | MIT |
| `django-starter` | Starters | web (repo `<org>/django-starter`, pre-deploy `python manage.py migrate`), postgres | web `/app/media`, postgres data | none (`SECRET_KEY` generated) | MIT (starter), BSD-3 (Django) |
| `laravel-starter` | Starters | web (repo `<org>/laravel-starter`, pre-deploy `php artisan migrate --force`), mysql, redis | mysql data, redis data | none (`APP_KEY` generated as `base64:${{ secret(32) }}`) | MIT |

- **Files:** `packages/templates/templates/{postgres,mysql,redis,mongodb,minio,n8n,uptime-kuma,umami,plausible,ghost,wordpress,directus,strapi,meilisearch,metabase,grafana-prometheus,nextjs-starter,express-starter,fastapi-starter,django-starter,laravel-starter}.json`, the five starter repos (separate GitHub repositories, each with `lumen.toml`, `/health`, README, MIT license, and a CI that builds on push), `docs/DECISIONS.md` (one license entry per third-party app with the URL checked and the date), `docs/user/templates/<slug>.md` (one page per template: what it is, what gets created, first-login steps, where data lives).
- **Done when:** each JSON validates, each image digest is pinned, each license entry exists, and each template passes its deploy test (§4.12).

### 4.11 Parallel session split
- **What:** Run four sessions in parallel with the same instructions and no shared files: Session A — Databases + Storage (`postgres`, `mysql`, `redis`, `mongodb`, `minio`) and the Phase 9 catalog alignment; Session B — Automation + Monitoring + Dev tools (`n8n`, `uptime-kuma`, `grafana-prometheus`, `meilisearch`, `metabase`); Session C — CMS + Analytics (`ghost`, `wordpress`, `directus`, `strapi`, `umami`, `plausible`); Session D — Starters (`nextjs-starter`, `express-starter`, `fastapi-starter`, `django-starter`, `laravel-starter`) including the five repositories. Each session owns only its JSON files, its docs pages and its deploy test cases, and appends to DECISIONS.md under its own heading to avoid merge conflicts.
- **Files:** `docs/phases/PHASE-13-templates.md` (this section is the split), `docs/PROGRESS.md` (a row per session with status).
- **Done when:** all four sessions report green deploy tests and the merged branch passes the full template suite.

### 4.12 Per-template deploy test
- **What:** A Playwright suite parameterized over every built-in slug: deploy to a new project on the test VM, wait for every service to reach Active within the template's `expectedReadyS` (default 300s; Plausible and Metabase get 600s), fetch the generated domain over HTTPS and assert the app's known readiness marker (a status code, a title string or a JSON body from a probe path declared per template in `e2e/templates/probes.ts`), then delete the project and assert the containers and volumes are gone. Run nightly and on any change under `packages/templates`.
- **Files:** `e2e/templates/deploy-all.spec.ts`, `e2e/templates/probes.ts`, `.github/workflows/templates-nightly.yml`.
- **Done when:** the suite passes for all 21 templates on an amd64 VM and an arm64 VM (templates whose images lack arm64 builds are marked `arch: ["amd64"]` in the JSON, shown in the gallery as "amd64 only", and skipped on arm64).

### 4.13 "Used by N", counts and audit
- **What:** `used_count` increments inside the deploy transaction; the gallery shows "Used by N" for N ≥ 1; the detail shows the same; instance admins see a per-template list of projects created from it (Instance admin → Templates, a small table). Every template mutation (publish, edit, unpublish, delete, import) writes an audit row.
- **Files:** `apps/api/src/templates/deploy.ts`, `apps/web/app/(app)/admin/templates/page.tsx`, `apps/api/src/routes/admin/templates.ts`.
- **Done when:** deploying twice shows "Used by 2" and the audit log lists both deploys.

### 4.14 Screenshots, accessibility, license audit, review fixes
- **What:** Screenshot matrix for the gallery (all, filtered, searched, empty search, workspace templates present), detail (short, long, six services, zero inputs), deploy form (each step, validation, capacity warning), create wizard (each step, sealed variable restriction, JSON error), import dialog (valid, invalid, conflict), at 390/1024/1440 × dark/light; axe; C14 self-critique; the license audit table finalized in DECISIONS.md; Part H1 review by Fable 5.1 on the resolver and from-project extraction; Part H2 on screenshots.
- **Files:** `e2e/visual/templates.spec.ts`, `e2e/a11y/templates.spec.ts`, `docs/UI_DECISIONS.md`, `docs/DECISIONS.md`.
- **Done when:** every finding is fixed or tracked and every screenshot is linked.

## 5. Detail checklist

### Typography
- Gallery page title "Templates" page title (24/600); result count meta 13/400 text-secondary ("21 templates"); category rail items label 13/500 with counts in caption 12/400 tabular text-muted; selected category text in `text` with a 2px `accent` left bar.
- Template card: name card title (14/500), description body 13/400 text-secondary clamped to two lines with a title attribute for the full text, service count chip 12/500, "Used by 12" caption 12/400 text-muted with tabular numerals, `Workspace` badge 11/600 uppercase 0.04em.
- Detail: name page title (24/600) with the version "v3" in meta beside it; category chip 12/500; description markdown at body 14/400 line-height 1.5 with headings capped at 16/600 and code spans 13/400 mono; "Required inputs" and "What gets created" section titles 16/600; list items body 14/400 with keys in 13/400 mono; the Definition code block 12/400 mono.
- Mini-diagram node: name 12/500, kind caption 11/400 text-muted, all tabular.
- Deploy form: stepper labels 13/500 (active in `text`, others text-secondary); field labels 13/500; helper caption 12/400; the "auto" chip 11/600 uppercase 0.04em in `accent` on `accent-subtle`; generated values 13/400 mono in a read-only input; review list body 14/400; capacity sentence body 14/400 with numbers tabular and the warning variant in `warning`.
- Create wizard: variable table cells 13/400 with keys in mono, classification segmented control button sm 13/500, description inputs 14/400; JSON preview 12/400 mono with line numbers 11/400 text-muted; error rows 13/400 danger with the JSON path in mono.
- Import dialog: drop zone title 14/500, hint caption 12/400, error list 13/400 danger with mono paths.
- Every numeral that can change width (counts, versions, memory) uses tabular numerals.

### Spacing & layout
- Gallery: max-width 1200px centered (C6); header row 64px with the title left and search (320px) plus sort (160px) right; below it the category rail 200px wide with 8px item padding and 32px rows, then a 24px gap, then the grid with 16px gaps; cards 16px padding, radius 10, min-height 128px so a grid of cards aligns; icon 24px top-left with the name 12px to its right; the description 8px below; the footer row (service count, used-by) pinned at the card bottom with 12px top margin.
- Category chip row (<1024): 40px tall, 8px gaps, horizontal scroll with fade edges, chips 28px tall with 12px horizontal padding.
- Detail: max-width 960px; header 96px with the 32px icon, title block and the Deploy button right-aligned; two-column body at ≥1024 (content 600px, sidebar 320px holding Required inputs and What gets created) and stacked below; the mini-diagram is 100% wide, 200px tall, inside a `surface` card with 16px padding; section gaps 32px.
- Deploy dialog: 640px wide at ≥1024, 24px padding, stepper 48px tall, step content min-height 320px so the dialog does not jump between steps, footer 64px with Back (ghost) left and Continue/Deploy (primary) right; field rows 16px apart; radio cards 12px padding in a 2-column grid with 12px gaps.
- Create wizard: full-page route (not a modal) with max-width 960px; stepper across the top at 48px; the variables table has columns Variable 240 · Value 240 · Classification 280 · Description flexible; row height 44px; the JSON preview and diagram sit side by side at ≥1280 (60/40) and stacked below.
- Import dialog: 560px wide; drop zone 160px tall with a 2px dashed `border` (turns `accent` on drag-over), 24px padding; paste area 120px tall below with an "or paste JSON" divider (12px caption).
- All spacing on the 4px grid; radii 6 (inputs, chips), 10 (cards, nodes), 14 (dialogs), full (badges).

### Color & theme
- Cards: `surface`, 1px `border`; hover `surface-hover` with `border-strong`; focus ring 2px `accent` 2px offset; the icon is monochrome `text` at 90% so the grid stays calm; the only accent element on the gallery page is the primary "Create template" button in the header (and the selected category bar, which is a thin indicator, not a filled element).
- `Workspace` badge: `info` text on 12% `info` tint; "amd64 only" badge: `warning` text on 12% tint.
- Detail: the Deploy button is the single accent element; license and docs links in `accent` on hover only (default `text-secondary` underline).
- Mini-diagram: nodes `surface-raised` with `border`, edges dashed 1px `border-strong`, volume glyph `text-secondary`; no status colors (templates have no status).
- Deploy form: "auto" chip `accent` on `accent-subtle`; required empty fields get a `warning` left bar (2px) until filled, then normal; capacity warning uses the inline alert warn variant; the Deploy button is the only filled accent element.
- Create wizard: classification segmented control selected segment `accent-subtle` with `text`; sealed rows show a `Lock` glyph in `text-muted` and the Fixed option disabled with a tooltip; JSON errors `danger` text with the offending line highlighted at 8% `danger`.
- Import drop zone: dashed `border`, on drag-over `accent` dashed with `accent-subtle` fill.
- Both themes verified for ≥ 4.5:1; the "auto" chip contrast on `accent-subtle` verified in light theme (use the darker light accent `#0D9488`).

### Motion
- Card hover: background and border transition 120ms ease-out; no lift or scale on the gallery (a grid of 21 lifting cards is noisy); the focus ring appears instantly.
- Category change: the grid re-filters with a 120ms opacity cross-fade; cards do not animate position (layout animation across 21 cards costs more than it communicates).
- Search: results update after the 150ms debounce with the same cross-fade; the empty-search state fades in over 120ms.
- Detail: the mini-diagram nodes fade in staggered by 40ms each (max 6) over 200ms once, respecting reduced motion.
- Deploy dialog: opens with the standard 200ms `cubic-bezier(.2,.8,.2,1)` scale-from-0.98 and fade; steps slide 16px horizontally with a 200ms cross-fade; the "auto" chip on a generated field pulses once (scale 1 → 1.06 → 1, 200ms) when the step opens to draw the eye to what was pre-filled, then never again; the "Customize" unlock transitions the input from read-only to editable with a 120ms border color change.
- Submit: the Deploy button enters the loading state; on success the dialog closes over 120ms while the canvas route loads; the new nodes appear on the canvas with the Phase 5 node-enter spring.
- Create wizard: classification changes swap the description input in or out with a 120ms height transition; the JSON preview re-renders without animation; validation errors slide in 4px over 120ms.
- Import: drag-over border color 120ms; validation error list fades in 120ms.
- All of the above collapse to instant changes under `prefers-reduced-motion`.

### Iconography & symbols
- Rail entry: `LayoutTemplate` 20px (Templates) in the left rail.
- Category rail icons 16px: `LayoutGrid` (All), `Database` (Databases), `Rocket` (Starters), `Sparkles` (AI), `PenLine` (CMS), `ChartColumn` (Analytics), `Workflow` (Automation), `Archive` (Storage), `Activity` (Monitoring), `Wrench` (Dev tools).
- Card: the template's registry icon at 24px; service count chip uses `Boxes` 12px; "Used by" uses `Users` 12px; `Workspace` badge no icon.
- Detail: `ExternalLink` 14px on docs and license links; `Download` 14px Export JSON; `Copy` 14px Copy JSON; `Pencil` / `EyeOff` / `Trash2` 14px in the workspace-template menu; the diagram's volume glyph `HardDrive` 12px; required input rows use `Asterisk` 12px in `warning` before the key and `KeyRound` 12px for secret inputs.
- Deploy form: stepper uses numbered 24px circles (11/600) with `Check` 14px on completed steps; radio cards `FolderPlus` (New project) and `FolderInput` (Add to current) 20px; server select `Server` 16px; generated field lock `Sparkles` 12px inside the "auto" chip; "Customize" `Pencil` 12px; review list uses the registry icons at 16px and `HardDrive` / `Globe` 14px for volumes and domains.
- Create wizard: service checklist uses registry icons 20px; classification icons `Asterisk` (Required), `Sparkles` (Generated), `Pin` (Fixed), `EyeOff` (Exclude) at 14px in the segmented control; sealed rows `Lock` 14px; icon picker grid shows 24px glyphs with a search `Search` 16px; publish radios `Users` (workspace) and `Globe` (instance) 20px.
- Import: `FileJson` 24px in the drop zone; `CircleAlert` 14px `danger` on error rows; `TriangleAlert` 14px `warning` on the conflict notice.
- No third-party logos are used as brand marks; app icons in the registry are monochrome glyphs and the registry documents which are from Simple Icons and which are Lucide substitutes.

### Copy
- Gallery: title "Templates"; search placeholder "Search templates"; sort options "Popular", "Name", "Newest"; result count "21 templates" / "3 templates match 'analytics'"; empty search "No templates match 'xyz'. Try another word or browse a category."; empty category (AI) "No AI templates yet. Publish one from a project and it appears here."; header primary "Create template" (opens the project picker then the wizard); card footer "3 services" · "Used by 12".
- Detail: primary "Deploy"; menu "Export JSON", "Copy JSON", "Edit", "Unpublish", "Delete"; sections "Required inputs" (empty: "Nothing to fill in. Everything is generated for you."), "What gets created" with rows like "Postgres · postgres:16 · volume at /var/lib/postgresql/data" and "API · from GitHub org/express-starter · public URL"; "Definition" toggle "Show definition" / "Hide definition"; license line "License: MIT" as a link; "amd64 only" badge tooltip "This app's image isn't built for ARM servers yet."
- Deploy form: title "Deploy n8n"; step names "Where", "Values", "Review"; radio "New project" (name field placeholder "n8n") / "Add to current project" ("Adds 2 services to 'Shop' · production"); server select label "Server" with "Auto (oracle-1)"; values step intro "We generated the secrets. Fill in the rest."; required field error "This value is required"; "auto" chip tooltip "Generated for you. Click Customize to set your own."; "Show all variables" toggle; review intro "Here's what we'll create:"; capacity "Uses about 1.5 GB of oracle-1's 18 GB free" / warning "This needs about 3 GB but oracle-1 has 1.2 GB free. Pick another server or resize."; primary "Deploy template"; success: no toast (the canvas opening with deploying nodes is the feedback).
- Create wizard: title "Create a template from 'Shop'"; steps "Services", "Variables", "Details", "Preview", "Publish"; services step helper "Databases bring their volumes along."; variables helper "Decide what users fill in, what we generate, and what stays fixed."; classification labels "Required", "Generated", "Fixed", "Exclude"; sealed tooltip "Sealed values can't be copied into a template. Make it required or generated."; details fields "Name", "Slug", "Category", "Icon", "Description" (helper "One sentence, up to 140 characters"), "About this template" (markdown), "License" (helper "Required when the template uses third-party images"); preview title "Definition"; error line "services[1].volume.mountPath must start with /"; publish radios "Private to this workspace" / "Everyone on this instance" (helper "Only instance admins can publish here"); primary "Publish template"; success toast "Template published" with the action "View".
- Import: title "Import a template"; drop zone "Drop a .template.json file here" caption "or choose a file"; paste label "or paste JSON"; errors title "We found 2 problems:"; conflict "A template named 'umami' already exists in this workspace. Import as 'umami-2'?" with "Import as 'umami-2'" and "Cancel"; primary "Import"; success toast "Template imported" with "View".
- Error cards: `TEMPLATE_INPUT_MISSING` title "Fill in the required values" explanation "This template needs 1 value before it can deploy." fix "Show values"; `VARIABLE_REF_CYCLE` per J6 "Variables reference each other in a loop" with the cycle listed as chips; `SERVER_CAPACITY` per J6.
- Voice per C9: second person, calm, buttons are verbs, numbers human-formatted, no exclamation marks.

### States (empty · loading · error · success · partial)
- Gallery: loading = 9 skeleton cards matching the card geometry (icon square, two text bars, footer bar); empty search / empty category per copy; error = error card with Retry; success = grid; partial = when the workspace's own templates fail to load but built-ins succeed, a dismissible inline alert "We couldn't load your workspace templates" above the grid.
- Detail: loading skeleton (header bar, diagram block, two list blocks); not found → the C7.26 404 card; success.
- Deploy form: each step's validation; submitting = loading button and the dialog locked; server error = the catalog error card inside the dialog above the footer with the fix action; partial = if the transaction commits but one deploy fails to enqueue, the canvas opens and the failed node shows its error card (never a half-created project without navigation).
- Create wizard: no services selected → Continue disabled with the hint "Pick at least one service"; variables step with zero variables shows "No variables to classify."; JSON invalid → Publish disabled with errors; publish in-flight; success.
- Import: idle, drag-over, validating (spinner 400ms minimum to avoid flicker), invalid (error list), conflict, importing, success.
- Admin templates table: empty "No templates have been deployed yet."

### Keyboard & accessibility
- Gallery: `/` focuses search (C11); the category rail is a `radiogroup`-style `listbox` navigable with Up/Down; cards are links reachable with Tab in DOM order (row-major) and Enter opens; `Escape` in the search clears it.
- Detail: the Deploy button is the first focusable element after the header; the definition block's copy button has `aria-label` "Copy definition JSON".
- Mini-diagram: an `img` role with an `aria-label` sentence ("3 services: n8n, connected to Postgres; n8n has a volume") generated from the definition (C11 chart summary rule applied to diagrams).
- Deploy dialog: focus trapped; `Escape` closes with a confirm only if values were edited; stepper steps are `tablist`-like but not focusable (navigation is by the footer buttons); required fields use `aria-required`, errors `aria-invalid` + `aria-errormessage`; the "auto" chip is `aria-describedby` for its field; `Enter` in the last field triggers Continue.
- Create wizard: the variables table is a `grid` with roving tabindex; the classification control is a `radiogroup` per row navigable with Left/Right; the icon picker is a `listbox` with type-ahead; the JSON preview is a read-only `textarea`-backed editor with `aria-label` "Template definition"; error rows are links that focus the editor at the line.
- Import: the drop zone is a button ("Choose a file") with the drag behavior as an enhancement; paste area labelled.
- Focus rings 2px `accent` 2px offset everywhere; status is never color-only (badges have text); axe clean on every state; keyboard pass recorded.

### Responsive
- ≥1280: 3-column card grid; detail two-column; deploy dialog 640px; create wizard preview side by side.
- 1024–1279: 2-column grid with the category rail; detail two-column at 560/320.
- 768–1023: 2-column grid, category chips row; detail stacked; deploy dialog 560px; create wizard preview stacked; variables table hides the Description column into an expandable row.
- <768: 1-column cards (full width, 112px min-height); search full width with the sort in an overflow menu; detail stacked with the Deploy button sticky at the bottom above the tab bar; deploy form as a full-screen sheet with the footer fixed; create wizard steps as full-screen sheets with the variables table rendered as cards (key, value, classification control stacked); import as a sheet with the file picker button prominent (drag-and-drop is unavailable on most phones).
- Add-flow inline gallery: at ≥1024 it renders inside the Add modal at 800px wide with the category chips row (no rail); below it becomes the same sheet as the Templates route.
- No hover-only affordances: card menus and copy buttons are visible on touch.

### Performance
- The gallery list payload carries card fields only (no definitions); 21 built-ins plus workspace templates stay under 20 KB.
- Search and category filtering happen client-side over the loaded list; the URL state is applied on load without a second fetch.
- Template detail fetches the definition once and renders the diagram from it; the diagram uses plain SVG (no React Flow instance) to keep the route under 40 KB of added JS.
- The deploy transaction completes in under 500ms for a 3-service template (measured in the integration test); deploy enqueueing happens after commit so a slow agent never holds the transaction.
- The create wizard extracts variables server-side in one query per environment; the JSON preview validates on a 200ms debounce.
- Route transitions keep the < 150ms perceived budget (B14) with prefetch on card hover/focus and skeletons matching the final layout.

### Security
- Template definitions are data: the resolver never executes strings; expressions are evaluated by the shared tokenizer with an allowlist of functions; unknown functions fail validation.
- Repo sources in templates are cloned only through the Phase 6 GitHub integration or as public repos; a template cannot reference a private registry credential it does not own (credential ids are scoped to the deploying workspace and validated at deploy time).
- Sealed variable values never leave the API during create-from-project; the extraction runs server-side and returns only keys and classifications.
- Publishing instance-wide requires `is_instance_admin`; workspace publishing requires member; deploying requires member (D11 create services); viewers can browse.
- Imported JSON is size-limited (256 KB), parsed with a safe JSON parser, validated with Zod, and slugs are normalized to `[a-z0-9-]`.
- Generated secrets use the platform CSPRNG (`crypto.randomBytes`) with the requested alphabet; generated values are encrypted at rest like any variable.
- Every mutation writes an audit row (publish, edit, unpublish, delete, import, deploy).
- The license audit is part of the definition of done: a template without a verified license entry does not ship.

### Data integrity & idempotency
- `POST /v1/templates/:slug/deploy` accepts an `Idempotency-Key` header; a retry with the same key returns the original result instead of creating a second project.
- Everything a deploy creates lives in one transaction; a failure rolls back completely (no orphan project or volume rows).
- Deploy enqueueing after commit is idempotent per `(service_instance_id, trigger=template, template_deployment_id)`.
- Built-in seeding is an upsert keyed by slug and version; user edits to built-ins are impossible (they are cloned into the workspace on "Edit" as a new workspace template, clearly labelled "Copy of Umami").
- `used_count` is incremented in the same transaction and reconciled nightly from `template_deployments`.
- Template `version` increments on every publish; deployed projects keep `template_deployments.version` so support can tell which version a user deployed.
- Export is deterministic (sorted keys, 2-space) so diffs between versions are readable.

## 6. Acceptance criteria
- [ ] Built-in templates (at least): Postgres, MySQL, Redis, MongoDB, MinIO, n8n, Uptime Kuma, Umami, Plausible, Ghost, WordPress, Directus, Strapi, Meilisearch, Metabase, Grafana + Prometheus, Next.js starter, Express starter, FastAPI starter, Django starter, Laravel starter (D9).
- [ ] Template gallery, deploy form, create-from-project, import/export (D9); `docker-compose.yml` import is verified as still working from Phase 10 with the shared transaction.
- [ ] Every third-party app's license and self-hosting terms are verified and recorded in DECISIONS.md before bundling (D9).
- [ ] Each template is tested by deploying it (Part F Phase 13): the parameterized suite passes for all 21 on amd64, and every arm64-capable template passes on arm64.
- [ ] The J4 example validates unchanged against the Zod schema.
- [ ] Generators evaluate once per deploy; `self.` and cross-service references resolve; a reference cycle is rejected naming the cycle; a missing required input is rejected with `TEMPLATE_INPUT_MISSING`.
- [ ] Deploying a template into a new project opens the canvas with all nodes present and the inspector on the first web service's Deployments tab (C7.5).
- [ ] A sealed variable cannot be exported as a fixed value.
- [ ] Export → import round-trips a definition except for scope fields.
- [ ] "Used by N" is accurate after two deploys and a nightly reconcile.
- [ ] Every page and state passes axe and the C14 checklist; screenshots reviewed at 390/1024/1440 × dark/light.
- [ ] The deploy transaction for a 3-service template completes in under 500ms in the integration test.

## 7. Test plan
- **Unit:** Zod schema (valid J4 example, every invalid case with paths); expression tokenizer and evaluator (each generator, `self.`, cross-service, `input.`, unknown function, unterminated expression); dependency ordering (chain, diamond, cycle); slug normalization; export determinism; capacity estimate.
- **Integration:** seed idempotency; deploy transaction (rollback on failure, idempotency key, RBAC per role, audit rows, `used_count`); from-project extraction (sealed handling, reference preservation); import (size limit, invalid JSON, conflict); admin list.
- **E2E (Playwright):** browse, search, filter, sort with URL round-trip; open detail; deploy Umami to a new project and Redis into an existing project; required-value validation; capacity warning; create a template from a project and deploy it; edit and republish (version bump); export and import; drag-and-drop import; the parameterized deploy-all suite (§4.12) nightly.
- **Visual regression:** all states in §5 at 390/1024/1440 × dark/light.
- **Accessibility (axe + keyboard pass):** axe on gallery, detail, deploy form, create wizard, import; keyboard pass for the category rail, the variables grid, the icon picker, and dialog focus traps.
- **Manual / on a real VM:** deploy n8n and complete its first-login flow on the generated HTTPS domain; deploy WordPress and publish a post; deploy the Laravel starter and confirm the pre-deploy migration ran; on an Oracle ARM VM run the arm64 subset.

## 8. Evidence required to close
- `pnpm test` output for `packages/shared/src/templates` and `packages/templates` green.
- The deploy-all suite report for amd64 and arm64 with per-template durations.
- Screenshots (390/1024/1440 × dark/light) for the gallery (all, filtered, searched, empty search, empty AI category, workspace templates present, mobile), detail (short, long, six services, zero inputs, amd64-only badge), deploy form (each step, validation, capacity warning, server error), create wizard (each step, sealed restriction, JSON error, mobile cards), import dialog (idle, drag-over, invalid, conflict) — linked from `docs/UI_DECISIONS.md`.
- The license audit table in DECISIONS.md with a URL and check date per third-party app.
- The five starter repositories' URLs with green CI badges and their `lumen.toml` files.
- The integration test timing for the deploy transaction.
- A screenshot of n8n's first-login page served over the generated HTTPS domain.

## 9. Review
- Part H1 (code review) with Fable 5.1 on `packages/shared/src/templates/**`, `apps/api/src/templates/**`: probe expression evaluation safety (no `eval`, allowlisted functions), generator single-evaluation, transaction boundaries and the post-commit enqueue, idempotency key handling, RBAC on publish scopes, sealed-variable leakage in from-project, import size and parse limits, credential scoping for private registries.
- Part H2 (UI review) with Fable 5.1 on the screenshot matrix: probe whether a beginner knows the gallery's next click (the cards must read as buttons), whether "auto" communicates "you don't need to touch this", whether the review step's capacity sentence prevents a failed deploy, whether the create wizard's classification labels are understandable without the tooltip, calmness (one accent element per view), and originality (no layout or copy that reads as another product's marketplace).
- Part H4 carry-forward: template definitions grow (long markdown, many services); the diagram and preview must stay performant at 12 services.

## 10. Risks & open questions
- **Risk:** Third-party license or self-hosting terms block a template (n8n's Sustainable Use License, Directus BSL, Redis RSALv2/SSPL, MinIO's console changes) → **Mitigation:** verify each at build time, record the finding, and swap (Valkey for Redis) or drop with a note in PROGRESS.md; the D9 list is a floor for count, not a mandate for a specific app if its terms fail.
- **Risk:** Images without arm64 builds fail on Oracle ARM VMs → **Mitigation:** `arch` in the schema, the "amd64 only" badge, and the deploy-all suite on both architectures.
- **Risk:** Apps that need their public URL at boot (Ghost `url`, n8n `WEBHOOK_URL`, Plausible `BASE_URL`) race the generated domain → **Mitigation:** the resolver creates the domain before variables are finalized and exposes `self.LUMEN_PUBLIC_DOMAIN` from the persisted domain, verified in the deploy test.
- **Risk:** Long-running first boots (Plausible with ClickHouse, Metabase) trip healthcheck timeouts → **Mitigation:** per-service `healthcheckTimeoutS` in the template and `expectedReadyS` in the test.
- **Risk:** The five starter repos add maintenance surface → **Mitigation:** minimal code, pinned Node/Python/PHP versions, a monthly dependency bump workflow, and each repo's CI deploys to a staging instance.
- **Risk:** Parallel sessions diverge in JSON style → **Mitigation:** a shared `packages/templates/CONTRIBUTING.md` with the field order and a formatter script run in CI.
- **Open question:** Should the Redis template default to Valkey? Default: evaluate license and compatibility in Session A; if Valkey passes the deploy test and the Phase 9 engine catalog supports it, make it the default and keep `redis` as the slug with a description note.
- **Open question:** Which GitHub organization hosts the starter repos? Default: the product organization named in Phase 11's instance settings; until it exists, a placeholder organization owned by the user, recorded in DECISIONS.md.
- **Open question:** Is "Create template" on the gallery header (needs a project picker) or only from inside a project? Default: both, with the header button opening a project picker first.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps, including the per-session template rows and any dropped or swapped app)
- [ ] `docs/DECISIONS.md` entries added: schema extensions beyond J4, expression grammar sharing with Phase 4, icon set and license, the license audit table, Valkey decision, starter repo organization, arch handling, diagram rendering approach
- [ ] `docs/UI_DECISIONS.md` updated with the screenshot matrix and keyboard pass notes
- [ ] Cross-model review done (H1 on schema/resolver/from-project, H2 on screenshots) and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 13 — Templates</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-13-templates.md,
and these SPEC sections: B6 (templates), B7 (generators, references), B8, B9 (generated domains),
C4, C5 (Stepper wizard, Combobox, Key-value editor, Code block), C7.4, C7.5 (Template option),
C7.19, C8.1, C9, C10, C11, C12, D9, J1 (templates), J4, J7.
If this is one of the parallel template-authoring sessions (A–D in §4.11), read only §4.10–§4.12
and own only the JSON files, docs pages and test cases assigned to that session.
</context>
<goal>A user deploys any of the 21 built-in templates from the gallery with at most a couple of
inputs and watches the whole project go live, and can publish their own project as a template
that others in the workspace deploy the same way.</goal>
<scope>
- J4 schema as Zod with the D9 extensions, schemaVersion, generated JSON Schema
- Built-in registry (packages/templates), build-time validation, digest pinning, idempotent seeding
- Resolver + deploy engine: generators once per deploy, self./cross-service/input. references,
  dependency ordering, one transaction, post-commit enqueue, Idempotency-Key, TEMPLATE_INPUT_MISSING
- Gallery (search, categories, sort, cards, URL state) and the inline Add-flow variant
- Template detail (mini-diagram, required inputs, what gets created, definition block)
- Deploy form (Where / Values with "auto" chips / Review with capacity)
- Create-from-project wizard (services, variable classification incl. sealed rules, details, preview, publish scope)
- Export/import JSON with path-level errors, conflict handling, drag-and-drop
- Icon registry (Simple Icons CC0 + Lucide, monochrome), "Used by N", admin templates table, audit rows
- All 21 templates with pinned images, healthchecks, volumes, generated secrets, license audit,
  the five starter repos, per-template docs, and the parameterized deploy-all test on amd64 + arm64
</scope>
<out_of_scope>
- docker-compose.yml import (Phase 10), MCP deploy_template and lumen template deploy (Phase 14),
  HA Postgres template (Phase 17), cross-instance marketplace, ratings, an AI built-in template
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-13-templates.md §6, including: all 21 templates deploy in the
parameterized suite; licenses verified and recorded before bundling; the J4 example validates
unchanged; cycle and missing-input errors; canvas opens with nodes and the inspector after deploy;
sealed variables never exported as fixed; export/import round-trip; axe-clean screenshots at
390/1024/1440 × dark/light.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, schema extensions, the expression module sharing with
   Phase 4, the parallel session split, risks (licenses, arm64, boot-time URLs), test plan,
   open questions (Valkey, starter org). STOP and wait for approval.
2. Implement in small steps in the §4 order; run code and tests after each step; deploy each
   template for real before marking it done.
3. For UI: screenshots at 390/1024/1440 × dark/light × the states in §5; critique against
   SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec (any dropped or
   swapped app and why), next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
