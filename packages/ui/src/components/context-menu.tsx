"use client";

import * as Radix from "@radix-ui/react-context-menu";
import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { MenuRowContent, type MenuRowProps } from "./menu-parts";
import {
  contextOrigin,
  menuContentClasses,
  menuIndicatorSlotClasses,
  menuItemClasses,
  menuItemDestructiveClasses,
  menuLabelClasses,
  menuSeparatorClasses,
} from "./menu-styles";

/** Touch: a press held this long opens the menu (SPEC C5). */
export const LONG_PRESS_MS = 500;

/**
 * A menu opened on an area (Radix ContextMenu): right-click, Shift+F10 or the
 * context-menu key on the focused element, or a 500 ms long-press on touch.
 * It shares every row style with DropdownMenu. The area is the trigger:
 *
 *   <ContextMenu>
 *     <ContextMenuTrigger asChild><button>…node…</button></ContextMenuTrigger>
 *     <ContextMenuContent>…rows…</ContextMenuContent>
 *   </ContextMenu>
 */
export const ContextMenu = Radix.Root;
export const ContextMenuGroup = Radix.Group;
export const ContextMenuSub = Radix.Sub;
export const ContextMenuRadioGroup = Radix.RadioGroup;

/** Opens the menu at a point by sending the browser's own contextmenu event. */
function openAt(target: Element, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }),
  );
}

export const ContextMenuTrigger = forwardRef<
  ComponentRef<typeof Radix.Trigger>,
  ComponentPropsWithoutRef<typeof Radix.Trigger>
>(function ContextMenuTrigger({ onKeyDown, onPointerDown, ...rest }, ref) {
  const press = useRef<number | undefined>(undefined);

  const cancelPress = () => {
    window.clearTimeout(press.current);
    press.current = undefined;
  };

  return (
    <Radix.Trigger
      ref={ref}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        onKeyDown?.(event);
        const keyboardMenu = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
        if (!event.defaultPrevented && keyboardMenu) {
          // Browsers disagree on where a keyboard contextmenu lands; open it
          // just under the focused element's top-left corner, like a native menu.
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openAt(event.currentTarget, rect.left + 8, rect.top + Math.min(rect.height, 32));
        }
      }}
      onPointerDown={(event: PointerEvent<HTMLSpanElement>) => {
        onPointerDown?.(event);
        if (event.pointerType !== "touch") {
          return;
        }
        // Radix waits 700 ms; Lumen opens at 500 ms. Moving or lifting cancels.
        const { clientX, clientY } = event;
        const target = event.currentTarget;
        cancelPress();
        press.current = window.setTimeout(() => {
          openAt(target, clientX, clientY);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={cancelPress}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      {...rest}
    />
  );
});

export interface ContextMenuContentProps extends ComponentPropsWithoutRef<typeof Radix.Content> {
  container?: HTMLElement | null | undefined;
}

export const ContextMenuContent = forwardRef<
  ComponentRef<typeof Radix.Content>,
  ContextMenuContentProps
>(function ContextMenuContent({ className, collisionPadding = 8, container, ...rest }, ref) {
  return (
    <Radix.Portal container={container}>
      <Radix.Content
        ref={ref}
        collisionPadding={collisionPadding}
        className={cn(menuContentClasses, contextOrigin, className)}
        {...rest}
      />
    </Radix.Portal>
  );
});

export interface ContextMenuItemProps
  extends Omit<ComponentPropsWithoutRef<typeof Radix.Item>, "children">, MenuRowProps {
  children: ReactNode;
  "data-force"?: string;
}

export const ContextMenuItem = forwardRef<ComponentRef<typeof Radix.Item>, ContextMenuItemProps>(
  function ContextMenuItem(
    { icon, shortcut, destructive = false, className, children, ...rest },
    ref,
  ) {
    return (
      <Radix.Item
        ref={ref}
        data-destructive={destructive || undefined}
        className={cn(menuItemClasses, destructive && menuItemDestructiveClasses, className)}
        {...rest}
      >
        <MenuRowContent icon={icon} shortcut={shortcut} destructive={destructive}>
          {children}
        </MenuRowContent>
      </Radix.Item>
    );
  },
);

export const ContextMenuCheckboxItem = forwardRef<
  ComponentRef<typeof Radix.CheckboxItem>,
  Omit<ComponentPropsWithoutRef<typeof Radix.CheckboxItem>, "children"> & { children: ReactNode }
>(function ContextMenuCheckboxItem({ className, children, ...rest }, ref) {
  return (
    <Radix.CheckboxItem ref={ref} className={cn(menuItemClasses, className)} {...rest}>
      <span className={menuIndicatorSlotClasses}>
        <Radix.ItemIndicator className="text-accent inline-flex">
          <Icon name="check" size={16} />
        </Radix.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Radix.CheckboxItem>
  );
});

export const ContextMenuRadioItem = forwardRef<
  ComponentRef<typeof Radix.RadioItem>,
  Omit<ComponentPropsWithoutRef<typeof Radix.RadioItem>, "children"> & { children: ReactNode }
>(function ContextMenuRadioItem({ className, children, ...rest }, ref) {
  return (
    <Radix.RadioItem ref={ref} className={cn(menuItemClasses, className)} {...rest}>
      <span className={menuIndicatorSlotClasses}>
        <Radix.ItemIndicator className="bg-accent block size-[6px]" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </Radix.RadioItem>
  );
});

export const ContextMenuSeparator = forwardRef<
  ComponentRef<typeof Radix.Separator>,
  ComponentPropsWithoutRef<typeof Radix.Separator>
>(function ContextMenuSeparator({ className, ...rest }, ref) {
  return <Radix.Separator ref={ref} className={cn(menuSeparatorClasses, className)} {...rest} />;
});

export const ContextMenuLabel = forwardRef<
  ComponentRef<typeof Radix.Label>,
  ComponentPropsWithoutRef<typeof Radix.Label>
>(function ContextMenuLabel({ className, ...rest }, ref) {
  return <Radix.Label ref={ref} className={cn(menuLabelClasses, className)} {...rest} />;
});

export const ContextMenuSubTrigger = forwardRef<
  ComponentRef<typeof Radix.SubTrigger>,
  Omit<ComponentPropsWithoutRef<typeof Radix.SubTrigger>, "children"> &
    Omit<MenuRowProps, "destructive"> & { children: ReactNode }
>(function ContextMenuSubTrigger({ icon, className, children, ...rest }, ref) {
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

export const ContextMenuSubContent = forwardRef<
  ComponentRef<typeof Radix.SubContent>,
  ComponentPropsWithoutRef<typeof Radix.SubContent> & {
    container?: HTMLElement | null | undefined;
  }
>(function ContextMenuSubContent(
  { className, sideOffset = 6, collisionPadding = 8, container, ...rest },
  ref,
) {
  return (
    <Radix.Portal container={container}>
      <Radix.SubContent
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(menuContentClasses, contextOrigin, className)}
        {...rest}
      />
    </Radix.Portal>
  );
});
