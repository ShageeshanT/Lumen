// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { composite, contrast, parseColor, toHex, WCAG_NON_TEXT, WCAG_TEXT } from "./contrast";

// The token file is the single source; parse it so the test cannot drift from it.
const css = readFileSync(fileURLToPath(new URL("../tokens/colors.css", import.meta.url)), "utf8");

function tokens(theme: "dark" | "light"): Record<string, string> {
  const start =
    theme === "dark"
      ? css.indexOf(':root,\n[data-theme="dark"]')
      : css.indexOf('[data-theme="light"]');
  const end = theme === "dark" ? css.indexOf('[data-theme="light"]') : css.length;
  const block = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--color-([a-z-]+):\s*([^;]+);/g)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      out[match[1]] = match[2].replace(/\s+/g, " ").trim();
    }
  }
  return out;
}

describe("contrast math", () => {
  it("matches the WCAG reference points", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 2);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("parses hex, short hex and rgba, and composites alpha", () => {
    expect(parseColor("#14b8a6")).toEqual({ r: 20, g: 184, b: 166, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(20, 184, 166, 0.12)")).toEqual({ r: 20, g: 184, b: 166, a: 0.12 });
    expect(toHex(composite(parseColor("rgba(20, 184, 166, 0.12)"), parseColor("#14171b")))).toBe(
      "#142a2c",
    );
    expect(() => parseColor("teal")).toThrow(/Unsupported color/);
  });
});

describe("the Direction D contrast table (docs/UI_DECISIONS.md)", () => {
  const dark = tokens("dark");
  const light = tokens("light");

  it.each([
    ["text", "bg", 17.13],
    ["text", "surface-hover", 14.89],
    ["text-secondary", "bg", 6.64],
    ["text-secondary", "surface-hover", 5.77],
    ["text-muted", "surface", 2.86],
    ["accent", "surface-hover", 4.84],
    ["accent-text", "surface-hover", 6.26],
    ["danger-text", "surface-hover", 6.4],
    ["info-text", "surface-hover", 7.96],
    ["sleeping", "surface-hover", 3.64],
    ["sleeping-text", "surface", 7.69],
  ])("dark: %s on %s is %d", (fg, bg, expected) => {
    expect(contrast(dark[fg] ?? "", dark[bg] ?? "")).toBeCloseTo(expected, 1);
  });

  it.each([
    ["text", "bg", 18.11],
    ["text-secondary", "surface", 7.41],
    ["text-secondary", "surface-hover", 6.49],
    ["accent", "surface-hover", 4.49],
    ["accent-text", "surface-hover", 6.35],
    ["success", "surface-hover", 4.39],
    ["success-text", "surface-hover", 6.25],
    ["warning", "surface-hover", 4.4],
    ["warning-text", "surface-hover", 6.21],
    ["danger-text", "surface", 6.47],
    ["info-text", "surface", 6.7],
    ["sleeping-text", "surface", 7.58],
  ])("light: %s on %s is %d", (fg, bg, expected) => {
    expect(contrast(light[fg] ?? "", light[bg] ?? "")).toBeCloseTo(expected, 1);
  });

  it("holds every text token to 4.5:1 on every surface in both themes", () => {
    const surfaces = ["bg", "surface", "surface-raised", "surface-hover"];
    const textTokens = [
      "text",
      "text-secondary",
      "accent-text",
      "success-text",
      "warning-text",
      "danger-text",
      "info-text",
      "sleeping-text",
    ];
    for (const theme of [dark, light]) {
      for (const fg of textTokens) {
        for (const bg of surfaces) {
          expect(
            contrast(theme[fg] ?? "", theme[bg] ?? ""),
            `${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(WCAG_TEXT);
        }
      }
    }
  });

  it("holds every non-text status color to 3:1 on every surface in both themes", () => {
    const surfaces = ["bg", "surface", "surface-raised", "surface-hover"];
    for (const theme of [dark, light]) {
      for (const token of [
        "accent",
        "success",
        "warning",
        "danger",
        "info",
        "sleeping",
        "violet",
      ]) {
        for (const bg of surfaces) {
          expect(
            contrast(theme[token] ?? "", theme[bg] ?? ""),
            `${token} on ${bg}`,
          ).toBeGreaterThanOrEqual(WCAG_NON_TEXT);
        }
      }
    }
  });

  it("holds ink on fills to 4.5:1", () => {
    for (const theme of [dark, light]) {
      expect(
        contrast(theme["accent-ink"] ?? "", theme["accent-fill"] ?? ""),
      ).toBeGreaterThanOrEqual(WCAG_TEXT);
      expect(
        contrast(theme["accent-ink"] ?? "", theme["accent-fill-hover"] ?? ""),
      ).toBeGreaterThanOrEqual(WCAG_TEXT);
      expect(
        contrast(theme["danger-ink"] ?? "", theme["danger-fill"] ?? ""),
      ).toBeGreaterThanOrEqual(WCAG_TEXT);
    }
  });

  it("keeps text readable on the accent-subtle tint", () => {
    for (const theme of [dark, light]) {
      const tint = toHex(
        composite(parseColor(theme["accent-subtle"] ?? ""), parseColor(theme["surface"] ?? "")),
      );
      expect(contrast(theme["text"] ?? "", tint)).toBeGreaterThanOrEqual(WCAG_TEXT);
      expect(contrast(theme["text-secondary"] ?? "", tint)).toBeGreaterThanOrEqual(WCAG_TEXT);
    }
  });

  it("documents the known exception: text-muted is below 4.5:1 and reserved for placeholders", () => {
    expect(contrast(dark["text-muted"] ?? "", dark["surface"] ?? "")).toBeLessThan(WCAG_TEXT);
    expect(contrast(light["text-muted"] ?? "", light["surface"] ?? "")).toBeLessThan(WCAG_TEXT);
  });
});
