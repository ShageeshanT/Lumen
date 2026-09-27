import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The CSS half of the design-token guard (ESLint's lumen/design-tokens-only
 * covers TypeScript). Outside src/tokens, stylesheets may only reference
 * tokens: no hex colors, no literal font sizes, no literal z-index values.
 */
const SRC = join(import.meta.dirname, "..");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "tokens" ? [] : cssFiles(path);
    }
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

const RULES = [
  { name: "hex color", pattern: /#[0-9a-f]{3,8}\b/i },
  { name: "literal font size", pattern: /font-size:\s*[0-9.]+(px|rem|em)/ },
  { name: "literal z-index", pattern: /z-index:\s*-?[0-9]/ },
];

describe("design-token guard (CSS)", () => {
  const files = cssFiles(SRC);

  it("finds the stylesheets", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(RULES)("no $name outside src/tokens", ({ pattern }) => {
    const hits = files.flatMap((file) =>
      readFileSync(file, "utf8")
        // Comments may mention values when explaining them.
        .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
        .split("\n")
        .flatMap((line, index) =>
          pattern.test(line) ? [`${relative(SRC, file)}:${String(index + 1)}: ${line.trim()}`] : [],
        ),
    );
    expect(hits).toEqual([]);
  });
});
