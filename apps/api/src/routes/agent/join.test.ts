import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, DATABASE_URL, json, type Harness } from "../../test-support/harness";

describe.skipIf(DATABASE_URL === undefined)("POST /agent/v1/join rate limit", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ AGENT_JOIN_RATE_LIMIT: "10" });
  });
  afterAll(async () => {
    await h.close();
  });

  it("allows 10 attempts a minute per address, then answers 429", async () => {
    const attempt = () =>
      h.app.request("/agent/v1/join", {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          join_token: "x".repeat(43),
          public_key: Buffer.alloc(32).toString("base64"),
          host: {},
        }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await attempt()).status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 401));
    expect(statuses[10]).toBe(429);
    const body = (await (await attempt()).json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
