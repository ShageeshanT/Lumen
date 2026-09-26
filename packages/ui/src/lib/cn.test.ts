import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins and drops falsy values", () => {
    expect(cn("a", false, undefined, "b", null, { c: true, d: false })).toBe("a b c");
  });

  it("lets the last conflicting utility win", () => {
    expect(cn("p-2 p-4")).toBe("p-4");
    expect(cn("text-text", "text-text-secondary")).toBe("text-text-secondary");
    expect(cn("text-13", "text-14")).toBe("text-14");
    expect(cn("rounded-card", "rounded-panel")).toBe("rounded-panel");
    expect(cn("bg-surface", "bg-accent-subtle")).toBe("bg-accent-subtle");
    expect(cn("border-border", "border-accent")).toBe("border-accent");
  });

  it("keeps a text style next to a color, a size next to a color", () => {
    expect(cn("text-action", "text-success-text")).toBe("text-action text-success-text");
    expect(cn("text-label text-text-secondary")).toBe("text-label text-text-secondary");
    expect(cn("text-13 text-danger-text")).toBe("text-13 text-danger-text");
  });

  it("lets a later text style replace an earlier one", () => {
    expect(cn("text-body", "text-meta")).toBe("text-meta");
  });
});
