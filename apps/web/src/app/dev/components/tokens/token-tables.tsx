"use client";

import { useEffect, useState } from "react";

import { Text } from "@lumen/ui";
import { contrast, WCAG_NON_TEXT, WCAG_TEXT } from "@lumen/ui/lib";
import { useTheme } from "@lumen/ui/theme";

const COLOR_TOKENS = [
  "bg",
  "bg-canvas",
  "grid",
  "grid-major",
  "surface",
  "surface-raised",
  "surface-hover",
  "border",
  "border-strong",
  "text",
  "text-secondary",
  "text-muted",
  "accent",
  "accent-hover",
  "accent-subtle",
  "accent-text",
  "accent-fill",
  "accent-fill-hover",
  "accent-ink",
  "success",
  "success-text",
  "success-subtle",
  "warning",
  "warning-text",
  "warning-subtle",
  "danger",
  "danger-text",
  "danger-subtle",
  "danger-fill",
  "danger-fill-hover",
  "danger-ink",
  "info",
  "info-text",
  "info-subtle",
  "sleeping",
  "sleeping-text",
  "sleeping-subtle",
  "glow-a",
  "glow-b",
  "overlay",
] as const;

const SURFACES = ["bg", "surface", "surface-raised", "surface-hover"] as const;

const TEXT_PAIRS = [
  "text",
  "text-secondary",
  "text-muted",
  "accent-text",
  "success-text",
  "warning-text",
  "danger-text",
  "info-text",
  "sleeping-text",
] as const;

const NON_TEXT_PAIRS = ["accent", "success", "warning", "danger", "info", "sleeping"] as const;

const OTHER_TOKENS = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-8",
  "--space-12",
  "--space-16",
  "--radius-kbd",
  "--radius-control",
  "--radius-card",
  "--radius-panel",
  "--dur-fast",
  "--dur-base",
  "--dur-slow",
  "--dur-reveal",
  "--stagger",
  "--dur-draw",
  "--ease-out",
  "--ease-panel",
  "--ease-in",
  "--z-sticky",
  "--z-rail",
  "--z-panel",
  "--z-popover",
  "--z-modal",
  "--z-toast",
  "--z-palette",
  "--shadow-raised",
  "--shadow-card",
  "--shadow-glow",
] as const;

type TokenMap = Record<string, string>;

function readTokens(): TokenMap {
  const style = getComputedStyle(document.documentElement);
  const out: TokenMap = {};
  for (const name of COLOR_TOKENS) {
    out[`--color-${name}`] = style.getPropertyValue(`--color-${name}`).trim();
  }
  for (const name of OTHER_TOKENS) {
    out[name] = style.getPropertyValue(name).trim();
  }
  return out;
}

function ratio(tokens: TokenMap, fg: string, bg: string): number | null {
  const foreground = tokens[`--color-${fg}`];
  const background = tokens[`--color-${bg}`];
  if (
    foreground === undefined ||
    background === undefined ||
    foreground === "" ||
    background === ""
  ) {
    return null;
  }
  try {
    return contrast(foreground, background);
  } catch {
    return null;
  }
}

function Cell({
  value,
  threshold,
  exempt,
}: {
  value: number | null;
  threshold: number;
  exempt?: boolean;
}) {
  if (value === null) {
    return <td className="text-text-muted px-3 py-1 text-right">–</td>;
  }
  const passes = value >= threshold;
  return (
    <td
      className={`tabular px-3 py-1 text-right ${
        passes
          ? "text-text"
          : exempt === true
            ? "text-warning-text"
            : "bg-danger-subtle text-danger-text"
      }`}
      title={passes ? `Passes ${String(threshold)}:1` : `Below ${String(threshold)}:1`}
    >
      {value.toFixed(2)}
    </td>
  );
}

export function TokenTables() {
  const { resolvedTheme } = useTheme();
  const [tokens, setTokens] = useState<TokenMap>({});

  useEffect(() => {
    // Read after the theme attribute has been applied for this render.
    const frame = requestAnimationFrame(() => {
      setTokens(readTokens());
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [resolvedTheme]);

  return (
    <div className="flex flex-col gap-8" data-gallery-page="tokens">
      <section className="flex flex-col gap-3">
        <Text variant="section-title">Colors ({resolvedTheme})</Text>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((name) => {
            const value = tokens[`--color-${name}`] ?? "";
            return (
              <li
                key={name}
                className="border-border bg-surface rounded-card flex items-center gap-3 border p-2"
              >
                <span
                  aria-hidden="true"
                  className="border-border rounded-control h-8 w-8 shrink-0 border"
                  style={{ background: `var(--color-${name})` }}
                />
                <span className="flex min-w-0 flex-col">
                  <span
                    className="text-code truncate"
                    style={{ background: "transparent", padding: 0 }}
                  >
                    --color-{name}
                  </span>
                  <Text variant="meta" tabular>
                    {value}
                  </Text>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Text variant="section-title">Text contrast (threshold {WCAG_TEXT}:1)</Text>
        <Text variant="body-secondary">
          text-muted is expected to fail: it is reserved for placeholders and disabled controls,
          which WCAG exempts, and never carries information.
        </Text>
        <table className="border-border rounded-card text-13 w-full border-collapse border">
          <thead>
            <tr className="text-eyebrow text-left">
              <th className="px-3 py-2">Foreground</th>
              {SURFACES.map((surface) => (
                <th key={surface} className="px-3 py-2 text-right">
                  on {surface}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEXT_PAIRS.map((fg) => (
              <tr key={fg} className="border-border border-t">
                <td className="px-3 py-1">
                  <span className="text-code" style={{ background: "transparent", padding: 0 }}>
                    {fg}
                  </span>
                </td>
                {SURFACES.map((bg) => (
                  <Cell
                    key={bg}
                    value={ratio(tokens, fg, bg)}
                    threshold={WCAG_TEXT}
                    exempt={fg === "text-muted"}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <Text variant="section-title">Non-text contrast (threshold {WCAG_NON_TEXT}:1)</Text>
        <Text variant="body-secondary">
          Dots, icons, borders and chart lines, held to 3:1 on every surface in both themes.
        </Text>
        <table className="border-border rounded-card text-13 w-full border-collapse border">
          <thead>
            <tr className="text-eyebrow text-left">
              <th className="px-3 py-2">Color</th>
              {SURFACES.map((surface) => (
                <th key={surface} className="px-3 py-2 text-right">
                  on {surface}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NON_TEXT_PAIRS.map((fg) => (
              <tr key={fg} className="border-border border-t">
                <td className="px-3 py-1">
                  <span className="text-code" style={{ background: "transparent", padding: 0 }}>
                    {fg}
                  </span>
                </td>
                {SURFACES.map((bg) => (
                  <Cell key={bg} value={ratio(tokens, fg, bg)} threshold={WCAG_NON_TEXT} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <Text variant="section-title">Spacing, radius, motion, layers, elevation</Text>
        <table className="border-border rounded-card text-13 w-full max-w-[640px] border-collapse border">
          <tbody>
            {OTHER_TOKENS.map((name) => (
              <tr key={name} className="border-border border-t">
                <td className="px-3 py-1">
                  <span className="text-code" style={{ background: "transparent", padding: 0 }}>
                    {name}
                  </span>
                </td>
                <td className="tabular text-text-secondary px-3 py-1">{tokens[name] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
