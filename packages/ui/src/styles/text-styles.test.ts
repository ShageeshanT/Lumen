// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TEXT_STYLES } from "./text-styles";

const css = readFileSync(fileURLToPath(new URL("./text.css", import.meta.url)), "utf8");

function rule(name: string): string {
  const match = new RegExp(`\\.text-${name}\\s*\\{([^}]*)\\}`).exec(css);
  if (match?.[1] === undefined) {
    throw new Error(`.text-${name} is missing from text.css`);
  }
  return match[1];
}

const WEIGHT_TOKEN = { 400: "regular", 500: "medium", 600: "semibold" } as const;
const LEADING_TOKEN = {
  1: "none",
  1.25: "tight",
  1.4: "normal",
  1.5: "normal",
  "20px": "log",
} as const;
const TRACKING_TOKEN = {
  "-0.02": "display",
  "-0.01": "title",
  "0": "normal",
  "0.04": "eyebrow",
} as const;

describe("text.css matches the usage table", () => {
  it.each(TEXT_STYLES.map((style) => [style.name, style] as const))("%s", (_name, style) => {
    const body = rule(style.name);
    expect(body).toContain(`font-size: var(--text-${String(style.size)})`);
    expect(body).toContain(`font-weight: var(--font-weight-${WEIGHT_TOKEN[style.weight]})`);
    expect(body).toContain(`line-height: var(--leading-${LEADING_TOKEN[style.lineHeight]})`);
    expect(body).toContain(
      `letter-spacing: var(--tracking-${TRACKING_TOKEN[String(style.tracking) as keyof typeof TRACKING_TOKEN]})`,
    );
    expect(body).toContain(`font-family: var(--font-${style.family})`);
    expect(body).toContain(`color: var(--color-${style.color})`);
    if (style.tabular === true) {
      expect(body).toContain("font-variant-numeric: tabular-nums");
    }
    if (style.uppercase === true) {
      expect(body).toContain("text-transform: uppercase");
    }
  });

  it("never loads a 700 weight and never uses a raw pixel size", () => {
    expect(css).not.toMatch(/font-weight:\s*700/);
    expect(css).not.toMatch(/font-size:\s*\d+px/);
  });
});
