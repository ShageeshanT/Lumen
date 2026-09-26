# Lumen

Lumen is a self-hosted deployment platform for servers you already own. Connect a
VM from any cloud, push to GitHub, and get a live app on HTTPS with databases,
variables, logs, metrics, domains, environments and previews, all from one
dashboard.

Feature and UX parity target: Railway. Visual identity: Lumen's own.

## Requirements

Node 24, pnpm 11, Go 1.26, Docker, and buf (`go install github.com/bufbuild/buf/cmd/buf@latest`).

## Quick start

```sh
pnpm install
pnpm dev:infra   # starts Postgres 16 in Docker and waits until it is healthy
pnpm dev         # web on :3000, api on :4000
```

Open http://localhost:3000. The page shows "API: ok · db: ok" when everything is
wired. If another Postgres already uses port 5432, copy `.env.example` to `.env`
and set `PG_PORT` and `DATABASE_URL` to a free port.

| Port | Service                                      |
| ---- | -------------------------------------------- |
| 3000 | Dashboard (Next.js)                          |
| 4000 | Control-plane API (Hono); docs at `/v1/docs` |
| 5432 | Postgres (Docker, development)               |

## Status

Phase 0 (foundations) is done. The build is split into 19 phases; start with
[docs/phases/README.md](docs/phases/README.md).

## Repository

| Path                 | Contents                                                        |
| -------------------- | --------------------------------------------------------------- |
| `apps/web`           | Dashboard                                                       |
| `apps/api`           | Control-plane API and workers                                   |
| `apps/agent`         | Go agent that runs on every server                              |
| `apps/cli`           | Go CLI                                                          |
| `packages/protocol`  | Protobuf definitions and generated Go and TypeScript            |
| `packages/db`        | Drizzle schema and migrations                                   |
| `packages/shared`    | Error catalog, ids, shared types                                |
| `packages/ui`        | Design system (Phase 1)                                         |
| `packages/templates` | Built-in templates (Phase 13)                                   |
| `e2e`                | Playwright suites                                               |
| `docs/`              | `SPEC.md` (source of truth), phase docs, progress and decisions |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full command list and conventions.
