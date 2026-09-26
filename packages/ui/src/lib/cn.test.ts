import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins and drops falsy values", () => {
    expect(cn("a", false, undefined, "b", null, { c: true, d: false })).toBe("a b c");
  });

  it("lets the last conflicting utility win", () => {
    expect(cn("p-2 p-4")).toBe("p-4");
    expect(cn("text-text", "text-text-secondary")).toBe("text-text-secondary");
  });
});
