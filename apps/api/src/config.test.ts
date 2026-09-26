import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig, redactConnectionString } from "./config";

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://lumen:lumen@localhost:5432/lumen" });
    expect(config.API_PORT).toBe(4000);
    expect(config.WEB_ORIGIN).toBe("http://localhost:3000");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.NODE_ENV).toBe("development");
  });

  it("coerces the port", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://lumen:lumen@localhost:5432/lumen",
      API_PORT: "4100",
    });
    expect(config.API_PORT).toBe(4100);
  });

  it("lists every problem in one readable error", () => {
    expect(() => loadConfig({ API_PORT: "abc", LOG_LEVEL: "loud" })).toThrow(ConfigError);
    try {
      loadConfig({ API_PORT: "abc", LOG_LEVEL: "loud" });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Missing or invalid environment variables:");
      expect(message).toContain(" - DATABASE_URL:");
      expect(message).toContain(" - API_PORT:");
      expect(message).toContain(" - LOG_LEVEL:");
      expect(message).toContain("Copy .env.example to .env");
    }
  });

  it("rejects a non-postgres database url", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://root@localhost/x" })).toThrow(ConfigError);
  });
});

describe("redactConnectionString", () => {
  it("hides the password and keeps the rest", () => {
    expect(redactConnectionString("postgres://lumen:s3cret@db.internal:5432/lumen")).toBe(
      "postgres://lumen:***@db.internal:5432/lumen",
    );
    expect(redactConnectionString("not a url")).toBe("<invalid url>");
  });
});
