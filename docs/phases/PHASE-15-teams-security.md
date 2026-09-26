# Phase 15 — Teams and security features

| | |
|---|---|
| **Status** | Not started |
| **Owner model** | Opus 5.5 (invites, roles UI, settings pages, 2FA/passkeys flows) → audited by Fable 5.1 (RBAC matrix, session security, WebAuthn, audit log integrity) |
| **Depends on** | Phase 4 (users, sessions, workspaces, RBAC middleware skeleton, audit_log, api_tokens), Phase 5 (app shell, settings layout, tables, dialogs, toasts), Phase 6 (Continue with GitHub, connected accounts), Phase 8 (notification channels list, reused as a link), Phase 9 (backup destinations, reused as a section), Phase 11 (instance admin: registration mode, user disable, reset 2FA) |
| **Unblocks** | Phase 16 (cloud accounts and usage & cost fill their placeholders in workspace settings), Phase 18 (H3 security audit, permission test matrix is a launch gate) |
| **Spec sections** | SPEC D11 (permission matrix), B6 (users, sessions, passkeys, workspace_members, invites, api_tokens, audit_log), B12 (web security), C7.2 (accept invite, 2FA challenge), C7.16 (Members overrides, Tokens), C7.20, C7.21, C7.26 (permission denied), C8.5 (confirmations), C9, C14, J1 (workspaces, tokens, audit) |
| **Estimated sessions** | 5 focused sessions: (1) roles matrix in middleware + per-route test matrix + per-project overrides, (2) invites (email + link) + accept page + members page, (3) 2FA TOTP + recovery codes + challenge + sessions page + login audit, (4) passkeys + API tokens + account settings, (5) workspace settings remaining sections + audit log UI + permission-denied card + H3 subset |

## 1. Goal
A workspace owner invites a teammate by email or link, the teammate accepts, signs in with a passkey or password plus 2FA, sees exactly the projects and actions their role allows, and every one of those actions shows up in a filterable audit log.

## 2. Why this phase exists
Until now one person owned everything. Real usage is a team: a founder who owns the servers, two engineers who deploy, a designer who reads logs, a contractor who should see one project only. The D11 matrix decides what each of them can do, and it has to be enforced in the API on every route, not in the UI, because the CLI, MCP and API get every feature the dashboard has (SPEC B2). A permission bug here is a data-exposure bug: a viewer who can PUT a variable, a member who can delete a server, an admin who can remove the owner.

Security features (2FA, passkeys, sessions, login audit) matter because the dashboard controls production servers. A stolen session is a stolen fleet. SPEC B12 lists the web security baseline; this phase implements the user-facing half and hardens the session layer the earlier phases only sketched.

The settings pages (C7.20, C7.21) are where power users spend time when things go wrong; they must feel as considered as the canvas. The structural parity target is a modern PaaS settings area: a sticky section nav, one section per concern, a danger zone at the bottom, typed confirmations for anything irreversible.

## 3. Scope
### In scope
- Roles (owner, admin, member, viewer) enforced in API middleware per the D11 matrix, with a per-route × per-role test matrix
- Per-project access overrides (C7.16 Members, D11)
- Invites by email and by link: role select, expiry, hashed token, pending list, resend, revoke, accept-invite page (C7.2)
- Members page: list, change role, remove, transfer ownership (owner only), leave workspace
- 2FA with TOTP: setup with QR and manual key, recovery codes, challenge page, disable with password, admin reset (Phase 11 UI calls this phase's endpoint)
- Passkeys (WebAuthn): register, name, list, remove, sign in with a passkey, passkey as second factor
- Sessions page: list active sessions with device, IP, location label, last seen; revoke one or all others
- Login audit: successful and failed sign-ins with method, IP, user agent; surfaced in Security settings and in the audit log
- Audit log (workspace): every mutation recorded (Phase 4 wired the writer; this phase completes coverage and builds the UI): filterable table, CSV export
- API tokens (user, workspace, project, environment-scoped) with scopes, last used, expiry, revoke; token creation reveals the value once
- Workspace settings (C7.20), every section: General, Members & invites, Roles & permissions (matrix view), Cloud accounts (placeholder card until Phase 16), Registry credentials, Notification channels (link to Phase 8 page), Backup destinations (Phase 9 section embedded), Usage & cost (placeholder until Phase 16), Audit log, Danger zone
- Account settings (C7.21), every section: Profile, Security, API tokens, Preferences, Notifications, Connected accounts
- Permission-denied card (C7.26) used by every 403 in the app
- Web security baseline verification: httpOnly SameSite cookies, CSRF, rate limits on auth, session rotation on privilege change
- The H3 security checks that concern auth, sessions, RBAC bypass and token handling

### Out of scope
- SSO via OIDC (SPEC D11 "later"; a placeholder note in Workspace settings → Members says "Single sign-on is coming later")
- Cloud account connections and Usage & cost content (Phase 16)
- Notification channel forms (Phase 8), backup destination forms (Phase 9): reused here, not rebuilt
- Instance admin pages themselves (Phase 11); this phase supplies the endpoints they call (reset 2FA, disable user)
- MCP token scoping details (Phase 14 consumes the token scopes defined here)

## 4. Work breakdown

### 4.1 Permission model and middleware
- **What:** Define the permission set in one file: `projects.view`, `logs.view`, `metrics.view`, `deploy.run`, `deploy.rollback`, `variables.edit`, `variables.reveal` (never granted to any role for sealed values), `projects.manage`, `services.manage`, `servers.manage`, `cloud_accounts.manage`, `backup_destinations.manage`, `registry_credentials.manage`, `notification_channels.manage`, `members.manage`, `members.manage_owners`, `workspace.delete`, `workspace.transfer`, `tokens.workspace`, `tokens.project`, `audit.view`, `webhooks.manage`. Map roles to permissions exactly as D11: viewer → view set; member → viewer + deploy.run, deploy.rollback, variables.edit, projects.manage, services.manage, tokens.project, webhooks.manage; admin → member + servers.manage, cloud_accounts.manage, backup_destinations.manage, registry_credentials.manage, notification_channels.manage, members.manage, tokens.workspace, audit.view; owner → admin + members.manage_owners, workspace.delete, workspace.transfer. `requirePermission(perm, { scope: 'workspace' | 'project' })` resolves the workspace from the route params (project → workspace, service → project → workspace, deployment → service …) through a single `resolveScope` helper so no route hand-rolls lookups. Every route in `apps/api/src/routes/**` declares exactly one permission; a lint rule (`apps/api/scripts/check-route-permissions.ts`, run in CI) fails when a mutating route lacks one.
- **Files:** `packages/shared/src/auth/permissions.ts`, `apps/api/src/middleware/rbac.ts`, `apps/api/src/lib/resolve-scope.ts`, `apps/api/scripts/check-route-permissions.ts`, `apps/api/src/routes/*.ts` (annotate every route)
- **Done when:** the CI lint passes with zero unannotated routes; `permissions.test.ts` asserts the role → permission table against a literal copy of D11.

### 4.2 Per-route × per-role test matrix
- **What:** `apps/api/test/rbac-matrix.test.ts` builds a workspace with four users (one per role) plus an outsider and an instance admin, then calls every route with each identity and asserts the status. The matrix (✓ allowed, ✗ 403, — 404 for outsider):

  | Route | Viewer | Member | Admin | Owner |
  |---|---|---|---|---|
  | `GET /projects`, `GET /projects/:id`, `GET /services/:id`, `GET /services/:id/deployments`, `GET /deployments/:id`, `GET /deployments/:id/logs`, `GET /services/:id/logs`, `GET /services/:id/metrics`, `GET /services/:id/http-logs`, `GET /environments/:id/logs`, `GET /services/:id/variables` (masked), `GET /services/:id/domains`, `GET /volumes`, `GET /templates`, `GET /servers` | ✓ | ✓ | ✓ | ✓ |
  | `POST /services/:id/deploy`, `POST /deployments/:id/rollback`, `POST /deployments/:id/redeploy`, `POST /deployments/:id/cancel`, `POST /environments/:id/staged/apply` | ✗ | ✓ | ✓ | ✓ |
  | `PUT/DELETE /services/:id/variables`, `PUT /environments/:id/shared-variables`, `GET/PUT/DELETE /environments/:id/staged` | ✗ | ✓ | ✓ | ✓ |
  | `GET …/variables?reveal=sealed` (any role) | ✗ | ✗ | ✗ | ✗ |
  | `POST /projects`, `PATCH/DELETE /projects/:id`, `PUT /projects/:id/canvas`, `POST/PATCH/DELETE environments`, `POST/PATCH/DELETE services`, `POST/DELETE domains`, `POST /services/:id/tcp-proxy`, `POST/PATCH/DELETE /volumes`, `POST /volumes/:id/backups`, `POST /backups/:id/restore`, `POST /templates/:slug/deploy`, `POST /import/compose`, `POST /projects/:id/webhooks`, notification rules for a project | ✗ | ✓ | ✓ | ✓ |
  | `POST /servers`, `POST /servers/join-tokens`, `PATCH/DELETE /servers/:id`, `POST /servers/:id/drain`, `POST /servers/:id/agent-update`, cloud accounts, backup destinations, registry credentials, notification channels | ✗ | ✗ | ✓ | ✓ |
  | `GET/POST /workspaces/:id/members`, `PATCH /workspaces/:id/members/:userId` (non-owner targets), `DELETE …/members/:userId` (non-owner), `POST /workspaces/:id/invites`, `DELETE …/invites/:id` | ✗ | ✗ | ✓ | ✓ |
  | `PATCH …/members/:userId` where target is owner, or new role is owner | ✗ | ✗ | ✗ | ✓ |
  | `POST /workspaces/:id/transfer`, `DELETE /workspaces/:id` | ✗ | ✗ | ✗ | ✓ |
  | `POST /tokens` (owner=workspace) | ✗ | ✗ | ✓ | ✓ |
  | `POST /tokens` (owner=project or environment) | ✗ | ✓ | ✓ | ✓ |
  | `POST /tokens` (owner=user), `DELETE /tokens/:id` (own) | ✓ | ✓ | ✓ | ✓ |
  | `GET /workspaces/:id/audit-log` | ✗ | ✗ | ✓ | ✓ |
  | `PATCH /workspaces/:id` (name, slug) | ✗ | ✗ | ✓ | ✓ |
  | Any route with an outsider identity | — | — | — | — |

  Project overrides (4.3) get their own block: a viewer raised to member on project A can deploy A and not B; a member lowered to viewer on B cannot edit B's variables; a member set to `none` on C gets 404 on C.
- **Files:** `apps/api/test/rbac-matrix.test.ts`, `apps/api/test/fixtures/workspace.ts`
- **Done when:** the matrix test enumerates every route from the OpenAPI document (fails if a route exists that the matrix does not list) and passes.

### 4.3 Per-project access overrides
- **What:** New table `project_access_overrides` (`project_id`, `user_id`, `role` in `admin | member | viewer | none`, unique on project + user). Effective role for a project = the override when present, else the workspace role; owners cannot be overridden (the UI hides them; the API returns 400 `OVERRIDE_NOT_ALLOWED`). `none` hides the project from lists and returns 404 on direct access. Project settings → Members (C7.16) lists workspace members with their effective role and a per-row select (Inherited / Admin / Member / Viewer / No access). Every change is audited (`project.access.override`).
- **Files:** `packages/db/src/schema/project-access-overrides.ts`, `packages/db/migrations/00xx_project_access_overrides.sql`, `apps/api/src/lib/effective-role.ts`, `apps/api/src/routes/projects.ts` (`GET/PUT /projects/:id/members`), `apps/web/app/(app)/p/[project]/settings/members/page.tsx`
- **Done when:** the override block of the matrix passes; the Members page shows "Inherited (Member)" for untouched rows.

### 4.4 Invites: email and link
- **What:**
  - `POST /workspaces/:id/invites {email?, role, expires_in_days=7}`; token = 32 random bytes base64url; store `sha256(token)` in `invites.token_hash`; the URL `https://<dashboard>/invite/<token>` is emailed (Phase 11 SMTP through nodemailer) or, when `email` is absent, returned once for copying ("link invite", role bound, single use by default with an "Allow multiple uses" toggle setting `max_uses`, up to 50).
  - Pending list: email or "Link", role, invited by, expires in, actions Resend (email only, rate-limited 1 / 5 min), Copy link (link invites), Revoke.
  - Accept page `/invite/[token]` (C7.2): shows workspace name, inviter, role; signed-out → "Sign in or create an account to join", the invite token kept in a cookie across sign-up/GitHub login; signed-in with a different email than the invite → "This invite was sent to a@b.com. You're signed in as c@d.com." with "Switch account"; expired/revoked/used → error card `INVITE_INVALID` "This invite link isn't valid anymore. Ask for a new one."; accepting creates `workspace_members`, marks `used_at`, audits `workspace.member.joined`.
  - Email template (plain text + HTML, Geist not embedded; system font stack): subject "{Inviter} invited you to {Workspace} on Lumen", one button "Accept invite", expiry sentence, the raw URL under it.
- **Files:** `apps/api/src/routes/invites.ts`, `apps/api/src/lib/mail/templates/invite.ts`, `apps/web/app/(auth)/invite/[token]/page.tsx`, `apps/web/components/settings/InviteDialog.tsx`, `apps/web/components/settings/PendingInvitesTable.tsx`, `packages/shared/src/errors/catalog.ts` (`INVITE_INVALID`, `INVITE_EMAIL_MISMATCH`, `INVITE_RATE_LIMITED`)
- **Done when:** e2e: owner invites by email (MailHog capture), invitee signs up from the link and lands in the workspace as Member; link invite with 3 uses is accepted by 3 users and rejected by the 4th; revoked invite shows the error card.

### 4.5 Members page and ownership
- **What:** Workspace settings → Members & invites: tabs "Members (N)" and "Pending invites (N)". Members table: avatar, name + email, role select (owner rows show a lock; only owners can select Owner), joined date, last active, 2FA badge (`shield-check` 14 px, "2FA on"), row menu: Change role, Remove from workspace (typed confirm of the person's email for admins/owners; simple confirm for members/viewers), Transfer ownership (owner only; typed confirm of the workspace name; the current owner becomes admin; single owner per workspace enforced with a transaction). "Leave workspace" for non-owners in the page footer (owners see "Transfer ownership first"). Search by name/email. Removing a member revokes their sessions' access to the workspace immediately (session stays, membership gone) and their workspace-owned tokens.
- **Files:** `apps/web/app/(app)/w/[workspace]/settings/members/page.tsx`, `apps/web/components/settings/MembersTable.tsx`, `apps/api/src/routes/workspaces.ts` (`members`, `transfer`, `leave`)
- **Done when:** transfer ownership moves the role in one transaction and the audit log shows `workspace.ownership.transferred` with both users; a removed member's next request to the workspace returns 404.

### 4.6 2FA with TOTP and recovery codes
- **What:**
  - Library: `otpauth` (MIT) for TOTP (SHA-1, 6 digits, 30 s period, ±1 window), `qrcode` (MIT) for the SVG QR. Secret encrypted with the B7 envelope (`users.totp_secret_enc`), stored only after the first valid code confirms setup.
  - Setup dialog (Account → Security): step 1 shows the QR and the manual key (Geist Mono, grouped in 4s, copy button), step 2 asks for a code, step 3 shows 10 recovery codes (10 characters, `xxxxx-xxxxx`, argon2id-hashed via `@node-rs/argon2`, MIT; each single-use) with "Download .txt" and "Copy" and a checkbox "I saved these codes" before Done.
  - Challenge page `/login/2fa` (C7.2): 6-digit input (auto-advance, paste-aware, `inputmode="numeric"`), "Use a recovery code" link swaps to a text input, "Trust this browser for 30 days" checkbox (sets a `lumen_2fa_trust` cookie bound to the user and a device hash; revocable from Sessions). 5 failures / 15 min per user, then `AUTH_2FA_LOCKED`.
  - Disable requires the current password (or a passkey assertion) plus a TOTP code; regenerate recovery codes requires a code; both audited.
  - Admin reset (Phase 11 UI): `POST /instance/users/:id/reset-2fa`, audited, emails the user.
  - When 2FA is on, sessions created before enabling it are revoked except the current one, with a toast "Signed out other devices."
- **Files:** `apps/api/src/routes/auth/2fa.ts`, `apps/api/src/lib/auth/totp.ts`, `apps/api/src/lib/auth/recovery-codes.ts`, `apps/web/app/(auth)/login/2fa/page.tsx`, `apps/web/components/settings/TwoFactorSetupDialog.tsx`, `packages/db/src/schema/users.ts` (`totp_enabled_at`, `recovery_codes` table), `packages/shared/src/errors/catalog.ts` (`AUTH_2FA_INVALID`, `AUTH_2FA_LOCKED`, `AUTH_RECOVERY_CODE_USED`)
- **Done when:** Vitest covers window drift, replay of the same code within 30 s (rejected), recovery code single use; e2e: enable, sign out, sign in with code, sign in with recovery code, trusted browser skips the challenge.

### 4.7 Passkeys (WebAuthn)
- **What:** `@simplewebauthn/server` and `@simplewebauthn/browser` (MIT). Relying party id = dashboard hostname (stored in `instance_settings`, and the "Change domain" flow in Phase 11 warns that passkeys registered on the old hostname stop working). Registration from Account → Security: `POST /auth/passkeys/register/options` → browser ceremony → `POST /auth/passkeys/register/verify {name}`; store `passkeys` (`user_id`, `credential_id`, `public_key`, `counter`, `transports`, `name`, `created_at`, `last_used_at`, `backed_up`). Sign-in: "Continue with a passkey" button on `/login` (conditional UI / autofill when supported), and passkeys count as the second factor when 2FA is on (skip TOTP after a passkey assertion with user verification). List with rename and remove (typed confirm not needed: simple confirm with undo for 8 s). Counter regression → revoke the passkey and email the user (`AUTH_PASSKEY_CLONED`).
- **Files:** `apps/api/src/routes/auth/passkeys.ts`, `apps/api/src/lib/auth/webauthn.ts`, `apps/web/components/auth/PasskeyButton.tsx`, `apps/web/components/settings/PasskeysSection.tsx`, `packages/db/src/schema/passkeys.ts`
- **Done when:** Playwright with the CDP virtual authenticator registers a passkey, signs out, signs in with it, and the login audit records `method=passkey`.

### 4.8 Sessions page and login audit
- **What:** `sessions` gains `ip`, `user_agent`, `device_label` (parsed with `ua-parser-js`, MIT: "Chrome on macOS"), `last_seen_at` (updated at most once per 5 minutes), `trusted_2fa`. Account → Security → Sessions: list with "This device" pill, device label, IP, approximate location (offline GeoLite2 lookup is out of scope; show the IP only, with a country label only if the `LUMEN_GEOIP_DB` file is configured), created, last seen; actions "Sign out" per row and "Sign out all other devices" (requires password or passkey re-auth if the current session is older than 10 minutes). Login audit table under it: time, result (Signed in / Failed), method (Password, Passkey, GitHub, Recovery code), IP, device; last 50, "View all in audit log" for admins. Failed attempts also email the user after 5 failures in 15 minutes ("Someone tried to sign in to your account 5 times").
- **Files:** `packages/db/src/schema/sessions.ts`, `apps/api/src/routes/auth/sessions.ts`, `apps/api/src/lib/auth/login-audit.ts`, `apps/web/components/settings/SessionsTable.tsx`, `apps/web/components/settings/LoginAuditTable.tsx`
- **Done when:** revoking a session from another browser returns 401 on its next request within 1 s (session check is not cached longer than that); the login audit shows password, passkey and GitHub sign-ins.

### 4.9 API tokens
- **What:** Account → API tokens (user tokens) and Workspace → Tokens (workspace tokens) and Project settings → Tokens (project and environment-scoped, C7.16). Create dialog: name, owner scope (fixed by the page), environment (project page only, optional), scopes as checkboxes grouped Read (`read:projects`, `read:logs`, `read:metrics`), Deploy (`deploy`), Write (`write:variables`, `write:services`, `write:domains`), Admin (`admin:servers`, `admin:members`, only offered to admins/owners), expiry (30 / 90 / 365 days / never, default 90). The token (`lumen_` + 40 base62 chars, prefix shown in the list as `lumen_ab12…`) is shown once in a copy field with "You won't see this again." Store `sha256(token)`; requests authenticate with `Authorization: Bearer`. Token permissions = intersection of the owner's effective permissions and the token scopes, re-evaluated per request (a demoted user's token shrinks with them). List: name, prefix, scopes as chips, last used (relative), expires, Revoke (simple confirm). Expired tokens show a muted "Expired" pill and a "Recreate" action.
- **Files:** `apps/api/src/routes/tokens.ts`, `apps/api/src/middleware/auth.ts` (bearer path), `packages/shared/src/auth/scopes.ts`, `apps/web/components/settings/TokensSection.tsx`, `apps/web/components/settings/CreateTokenDialog.tsx`
- **Done when:** a token with only `read:logs` gets 403 on deploy; a workspace token created by an admin loses `admin:*` scopes' effect when that admin is demoted to member (matrix test).

### 4.10 Workspace settings (C7.20), every section
- **What:** Route `apps/web/app/(app)/w/[workspace]/settings/[section]/page.tsx` with the settings layout (sticky left section nav, content max 1200 px). Sections:
  - **General:** workspace name (autosave, "Saved" tick), slug (with the URL preview and a rename warning "Links to this workspace change"), workspace avatar (upload, 512 KB max, resized server-side to 128 px), created date, id copy field.
  - **Members & invites:** 4.5 + 4.4.
  - **Roles & permissions:** the D11 matrix as a read-only table (rows = permissions in plain words, columns = roles, ✓ in `success`, — in `text-muted`), with a sentence "Roles apply to the whole workspace. Give someone different access to one project from that project's settings."
  - **Cloud accounts:** Phase 16 placeholder card: "Connect Oracle, AWS, GCP, Hetzner or DigitalOcean to create and resize servers from Lumen." with a disabled "Connect account" button and a "Coming in a later release" caption until Phase 16 replaces it.
  - **Registry credentials:** list (registry host, username, used by N services), add dialog (registry preset: GHCR, Docker Hub, ECR, GCR / Artifact Registry, Other; username; password or token as Secret field), "Test" (attempts `GET /v2/` with basic auth from the API), remove (blocked while services use it: "3 services use this credential. Switch them first.").
  - **Notification channels:** embeds the Phase 8 channel list with a "Manage" link to the full page.
  - **Backup destinations:** embeds the Phase 9 destinations section.
  - **Usage & cost:** Phase 16 placeholder: "Set a monthly cost on each server to see estimated usage per project and service." with a link to Servers.
  - **Audit log:** 4.11.
  - **Danger zone:** "Transfer ownership" (owner; opens the member picker + typed confirm), "Delete workspace" (owner; typed confirm of the slug; lists consequences: N projects, N services, N servers disconnected, N members removed; servers' agents are told to remove all containers first; the workspace row is soft-deleted for 7 days with instance-admin restore).
- **Files:** `apps/web/app/(app)/w/[workspace]/settings/layout.tsx`, `general/page.tsx`, `members/page.tsx`, `roles/page.tsx`, `cloud/page.tsx`, `registries/page.tsx`, `notifications/page.tsx`, `backups/page.tsx`, `usage/page.tsx`, `audit/page.tsx`, `danger/page.tsx`, `apps/api/src/routes/workspaces.ts`, `apps/api/src/routes/registry-credentials.ts`
- **Done when:** every section renders with real data, passes C14 at three widths and two themes, and the Danger zone actions are blocked for non-owners with the permission-denied card.

### 4.11 Audit log: coverage and UI
- **What:** Complete the writer: every mutating route calls `audit(ctx, action, target, metadata)` through the RBAC middleware's post-hook (so a route cannot forget), with `actor` = user or token (`token:<prefix>`), `ip`, `user_agent`. Action names are dot-namespaced (`project.created`, `service.deleted`, `variable.updated` with keys only, never values, `deployment.rollback`, `member.role_changed`, `token.created`, `session.revoked`, `auth.login.failed`, `setup.verify`). UI: table (time with tabular numerals and a tooltip with the full ISO timestamp, actor with avatar, action in plain words from a dictionary "Rolled back deployment", target link, IP), filters (actor combobox, action multi-select grouped by area, date range with presets Today / 7 days / 30 days, target search), infinite scroll (cursor pagination, 50 per page), "Export CSV" of the current filter (max 10 000 rows, streamed). Retention: 365 days default, instance setting.
- **Files:** `apps/api/src/middleware/audit.ts`, `packages/shared/src/audit/actions.ts` (action dictionary with plain-language labels), `apps/api/src/routes/audit.ts`, `apps/web/app/(app)/w/[workspace]/settings/audit/page.tsx`, `apps/web/components/settings/AuditLogTable.tsx`
- **Done when:** the matrix test asserts that every allowed mutating call produced exactly one audit row with the expected action; the CSV export of 10 000 rows streams in under 3 s locally.

### 4.12 Account settings (C7.21), every section
- **What:** Route `apps/web/app/(app)/account/[section]/page.tsx`:
  - **Profile:** avatar (upload or GitHub avatar), name, email (change requires verification of the new address, old address gets a notice), delete account (typed confirm of the email; blocked while the user is the sole owner of any workspace: "Transfer ownership of Acme first.").
  - **Security:** change password (current + new with strength meter; revokes other sessions), 2FA (4.6), passkeys (4.7), sessions and login audit (4.8).
  - **API tokens:** 4.9 user tokens.
  - **Preferences:** Theme (segmented System / Dark / Light, applied instantly, stored on the user and mirrored to `localStorage` for first paint), "Apply changes immediately" switch (off by default, explanation "Skip the staged changes bar and deploy each edit right away."), Density (Comfortable / Compact: compact sets the base row height 32 → 28 and table cell padding 12 → 8), Reduced motion (System / On / Off), Default landing page (Home / Projects / Last opened project).
  - **Notifications:** personal email toggles per event (deploy failed, crash, server offline, backup failed, invite, security), digest option (Immediately / Daily summary at 09:00 local).
  - **Connected accounts:** GitHub (connected as @login, "Disconnect" blocked if it is the only sign-in method and no password is set: "Set a password first.").
- **Files:** `apps/web/app/(app)/account/layout.tsx`, `profile/page.tsx`, `security/page.tsx`, `tokens/page.tsx`, `preferences/page.tsx`, `notifications/page.tsx`, `connected/page.tsx`, `apps/api/src/routes/me.ts`, `apps/api/src/routes/auth/password.ts`, `apps/api/src/routes/auth/email-change.ts`
- **Done when:** every preference persists across devices (server) and applies without reload; email change round-trips through MailHog; delete account is blocked for a sole owner.

### 4.13 Permission-denied card and 403 handling (C7.26)
- **What:** `PermissionDenied` component: `lock` icon 24 px, title "You don't have access to this", sentence "Your role is Viewer. Deploying needs Member or higher." (role and needed role from the 403 body `{code: 'FORBIDDEN', needed: 'member', current: 'viewer', workspace_admins: [...]}`), primary "Ask an admin" (opens a prefilled mailto to the first two admins, or copies a message when no SMTP), secondary "Back". Route-level 403 renders the card in the content area; action-level 403 (a button the UI didn't hide) shows a toast with the same sentence. Buttons the role cannot use are rendered disabled with a tooltip "Needs Member or higher" instead of hidden, so the UI teaches the model; destructive owner-only actions are hidden from viewers entirely.
- **Files:** `packages/ui/src/components/PermissionDenied.tsx`, `apps/web/app/(app)/error.tsx` (403 branch), `apps/web/lib/api/errors.ts`, `apps/api/src/middleware/rbac.ts` (403 body shape)
- **Done when:** a viewer opening `/w/acme/settings/audit` sees the card with "Admin or higher"; axe passes; screenshots reviewed.

### 4.14 Web security baseline verification (B12)
- **What:** A checklist executed and recorded in `docs/security/web-baseline.md`: session cookie `lumen_session` httpOnly, Secure, SameSite=Lax, 30-day rolling with absolute 90-day cap, rotated on login, on privilege change and on 2FA enable; CSRF: Origin/Sec-Fetch-Site check plus a double-submit `X-CSRF-Token` for cookie-authenticated mutations (bearer tokens exempt); rate limits: login 10 / 15 min per IP and 5 / 15 min per email, signup 5 / hour per IP, 2FA 5 / 15 min per user, invite accept 10 / hour per IP, password reset 3 / hour per email; password hashing argon2id (m=64 MiB, t=3, p=1); security headers (CSP with nonces, `frame-ancestors 'none'`, HSTS 1 year with preload after the domain step, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal); user enumeration resistant messages on login and reset ("If that email has an account, we sent a link."); session fixation test; open redirect test on `?next=`.
- **Files:** `apps/api/src/middleware/security-headers.ts`, `apps/api/src/middleware/csrf.ts`, `apps/api/src/middleware/rate-limit.ts` (Postgres-backed counters, no Redis, per SPEC tech stack), `apps/api/test/security/*.test.ts`, `docs/security/web-baseline.md`
- **Done when:** every checklist item has an automated test or a recorded manual verification with the command and output.

## 5. Detail checklist

### Typography
- Settings page title: page title 24 / 600, line-height 1.25, −0.01em; section nav items label 13 / 500 (active `text`, inactive `text-secondary`).
- Section headings inside a page: section title 16 / 600 with a caption 12 / 400 `text-secondary` sentence under it, 4 px gap.
- Card titles (each settings card): card title 14 / 600; card description body 14 / 400 `text-secondary`.
- Table header: label 12 / 500 uppercase, tracking 0.04em, `text-secondary`; cells table cell 13 / 400; timestamps and IPs tabular numerals; token prefixes, recovery codes, manual TOTP key, IPs in Geist Mono 13.
- Role chips: 12 / 500 with 2 px vertical / 8 px horizontal padding, radius full; Owner chip uses `accent-subtle` background and `accent` text (the one accent chip), Admin `surface-hover`, Member and Viewer `surface-hover` with `text-secondary`.
- 2FA code input: Geist Mono 20 / 500 in six 40 × 48 px boxes with 8 px gaps, letter-spacing 0.
- Recovery codes: Geist Mono 14 / 400 in a two-column grid, 8 px row gap, tabular.
- Danger zone: card title 14 / 600 in `danger`; body stays `text-secondary`, never red paragraphs.
- Permission-denied card: card title 16 / 600, body 14 / 400.
- Audit "action" text: body 14 / 400 with the target as a link in `text` weight 500 (not accent) so the table stays calm.

### Spacing & layout
- Settings layout: section nav 220 px sticky (top offset 48 px top bar + 16 px), content column max 1200 px, 32 px between cards, card padding 20 px, radius 10, `surface` + `border`.
- Form rows: label above input, 8 px gap; two-column fields (name + email) at ≥ 1024 with 16 px gap; helper text 6 px under.
- Tables: row height 44 px (40 in compact density), first column padding-left 16 px, action menu column 48 px wide, right-aligned.
- Dialogs: 480 px wide (create token, invite), 560 px (2FA setup, transfer ownership), padding 24, radius 14, `surface-raised`, title 20 / 600, footer buttons right-aligned with 8 px gap.
- Role matrix: first column 280 px, role columns equal, cell height 36 px, ✓ centered.
- Danger zone: cards with a `danger` 1 px left border (3 px wide accent bar) and the action button `danger` variant right-aligned.
- Sessions list: 56 px rows with a 32 px device icon column.
- Everything on the 4 px grid.

### Color & theme
- One accent element per page: the page's primary button ("Invite member", "Create token", "Add credential"). Save actions in autosave sections show a `success` tick, not a button.
- Role chips as above; 2FA badge `success` icon + `text-secondary` text.
- Audit result colors: Failed sign-in row shows a `danger` dot + text "Failed"; success rows no color.
- Permission-denied card: `surface` with `border`, lock icon `text-secondary`; no red, since it is not an error the user caused.
- Danger zone: `danger` only on the left bar and the button; hover `danger` at 90 % lightness mix.
- Contrast: every chip text on its chip background ≥ 4.5:1 in both themes (verify the Owner chip: `accent` #14B8A6 on `accent-subtle` over `surface` in dark; in light use `accent` #0D9488 text).

### Motion
- Section nav active indicator: 2 px `accent` bar slides between items, 200 ms `cubic-bezier(.2,.8,.2,1)`; reduced motion: jumps.
- Dialogs: fade + scale 0.98 → 1, 200 ms; overlay fade 120 ms; reduced motion: fade only.
- Autosave tick: `check` fades in 120 ms, holds 1.5 s, fades out 200 ms.
- Copy feedback: icon swap with a 120 ms scale pop; reduced motion: swap only.
- 2FA code boxes: filled box border turns `border-strong` in 120 ms; on error all six shake ±4 px over 240 ms (disabled under reduced motion, replaced by the border turning `danger`).
- Token reveal: the copy field appears with a 200 ms slide-down of 8 px; the "You won't see this again" caption is static.
- Table row removal (revoke, remove member): row collapses height over 200 ms after the toast's undo window (8 s) or immediately if there is no undo; reduced motion: instant.
- Toasts (C8.4): bottom-right, slide-in 200 ms, stack up to 3, undo for reversible actions (remove passkey, revoke invite) with 8 s timers.

### Iconography & symbols
- Section nav (Lucide 16 px): General `settings-2`, Members `users`, Roles `shield`, Cloud accounts `cloud`, Registry credentials `package`, Notification channels `bell`, Backup destinations `archive`, Usage & cost `receipt`, Audit log `scroll-text`, Danger zone `alert-triangle` (in `danger` only when active). Account: Profile `user`, Security `lock`, API tokens `key-round`, Preferences `sliders-horizontal`, Notifications `bell`, Connected accounts `link`.
- Role matrix: ✓ as `check` 16 px in `success`; — as an en dash in `text-muted` (never an ✕, since the row is not an error).
- 2FA on: `shield-check` 14 px `success`; 2FA off in the members table: nothing (absence, not a warning).
- Sessions: device icons `monitor`, `smartphone`, `tablet` 20 px; "This device" pill uses `accent-subtle`.
- Passkeys: `fingerprint` 16 px in the list; platform vs roaming shown as text ("Saved in iCloud Keychain" when `backed_up`, else "Security key").
- Tokens: `key-round` 16 px; expired tokens `clock` 14 px `text-muted`.
- Invites: `mail` 16 px for email invites, `link` 16 px for link invites.
- Audit actions: a 16 px icon per area (deploy `rocket`, variables `braces`, members `users`, auth `lock`, servers `server`, settings `settings-2`).
- Permission-denied: `lock` 24 px.
- Danger zone: `alert-triangle` 16 px `danger` at the card top-left.

### Copy
- Invite dialog: title "Invite to Acme", fields "Email", "Role", helper under role "Members can deploy and edit variables. Viewers can look but not change anything.", buttons "Send invite" / "Create link".
- Link invite result: "Anyone with this link can join as Member. It expires in 7 days." with the copy field.
- Accept page: "Shagee invited you to join Acme as Member." button "Join Acme"; signed-out: "Sign in or create an account to join."
- Email mismatch: "This invite was sent to a@b.com. You're signed in as c@d.com."
- Invalid invite: "This invite link isn't valid anymore. Ask for a new one."
- Remove member confirm: "Remove Priya from Acme? They lose access to every project right away. Their deploys and changes stay." Typed: "Type priya@acme.com to confirm."
- Transfer ownership: "Transfer Acme to Priya? You'll become an admin. Only Priya can transfer it back." Typed: the workspace slug.
- 2FA setup: "Scan this with your authenticator app" · "Can't scan? Enter this key instead." · "Enter the 6-digit code from the app" · "Save your recovery codes" · "Each code works once. Keep them somewhere safe, like a password manager." · checkbox "I saved these codes" · Done.
- 2FA challenge: title "Enter your code", body "Open your authenticator app for Acme Lumen." link "Use a recovery code", checkbox "Trust this browser for 30 days". Wrong: "That code isn't right. Codes change every 30 seconds." Locked: "Too many attempts. Try again in 15 minutes."
- Passkeys: "Add a passkey" · "Passkeys sign you in with your fingerprint, face or device PIN. No password needed." · remove toast "Passkey removed" with Undo.
- Sessions: "Sign out all other devices" · confirm "This signs out 3 other devices. You stay signed in here."
- Token created: "Copy your token now. You won't see it again."
- Token scopes helper: "A token can never do more than you can."
- Registry credential in use: "3 services use this credential. Switch them first."
- Permission denied: "You don't have access to this" · "Your role is Viewer. Deploying needs Member or higher." · buttons "Ask an admin", "Back".
- Delete workspace: "Delete Acme? This removes 4 projects, 11 services and disconnects 2 servers. Apps on those servers stop. 5 members lose access." Typed: the slug. Button "Delete workspace".
- Leave workspace: "Leave Acme? You'll need a new invite to come back."
- Failed-login email subject: "5 failed sign-in attempts on your Lumen account".
- No exclamation marks; buttons are verbs; jargon ("TOTP", "WebAuthn", "argon2") only in tooltips.

### States (empty · loading · error · success · partial)
- Members: never empty (the owner exists); one-member state shows an inline invitation card "It's just you so far. Invite a teammate." with the primary action.
- Pending invites empty: "No pending invites." caption only, no illustration.
- Tokens empty: `key-round` icon, "No tokens yet", "Create a token to use the CLI, the API or the MCP server.", button "Create token".
- Passkeys empty: "No passkeys yet", sentence, button "Add a passkey".
- Sessions: always at least the current one.
- Audit log empty (filters): "Nothing matches these filters." with "Clear filters"; truly empty (new workspace): "Actions in this workspace show up here."
- Loading: table skeletons with the exact column widths and row height; dialogs never skeleton (they open with data or after a button spinner).
- Errors: every API error renders the catalog card inline in dialogs and as a toast for row actions; network loss shows the global "Reconnecting…" bar (C7.26) and disables mutating buttons with a tooltip.
- Partial: SMTP not configured → invite dialog shows "Email isn't set up on this instance, so we'll give you a link to share." and switches to link mode; passkeys unsupported browser → the button is hidden and a caption says "Passkeys need a browser that supports them."
- Success: autosave tick, toasts with undo where reversible, dialogs close on success.

### Keyboard & accessibility
- Settings section nav: `<nav aria-label="Workspace settings">`, arrow keys move, Enter activates; the active section has `aria-current="page"`.
- Every table: header buttons with `aria-sort`; row action menu opens with Enter or Space, arrow keys navigate, Esc closes and returns focus to the trigger.
- Dialogs: focus trapped, initial focus on the first input, Esc closes (except while a request is in flight), `aria-labelledby` the title, `aria-describedby` the body.
- Typed confirmations: the confirm button is `aria-disabled` with the tooltip "Type the name to confirm" until matched.
- 2FA code boxes: one `<input>` visually split (not six inputs) so screen readers see one field labeled "6-digit code"; paste fills it.
- Recovery codes have a "Copy all" button and are in a `<pre>` for reliable screen-reader reading.
- Role matrix table has proper `<th scope="col">` and `<th scope="row">`; ✓ cells contain visually hidden "Allowed" / "Not allowed".
- Role chips are text, not color-only; status of invites ("Expires in 2 days", "Expired") is text.
- Live regions: "Invite sent", "Token copied", "Session signed out".
- Contrast and focus rings per C4; axe clean on every page and dialog in both themes; a manual keyboard pass creates an invite, changes a role, creates a token, enables 2FA and revokes a session without a mouse.

### Responsive
- ≥ 1280: full settings layout.
- 1024–1279: section nav 180 px; two-column form rows remain.
- 768–1023: section nav becomes a horizontal scrollable tab row under the page title; form rows single-column; tables keep horizontal scroll with the first column sticky.
- < 768: tables become card lists (member card: avatar, name, email, role chip, menu; token card: name, prefix, scopes chips, expiry); dialogs become bottom sheets (C5 Sheet) with full-width stacked buttons; 2FA code boxes shrink to 36 × 44 px; the role matrix scrolls horizontally with the permission column sticky; Danger zone buttons full width.
- No hover-only affordances: row menus are always visible as a `more-horizontal` button on touch devices.

### Performance
- Members and audit pages use cursor pagination and TanStack Query with `keepPreviousData`; the audit table is virtualized past 200 rows.
- Effective-role resolution is one SQL query with a lateral join (workspace role + override), cached per request; never N+1 across project lists.
- Rate-limit counters live in a Postgres unlogged table with a 15-minute bucket key and a periodic cleanup job; the check is a single upsert.
- Session validation reads a 60 s in-process cache keyed by session id and invalidated through LISTEN/NOTIFY on revoke, so revocation lands within 1 s while normal requests avoid a DB hit.
- Settings routes prefetch on rail hover; route transition under 150 ms perceived with skeletons matching the tables.

### Security
- All RBAC in the API; the web app only mirrors it for affordances.
- Invite tokens hashed at rest, single or bounded use, 7-day default expiry, revocable; accepting requires a session, so a leaked link alone cannot create an account into the workspace without sign-up (which registration mode may block).
- TOTP secret encrypted with the B7 envelope; recovery codes argon2id-hashed; replay of a code within its window rejected; lockout after 5 failures.
- WebAuthn: origin and RP id checks, counter regression revokes the credential and alerts the user, `userVerification: 'preferred'` for sign-in and `'required'` when used as the second factor.
- Sessions rotate on login, privilege change and 2FA enable; revocation propagates within 1 s; the trusted-browser cookie is bound to user id + device hash and revocable.
- Tokens: shown once, hashed at rest, permission = intersection with the owner's current permissions, `last_used_at` updated at most once per minute; token prefix in audit rows, never the token.
- Audit rows are append-only (no UPDATE/DELETE grants for the app role; retention pruning runs as a separate DB role), so a compromised API cannot rewrite history.
- Sealed variables: no route, role or token can return the value (matrix asserts it).
- CSRF, security headers, rate limits and enumeration-safe messages per 4.14.
- Workspace deletion is soft for 7 days with instance-admin restore, so a compromised owner session cannot destroy data instantly and silently; the agents remove containers only after the grace period unless the owner confirms "Stop apps now".

### Data integrity & idempotency
- Ownership transfer, role changes and member removal run in single transactions with `SELECT … FOR UPDATE` on the membership rows; exactly one owner is enforced by a partial unique index on `(workspace_id) WHERE role = 'owner'`.
- Invite acceptance is idempotent: accepting an already-used single-use invite by the same user returns the existing membership; by another user returns `INVITE_INVALID`.
- Token creation returns the plaintext once and never stores it; a failed response after insert leaves an unusable token the user can revoke.
- Audit writes happen in the same transaction as the mutation; if the audit insert fails, the mutation rolls back.
- Preference writes are last-write-wins with an `updated_at` check to avoid clobbering from two tabs (the older write is rejected with a toast "Refreshed with your latest settings").

## 6. Acceptance criteria
- [ ] SPEC D11: Workspaces, invites, roles per the matrix; 2FA (TOTP), passkeys, session management, audit log, per-project access overrides.
- [ ] SPEC Phase 15 AC: the permission test matrix covers every route (enumerated from the OpenAPI document) and passes for viewer, member, admin, owner, outsider and instance admin.
- [ ] Sealed variable values are unreachable by any role or token; the matrix asserts it.
- [ ] Per-project overrides raise or lower access exactly as specified, and `none` yields 404.
- [ ] Email and link invites work end to end, including expiry, revoke, max uses and email mismatch; a revoked invite shows the catalog error.
- [ ] Ownership transfer keeps exactly one owner and is audited with both users.
- [ ] 2FA: setup, challenge, recovery codes (single use), trusted browser, lockout, disable, admin reset all work and are audited.
- [ ] Passkeys: register, sign in, use as second factor, rename, remove; counter regression revokes and alerts.
- [ ] Sessions page lists devices; revoking a session is effective within 1 s; "Sign out all other devices" re-authenticates when the session is older than 10 minutes.
- [ ] Login audit shows password, passkey, GitHub and recovery-code sign-ins and failed attempts; 5 failures in 15 minutes email the user.
- [ ] Every mutating route writes exactly one audit row in the same transaction; the audit UI filters by actor, action, date and target and exports CSV.
- [ ] API tokens: scopes, expiry, single reveal, last used, revoke; token permissions shrink with the owner's role.
- [ ] Workspace settings: all ten sections exist and pass C14 at 390 / 1024 / 1440 × dark / light; Cloud accounts and Usage & cost show the specified placeholders.
- [ ] Account settings: all six sections exist; preferences apply instantly and persist server-side; email change verifies the new address.
- [ ] Permission-denied card names the current and needed role and offers "Ask an admin".
- [ ] Web security baseline (4.14) verified item by item with tests or recorded evidence; axe clean on every page and dialog.

## 7. Test plan
- **Unit:** permissions table vs D11 literal; effective-role resolution with overrides; invite token hashing and expiry; TOTP verification (drift window, replay); recovery code hashing and single use; WebAuthn verification helpers with fixture credentials; token scope intersection; rate limiter buckets; audit action dictionary completeness (every action used in routes has a label).
- **Integration:** the full route × role matrix against testcontainers Postgres; audit row per mutation; session revocation propagation through LISTEN/NOTIFY; CSRF rejection of cross-origin cookie requests; enumeration-safe responses; email flows through MailHog.
- **E2E (Playwright):** invite by email → sign-up → join; link invite with max uses; change role and observe UI affordances; 2FA setup → challenge → recovery code → trusted browser; passkey with the CDP virtual authenticator; create token → use with `curl` in the test → revoke; sessions revoke from a second context; audit filters and CSV download; permission-denied card for a viewer; delete workspace typed confirm.
- **Visual regression:** every settings section and dialog, 3 widths × 2 themes, states listed in §5.
- **Accessibility (axe + keyboard pass):** axe on every page and dialog; keyboard-only script per §5.
- **Manual / on a real VM:** passkey registration on macOS Safari, Windows Hello and Android Chrome against the real dashboard hostname; 2FA with Google Authenticator and 1Password; HSTS and CSP headers observed in the browser.

## 8. Evidence required to close
- Matrix test output listing every route with the per-role result, and the CI lint output showing zero unannotated routes.
- Screenshots of every settings section and dialog at 390 / 1024 / 1440 × dark / light, with the C14 critique notes.
- Playwright report for the e2e suites above; axe reports.
- `docs/security/web-baseline.md` filled with the command and output for each item (curl showing headers, rate-limit 429 transcript, CSRF rejection).
- Screen recordings or screenshots of passkey registration on the three platforms.
- Audit CSV sample and the timing for a 10 000-row export.

## 9. Review
- SPEC H1 with Fable 5.1 on the RBAC middleware, effective-role resolution, token auth path, invite and 2FA code; probe: any route reachable without `requirePermission`, scope resolution for nested resources (deployment → service → project → workspace), token scope escalation through a stale owner role, audit rows missing on error paths, transaction boundaries on ownership transfer.
- SPEC H2 on the settings screenshots; probe: does a viewer understand why a button is disabled, is the Danger zone calm, do role chips read at a glance, is the 2FA setup obvious to someone who has never used an authenticator app.
- SPEC H3 subset: low-privilege member attacking RBAC (IDOR on ids across workspaces, override bypass through the CLI), session theft and fixation, CSRF, invite link leakage, WebAuthn origin confusion after a domain change, token replay after revoke, audit tampering.

## 10. Risks & open questions
- **Risk:** Routes added in later phases forget the permission annotation. → **Mitigation:** the CI lint (4.1) and the matrix's "every OpenAPI route must be listed" assertion fail the build.
- **Risk:** Passkeys break when the dashboard hostname changes (RP id mismatch). → **Mitigation:** Phase 11's Change domain flow warns and lists affected users; users keep password/2FA as fallback; document in the guide.
- **Risk:** Postgres-backed rate limiting under a login flood adds write load. → **Mitigation:** unlogged table, single upsert, and a per-IP in-process pre-filter; k6 login flood in Phase 18 verifies p95 stays under budget.
- **Risk:** Soft-deleted workspaces keep servers' containers running for 7 days, surprising the owner who wanted them gone. → **Mitigation:** the delete dialog offers "Stop apps now" as a checkbox (default off) with the consequence spelled out.
- **Open question:** Should viewers see variable names at all (currently yes, masked values)? Default: yes, names only, since debugging needs them; the owner may tighten this later with a workspace setting.
- **Open question:** Trusted-browser duration 30 days versus 14. Default 30 unless the user objects.
- **Open question:** GeoIP for sessions requires a database download and license acceptance; default: off, IP only, with an instance setting to point at a MaxMind file.

## 11. Exit checklist
- [ ] Every acceptance criterion in §6 verified with evidence
- [ ] `docs/PROGRESS.md` updated (done / next / known gaps)
- [ ] `docs/DECISIONS.md` entries added: permission set and D11 mapping, override semantics, invite token scheme, `otpauth` + `qrcode` + `@node-rs/argon2`, `@simplewebauthn`, `ua-parser-js`, Postgres rate limiter, session cache + NOTIFY invalidation, soft-delete grace period, token format and scope intersection
- [ ] `docs/UI_DECISIONS.md` updated with settings screenshots and the C14 notes
- [ ] Cross-model review done and findings fixed; `docs/security/web-baseline.md` complete
- [ ] Committed and pushed

## 12. Session prompt (paste to start the phase)
```xml
<task>Phase 15 — Teams and security features</task>
<context>
Read CLAUDE.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/phases/PHASE-15-teams-security.md,
and these SPEC sections: D11, B6 (users, sessions, passkeys, workspace_members, invites, api_tokens, audit_log),
B12, C7.2, C7.16, C7.20, C7.21, C7.26, C8.4–C8.5, C9, C14, J1 (workspaces, tokens, audit), Part H1/H2/H3.
</context>
<goal>A workspace owner invites a teammate, the teammate signs in with a passkey or password plus 2FA, sees exactly what their role allows on every route and page, and every action lands in a filterable audit log.</goal>
<scope>
- Permission set + D11 role mapping enforced by requirePermission on every route; CI lint for unannotated routes; the per-route × per-role matrix test enumerated from OpenAPI
- Per-project access overrides (raise / lower / none) with the project Members page
- Invites by email and link (hashed tokens, expiry, max uses, resend, revoke), accept-invite page, Members page with role change, remove, transfer ownership, leave
- 2FA TOTP (setup with QR + manual key, recovery codes, challenge page, trusted browser, lockout, disable, admin reset), passkeys (register, sign in, second factor, rename, remove, counter regression), sessions page with revoke, login audit with alert email
- API tokens (user / workspace / project / environment scope, scopes, expiry, single reveal, last used, revoke, permission intersection)
- Audit log coverage through the RBAC post-hook, plain-language action dictionary, filterable table with CSV export, append-only storage
- Workspace settings: all C7.20 sections (with the Phase 16 placeholders for Cloud accounts and Usage & cost); Account settings: all C7.21 sections
- Permission-denied card for every 403; web security baseline verification recorded in docs/security/web-baseline.md
</scope>
<out_of_scope>
- SSO/OIDC (later), cloud accounts and usage & cost content (Phase 16), notification channel and backup destination forms (Phases 8, 9), instance admin pages (Phase 11), MCP token consumption (Phase 14)
</out_of_scope>
<acceptance_criteria>
Every item in docs/phases/PHASE-15-teams-security.md §6, including: the matrix test lists every OpenAPI route and passes for viewer, member, admin, owner, outsider and instance admin; sealed values unreachable by any identity; overrides behave as specified; one owner per workspace enforced transactionally; 2FA, passkeys, sessions and login audit complete and audited; session revocation effective within 1 s; every mutating route writes one audit row in the same transaction; all settings sections pass C14 at 390/1024/1440 × dark/light; web security baseline verified item by item.
</acceptance_criteria>
<process>
1. Write a plan: files to create/change, schema changes (project_access_overrides, recovery_codes, passkeys, sessions columns, rate-limit table), the permission set, risks, test plan, open questions. STOP and wait for approval.
2. Implement in the session order from the phase doc header; run Vitest, the matrix test and Playwright after each step.
3. For UI: screenshots at 390/1024/1440 × dark/light × every section, dialog and state in §5; critique against SPEC C14 and §5; fix before reporting.
4. Report: what works (with the matrix output, screenshots, baseline doc), what doesn't, deviations from spec, next steps.
5. Update docs/PROGRESS.md, docs/DECISIONS.md and docs/UI_DECISIONS.md.
</process>
```
