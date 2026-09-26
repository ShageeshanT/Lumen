import { describe, expect, it } from "vitest";

import { ID_PREFIXES, isId, newId, parseId } from "./ids.js";

describe("newId", () => {
  it("produces a prefixed lowercase ULID for every prefix", () => {
    for (const prefix of ID_PREFIXES) {
      const id = newId(prefix);
      expect(id).toMatch(new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{26}$`));
    }
  });

  it("is monotonic within a process", () => {
    const ids = Array.from({ length: 1000 }, () => newId("dep"));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(1000);
  });
});

describe("parseId", () => {
  it("splits a valid id", () => {
    const id = newId("prj");
    const parsed = parseId(id);
    expect(parsed?.prefix).toBe("prj");
    expect(parsed?.ulid).toHaveLength(26);
  });

  it("rejects unknown prefixes, bad ULIDs and missing separators", () => {
    expect(parseId("xyz_01j8x9k2d3m4n5p6q7r8s9t0v1")).toBeNull();
    expect(parseId("prj_not-a-ulid")).toBeNull();
    expect(parseId("prj01j8x9k2d3m4n5p6q7r8s9t0v1")).toBeNull();
    expect(parseId("_01j8x9k2d3m4n5p6q7r8s9t0v1")).toBeNull();
    expect(parseId("")).toBeNull();
  });
});

describe("isId", () => {
  it("checks the prefix", () => {
    const id = newId("svc");
    expect(isId(id, "svc")).toBe(true);
    expect(isId(id, "prj")).toBe(false);
    expect(isId("garbage", "svc")).toBe(false);
  });
});
