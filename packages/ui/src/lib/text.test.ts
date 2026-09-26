import { describe, expect, it } from "vitest";

import { initials, truncateEnd, truncateMiddle } from "./text";

describe("truncateMiddle", () => {
  it("keeps both ends and uses a single ellipsis", () => {
    expect(truncateMiddle("dep_01j8x9k2d3m4n5p6q7r8s9t0v1", 8, 6)).toBe("dep_01j8…s9t0v1");
    expect(truncateMiddle("short", 8, 6)).toBe("short");
    expect(truncateMiddle("abcdefgh", 3, 3)).toBe("abc…fgh");
    expect(truncateMiddle("abcdefg", 3, 3)).toBe("abcdefg");
  });

  it("counts code points, not UTF-16 units", () => {
    expect(truncateMiddle("😀😀😀😀😀😀", 2, 2)).toBe("😀😀…😀😀");
  });

  it("rejects negative lengths", () => {
    expect(() => truncateMiddle("x", -1, 0)).toThrow(RangeError);
  });
});

describe("truncateEnd", () => {
  it("cuts and appends an ellipsis within the limit", () => {
    expect(truncateEnd("feat: checkout redesign", 12)).toBe("feat: check…");
    expect(truncateEnd("short", 12)).toBe("short");
    expect(truncateEnd("abc", 1)).toBe("…");
  });
});

describe("initials", () => {
  it("takes the first letters of the first words", () => {
    expect(initials("api")).toBe("A");
    expect(initials("Web App")).toBe("WA");
    expect(initials("Acme Cloud Team")).toBe("AC");
    expect(initials("  ")).toBe("?");
  });
});
