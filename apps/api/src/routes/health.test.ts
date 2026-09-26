import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "@lumen/db";

import { createApp } from "../app.js";
import { createLogger } from "../logger.js";

import { HealthResponse, type Health } from "./health.js";

const databaseUrl = process.env["DATABASE_URL"];
const closers: (() => Promise<void>)[] = [];

afterAll(async () => {
  await Promise.all(closers.map((close) => close()));
});

function appFor(connectionString: string) {
  const handle = createDb(connectionString, { max: 2, connectionTimeoutMillis: 1_500 });
  closers.push(handle.close);
  const logger = createLogger("silent");
  return createApp({
    config: { WEB_ORIGIN: "http://localhost:3000" },
    pool: handle.pool,
    logger,
    version: "0.0.0-test",
    startedAt: Date.now() - 5_000,
  });
}

describe("GET /v1/health", () => {
  it.skipIf(databaseUrl === undefined)(
    "returns 200 with db ok against a real database",
    async () => {
      if (databaseUrl === undefined) {
        throw new Error("DATABASE_URL is required");
      }
      const app = appFor(databaseUrl);
      const res = await app.request("/v1/health");
      expect(res.status).toBe(200);
      const body = HealthResponse.parse(await res.json());
      expect(body.status).toBe("ok");
      expect(body.db).toBe("ok");
      expect(body.version).toBe("0.0.0-test");
      expect(body.uptime_s).toBeGreaterThanOrEqual(5);
      expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    },
  );

  it("returns 503 within three seconds when the database is unreachable", async () => {
    const app = appFor("postgres://lumen:lumen@127.0.0.1:1/lumen");
    const started = Date.now();
    const res = await app.request("/v1/health");
    const elapsed = Date.now() - started;
    expect(res.status).toBe(503);
    expect(elapsed).toBeLessThan(3_000);
    const body = (await res.json()) as Health;
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("unavailable");
  });

  it("serves the OpenAPI document with the health route", async () => {
    const app = appFor("postgres://lumen:lumen@127.0.0.1:1/lumen");
    const res = await app.request("/v1/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.info.title).toBe("Lumen API");
    expect(doc.info.version).toBe("0.0.0-test");
    expect(Object.keys(doc.paths)).toContain("/v1/health");
  });

  it("serves the docs page", async () => {
    const app = appFor("postgres://lumen:lumen@127.0.0.1:1/lumen");
    const res = await app.request("/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("/v1/openapi.json");
  });

  it("sets security headers and restricts CORS to the web origin", async () => {
    const app = appFor("postgres://lumen:lumen@127.0.0.1:1/lumen");
    const allowed = await app.request("/v1/openapi.json", {
      headers: { origin: "http://localhost:3000" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(allowed.headers.get("x-content-type-options")).toBe("nosniff");
    const denied = await app.request("/v1/openapi.json", {
      headers: { origin: "https://evil.example" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
