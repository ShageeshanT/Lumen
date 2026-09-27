import { cn } from "../lib/cn";

/**
 * The one look shared by DropdownMenu and ContextMenu (and the pickers built
 * on them): a raised panel with a strong hairline frame, 32 px rows, sans 13
 * labels, 16 px icons and right-aligned keyboard hints. It scales in from the
 * trigger side over --dur-base and leaves 80 ms faster with --ease-in.
 */
export const menuContentClasses = cn(
  "border-border-strong bg-surface-raised text-text shadow-raised rounded-card z-[var(--z-popover)] min-w-[200px] border p-1 outline-none",
  "max-h-[var(--radix-dropdown-menu-content-available-height,var(--radix-context-menu-content-available-height,480px))] overflow-y-auto",
  "data-[state=open]:animate-[lumen-pop-in_var(--dur-base)_var(--ease-panel)]",
  "data-[state=closed]:animate-[lumen-pop-out_var(--dur-exit-base)_var(--ease-in)]",
);

/** Transform origin per primitive, so the scale grows out of the trigger side. */
export const dropdownOrigin = "origin-(--radix-dropdown-menu-content-transform-origin)";
export const contextOrigin = "origin-(--radix-context-menu-content-transform-origin)";

export const menuItemClasses = cn(
  "text-13 text-text rounded-control relative flex h-8 cursor-default items-center gap-2 px-2 outline-none select-none",
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
  "data-[highlighted]:bg-surface-hover data-[force~=hover]:bg-surface-hover",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

/** Destructive rows: danger text, a 10 % danger tint on hover. */
export const menuItemDestructiveClasses = cn(
  "text-danger-text",
  "data-[highlighted]:bg-danger-subtle data-[force~=hover]:bg-danger-subtle",
);

export const menuSeparatorClasses = "bg-border mx-[-4px] my-1 h-px";

export const menuLabelClasses = "text-eyebrow px-2 pt-2 pb-1";

/** The 16 px leading slot that holds a check or a radio marker. */
export const menuIndicatorSlotClasses = "inline-flex size-4 shrink-0 items-center justify-center";
