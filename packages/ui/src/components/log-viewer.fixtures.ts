import type { LogLine } from "./log-viewer";

/**
 * Static log lines for the gallery, the tests and the performance page. All
 * content is invented; timestamps start at a fixed instant so screenshots are
 * stable (render with timeZone="UTC").
 */

const E = "\u001b";
export const LOG_BASE_TIME = Date.parse("2026-09-26T14:02:00.000Z");

type Template = Omit<LogLine, "id" | "ts">;

const TEMPLATES: readonly ((n: number) => Template)[] = [
  (n) => ({
    text: `${E}[90m#${String(n % 12)}${E}[0m [builder ${String((n % 5) + 1)}/5] RUN pnpm install --frozen-lockfile`,
    level: "info",
    source: "build",
  }),
  (n) => ({
    text: `${E}[32m✓${E}[0m Compiled ${String(80 + (n % 40))} modules in ${E}[1m${String(1 + (n % 9))}.${String(n % 10)}s${E}[0m`,
    level: "info",
    source: "build",
  }),
  (n) => ({
    text: JSON.stringify({
      level: "info",
      msg: "request completed",
      method: n % 3 === 0 ? "POST" : "GET",
      path: `/api/orders/${String(1000 + (n % 900))}`,
      status: 200,
      duration_ms: 12 + (n % 80),
    }),
    level: "info",
    source: "http",
  }),
  (n) => ({
    text: `GET /healthz 200 ${String(1 + (n % 4))}ms`,
    level: "debug",
    source: "http",
  }),
  (n) => ({
    text: `${E}[33mwarn${E}[0m  Slow query took ${String(900 + (n % 400))} ms: SELECT * FROM orders WHERE customer_id = $1`,
    level: "warn",
    source: "stdout",
  }),
  (n) => ({
    text: `Worker ${String(n % 4)} picked job send-receipt #${String(40_000 + n)}`,
    level: "info",
    source: "stdout",
  }),
  (n) => ({
    text: `${E}[31mError:${E}[0m connect ECONNREFUSED 10.0.0.${String(10 + (n % 20))}:5432 — retrying in ${String(1 + (n % 5))}s`,
    level: "error",
    source: "stderr",
  }),
  (n) => ({
    text: `cache ${n % 2 === 0 ? "hit" : "miss"} key=session:${String(n * 7919).slice(-6)} ttl=3600`,
    level: "debug",
    source: "stdout",
  }),
];

/** `count` deterministic lines, 50 ms apart. */
export function makeLogLines(count: number, startAt = 0): LogLine[] {
  const lines: LogLine[] = [];
  for (let i = startAt; i < startAt + count; i += 1) {
    const template = TEMPLATES[i % TEMPLATES.length];
    if (template === undefined) {
      continue;
    }
    lines.push({ id: `l${String(i)}`, ts: LOG_BASE_TIME + i * 50, ...template(i) });
  }
  return lines;
}

let bigCache: LogLine[] | undefined;
/** 50,000 lines, built once per page. */
export function fiftyThousandLines(): LogLine[] {
  bigCache ??= makeLogLines(50_000);
  return bigCache;
}

/** A short deploy: build output with ANSI colors, then the app starting, one stderr error. */
const DEPLOY_TEMPLATES: Template[] = [
  { text: `${E}[1m${E}[36m==>${E}[0m Building with Railpack (node 22)`, source: "build" },
  { text: `${E}[90m#4${E}[0m [builder 2/5] RUN pnpm install --frozen-lockfile`, source: "build" },
  { text: `Packages: +412 ${E}[32m++++++++++++++++++++${E}[0m`, source: "build" },
  { text: `${E}[32m✓${E}[0m Compiled successfully in ${E}[1m4.2s${E}[0m`, source: "build" },
  { text: `${E}[1m${E}[36m==>${E}[0m Starting container api-7f3c`, source: "build" },
  { text: "Server listening on http://0.0.0.0:3000", level: "info", source: "stdout" },
  {
    text: `${E}[33mwarn${E}[0m  DATABASE_POOL_SIZE is not set, using 10`,
    level: "warn",
    source: "stdout",
  },
  {
    text: `${E}[31mError:${E}[0m connect ECONNREFUSED 10.0.0.12:5432`,
    level: "error",
    source: "stderr",
  },
  {
    text: "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)",
    level: "error",
    source: "stderr",
  },
  { text: "Connected to postgres after 1 retry", level: "info", source: "stdout" },
  { text: "GET /healthz 200 2ms", level: "debug", source: "http" },
  {
    text: `${E}[35mmigrations${E}[0m 3 applied, 0 pending`,
    level: "info",
    source: "stdout",
  },
];

export const DEPLOY_LINES: LogLine[] = DEPLOY_TEMPLATES.map((line, index) => ({
  id: `d${String(index)}`,
  ts: LOG_BASE_TIME + index * 180,
  ...line,
}));

/** Structured request logs (JSON lines). */
export const JSON_LINES: LogLine[] = [
  {
    id: "j0",
    ts: LOG_BASE_TIME,
    level: "info",
    source: "http",
    text: JSON.stringify({
      level: "info",
      msg: "request completed",
      method: "GET",
      path: "/api/orders",
      status: 200,
      duration_ms: 42,
    }),
  },
  {
    id: "j1",
    ts: LOG_BASE_TIME + 220,
    level: "error",
    source: "stderr",
    text: JSON.stringify({
      level: "error",
      msg: "payment failed",
      order_id: "ord_9f2k",
      error: { code: "card_declined", retryable: false },
      attempt: 2,
    }),
  },
  {
    id: "j2",
    ts: LOG_BASE_TIME + 480,
    level: "info",
    source: "http",
    text: JSON.stringify({
      level: "info",
      msg: "request completed",
      method: "POST",
      path: "/api/checkout",
      status: 201,
      duration_ms: 88,
    }),
  },
  {
    id: "j3",
    ts: LOG_BASE_TIME + 700,
    level: "debug",
    source: "http",
    text: "GET /healthz 200 1ms",
  },
];
