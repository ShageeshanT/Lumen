import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";

import { LumenHttpError } from "@lumen/shared";

import { createLogger } from "../logger.js";

import { errorHandler, notFoundHandler, type ErrorBody } from "./error.js";
import { requestId } from "./request-id.js";

function buildApp() {
  const lines: string[] = [];
  const logger = createLogger("info", {
    write(chunk: string) {
      lines.push(chunk);
    },
  });
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use(requestId);
  app.get("/boom", () => {
    throw new Error("boom: password=hunter2");
  });
  app.get("/forbidden", () => {
    throw new LumenHttpError("FORBIDDEN", { roleNeeded: "admin" });
  });
  app.get("/unauthenticated", () => {
    throw new HTTPException(401, { message: "token expired" });
  });
  app.get("/teapot", () => {
    throw new HTTPException(418, { message: "short and stout" });
  });
  app.notFound(notFoundHandler);
  app.onError(errorHandler(logger));
  return { app, lines };
}

describe("errorHandler", () => {
  it("maps unexpected errors to INTERNAL with a support id and no details", async () => {
    const { app, lines } = buildApp();
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.supportId).toBe(res.headers.get("x-request-id"));
    expect(body.error.supportId).toMatch(/^req_/);
    expect(Object.keys(body.error).sort()).toEqual(
      ["action", "code", "explanation", "fix", "supportId", "title"].sort(),
    );
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("boom");
    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("    at ");
    expect(lines.join("\n")).toContain("boom");
    expect(lines.join("\n")).toContain(body.error.supportId ?? "missing");
  });

  it("passes LumenHttpError through with its status", async () => {
    const { app } = buildApp();
    const res = await app.request("/forbidden");
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.explanation).toContain("admin");
  });

  it("maps known HTTPException statuses to catalog codes", async () => {
    const { app } = buildApp();
    const res = await app.request("/unauthenticated");
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("treats unknown HTTPException statuses as internal", async () => {
    const { app } = buildApp();
    const res = await app.request("/teapot");
    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("stout");
  });

  it("answers unknown routes with NOT_FOUND", async () => {
    const { app } = buildApp();
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.title).toBe("This route doesn't exist or you don't have access");
  });

  it("keeps a well-formed incoming request id and replaces a bad one", async () => {
    const { app } = buildApp();
    const good = "req_01j8x9k2d3m4n5p6q7r8s9t0v1";
    const kept = await app.request("/nope", { headers: { "x-request-id": good } });
    expect(kept.headers.get("x-request-id")).toBe(good);
    const replaced = await app.request("/nope", { headers: { "x-request-id": "evil" } });
    expect(replaced.headers.get("x-request-id")).toMatch(/^req_/);
    expect(replaced.headers.get("x-request-id")).not.toBe("evil");
  });
});
