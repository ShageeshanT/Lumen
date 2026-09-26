# Phase 06 — GitHub integration

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 → reviewed by Fable 5.1 (webhook verification, token handling, account linking) |
| **Depends on** | Phase 5 (app shell, Add flow, deployments tab, settings Source section) |
| **Unblocks** | Phase 10 (PR preview environments, `.env.example` suggestions, `lumen.toml` reads from the repo) |
| **Spec sections** | SPEC B6 (github_app, github_installations, deployments.trigger), B8 (builder priority), C7.5 option 1, C7.8 (commit metadata, deploy specific commit), C7.12 Source, C7.2 (Continue with GitHub), D2 (push-to-deploy, watch paths, wait for CI, monorepo), J1 integrations, J6 `GITHUB_ACCESS_REVOKED` |
| **Estimated sessions** | 5 focused sessions: (1) App manifest + installations, (2) repo/branch pickers + Add flow wiring, (3) webhooks + push-to-deploy + watch paths, (4) wait for CI + deploy specific commit + revoked access, (5) Continue-with-GitHub login + e2e |

## 1. Goal
A user connects GitHub once from the setup wizard or Instance settings, picks a repository and branch in the Add flow, and from then on every push to that branch deploys automatically, pushes that touch only unwatched paths show as "Skipped", and revoked access shows a card with a "Reconnect GitHub" button.

## 2. Why this phase exists
Push-to-deploy is the loop that makes the product feel alive: commit, look at the canvas, watch the node pulse from Building to Active. Everything in this phase is in service of that loop being trustworthy. Three properties matter more than feature count:

- **Trust in the trigger.** A deploy must happen for exactly the pushes the user expects. That means HMAC-verified webhooks, delivery de-duplication so a GitHub retry never double-deploys, watch paths that skip loudly rather than silently, and wait-for-CI that never deploys a red commit.
- **Trust in the credential.** The GitHub App private key and webhook secret are instance secrets. They are encrypted at rest with the Phase 4 envelope scheme and never leave the API process. Installation tokens are short-lived and cached in memory only.
- **Recoverable failure.** When a user uninstalls the app or removes a repository, nothing crashes. The service shows `GITHUB_ACCESS_REVOKED` with a one-click reconnect, and the last deployment keeps running.

The manifest flow (rather than asking the user to create an OAuth app by hand) exists because the north star is "under 10 minutes without reading docs". One click creates the App with the right permissions and events; the user never sees a permissions checklist.

## 3. Scope
### In scope
- GitHub App creation via the manifest flow, at instance level (one App per Lumen instance), from the setup wizard step 3 and from Instance admin → GitHub App.
- Storage of App credentials (`github_app` singleton) and installations (`github_installations`), installation access tokens cached in memory with expiry.
- Repo picker (search, pagination, framework detection preview) and branch picker in the Add flow option 1 and in Settings → Source.
- Webhook endpoint `POST /v1/webhooks/github` with HMAC-SHA256 verification, delivery-id de-duplication, and handlers for `push`, `pull_request` (recorded for Phase 10), `check_suite`, `installation`, `installation_repositories`.
- Push → deployment with trigger `push` and full commit metadata (sha, message, author, branch).
- Watch paths (glob list per service instance) producing `SKIPPED` deployments.
- Deploy-on-push toggle and wait-for-CI toggle.
- "Deploy specific commit" flow from the inspector.
- Revoked access detection and the `GITHUB_ACCESS_REVOKED` error card with "Reconnect GitHub".
- "Continue with GitHub" login and account linking via the same App's OAuth.
- GitHub API client with conditional requests (ETag) and rate-limit awareness.
- E2E test against a dedicated test repository.
### Out of scope
- PR preview environments lifecycle and the PR comment (Phase 10 consumes the `pull_request` events this phase records).
- Reading `lumen.toml` and `.env.example` from the repository (Phase 10; this phase exposes the `getRepoFile` client method they use).
- The build itself, Railpack detection inside the agent (Phase 3). This phase only does a lightweight, best-effort framework *preview* from the repo file list.
- GitLab, Bitbucket, or generic git URLs (not in SPEC).
- Local upload (`lumen up`, Phase 14).

## 4. Work breakdown

### 4.1 Schema additions and encrypted App credentials
- **What:** Add the `github_app` singleton and `github_installations` tables from SPEC B6, plus `github_webhook_deliveries` (delivery_id unique, event, received_at, processed_at, result) for de-duplication and `github_repo_cache` (installation_id, repo_full_name, default_branch, private, pushed_at, etag). Encrypt `client_secret_enc`, `private_key_enc`, `webhook_secret_enc` with the Phase 4 instance data key.
- **Files:** `packages/db/src/schema/github.ts`, `packages/db/migrations/00NN_github.sql`, `apps/api/src/crypto/instance-secrets.ts`
- **Done when:** migration applies on a fresh database and on the Phase 4 database; a unit test round-trips a fake PEM private key through encrypt/decrypt; `github_webhook_deliveries.delivery_id` has a unique index.

### 4.2 GitHub App manifest flow
- **What:** `POST /v1/github/manifest` returns the manifest JSON and a `state` nonce stored in `instance_settings` for 10 minutes; the web posts the manifest to `https://github.com/settings/apps/new?state=<nonce>` (or the organization URL if the user picks "Create under an organization"). GitHub redirects to `GET /v1/github/manifest/callback?code=&state=`; the API exchanges the code via `POST /app-manifests/{code}/conversions`, stores app_id, slug, client_id, client_secret, private key (PEM), webhook secret, and redirects the browser to the return URL with `?github=connected`.
- **Manifest fields:** `name` ("Lumen on <instance host>"), `url` (instance URL), `hook_attributes.url` (`<instance>/v1/webhooks/github`), `hook_attributes.active: true`, `redirect_url` (`<instance>/v1/github/manifest/callback`), `callback_urls: ["<instance>/v1/auth/github/callback"]`, `setup_url` (`<instance>/settings/instance/github?setup=1`), `setup_on_update: true`, `public: false`, `request_oauth_on_install: false`, `default_permissions: { contents: "read", metadata: "read", pull_requests: "write", checks: "read", emails: "read" }`, `default_events: ["push", "pull_request", "check_suite", "installation", "installation_repositories"]`.
- **Files:** `apps/api/src/routes/github/manifest.ts`, `apps/api/src/github/manifest.ts`, `apps/web/app/(setup)/setup/github/page.tsx`, `apps/web/app/(app)/settings/instance/github/page.tsx`, `apps/web/components/github/create-app-button.tsx`
- **Done when:** clicking "Create GitHub App" on a real instance creates the App, returns, and the page shows "Connected as <app slug>" with the App's settings link; running the flow twice replaces the stored credentials and logs an audit entry `github_app.recreated`.

### 4.3 Installations and installation tokens
- **What:** Handle `installation` (`created`, `deleted`, `suspend`, `unsuspend`, `new_permissions_accepted`) and `installation_repositories` (`added`, `removed`) webhooks. Map an installation to a workspace when the user completes the install from the "Configure GitHub access" link (which carries `?workspace=<id>` in `setup_url` state); until mapped, the installation is stored with `workspace_id = null` and a banner in the workspace offers "Claim this installation". Mint installation access tokens with the App JWT (RS256, 10-minute expiry, `iat` skewed by -60s) and cache them in memory keyed by installation_id until 5 minutes before their 1-hour expiry.
- **Files:** `apps/api/src/github/app-jwt.ts`, `apps/api/src/github/installation-token.ts`, `apps/api/src/github/client.ts` (octokit-free thin fetch client with ETag support), `apps/api/src/routes/github/installations.ts` (`GET /v1/github/installations`)
- **Done when:** a unit test signs a JWT with a test key and verifies the header/claims; a mocked-fetch test proves the token cache returns the same token within its window and refreshes after; `GET /v1/github/installations` returns account_login, account_type, repository_selection, and a `configure_url` of `https://github.com/settings/installations/<id>` (or `/organizations/<org>/settings/installations/<id>`).

### 4.4 Repo picker and branch picker
- **What:** `GET /v1/github/repos?installation=&q=&page=` lists repositories for the workspace's installations (uses `GET /installation/repositories` with `per_page=100`, cached in `github_repo_cache` with ETag; search is local prefix/substring over the cache). `GET /v1/github/repos/:owner/:repo/branches?q=` lists branches (default branch first). `GET /v1/github/repos/:owner/:repo/preview?ref=` fetches the root tree (one `GET /repos/{owner}/{repo}/git/trees/{ref}`), and returns `{ framework, builder, hint }` from a static detection table (see §5 Copy for the hint strings). Web: `RepoPicker` combobox with virtualized list, avatar, name, private lock icon, "pushed 3 h ago" meta; `BranchPicker` combobox; both used by the Add flow option 1 and Settings → Source.
- **Files:** `apps/api/src/routes/github/repos.ts`, `apps/api/src/github/detect-framework.ts`, `apps/web/components/github/repo-picker.tsx`, `apps/web/components/github/branch-picker.tsx`, `apps/web/components/add-flow/option-github.tsx`, `apps/web/app/(app)/p/[project]/[env]/s/[service]/settings/source-section.tsx`
- **Done when:** with 300 repositories across two installations the picker opens in under 150 ms from cache, search filters as you type, a missing repo shows the "Configure GitHub access" row, and choosing a Next.js repo shows "Looks like a Next.js app. We'll build it automatically." under the branch picker.

Framework preview detection table (first matching row wins; paths are relative to `root_dir`):

| Order | File(s) present | Framework key | Builder preview |
|---|---|---|---|
| 1 | `lumen.toml` with `[build] builder = "image"` | image | "This service uses a prebuilt image." (Phase 10 reads the file; until then this row is skipped) |
| 2 | `Dockerfile` | dockerfile | "We found a Dockerfile. We'll use it." |
| 3 | `next.config.js` / `next.config.mjs` / `next.config.ts` | nextjs | "Looks like a Next.js app. We'll build it automatically." |
| 4 | `package.json` with `"bun"` in `packageManager` or `bun.lockb` / `bun.lock` | bun | "Looks like a Bun app. We'll build it automatically." |
| 5 | `deno.json` / `deno.jsonc` | deno | "Looks like a Deno app. We'll build it automatically." |
| 6 | `package.json` | node | "Looks like a Node app. We'll build it automatically." |
| 7 | `pyproject.toml` / `requirements.txt` / `Pipfile` | python | "Looks like a Python app. We'll build it automatically." |
| 8 | `go.mod` | go | "Looks like a Go app. We'll build it automatically." |
| 9 | `Cargo.toml` | rust | "Looks like a Rust app." |
| 10 | `Gemfile` | ruby | "Looks like a Ruby app." |
| 11 | `composer.json` | php | "Looks like a PHP app." |
| 12 | `pom.xml` / `build.gradle` / `build.gradle.kts` | java | "Looks like a Java app." |
| 13 | `*.csproj` / `*.fsproj` / `global.json` | dotnet | "Looks like a .NET app." |
| 14 | `index.html` and none of the above | static | "Looks like a static site. We'll serve it." |
| 15 | anything else | unknown | "We'll detect how to build this when it deploys." |

The preview is advisory. The authoritative builder decision happens in the agent (Phase 3, SPEC B8). The Details tab of a deployment shows the agent's detected framework, and if it differs from the preview the Deployments tab shows no warning (the preview is never persisted).

### 4.5 Webhook endpoint, verification and de-duplication
- **What:** `POST /v1/webhooks/github` reads the raw body (before JSON parsing), verifies `X-Hub-Signature-256` with `timingSafeEqual` against HMAC-SHA256 of the raw body using the decrypted webhook secret, rejects missing or bad signatures with 401 and no body, inserts `X-GitHub-Delivery` into `github_webhook_deliveries` (unique) and returns 200 immediately on a duplicate, then enqueues a `github.webhook` job (pg-boss) with the event name and payload. The HTTP handler never does GitHub API calls. Payload size limit 5 MB. The route is exempt from session/CSRF middleware and from RBAC (it authenticates by signature only).
- **Files:** `apps/api/src/routes/webhooks/github.ts`, `apps/api/src/github/verify-signature.ts`, `apps/api/src/workers/github-webhook.ts`
- **Done when:** unit tests cover valid signature, wrong secret, missing header, tampered body, and duplicate delivery; a replayed delivery id produces exactly one deployment; the handler responds in under 50 ms p95 in a local benchmark of 1,000 deliveries.

Webhook event routing (worker side):

| Event | Actions handled | Handler file | Effect |
|---|---|---|---|
| `ping` | — | `handlers/ping.ts` | Records `github_app.webhook_verified_at` in instance settings; the Instance → GitHub App page shows "Webhooks working" |
| `push` | — | `handlers/push.ts` | Deployment(s) with trigger `push`, or `SKIPPED` rows (4.6, 4.7) |
| `pull_request` | `opened`, `reopened`, `synchronize`, `closed`, `edited` | `handlers/pull-request.ts` | Stored in `github_pr_events` for Phase 10; no deploy in this phase |
| `check_suite` | `completed` | `handlers/check-suite.ts` | Advances or skips `WAITING_FOR_CI` deployments (4.7) |
| `check_run` | `completed` | `handlers/check-suite.ts` | Same as above, aggregated per suite |
| `installation` | `created`, `deleted`, `suspend`, `unsuspend`, `new_permissions_accepted` | `handlers/installation.ts` | Upsert / mark revoked / permissions re-check |
| `installation_repositories` | `added`, `removed` | `handlers/installation.ts` | Repo cache update; removed repos mark affected services revoked |
| `github_app_authorization` | `revoked` | `handlers/authorization.ts` | Unlinks `github_user_id` for that GitHub user (login by GitHub stops; password/passkey still work) |
| anything else | — | `handlers/ignore.ts` | Marked processed with result `ignored` |

Every handler is idempotent on `(delivery_id)` and safe to retry: pg-boss retries 3 times with 30 s backoff on thrown errors, then dead-letters into `github_webhook_deliveries.result = 'failed'` with the error text, visible on the Instance → GitHub App page under "Recent deliveries" (last 50, with a "Retry" row action).

Public API surface added by this phase (all under `/v1`, JSON, session or token auth unless stated):

| Method and path | Auth | RBAC | Purpose |
|---|---|---|---|
| `POST /github/manifest` | session | instance admin | Returns manifest JSON + state nonce |
| `GET /github/manifest/callback` | none (state nonce) | — | Converts the code, stores credentials, redirects |
| `GET /github/installations` | session/token | workspace viewer | List installations with `configure_url` |
| `POST /github/installations/:id/claim` | session | workspace admin | Bind an unclaimed installation to the workspace |
| `GET /github/repos` | session/token | workspace viewer | Cached repo list with search |
| `GET /github/repos/:owner/:repo/branches` | session/token | workspace viewer | Branch list, default first |
| `GET /github/repos/:owner/:repo/preview` | session/token | workspace viewer | Framework preview hint |
| `GET /github/repos/:owner/:repo/commits` | session/token | workspace viewer | Last 30 commits on a ref |
| `POST /webhooks/github` | HMAC signature | — | Webhook intake |
| `GET /auth/github` | none | — | Start OAuth login |
| `GET /auth/github/callback` | none (signed state) | — | Finish OAuth login / linking |
| `DELETE /me/connections/github` | session | self | Disconnect GitHub from the account |

### 4.6 Push → deployment, watch paths, deploy-on-push
- **What:** The worker resolves `push` events: match `repository.full_name` and `ref` (`refs/heads/<branch>`) to every `service_instances` row with `source_type = 'repo'`, same `repo_full_name`, same `branch`, and `deploy_on_push = true`. For each match: compute changed paths from the payload's `commits[].added|modified|removed` (if the payload has more than 20 commits or `forced` is true, call `GET /repos/{o}/{r}/compare/{before}...{after}` for the full file list); if `watch_paths` is non-empty and no changed path matches any glob relative to `root_dir`, create a deployment with status `SKIPPED`, `trigger = 'push'`, and `error_code = null`, `skip_reason = 'watch_paths'`; otherwise create a deployment with `trigger = 'push'`, `commit_sha`, `commit_message` (first line, max 200 chars stored, full message in `config_snapshot.commit_full_message`), `commit_author` (`head_commit.author.username` or name), `branch`, and hand it to the Phase 4 deploy orchestrator, which supersedes older queued deployments for the same service instance. Glob matching uses `picomatch` (MIT), with `dot: true`, and patterns are matched against paths relative to the service root directory; a pattern starting with `!` negates.
- **Files:** `apps/api/src/github/handlers/push.ts`, `packages/shared/src/watch-paths.ts` (matcher + tests), `apps/api/src/routes/services.ts` (PATCH accepts `watch_paths[]`, `deploy_on_push`)
- **Done when:** `packages/shared` tests cover: empty list deploys; `apps/api/**` matches nested change; `!**/*.md` excludes docs-only push; root_dir `apps/api` with pattern `src/**` matches `apps/api/src/x.ts`; a push with only unwatched paths creates a `SKIPPED` row visible in the Deployments tab as the muted row "Skipped — no changes in watched paths".

### 4.7 Wait for CI
- **What:** When `wait_for_ci = true`, the push handler creates the deployment in a new status `WAITING_FOR_CI` (added to the B4 machine as a pre-`QUEUED` state that can go to `QUEUED`, `SKIPPED` or `CANCELLED`) instead of queueing it. On `check_suite` with `action = completed` for the same head sha: `conclusion in ('success','neutral','skipped')` → transition to `QUEUED`; `conclusion in ('failure','timed_out','cancelled','action_required','stale')` → `SKIPPED` with `skip_reason = 'ci_failed'` and the row copy "Skipped — CI failed on <short sha>". Decision: a red CI result is a *skip*, not a *failure*, because nothing Lumen did failed and the previous deployment stays live; the row still offers "Deploy anyway" in its menu, which requeues with `trigger = 'manual'`. If no check suite reports within 60 minutes, the deployment becomes `SKIPPED` with `skip_reason = 'ci_timeout'` and the copy "Skipped — no CI result within 60 minutes". Multiple check suites on one sha: wait until all suites known at the time of the first `completed` event are completed; any failure skips.
- **Files:** `apps/api/src/github/handlers/check-suite.ts`, `apps/api/src/deployments/state-machine.ts` (add `WAITING_FOR_CI`), `apps/api/src/workers/ci-timeout.ts`, `packages/shared/src/deployment-status.ts`
- **Done when:** a state-machine unit test covers every transition above; an integration test posts a push then a failing `check_suite` and asserts `SKIPPED/ci_failed`; the timeline in the deployment detail shows a "Waiting for CI" step with a live-ticking duration.

`WAITING_FOR_CI` transitions (extends SPEC B4):

| From | Event | To | Row copy |
|---|---|---|---|
| — (push received, `wait_for_ci = true`) | create | `WAITING_FOR_CI` | "Waiting for CI" (clock, pulsing) |
| `WAITING_FOR_CI` | all known check suites completed, all green/neutral/skipped | `QUEUED` | "Queued" |
| `WAITING_FOR_CI` | any suite completed with failure/timed_out/cancelled/action_required/stale | `SKIPPED` (`ci_failed`) | "Skipped — CI failed on a1b2c3d" |
| `WAITING_FOR_CI` | 60 minutes elapsed with no completed suite | `SKIPPED` (`ci_timeout`) | "Skipped — no CI result within 60 minutes" |
| `WAITING_FOR_CI` | newer push to the same branch | `CANCELLED` (`superseded`) | "Cancelled — superseded by b2c3d4e" |
| `WAITING_FOR_CI` | user clicks Cancel | `CANCELLED` (`user`) | "Cancelled" |
| `SKIPPED` (`ci_failed` or `ci_timeout`) | row menu "Deploy anyway" | new deployment `QUEUED`, trigger `manual`, same sha | "Deployed a1b2c3d manually" |

Repositories with no CI at all: if `wait_for_ci` is on and GitHub reports zero check suites for the sha within 2 minutes of the push (`GET /repos/{o}/{r}/commits/{sha}/check-suites` returns `total_count: 0`), the deployment moves to `QUEUED` immediately with a one-time inline hint in the Settings → Source section: "This repository has no CI checks. "Wait for CI" has no effect until you add one." The hint is dismissible and stored per service instance.

### 4.8 Commit metadata, deploy specific commit
- **What:** Deployments tab shows the short SHA (7 chars, Geist Mono) as a link to `https://github.com/<repo>/commit/<sha>`, the author avatar (`https://github.com/<username>.png?size=40`, with an initials fallback), and the trigger label ("Pushed to main"). The Redeploy split button's third item, "Deploy specific commit…", opens a modal listing the branch's last 30 commits (`GET /v1/github/repos/:o/:r/commits?sha=<branch>&page=`) with search by SHA prefix or message; choosing one calls `POST /v1/services/:id/deploy` with `{ commit_sha, trigger: 'manual' }`.
- **Files:** `apps/web/components/inspector/deployments/commit-meta.tsx`, `apps/web/components/inspector/deployments/deploy-commit-modal.tsx`, `apps/api/src/routes/github/commits.ts`, `apps/api/src/routes/deployments.ts`
- **Done when:** the modal opens in under 200 ms from cache, keyboard-navigable, and deploying a 3-commits-old SHA produces a deployment whose detail Details tab shows that SHA and message.

### 4.9 Revoked access detection and reconnect
- **What:** Three signals mark a service's source as revoked: `installation.deleted` or `installation.suspend` webhook; `installation_repositories.removed` containing the repo; or a 401/403/404 from the GitHub API when fetching the repo during a deploy. On any: set `github_installations.status = 'revoked'` (or add the repo to `github_installations.removed_repos`), fail in-flight deployments with `error_code = 'GITHUB_ACCESS_REVOKED'`, and publish a realtime event. The inspector header and the Deployments tab show the error card; its fix action "Reconnect GitHub" opens the installation `configure_url` in a new tab and starts polling `GET /v1/github/installations` every 5 s for up to 5 minutes; when access returns, the card dismisses with a toast "GitHub access restored".
- **Files:** `apps/api/src/github/handlers/installation.ts`, `apps/api/src/github/errors.ts`, `packages/shared/src/errors/catalog.ts` (`GITHUB_ACCESS_REVOKED` entry), `apps/web/components/errors/github-access-revoked-card.tsx`
- **Done when:** uninstalling the App on a test account shows the card within 5 s on the open inspector; reinstalling clears it without a reload; the deployment created during the revoked window is `FAILED` with that error code.

### 4.10 Continue with GitHub (login and account linking)
- **What:** `GET /v1/auth/github` redirects to `https://github.com/login/oauth/authorize?client_id=&redirect_uri=&scope=&state=` (no extra scopes; the App's `emails: read` permission covers `GET /user/emails`), `state` is a signed nonce bound to the session cookie. `GET /v1/auth/github/callback` exchanges the code, reads `GET /user` and `GET /user/emails` (primary + verified). Linking rules: (1) a user with `github_user_id` matching → log in; (2) no match but a verified primary email matches an existing user with a verified email → link `github_user_id` to that user after showing "Link GitHub to your existing account?" with a password confirmation (or 2FA if enabled); (3) no match at all → if registration is open, create the user with `email_verified = true`, `avatar_url` from GitHub; if invite-only, show "Sign-ups are by invitation. Ask a workspace admin for an invite." Unverified GitHub emails never auto-link. Account settings → Connected accounts shows the GitHub login with "Disconnect" (disabled with tooltip if the user has no password and no passkey).
- **Files:** `apps/api/src/routes/auth/github.ts`, `apps/api/src/auth/link-github.ts`, `apps/web/app/(auth)/login/page.tsx` (button appears only when `github_app` exists), `apps/web/app/(app)/settings/account/connected-accounts/page.tsx`
- **Done when:** the three linking paths have integration tests; a login audit row `auth.github_login` is written; the button is hidden when no App is configured.

### 4.11 GitHub API client hygiene
- **What:** One thin client (`fetch`, no SDK) with: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, User-Agent `lumen/<version>`, per-installation token injection, `If-None-Match` from `github_repo_cache.etag` for list calls (304 costs no rate limit), reading `x-ratelimit-remaining`/`x-ratelimit-reset` and, when remaining < 50, deferring non-urgent calls (repo cache refresh) until reset, retry on 502/503 with jittered backoff (3 attempts), no retry on 4xx. Secondary rate limit (`retry-after`) is honored.
- **Files:** `apps/api/src/github/client.ts`, `apps/api/src/github/rate-limit.ts`
- **Done when:** mocked tests cover 304 handling, rate-limit deferral, `retry-after`, and that 401/403/404 raise a typed `GitHubAccessError` consumed by 4.9.

### 4.12 Settings → Source section wiring
- **What:** The Phase 5 Source section gains real controls: repository (RepoPicker, with "Change repository" typed-confirm because it resets watch paths and detected port), branch (BranchPicker), root directory (input with `/` prefix validation), watch paths (glob list editor with the three examples as placeholder chips), "Deploy on push" switch, "Wait for CI" switch, and "Disconnect source" (moves the service to `source_type = 'image'` with an empty image, staged). Every edit is a staged change (C8.1).
- **Files:** `apps/web/app/(app)/p/[project]/[env]/s/[service]/settings/source-section.tsx`, `apps/web/components/settings/glob-list-editor.tsx`
- **Done when:** changing branch then applying staged changes creates a deployment with `trigger = 'config_change'` on the new branch; all controls keyboard-operable; screenshots at three widths and both themes attached.

### 4.13 E2E against the test repository
- **What:** A dedicated repository `lumen-e2e/hello-node` (private, owned by the test GitHub account, App installed) with `main` and a `docs-only` branch. The Playwright suite: connect (pre-seeded App credentials via env), add service from the repo, wait for Active, push a commit via the GitHub API (`PUT /repos/{o}/{r}/contents/README.md`) to `docs-only` with watch paths `src/**` and assert a `SKIPPED` row, push to `src/index.js` and assert a new `ACTIVE` deployment, simulate revoke by removing the repo from the installation via the API and assert the error card, restore and assert the toast.
- **Files:** `e2e/github/push-to-deploy.spec.ts`, `e2e/fixtures/github.ts`, `.github/workflows/e2e-github.yml` (nightly, secrets-gated)
- **Done when:** the suite passes nightly against a real VM and is skipped (not failed) when secrets are absent.

## 5. Detail checklist

### Typography
- Repo picker rows: repo name in body 14/500 `--color-text`; owner prefix in body 14/400 `--color-text-secondary` (`owner/` then name, one string, no extra spacing); meta "pushed 3 h ago" in meta 12/400 `--color-text-secondary`, tabular numerals.
- Branch picker rows: branch name in code 13/400 Geist Mono `--color-text`; the default branch carries a "default" caption pill 12/500.
- Framework hint under the branch picker: body 14/400 `--color-text-secondary`, framework name in 14/500 `--color-text`.
- Commit meta in the Deployments tab: short SHA in code 13/400 Geist Mono, link-colored on hover only (`--color-accent`), underline on hover; commit message in body 14/400 truncated at one line with `text-overflow: ellipsis`; author name in meta 12/400.
- Deploy-commit modal: title "Deploy a specific commit" section title 16/600; commit rows as above; relative time in meta 12/400 right-aligned tabular.
- Error card `GITHUB_ACCESS_REVOKED`: title card title 14/600 `--color-text`; explanation body 14/400 `--color-text-secondary`; raw details in code 12/400 Geist Mono.
- Skipped row: body 14/400 `--color-text-muted` for the whole row, glyph "…" replaced by "⊘"? No: SPEC C4 has no skipped glyph. Use Lucide `circle-slash` 16 in `--color-text-muted` with text "Skipped" and the reason in meta 12 after a middle dot.
- Setup wizard step 3 and Instance → GitHub App: page title 24/600, letter-spacing -0.01em; success state "Connected as <slug>" body 14/500 with `check` icon in `--color-success`.

### Spacing & layout
- Repo picker popover: width matches the trigger, min 360px, max 480px; rows 40px tall, 12px horizontal padding, avatar 20px with 8px gap; list virtualized at 8 overscan rows; sticky search input 32px with 8px padding and a 1px `--color-border` divider.
- Branch picker: rows 32px, 12px horizontal padding.
- Framework hint: 8px below the branch picker, 12px left padding, with a 16px framework icon aligned to the first text line.
- Deploy-commit modal: 560px wide, 14px radius, 24px padding; list max-height 60vh; search input pinned top with 16px bottom gap.
- Error card: 10px radius, 16px padding, 1px `--color-border` plus a 3px left border in `--color-danger`; actions row 12px above the card bottom with the primary fix button first, "Show raw error" as a ghost button, "Copy for support" as ghost icon button on the right.
- Source section: two-column label/control grid at ≥1024 (label column 200px), stacked below; controls 32px tall; helper text 8px below control; watch-path chips 24px tall, 8px gap, wrap.
- All values on the 4px grid; no magic numbers outside the tokens.

### Color & theme
- Repo row hover `--color-surface-hover`; selected `--color-accent-subtle` with `--color-accent` 2px inset ring on keyboard focus.
- Private repo lock icon `--color-text-muted`; never colored.
- Skipped rows use `--color-text-muted` text and a transparent background; no status color.
- Error card left border `--color-danger`; card background `--color-surface`; in light theme add the C4 soft shadow.
- "Connected" state uses `--color-success` only for the check icon; text stays `--color-text`.
- Both themes verified by screenshot for: picker open, picker empty, error card, skipped row, connected state.

### Motion
- Picker popover: 120ms ease-out fade + 4px translate-y; reduced motion: opacity only.
- Framework hint appears with a 200ms `cubic-bezier(.2,.8,.2,1)` fade + height animation after detection resolves; reduced motion: no height animation.
- Reconnect polling: the error card's fix button shows a spinner (Lucide `loader-circle` 16, 1s linear rotation) with label "Waiting for GitHub…"; reduced motion: static icon with an ellipsis that updates every second.
- Toast "GitHub access restored": standard toast entrance (200ms), 8s auto-dismiss, no undo.
- Deploy-commit modal: 200ms panel easing; backdrop 120ms fade.
- Nothing animates longer than 300ms except the spinner.

### Iconography & symbols
- GitHub mark: Lucide `github` 16 for buttons and 20 in the wizard tile (the Lucide glyph is used under ISC; the official GitHub logo asset is not bundled).
- Lock for private repos: Lucide `lock` 14.
- Branch: Lucide `git-branch` 16. Commit: Lucide `git-commit-horizontal` 16.
- Skipped: Lucide `circle-slash` 16 muted. Waiting for CI: Lucide `clock` 16 in `--color-warning`, pulsing per C4 while waiting.
- External link on SHA: Lucide `arrow-up-right` 12 inline after the SHA on hover.
- Framework icons from the Phase 1 framework set (Node, Next.js maps to Node set entry "nextjs", Python, Go, Rust, Ruby, PHP, Java, .NET, Deno, Bun, static) at 16px.
- Error card icon: Lucide `unplug` 20 in `--color-danger`.

### Copy
- Add flow option 1 title: "GitHub repository". Sub: "Deploy any branch. Pushes deploy automatically."
- Empty picker (no installations): "Connect GitHub to see your repositories." Button: "Connect GitHub".
- Missing repo row: "Can't find your repository? Configure GitHub access" (link).
- Framework hints (detection table → hint): Next.js "Looks like a Next.js app. We'll build it automatically." · Node "Looks like a Node app. We'll build it automatically." · Python "Looks like a Python app. We'll build it automatically." · Go "Looks like a Go app. We'll build it automatically." · Rust "Looks like a Rust app." · Ruby "Looks like a Ruby app." · PHP "Looks like a PHP app." · Java "Looks like a Java app." · .NET "Looks like a .NET app." · Deno "Looks like a Deno app." · Bun "Looks like a Bun app." · Dockerfile present "We found a Dockerfile. We'll use it." · static "Looks like a static site. We'll serve it." · unknown "We'll detect how to build this when it deploys."
- Deploy-on-push helper: "Every push to <branch> deploys this service."
- Wait-for-CI helper: "Deploy only after GitHub checks pass on the commit."
- Watch paths helper: "Deploy only when files matching these paths change. Leave empty to deploy on every push." Placeholder examples: `apps/api/**`, `packages/shared/**`, `!**/*.md`.
- Skipped rows: "Skipped — no changes in watched paths" · "Skipped — CI failed on a1b2c3d" · "Skipped — no CI result within 60 minutes". Row menu item: "Deploy anyway".
- Trigger labels: "Pushed to main" · "Deployed manually" · "Deployed a1b2c3d manually".
- Error card (J6): title "We lost access to this repository". Explanation: "GitHub stopped letting Lumen read <owner/repo>. This happens when the app is uninstalled or the repository is removed from it. Your last deployment keeps running." Fix button: "Reconnect GitHub". Secondary: "Show raw error".
- Toast on restore: "GitHub access restored".
- Change repository confirmation: title "Change repository?" body "Watch paths and the detected port reset. The current deployment keeps running until the next deploy." Confirm: "Change repository".
- Login button: "Continue with GitHub". Link prompt: "Link GitHub to your existing account?" with "Link accounts" and "Use a different email".
- Invite-only: "Sign-ups are by invitation. Ask a workspace admin for an invite."
- Wizard step 3 title: "Connect GitHub". Body: "One click creates a GitHub App for this instance. You choose which repositories it can see." Primary: "Create GitHub App". Skip link: "I'll deploy Docker images for now".

### States (empty · loading · error · success · partial)
- Repo picker: loading shows 6 skeleton rows (20px circle + 60% bar + 24px meta bar); empty-no-installation state as above; empty-search "No repositories match "<q>"" with the configure link; error "GitHub didn't respond. Try again." with a retry ghost button; partial when one of two installations fails: rows from the healthy one plus an inline muted line "1 installation unavailable".
- Branch picker: loading 4 skeleton rows; error inline; empty impossible (default branch always exists) but guard with "No branches found".
- Framework preview: loading shows a 16px skeleton circle + 180px bar for max 2 s, then the unknown hint if it hasn't resolved.
- Deployments rows: `WAITING_FOR_CI` (clock, pulsing), `SKIPPED` (muted), plus Phase 5 states.
- Instance → GitHub App: not configured (hero empty state with "Create GitHub App"), configured (slug, app_id, permissions check list with green checks or "Missing: pull_requests write — Re-create app"), error (callback failed: "GitHub didn't finish creating the app. Try again.").
- Connected accounts: connected (login + avatar + "Disconnect"), not connected ("Connect GitHub"), disconnect disabled tooltip "Add a password or passkey first so you can still sign in."

Skeleton shapes (must match the final layout to avoid shift):

| Surface | Skeleton |
|---|---|
| Repo picker list | 6 rows × 40px: 20px circle, 8px gap, bar 60% width 14px tall, right-aligned bar 56px × 12px |
| Branch picker list | 4 rows × 32px: 16px square, 8px gap, bar 40% width 13px tall |
| Framework hint | 16px circle + bar 180px × 14px, 8px below the branch picker |
| Deploy-commit modal list | 8 rows × 44px: bar 56px × 13px mono, bar 70% × 14px, right bar 48px × 12px |
| Instance → GitHub App configured | title bar 220px × 24px; 5 rows × 28px for the permission list |
| Recent deliveries table | 6 rows × 36px with 4 column bars (event 80px, id 140px, time 64px, result 56px) |

Screenshot matrix for this phase (each cell = 390 / 1024 / 1440 × dark / light):

| Surface | States |
|---|---|
| Add flow → GitHub repository | loading, no installation, list, search with results, search empty, repo selected with hint |
| Settings → Source | default, editing watch paths, change-repository confirm, disconnect confirm, staged bar visible |
| Deployments tab | waiting for CI, skipped (watch paths), skipped (CI failed), deploy-commit modal open |
| Error card | GITHUB_ACCESS_REVOKED idle, reconnecting (spinner), restored toast |
| Setup wizard step 3 | idle, creating (button loading), success, callback error |
| Instance → GitHub App | not configured, configured all permissions ok, missing permission, recent deliveries with a failed row |
| Login | with "Continue with GitHub", link-accounts prompt, invite-only message |
| Account → Connected accounts | connected, not connected, disconnect disabled |

### Keyboard & accessibility
- Pickers are Radix Combobox-pattern (`role="combobox"` + `listbox`); arrow keys move, Enter selects, Esc closes, typing filters; focus ring 2px `--color-accent` 2px offset.
- Deploy-commit modal: focus trapped, initial focus on search, Esc closes, Enter on a row deploys after the confirm step.
- Error card actions reachable by Tab in order fix → raw → copy; the card has `role="alert"`.
- Status changes (`WAITING_FOR_CI` → `QUEUED`) announced via the Phase 5 live region: "api: waiting for CI" → "api: queued".
- All icons have `aria-hidden` with adjacent text; icon-only buttons carry `aria-label`.
- Contrast: skipped-row muted text is informational only when paired with the `circle-slash` icon; the reason text is 12px `--color-text-secondary`, which passes 4.5:1 on `--color-surface`.

### Responsive
- ≥1280: pickers in the inspector Source section; modal centered.
- 1024–1279: same; inspector overlays the canvas.
- 768–1023: Source section stacks label above control.
- <768: pickers open as a bottom Sheet with the search input pinned and 44px rows; the deploy-commit modal becomes a full-screen sheet; the error card actions stack vertically with the fix button full-width; SHA links have 44px tap targets.

### Realtime and deep links
- Realtime topics published by this phase (over the Phase 4 `/v1/ws` multiplex) and the TanStack Query keys they invalidate:

| Topic | Payload | Invalidates |
|---|---|---|
| `github.installation.changed` (workspace) | `{ installation_id, status }` | `['github','installations', workspaceId]`, `['github','repos', workspaceId]` |
| `github.app.changed` (instance) | `{ configured: boolean }` | `['instance','github-app']`, `['auth','providers']` (login button visibility) |
| `deployment.created` / `deployment.updated` (service instance) | Phase 4 payload + `skip_reason`, `commit_*` | `['deployments', serviceInstanceId]`, `['deployment', id]` |
| `service.source.revoked` (service instance) | `{ service_instance_id, error_code }` | `['service', id]`, `['deployments', serviceInstanceId]` |
| `github.delivery.recorded` (instance) | `{ delivery_id, event, result }` | `['instance','github-deliveries']` |

- Deep links: `/p/:project/:env/s/:service/deployments?commit=<sha>` opens the deploy-commit modal pre-filtered; `/p/:project/:env/s/:service/settings#source` scrolls to the Source section; `/settings/instance/github?setup=1` is the App `setup_url` target and shows the "Connected" state; `/settings/account/connected-accounts` for linking.
- The Add flow keeps `?add=github&repo=<owner/repo>&branch=<b>` in the URL so a refresh mid-flow restores the selection.

### Performance
- Repo list from cache < 150 ms; cache refresh in the background with `stale-while-revalidate` semantics in TanStack Query (`staleTime` 60 s).
- Webhook handler p95 < 50 ms; all GitHub API calls happen in workers.
- Framework preview: one tree request, cached per (repo, ref) for 10 minutes.

### Security
- Webhook: raw-body HMAC-SHA256 with `timingSafeEqual`; 401 on failure with no diagnostic detail; payload cap 5 MB; delivery-id unique index.
- App private key, client secret and webhook secret encrypted at rest; decrypted in memory per use; never logged; the manifest callback route is rate-limited (5/min/IP) and the `state` nonce is single-use.
- OAuth `state` is signed and bound to the browser session; callback rejects mismatches; the code exchange happens server-side only.
- Unverified GitHub emails never link to existing accounts.
- Installation tokens are memory-only; process restart simply re-mints.
- Fork PRs are recorded but never deploy (Phase 10 enforces `allow_forks` default off).

### Data integrity & idempotency
- One deployment per (delivery_id); replayed deliveries are no-ops.
- Superseding: a new push cancels queued/in-progress builds of older deployments for the same service instance (Phase 4 rule) including `WAITING_FOR_CI` rows, which become `CANCELLED` with reason "superseded by <sha>".
- Repo cache refresh is ETag-conditional and idempotent.
- `installation.deleted` is idempotent: repeated events do not re-fail already-failed deployments.

## 6. Acceptance criteria
- [ ] D2: **Deploy from GitHub** (any branch) works from the Add flow and from Settings → Source.
- [ ] D2: **Push-to-deploy**, deploy-on-push toggle, **watch paths**, **wait for CI**. AC: a push touching only unwatched paths produces a "Skipped" deployment.
- [ ] D2: **Monorepo support** (root directory per service) — watch paths and framework preview respect `root_dir`.
- [ ] D2: **Deploy a specific commit** from the inspector.
- [ ] Revoked access shows the `GITHUB_ACCESS_REVOKED` card within 5 s of the webhook and offers "Reconnect GitHub"; restoring access clears it without reload.
- [ ] Webhook signature verification rejects tampered payloads; replayed delivery ids never create a second deployment.
- [ ] Wait for CI never deploys a commit whose check suite failed; a 60-minute timeout skips with a clear reason.
- [ ] "Continue with GitHub" logs in existing linked users, links by verified email with confirmation, and respects registration mode.
- [ ] Setup wizard step 3 creates the App in one click and is skippable; Instance admin can re-create it and shows a permissions check.
- [ ] C14 quality bar passes on: Add flow option 1, Source section, deploy-commit modal, error card, wizard step 3, Instance → GitHub App, Connected accounts.
- [ ] No GitHub secret appears in any log line (grep of API and worker logs during the e2e run).

## 7. Test plan
- **Unit:** signature verification; watch-path matcher (10 cases incl. negation, root_dir, dotfiles); framework detection table; App JWT claims; token cache expiry; state machine transitions incl. `WAITING_FOR_CI`; account-linking decision function (3 paths + unverified email); rate-limit deferral.
- **Integration (API + Postgres):** webhook → deployment row; duplicate delivery; push with watch paths → `SKIPPED`; check_suite success/failure/timeout; installation deleted → failed deployment + realtime event; OAuth callback with mocked GitHub.
- **E2E (Playwright):** `e2e/github/push-to-deploy.spec.ts` as in 4.13; login with GitHub on a seeded App (mock OAuth server in CI, real GitHub nightly).
- **Visual regression:** Add flow option 1 (loading/empty/list/search-empty), Source section, deploy-commit modal, error card, skipped row, wizard step 3 (idle/success), Instance GitHub page (not configured/configured/missing permission) × 390/1024/1440 × dark/light.
- **Accessibility:** axe on every page above; manual keyboard pass through the pickers and the modal.
- **Manual / real VM:** create the App on a real GitHub account, install on one org and one personal account, deploy from each, revoke and restore.

Named test cases the reviewer will look for:

| ID | Layer | Case | Expected |
|---|---|---|---|
| GH-01 | unit | Valid `X-Hub-Signature-256` | 200, delivery recorded, job enqueued |
| GH-02 | unit | Signature computed with wrong secret | 401, nothing recorded |
| GH-03 | unit | Header missing | 401 |
| GH-04 | unit | Body altered after signing | 401 |
| GH-05 | integration | Same delivery id posted twice | one deployment |
| GH-06 | unit | Watch paths `["src/**"]`, changed `["README.md"]` | skip |
| GH-07 | unit | Watch paths `["src/**","!src/**/*.test.ts"]`, changed `["src/a.test.ts"]` | skip |
| GH-08 | unit | Watch paths `["src/**"]`, root_dir `apps/api`, changed `["apps/api/src/a.ts"]` | deploy |
| GH-09 | unit | Watch paths empty | deploy |
| GH-10 | integration | Push with 25 commits and `forced: true` | compare API called; deploy |
| GH-11 | integration | `wait_for_ci` + suite success | `WAITING_FOR_CI` → `QUEUED` |
| GH-12 | integration | `wait_for_ci` + suite failure | `SKIPPED/ci_failed` |
| GH-13 | integration | `wait_for_ci` + no suites after 60 min (clock injected) | `SKIPPED/ci_timeout` |
| GH-14 | integration | `wait_for_ci` + second push before CI | first `CANCELLED/superseded` |
| GH-15 | integration | `installation.deleted` during a build | deployment `FAILED/GITHUB_ACCESS_REVOKED`, event published |
| GH-16 | integration | OAuth callback, `github_user_id` known | login, audit row |
| GH-17 | integration | OAuth callback, verified email matches user | link prompt, then linked after password confirm |
| GH-18 | integration | OAuth callback, unverified email matches user | no link; treated as new (or blocked if invite-only) |
| GH-19 | integration | OAuth `state` mismatch | 400, no session |
| GH-20 | unit | Repo list refresh with ETag → 304 | cache untouched, no rate-limit decrement |
| GH-21 | unit | `x-ratelimit-remaining: 10` | background refresh deferred until reset |
| GH-22 | e2e | Push to `docs-only` with watch paths `src/**` | "Skipped — no changes in watched paths" row |
| GH-23 | e2e | Push to `src/index.js` | new `ACTIVE` deployment; node status visible < 1 s after event |
| GH-24 | e2e | Remove repo from installation | error card within 5 s; restore → toast |

## 8. Evidence required to close
- Test output for unit and integration suites (counts, all green).
- Nightly e2e run link with the push → Active and docs-only → Skipped assertions visible.
- Screenshot matrix listed in §7 under `docs/evidence/phase-06/`.
- A screen recording (or 4 sequential screenshots) of: push → node pulses Building → Active in the canvas, with timestamps showing status visible within 1 s of the API event.
- Log grep output showing zero occurrences of the webhook secret, client secret or private key fragments.
- Measured webhook handler p95 from the 1,000-delivery benchmark.

## 9. Review
Use SPEC H1 (code review) with Fable 5.1 on: `verify-signature.ts`, `push.ts`, `check-suite.ts`, `link-github.ts`, `client.ts`. Probe specifically: raw-body handling before any JSON middleware; timing-safe comparison; state nonce single use; the email-linking path (can an attacker with a GitHub account whose unverified email equals a victim's email link to the victim?); superseding of `WAITING_FOR_CI`; behaviour when `github_app` is re-created while installations exist (old installations must be marked stale). Then SPEC H2 (UI review) on the screenshot matrix, checking that the Add flow still has exactly one primary action and that the framework hint doesn't compete with the Deploy button.

## 10. Risks & open questions
- **Risk:** GitHub manifest flow requires the instance to be reachable at a public HTTPS URL for the callback → **Mitigation:** the wizard checks the instance URL is not an IP-only or `localhost` address before offering the flow, and explains "GitHub needs a public address to send events. Set your domain first (step 2)."
- **Risk:** Large monorepo pushes exceed the 20-commit payload cap, hiding changed files → **Mitigation:** compare API fallback in 4.6; if compare fails, deploy (never silently skip).
- **Risk:** Check-suite semantics vary (some CI apps only post check runs, not suites) → **Mitigation:** also subscribe to `check_run` and treat a suite as complete when all its runs complete; documented in DECISIONS.md.
- **Risk:** Users install the App on an org that maps to multiple Lumen workspaces → **Mitigation:** installations are claimed explicitly by a workspace; the same installation can be claimed by more than one workspace only by an instance admin.
- **Open question:** Should `SKIPPED` deployments count toward the history list by default or be collapsed behind a "Show skipped" toggle? Default: shown, muted, collapsible after 10 consecutive skips.
- **Open question:** `WAITING_FOR_CI` is a new lifecycle state not in SPEC B4. Default: add it and record in DECISIONS.md; SPEC B4 to be updated.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries: glob library, `WAITING_FOR_CI` state, CI-failure-is-skip rule, account-linking rules, no-SDK client
- [ ] `docs/UI_DECISIONS.md` updated with the §7 screenshot matrix
- [ ] Cross-model review done and findings fixed
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 06 — GitHub integration</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-06-github.md,
and these SPEC sections: B6 (github_app, github_installations, deployments), B8, C7.2,
C7.5 option 1, C7.8, C7.12 Source, D2, J1 integrations, J6 GITHUB_ACCESS_REVOKED.
</context>
<goal>A user connects GitHub once, picks a repo and branch in the Add flow, and every
push to that branch deploys automatically; unwatched-path pushes show "Skipped"; revoked
access shows a card with "Reconnect GitHub".</goal>
<scope>
- GitHub App manifest flow (instance level), installations, installation tokens (memory cache)
- Repo picker, branch picker, framework preview hint, Source section wiring (staged changes)
- POST /v1/webhooks/github with HMAC-SHA256 verification and delivery de-duplication
- push → deployment with commit metadata; watch paths → SKIPPED; deploy-on-push; wait for CI (WAITING_FOR_CI state)
- Deploy specific commit modal
- Revoked access detection → GITHUB_ACCESS_REVOKED card with Reconnect
- Continue with GitHub login + account linking; Connected accounts page
- GitHub client with ETags, rate-limit handling; e2e against lumen-e2e/hello-node
</scope>
<out_of_scope>
- PR preview environment lifecycle and the PR comment (Phase 10)
- Reading lumen.toml / .env.example (Phase 10)
- Build/Railpack detection in the agent (Phase 3)
- GitLab/Bitbucket; local upload (Phase 14)
</out_of_scope>
<acceptance_criteria>
Every item in PHASE-06-github.md §6, including: a push touching only unwatched paths
produces a SKIPPED deployment; replayed delivery ids never double-deploy; failed CI never
deploys; revoked access shows the card within 5 s and clears on restore without reload;
no GitHub secret appears in logs; C14 passes on every listed surface.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, data/protocol changes (github tables,
   WAITING_FOR_CI state), risks, test plan, open questions. STOP and wait for approval.
2. Implement in small steps; run code and tests after each step.
3. For UI: screenshots at 390/1024/1440 × dark/light × key states (picker loading/empty/
   list, Source section, deploy-commit modal, error card, wizard step 3, Instance GitHub
   page); critique against SPEC C14; fix before reporting.
4. Report: what works (with evidence), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md and docs/DECISIONS.md.
</process>
```
