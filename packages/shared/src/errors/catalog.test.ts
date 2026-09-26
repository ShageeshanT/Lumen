import { describe, expect, it } from "vitest";

import { catalog } from "./catalog";
import { LUMEN_ERROR_CODES, type ErrorContext } from "./types";

import { ERROR_STATUS, LumenHttpError, isLumenError, makeError } from "./index";

// Buttons are verbs (SPEC C9). The list is deliberately short; add to it only
// when a new action genuinely needs a new verb.
const ACTION_VERBS = [
  "Fix",
  "Open",
  "Show",
  "Increase",
  "Set",
  "Add",
  "Reconnect",
  "Retry",
  "Test",
  "Clean",
  "View",
  "Move",
  "Copy",
  "Recheck",
  "Jump",
  "Sign",
];

// Contexts that exercise every interpolation branch.
const CONTEXTS: ErrorContext[] = [
  {},
  {
    port: 80,
    serverName: "oracle-1",
    memoryMb: 512,
    suggestedMemoryMb: 1024,
    hostname: "app.example.com",
    variableKey: "DATABASE_URL",
    cycle: ["api.A", "worker.B"],
    image: "ghcr.io/acme/api:1",
    repo: "acme/api",
    volumeName: "data",
    freeDiskGb: 1,
    resource: "project",
    roleNeeded: "member",
    retryAfterS: 30,
    detail: "Port 80 refused the connection.",
    supportId: "req_01j8x9k2d3m4n5p6q7r8s9t0v1",
  },
];

describe("error catalog", () => {
  it("has an entry for every code", () => {
    for (const code of LUMEN_ERROR_CODES) {
      expect(catalog[code], code).toBeTypeOf("function");
      expect(ERROR_STATUS[code], code).toBeGreaterThanOrEqual(400);
    }
    expect(Object.keys(catalog).sort()).toEqual([...LUMEN_ERROR_CODES].sort());
  });

  it.each(CONTEXTS)("follows the voice rules for every code (ctx %#)", (ctx) => {
    for (const code of LUMEN_ERROR_CODES) {
      const error = makeError(code, ctx);
      expect(error.code).toBe(code);
      expect(error.title, code).not.toMatch(/\.$/);
      expect(error.title, code).not.toMatch(/^(Error|Failed)/);
      expect(error.title, code).not.toMatch(/!/);
      expect(error.title.length, code).toBeGreaterThan(0);
      expect(error.explanation.length, code).toBeLessThanOrEqual(200);
      expect(error.explanation.length, code).toBeGreaterThan(0);
      expect(error.fix.length, code).toBeGreaterThan(0);
      if (error.action.kind !== "none") {
        const verb = error.action.label.split(" ")[0] ?? "";
        expect(ACTION_VERBS, `${code}: "${error.action.label}"`).toContain(verb);
      }
    }
  });

  it("interpolates context into titles", () => {
    expect(makeError("PORT_BLOCKED", { port: 80 }).title).toBe("Port 80 is blocked on your server");
    expect(makeError("PORT_BLOCKED").title).toBe("Port 443 is blocked on your server");
    expect(makeError("AGENT_OFFLINE", { serverName: "oracle-1" }).title).toBe(
      "Server 'oracle-1' isn't responding",
    );
    expect(makeError("OOM_KILLED", { memoryMb: 512 }).action).toEqual({
      kind: "button",
      label: "Increase memory to 1 GB",
      actionId: "increase_memory",
    });
    expect(makeError("VARIABLE_REF_CYCLE", { cycle: ["api.A", "worker.B"] }).explanation).toContain(
      "api.A → worker.B → api.A",
    );
  });

  it("keeps raw details and support ids only when given", () => {
    const plain = makeError("INTERNAL");
    expect(plain).not.toHaveProperty("raw");
    expect(plain).not.toHaveProperty("supportId");

    const detailed = makeError("INTERNAL", { supportId: "req_1", raw: "boom" });
    expect(detailed.supportId).toBe("req_1");
    expect(detailed.raw).toBe("boom");
    expect(detailed.explanation).toContain("req_1");
  });
});

describe("isLumenError", () => {
  it("accepts catalog errors and rejects everything else", () => {
    expect(isLumenError(makeError("NOT_FOUND"))).toBe(true);
    expect(isLumenError({ code: "NOPE", title: "x", explanation: "y", fix: "z", action: {} })).toBe(
      false,
    );
    expect(isLumenError(null)).toBe(false);
    expect(isLumenError("NOT_FOUND")).toBe(false);
    expect(isLumenError({ code: "NOT_FOUND" })).toBe(false);
  });
});

describe("LumenHttpError", () => {
  it("carries the catalog error and the default status", () => {
    const error = new LumenHttpError("FORBIDDEN", { roleNeeded: "admin" });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LumenHttpError");
    expect(error.status).toBe(403);
    expect(error.error.code).toBe("FORBIDDEN");
    expect(error.error.explanation).toContain("admin");
    expect(error.message).toBe(error.error.title);
  });

  it("allows a status override", () => {
    expect(new LumenHttpError("VALIDATION_FAILED", {}, 422).status).toBe(422);
  });
});
