# Lumen

Lumen is a self-hosted deployment platform. It deploys apps, databases and templates
onto VMs you already own (Oracle, AWS, GCP, Azure, Hetzner, DigitalOcean, a home
server) through a dashboard simple enough that a beginner goes from a fresh VM to
an app live on HTTPS in under ten minutes.

Feature and UX parity target: Railway. Visual identity: Lumen's own.

## Status

Planning complete, implementation not started. The build is split into 19 phases.
Start with [docs/phases/README.md](docs/phases/README.md).

## Repository

| Path | Contents |
|---|---|
| `CLAUDE.md` | Permanent project context for the models building Lumen |
| `docs/SPEC.md` | The complete build spec: the single source of truth |
| `docs/phases/` | One detailed document per build phase, plus the template and index |
| `docs/PROGRESS.md` | What is done, what is next, known gaps |
| `docs/DECISIONS.md` | Architecture and tooling decisions, one entry each |
| `docs/UI_DECISIONS.md` | Design decisions with screenshots |

The code layout (`apps/`, `packages/`, `deploy/`, `e2e/`) is created in Phase 0.

## Working on a phase

1. Start a fresh session and paste the session prompt from the phase file (section 12).
2. Review the plan the model writes, then approve.
3. The model implements, runs tests, takes screenshots, and reports with evidence.
4. The other model reviews with the matching prompt from `docs/SPEC.md` Part H.
5. Fix findings, update the docs, commit and push.
