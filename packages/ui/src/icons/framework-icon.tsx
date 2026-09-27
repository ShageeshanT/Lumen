import type { CSSProperties } from "react";

import { cn } from "../lib/cn";

import { Icon, type IconSize } from "./icon";
import { DEVICONS, type DeviconKey } from "./vendor/devicon-paths";

/**
 * A vendored Devicon mark, drawn inline. The mark fills 20 of 24 units, like
 * the Lucide icons it sits next to, and takes `currentColor` unless a `color`
 * is given.
 */
export function VendoredMark({
  icon,
  size,
  color,
  className,
  label,
}: {
  icon: DeviconKey;
  size: IconSize;
  color?: string | undefined;
  className?: string | undefined;
  label?: string | undefined;
}) {
  const mark = DEVICONS[icon];
  const style: CSSProperties | undefined = color === undefined ? undefined : { color };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      focusable="false"
      data-mark={icon}
    >
      <svg x="2" y="2" width="20" height="20" viewBox={mark.viewBox}>
        {mark.paths.map((path, index) => (
          <path key={index} d={path.d} fillRule={"fillRule" in path ? path.fillRule : undefined} />
        ))}
      </svg>
    </svg>
  );
}

export const FRAMEWORKS = [
  "node",
  "python",
  "go",
  "rust",
  "ruby",
  "php",
  "java",
  "dotnet",
  "deno",
  "bun",
  "static",
  "docker",
  "unknown",
] as const;

export type Framework = (typeof FRAMEWORKS)[number];

/** Human names, used for labels and tooltips. */
export const FRAMEWORK_NAMES: Record<Framework, string> = {
  node: "Node.js",
  python: "Python",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  java: "Java",
  dotnet: ".NET",
  deno: "Deno",
  bun: "Bun",
  static: "Static site",
  docker: "Dockerfile",
  unknown: "Unknown",
};

export interface FrameworkIconProps {
  framework: Framework;
  size?: IconSize;
  /** A brand tint. Monochrome (the current text color) when omitted. */
  color?: string;
  className?: string;
  /** Accessible name; omit when the framework's name is written next to it. */
  label?: string;
}

/**
 * The framework or language a service runs. Devicon marks for the languages,
 * Lucide `file-code` for static sites and `box` when Lumen cannot tell.
 */
export function FrameworkIcon({
  framework,
  size = 20,
  color,
  className,
  label,
}: FrameworkIconProps) {
  if (framework === "static" || framework === "unknown") {
    return (
      <span
        className={cn("inline-flex shrink-0", className)}
        style={color === undefined ? undefined : { color }}
      >
        <Icon
          name={framework === "static" ? "file-code" : "box"}
          size={size}
          {...(label === undefined ? {} : { label })}
        />
      </span>
    );
  }
  return (
    <VendoredMark icon={framework} size={size} color={color} className={className} label={label} />
  );
}
