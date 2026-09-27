"use client";

import * as Radix from "@radix-ui/react-dropdown-menu";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { MenuRowContent, type MenuRowProps } from "./menu-parts";
import {
  dropdownOrigin,
  menuContentClasses,
  menuIndicatorSlotClasses,
  menuItemClasses,
  menuItemDestructiveClasses,
  menuLabelClasses,
  menuSeparatorClasses,
} from "./menu-styles";

/**
 * A menu of actions opened from a button (Radix DropdownMenu). Compose it:
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><IconButton icon="ellipsis" label="More" /></DropdownMenuTrigger>
 *     <DropdownMenuContent>
 *       <DropdownMenuItem icon="terminal">Open shell</DropdownMenuItem>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem icon="trash-2" destructive>Delete</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 *
 * Enter, Space and ArrowDown open it; arrows move, typeahead jumps, ArrowRight
 * opens a submenu, Escape closes and returns focus to the trigger.
 */
export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;
export const DropdownMenuSub = Radix.Sub;

export interface DropdownMenuContentProps extends ComponentPropsWithoutRef<typeof Radix.Content> {
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null | undefined;
}

export const DropdownMenuContent = forwardRef<
  ComponentRef<typeof Radix.Content>,
  DropdownMenuContentProps
>(function DropdownMenuContent(
  { className, sideOffset = 4, collisionPadding = 8, align = "start", container, ...rest },
  ref,
) {
  return (
    <Radix.Portal container={container}>
      <Radix.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        className={cn(menuContentClasses, dropdownOrigin, className)}
        {...rest}
      />
    </Radix.Portal>
  );
});

export interface DropdownMenuItemProps
  extends Omit<ComponentPropsWithoutRef<typeof Radix.Item>, "children">, MenuRowProps {
  children: ReactNode;
  /** Forced interaction state for gallery screenshots ("hover"). */
  "data-force"?: string;
}

export const DropdownMenuItem = forwardRef<ComponentRef<typeof Radix.Item>, DropdownMenuItemProps>(
  function DropdownMenuItem(
    { icon, shortcut, destructive = false, className, children, asChild, ...rest },
    ref,
  ) {
    return (
      <Radix.Item
        ref={ref}
        asChild={asChild === true}
        data-destructive={destructive || undefined}
        className={cn(menuItemClasses, destructive && menuItemDestructiveClasses, className)}
        {...rest}
      >
        {asChild === true ? (
          children
        ) : (
          <MenuRowContent icon={icon} shortcut={shortcut} destructive={destructive}>
            {children}
          </MenuRowContent>
        )}
      </Radix.Item>
    );
  },
);

export interface DropdownMenuCheckboxItemProps extends Omit<
  ComponentPropsWithoutRef<typeof Radix.CheckboxItem>,
  "children"
> {
  children: ReactNode;
  shortcut?: MenuRowProps["shortcut"];
}

/** A toggle row; a check marks it on. Selecting keeps the menu open. */
export const DropdownMenuCheckboxItem = forwardRef<
  ComponentRef<typeof Radix.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem({ className, children, shortcut, onSelect, ...rest }, ref) {
  return (
    <Radix.CheckboxItem
      ref={ref}
      className={cn(menuItemClasses, className)}
      onSelect={(event) => {
        // Toggles stay open so several can be flipped in a row.
        event.preventDefault();
        onSelect?.(event);
      }}
      {...rest}
    >
      <span className={menuIndicatorSlotClasses}>
        <Radix.ItemIndicator className="text-accent inline-flex">
          <Icon name="check" size={16} />
        </Radix.ItemIndicator>
      </span>
      <MenuRowContent shortcut={shortcut}>{children}</MenuRowContent>
    </Radix.CheckboxItem>
  );
});

export const DropdownMenuRadioGroup = Radix.RadioGroup;

export interface DropdownMenuRadioItemProps extends Omit<
  ComponentPropsWithoutRef<typeof Radix.RadioItem>,
  "children"
> {
  children: ReactNode;
  /**
   * marker: a square signal marker before the label (sort orders, modes).
   * check: an accent check at the right edge, for rows that lead with their
   * own icon or avatar (environments, workspaces).
   */
  indicator?: "marker" | "check";
}

/** One of a set; the chosen row shows the square signal marker or a check. */
export const DropdownMenuRadioItem = forwardRef<
  ComponentRef<typeof Radix.RadioItem>,
  DropdownMenuRadioItemProps
>(function DropdownMenuRadioItem({ className, children, indicator = "marker", ...rest }, ref) {
  return (
    <Radix.RadioItem ref={ref} className={cn(menuItemClasses, className)} {...rest}>
      {indicator === "marker" && (
        <span className={menuIndicatorSlotClasses}>
          <Radix.ItemIndicator className="bg-accent block size-[6px]" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {indicator === "check" && (
        <span className={menuIndicatorSlotClasses}>
          <Radix.ItemIndicator className="text-accent inline-flex">
            <Icon name="check" size={16} />
          </Radix.ItemIndicator>
        </span>
      )}
    </Radix.RadioItem>
  );
});

export const DropdownMenuSeparator = forwardRef<
  ComponentRef<typeof Radix.Separator>,
  ComponentPropsWithoutRef<typeof Radix.Separator>
>(function DropdownMenuSeparator({ className, ...rest }, ref) {
  return <Radix.Separator ref={ref} className={cn(menuSeparatorClasses, className)} {...rest} />;
});

export const DropdownMenuLabel = forwardRef<
  ComponentRef<typeof Radix.Label>,
  ComponentPropsWithoutRef<typeof Radix.Label>
>(function DropdownMenuLabel({ className, ...rest }, ref) {
  return <Radix.Label ref={ref} className={cn(menuLabelClasses, className)} {...rest} />;
});

export interface DropdownMenuSubTriggerProps
  extends
    Omit<ComponentPropsWithoutRef<typeof Radix.SubTrigger>, "children">,
    Omit<MenuRowProps, "destructive"> {
  children: ReactNode;
}

/** Opens a nested menu with ArrowRight, Enter or hover. */
export const DropdownMenuSubTrigger = forwardRef<
  ComponentRef<typeof Radix.SubTrigger>,
  DropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger({ icon, className, children, ...rest }, ref) {
  return (
    <Radix.SubTrigger
      ref={ref}
      className={cn(menuItemClasses, "data-[state=open]:bg-surface-hover", className)}
      {...rest}
    >
      <MenuRowContent
        icon={icon}
        trailing={<Icon name="chevron-right" size={14} className="text-text-secondary" />}
      >
        {children}
      </MenuRowContent>
    </Radix.SubTrigger>
  );
});

export const DropdownMenuSubContent = forwardRef<
  ComponentRef<typeof Radix.SubContent>,
  ComponentPropsWithoutRef<typeof Radix.SubContent> & {
    container?: HTMLElement | null | undefined;
  }
>(function DropdownMenuSubContent(
  { className, sideOffset = 6, collisionPadding = 8, container, ...rest },
  ref,
) {
  return (
    <Radix.Portal container={container}>
      <Radix.SubContent
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(menuContentClasses, dropdownOrigin, className)}
        {...rest}
      />
    </Radix.Portal>
  );
});
