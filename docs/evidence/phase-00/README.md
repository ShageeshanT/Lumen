# Phase 0 evidence

Collected 2026-09-26 on the dev machine (Windows 11, Node 24.11.1, pnpm 11.14.0,
Go 1.26.5, Docker 28.1.1, buf 1.73.0, golangci-lint 2.14.0). Commands were run
from the repository root unless noted.

## Acceptance criteria (PHASE-00 §6)

| Criterion | Result |
|---|---|
| `pnpm dev` starts web + api | Web on :3000, API on :4000, both hot-reload (`GET / 200`, `/v1/health` 200) |
| `pnpm test` green | Vitest: shared 13, protocol 3, db 6, api 18, web 5 tests; `go test`: 5 packages ok |
| CI green | Workflow committed; first run on `main` linked from PROGRESS.md once it completes |
| Agent builds for both architectures; arm64 prints its version under QEMU | See "Go binaries" below |
| `/v1/health` 200 with `db: "ok"`, 503 when Postgres is down | 200 live; 503 verified by the api test against a closed port (under 3 s) |
| `/v1/openapi.json` passes Redocly lint with zero errors | "Your API description is valid" · 0 errors · 2 warnings (`info-license`, `operation-4xx-response`) |
| Geist Sans and Mono self-hosted | Two `woff2` preloads from `/_next/static/media/`, no font CDN hosts, `size-adjust` fallbacks present |
| Proto round trip byte-identical Go ↔ TS | `packages/protocol/roundtrip_test.go` writes `testdata/agent_hello.bin` (137 bytes); `src/roundtrip.test.ts` decodes and re-encodes it to equal bytes |
| Every J6 code in the catalog with voice tests | `packages/shared/src/errors/catalog.test.ts`: 26 codes × 2 contexts, all rules pass |
| Fresh clone to `db: ok` under five minutes | Timed run recorded in PROGRESS.md |
| DECISIONS.md entries | 0005–0024 |

## Go binaries

```
apps/agent/bin/lumen-agent-linux-amd64: ELF 64-bit LSB executable, x86-64, statically linked, stripped
apps/agent/bin/lumen-agent-linux-arm64: ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped
apps/cli/bin/lumen-linux-amd64:         ELF 64-bit LSB executable, x86-64, statically linked, stripped
apps/cli/bin/lumen-linux-arm64:         ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped
```

Sizes: agent 1.67 MB (amd64) / 1.64 MB (arm64); CLI the same.

```
$ docker run --rm --platform linux/arm64 -v "$PWD/apps/agent/bin:/b" debian:12-slim /b/lumen-agent-linux-arm64 --version
lumen-agent 0.0.0-dev (455ae03, 2026-09-26T14:39:01Z, linux/arm64)

$ docker run --rm --platform linux/amd64 -v "$PWD/apps/cli/bin:/b" debian:12-slim /b/lumen-linux-amd64 --version
lumen 0.0.0-dev (455ae03, 2026-09-26T14:39:01Z, linux/amd64)
```

## API

```
$ curl -s -w '\nHTTP %{http_code}\n' localhost:4000/v1/health
{"status":"ok","version":"0.0.0","db":"ok","uptime_s":53}
HTTP 200

$ curl -s localhost:4000/v1/nope
{"error":{"code":"NOT_FOUND","title":"This route doesn't exist or you don't have access", ...}}

$ curl -s -o /dev/null -w '%{http_code} %{content_type}\n' localhost:4000/v1/docs
200 text/html; charset=UTF-8
```

Idle RSS of the production bundle (`NODE_ENV=production node dist/index.js`, after
three health requests and 16 s idle): **64.3 MB**. Under `tsx watch` in dev: 83.7 MB.

## Web

```
$ curl -s localhost:3000 | grep -oE '<html[^>]*>'
<html lang="en" data-theme="dark" class="geistsans_…__variable geistmono_…__variable">
```

Production build (`next build`, Turbopack): routes `/`, `/_not-found`,
`/dev/components`, `/icon.svg`, all static. First Load JS for `/`: 7 chunks,
553.7 KB raw, 169.8 KB gzip; Lumen's own code is under 1 KB of that.

Screenshots from the Playwright smoke test (`home-<size>-<scheme>.png` in this
folder): desktop 1440×900, tablet 1024×768, mobile 390×844, dark and light.

## Tooling

```
$ pnpm typecheck          Tasks: 7 successful, 7 total   Time: 7.1 s
$ pnpm turbo run lint     Tasks: 7 successful, 7 total   Time: 16 s
$ golangci-lint run …     0 issues.
$ buf lint && buf format -d --exit-code   (clean)
$ pnpm format:check       All matched files use Prettier code style!
$ pnpm build && pnpm build                second run: 103 ms >>> FULL TURBO
$ pnpm db:migrate         1 migration applied
$ pnpm db:migrate         0 migrations applied
$ pnpm --filter e2e test  6 passed (5.7 s)
```

Cold `pnpm install` on this machine: 1 m 33 s (postinstall builds for esbuild,
msw, unrs-resolver and simple-git-hooks dominate).
