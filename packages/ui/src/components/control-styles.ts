import { cn } from "../lib/cn";

/**
 * The shared look of every text-entry control (input, textarea, select and
 * combobox triggers). Focus shows an accent frame, a soft accent halo and
 * accent corner brackets; the global outline ring is replaced because a field
 * being typed in always deserves a visible state, keyboard or pointer.
 */
export function controlClasses({
  size = "md",
  invalid = false,
  monospace = false,
  className,
}: {
  size?: "sm" | "md";
  invalid?: boolean;
  monospace?: boolean;
  className?: string | undefined;
}) {
  return cn(
    "text-input bg-surface text-text w-full min-w-0 border rounded-control",
    "placeholder:text-text-muted",
    "transition-[border-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    size === "sm" ? "h-[28px] px-[10px] text-13" : "h-8 px-[10px] text-14",
    monospace ? "font-mono" : "font-sans",
    invalid
      ? "border-danger focus-visible:shadow-[0_0_0_3px_var(--color-danger-subtle)]"
      : "border-border is-hover:border-border-strong",
    "focus-visible:outline-none focus-visible:border-accent",
    !invalid && "focus-visible:shadow-[0_0_0_3px_var(--color-accent-subtle)]",
    "data-[force~=focus]:outline-none data-[force~=focus]:border-accent data-[force~=focus]:shadow-[0_0_0_3px_var(--color-accent-subtle)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "read-only:bg-bg read-only:text-text-secondary",
    className,
  );
}

/**
 * The frame around a control: accent corner brackets appear when the control
 * inside has keyboard or pointer focus (inputs cannot draw pseudo-elements, so
 * the brackets live here).
 */
export const controlFrameClasses = cn(
  "hud relative flex w-full items-center [--hud-size:5px] [--hud-offset:3px] [--hud-color:transparent]",
  "has-[:focus-visible]:[--hud-color:var(--color-accent)] has-[[data-force~=focus]]:[--hud-color:var(--color-accent)]",
);
