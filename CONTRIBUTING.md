# Contributing

## Setup

You need Node 24, pnpm 11, Go 1.26, Docker and buf. Then:

```sh
pnpm install
pnpm dev:infra   # Postgres 16 in Docker
pnpm dev         # web on :3000, api on :4000
```

Copy `.env.example` to `.env` if you need to change a port. Install buf and
golangci-lint with `go install`:

```sh
go install github.com/bufbuild/buf/cmd/buf@latest
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest
```

## Commands

| Command                  | What it does                                                                  |
| ------------------------ | ----------------------------------------------------------------------------- |
| `pnpm test`              | Vitest in every package, then `go test`                                       |
| `pnpm lint`              | ESLint, golangci-lint, buf lint, Prettier check                               |
| `pnpm typecheck`         | `tsc --noEmit` in every package                                               |
| `pnpm build`             | Next.js, the API bundle, and both Go binaries for linux/amd64 and linux/arm64 |
| `pnpm gen`               | Regenerate protobuf code (commit the result)                                  |
| `pnpm db:generate`       | Create a migration from schema changes                                        |
| `pnpm db:migrate`        | Apply pending migrations                                                      |
| `pnpm --filter e2e test` | Playwright smoke test at three widths in both color schemes                   |

## How work is organized

The build is split into phases under `docs/phases/`. Read `docs/phases/README.md`
first, then the phase you are working on. `docs/SPEC.md` is the source of truth;
if you change your mind about a behavior, change the spec first.

## Conventions

- TypeScript strict, no `any`, no non-null assertions without a described
  `eslint-disable` comment. Go errors are wrapped with `%w`; context is passed
  everywhere.
- Every dependency added gets its license and maintenance status checked and a
  line in `docs/DECISIONS.md`.
- Commit messages: imperative mood, subject of at most 72 characters, body
  explains why. Commit after every green step.
- Update `docs/PROGRESS.md` and `docs/DECISIONS.md` at the end of every session.
- A pre-commit hook runs ESLint, Prettier, gofmt and buf format on staged files.
