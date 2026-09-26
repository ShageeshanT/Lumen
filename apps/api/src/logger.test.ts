import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";

function captureLogger(level = "info") {
  const lines: string[] = [];
  const logger = createLogger(level, {
    write(chunk: string) {
      lines.push(chunk);
    },
  });
  return { logger, lines };
}

describe("createLogger", () => {
  it("redacts authorization and cookie headers", () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        req: {
          headers: {
            authorization: "Bearer very-secret-token",
            cookie: "session=abc123",
            "x-request-id": "req_01j8x9k2d3m4n5p6q7r8s9t0v1",
          },
        },
      },
      "request",
    );
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line).not.toContain("very-secret-token");
    expect(line).not.toContain("abc123");
    const parsed = JSON.parse(line) as {
      req: { headers: Record<string, string> };
      service: string;
      msg: string;
    };
    expect(parsed.req.headers["authorization"]).toBe("[Redacted]");
    expect(parsed.req.headers["cookie"]).toBe("[Redacted]");
    expect(parsed.req.headers["x-request-id"]).toBe("req_01j8x9k2d3m4n5p6q7r8s9t0v1");
    expect(parsed.service).toBe("lumen-api");
    expect(parsed.msg).toBe("request");
  });

  it("respects the level", () => {
    const { logger, lines } = captureLogger("warn");
    logger.info("hidden");
    logger.warn("shown");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("shown");
  });
});
