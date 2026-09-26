# Build phases

Lumen is built in 19 phases, in the order below. Each phase has one document that
follows [`_TEMPLATE.md`](_TEMPLATE.md): goal, why, scope, work breakdown, detail
checklist, acceptance criteria, test plan, evidence, review, risks, exit checklist,
and a ready-to-paste session prompt. The detail checklist (§5) is binding: type,
spacing, motion, icons, theme, copy, states, keyboard and responsive behavior are
acceptance criteria, not polish to do later.

## Order

| # | Phase | File | Owner model | Depends on | Status |
|---|---|---|---|---|---|
| 0 | Foundations | [PHASE-00-foundations.md](PHASE-00-foundations.md) | Opus 5.5 | — | Not started |
| 1 | Design direction and design system | [PHASE-01-design-system.md](PHASE-01-design-system.md) | Opus 5.5 → Fable 5.1 review | 0 | Not started |
| 2 | Agent core and server join | [PHASE-02-agent-core.md](PHASE-02-agent-core.md) | Fable 5.1 | 0 | Not started |
| 3 | Deploy engine on the agent | [PHASE-03-deploy-engine.md](PHASE-03-deploy-engine.md) | Fable 5.1 | 2 | Not started |
| 4 | Control plane core | [PHASE-04-control-plane.md](PHASE-04-control-plane.md) | Fable 5.1 (schema, security) → Opus 5.5 (CRUD) | 2, 3 | Not started |
| 5 | App shell, projects, canvas, inspector | [PHASE-05-shell-canvas-inspector.md](PHASE-05-shell-canvas-inspector.md) | Opus 5.5 | 1, 4 | Not started |
| 6 | GitHub integration | [PHASE-06-github.md](PHASE-06-github.md) | Opus 5.5 | 5 | Not started |
| 7 | Public networking | [PHASE-07-public-networking.md](PHASE-07-public-networking.md) | Opus 5.5 → Fable 5.1 review | 5 | Not started |
| 8 | Observability | [PHASE-08-observability.md](PHASE-08-observability.md) | Opus 5.5 | 5, 7 | Not started |
| 9 | Databases, volumes, backups | [PHASE-09-databases-volumes-backups.md](PHASE-09-databases-volumes-backups.md) | Fable 5.1 (backup/restore) → Opus 5.5 (UI) | 5 | Not started |
| 10 | Environments, staged changes, config as code | [PHASE-10-environments-config-as-code.md](PHASE-10-environments-config-as-code.md) | Opus 5.5 | 6 | Not started |
| 11 | Self-host installer and setup wizard | [PHASE-11-installer-setup-wizard.md](PHASE-11-installer-setup-wizard.md) | Fable 5.1 (installer) → Opus 5.5 (wizard) | 5, 7 | Not started |
| 12 | Multi-server and private networking | [PHASE-12-multi-server-mesh.md](PHASE-12-multi-server-mesh.md) | Fable 5.1 | 3, 4 | Not started |
| 13 | Templates | [PHASE-13-templates.md](PHASE-13-templates.md) | Opus 5.5 (parallelizable) | 9 | Not started |
| 14 | CLI, API, MCP, terminal | [PHASE-14-cli-api-mcp-terminal.md](PHASE-14-cli-api-mcp-terminal.md) | Opus 5.5 | 5, 9 | Not started |
| 15 | Teams and security | [PHASE-15-teams-security.md](PHASE-15-teams-security.md) | Opus 5.5 → Fable 5.1 audit | 5 | Not started |
| 16 | Cron, sleeping, cost, cloud integrations | [PHASE-16-cron-sleep-cost-cloud.md](PHASE-16-cron-sleep-cost-cloud.md) | Fable 5.1 (sleep/wake) → Opus 5.5 | 7, 8 | Not started |
| 17 | HA Postgres | [PHASE-17-ha-postgres.md](PHASE-17-ha-postgres.md) | Fable 5.1 | 9, 12 | Not started |
| 18 | Hardening and launch | [PHASE-18-hardening-launch.md](PHASE-18-hardening-launch.md) | Fable 5.1 (audit) → Opus 5.5 (fixes, docs) | all | Not started |

Status values: Not started · In progress · Blocked · Done. Update the phase file's
header table and this row together.

## Dependency graph

```
0 → 1
0 → 2 → 3 → 4 → 5
4 → 12
5 → 6 → 10
5 → 7 → 8 → 16
5 → 7 → 11
5 → 9 → 13
5 → 9 → 14
5 → 15
9 + 12 → 17
every phase → 18
```

Phases that can run in parallel once 5 is done: 6, 7, 9, 15. Phase 13 splits into
parallel sessions by template group. Phase 12 can start as soon as 4 is done.

## Parity map

Railway is the feature and UX parity target. Where each feature lands:

| Feature | Phase |
|---|---|
| Design tokens, typography, motion, icons, component gallery | 1 |
| One-command server join with live checklist and port fixes | 2 |
| Zero-config builds, zero-downtime deploys, crash handling, port detection | 3 |
| Auth, workspaces, projects, environments, services, variables, references, RBAC, realtime | 4 |
| App shell, project canvas, service inspector, deployments, variables, logs, settings, ⌘K, staged changes | 5 |
| GitHub App, push-to-deploy, watch paths, wait for CI, deploy a commit | 6 |
| Generated and custom domains, HTTPS, TCP proxy, HTTP logs | 7 |
| Metrics, log explorer with filters, observability dashboard, notifications, webhooks | 8 |
| One-click databases, data browser, query console, volumes, backups and restore | 9 |
| Environments, PR previews, compare and sync, lumen.toml, .env import, compose import | 10 |
| One-command self-host install, setup wizard, updates, instance admin | 11 |
| Private networking across servers, replicas, placement, load balancing | 12 |
| Template marketplace and every built-in template | 13 |
| CLI, public API with tokens, MCP server, web terminal | 14 |
| Invites, roles, 2FA, passkeys, sessions, audit log, account settings | 15 |
| Cron jobs, app sleeping, usage and cost, cloud provisioning | 16 |
| HA Postgres | 17 |
| Security audit, performance budgets, chaos tests, docs site, release pipeline | 18 |

## Running a phase

1. Open a fresh session. Paste the phase file's §12 session prompt.
2. The model reads `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, the phase
   file and the referenced SPEC sections, writes a plan, and stops.
3. Read the plan. Push back. Approve.
4. The model implements in small steps, runs code and tests, takes screenshots for
   UI work (390 / 1024 / 1440 × dark / light × key states), critiques them against
   SPEC C14, fixes, and reports with evidence.
5. Switch to the other model and run the matching review prompt from SPEC Part H.
6. Fix findings. Update `docs/PROGRESS.md`, `docs/DECISIONS.md` and, for UI work,
   `docs/UI_DECISIONS.md`. Commit and push.

Evidence for each phase goes in `docs/evidence/phase-NN/` (screenshots, test output,
timings). A phase is Done only when every §6 acceptance criterion has evidence and
the §11 exit checklist is complete.
