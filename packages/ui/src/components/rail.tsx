"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";
import { useSkipMountFocus } from "../lib/use-skip-mount-focus";
import { useStoredState } from "../lib/use-stored-state";

import { IconButton } from "./icon-button";
import type { KbdKey } from "./kbd";
import { Tooltip } from "./tooltip";

/** localStorage key for the pinned rail (SPEC C7.1). */
export const RAIL_PINNED_KEY = "lumen.rail.pinned";
export const RAIL_COLLAPSED_WIDTH = 56;
export const RAIL_EXPANDED_WIDTH = 220;
/** Hovering this long expands the rail; leaving collapses it after RAIL_COLLAPSE_DELAY. */
export const RAIL_EXPAND_DELAY = 150;
export const RAIL_COLLAPSE_DELAY = 300;

export interface RailNavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  /** Shown in the collapsed tooltip: ["G", "then", "P"]. */
  shortcut?: KbdKey[];
  active?: boolean;
}

type Slot = ReactNode | ((expanded: boolean) => ReactNode);

export interface RailProps {
  items: RailNavItem[];
  /** Controlled pin. Without it the pin persists in localStorage. */
  pinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
  /** Above the items: the WorkspaceSwitcher. A function receives whether the rail is expanded. */
  top?: Slot;
  /** Below the items: help, the account avatar. */
  bottom?: Slot;
  /** Expand on hover after 150 ms. */
  hoverExpand?: boolean;
  /** Force the expanded look, for gallery screenshots. */
  expanded?: boolean;
  /** Hide under 1024 px, where the drawer and the bottom tab bar take over. */
  responsive?: boolean;
  /** Tablet drawer (under 1024 px), opened from the top bar's menu button. */
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** Render the drawer inside this element (gallery previews). */
  drawerContainer?: HTMLElement | null | undefined;
  className?: string;
}

function renderSlot(slot: Slot | undefined, expanded: boolean): ReactNode {
  return typeof slot === "function" ? slot(expanded) : slot;
}

export interface RailItemProps {
  item: RailNavItem;
  /** Labels visible: no tooltip. */
  expanded: boolean;
}

/**
 * One destination: a 40 px row with a 20 px icon. The active item has a 2 px
 * accent bar at the rail's edge and full-strength text. Collapsed, the label
 * and shortcut live in a tooltip.
 */
export function RailItem({ item, expanded }: RailItemProps) {
  return (
    <li className="px-2">
      <Tooltip
        content={item.label}
        side="right"
        disabled={expanded}
        {...(item.shortcut === undefined ? {} : { shortcut: item.shortcut })}
      >
        <a
          href={item.href}
          data-rail-item={item.id}
          aria-current={item.active === true ? "page" : undefined}
          className={cn(
            "rounded-control text-text-secondary relative flex h-[40px] items-center gap-3 px-[10px]",
            "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
            "is-hover:bg-surface-hover is-hover:text-text aria-[current=page]:text-text",
          )}
        >
          {item.active === true && (
            <span
              aria-hidden="true"
              className="bg-accent absolute top-3 -left-2 h-4 w-[2px] shadow-[0_0_12px_var(--color-accent)]"
            />
          )}
          <Icon name={item.icon} size={20} className="shrink-0" />
          <span
            className={cn(
              "text-label min-w-0 truncate text-inherit transition-opacity duration-[var(--dur-fast)]",
              expanded ? "opacity-100 delay-[80ms]" : "opacity-0",
            )}
          >
            {item.label}
          </span>
        </a>
      </Tooltip>
    </li>
  );
}

/** Up and Down (and Home, End) move focus between rail links. */
function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[data-rail-item]")];
  const index = links.indexOf(event.target as HTMLAnchorElement);
  if (index === -1) {
    return;
  }
  const target =
    event.key === "ArrowDown"
      ? links[(index + 1) % links.length]
      : event.key === "ArrowUp"
        ? links[(index - 1 + links.length) % links.length]
        : event.key === "Home"
          ? links[0]
          : event.key === "End"
            ? links.at(-1)
            : undefined;
  if (target !== undefined) {
    event.preventDefault();
    target.focus();
  }
}

/**
 * The main navigation rail. 56 px of icons with tooltips; hovering 150 ms
 * slides it open to 220 px over the page, leaving collapses it 300 ms later.
 * Pinning keeps it open and makes room for it; the pin is remembered. Under
 * 1024 px it hides behind the top bar's menu button (a drawer), and phones use
 * MobileTabBar instead.
 */
export function Rail({
  items,
  pinned: pinnedProp,
  onPinnedChange,
  top,
  bottom,
  hoverExpand = true,
  expanded: expandedProp,
  responsive = true,
  drawerOpen = false,
  onDrawerOpenChange,
  drawerContainer,
  className,
}: RailProps) {
  const [storedPinned, setStoredPinned] = useStoredState(RAIL_PINNED_KEY, false, (raw) =>
    raw === "true" ? true : raw === "false" ? false : undefined,
  );
  const pinned = pinnedProp ?? storedPinned;
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pointerInside = useRef(false);
  const expanded = expandedProp ?? (pinned || hovered);
  const skipDrawerFocus = useSkipMountFocus(drawerOpen, drawerContainer !== undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setHovered(next);
    }, delay);
  };

  const togglePin = () => {
    const next = !pinned;
    if (pinnedProp === undefined) {
      setStoredPinned(next);
    }
    onPinnedChange?.(next);
    // Unpinning under the pointer keeps it open until the pointer leaves.
    window.clearTimeout(timer.current);
    setHovered(!next && pointerInside.current);
  };

  const list = (isExpanded: boolean) => (
    <ul className="flex flex-col gap-[2px]" onKeyDown={onListKeyDown}>
      {items.map((item) => (
        <RailItem key={item.id} item={item} expanded={isExpanded} />
      ))}
    </ul>
  );

  const pin = (
    <div className="px-2">
      <IconButton
        icon="pin"
        label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
        pressed={pinned}
        tooltipSide="right"
        onClick={togglePin}
        className="ml-1"
      />
    </div>
  );

  return (
    <>
      <div
        data-rail=""
        data-expanded={expanded || undefined}
        data-pinned={pinned || undefined}
        className={cn("relative h-full shrink-0", responsive && "max-lg:hidden", className)}
        style={{ width: pinned ? RAIL_EXPANDED_WIDTH : RAIL_COLLAPSED_WIDTH }}
      >
        <nav
          aria-label="Main"
          onPointerEnter={(event) => {
            pointerInside.current = true;
            if (hoverExpand && event.pointerType === "mouse") {
              schedule(true, RAIL_EXPAND_DELAY);
            }
          }}
          onPointerLeave={(event) => {
            pointerInside.current = false;
            if (hoverExpand && event.pointerType === "mouse") {
              schedule(false, RAIL_COLLAPSE_DELAY);
            }
          }}
          className={cn(
            "bg-surface absolute inset-y-0 left-0 z-[var(--z-rail)] flex flex-col gap-2 py-2",
            // The panel is always 220 wide; a clip reveals it so only transform-like
            // properties animate and the page never reflows during hover.
            "transition-[clip-path] duration-[var(--dur-base)] ease-[var(--ease-panel)]",
          )}
          style={{
            width: RAIL_EXPANDED_WIDTH,
            clipPath: expanded
              ? "inset(0 -24px 0 0)"
              : `inset(0 ${String(RAIL_EXPANDED_WIDTH - RAIL_COLLAPSED_WIDTH)}px 0 0)`,
          }}
        >
          {/* The right-hand hairline travels with the visible edge. */}
          <span
            aria-hidden="true"
            className="bg-border absolute inset-y-0 right-0 w-px transition-transform duration-[var(--dur-base)] ease-[var(--ease-panel)]"
            style={{
              transform: expanded
                ? "none"
                : `translateX(-${String(RAIL_EXPANDED_WIDTH - RAIL_COLLAPSED_WIDTH)}px)`,
            }}
          />
          {top !== undefined && <div className="px-2">{renderSlot(top, expanded)}</div>}
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{list(expanded)}</div>
          {bottom !== undefined && <div className="px-2">{renderSlot(bottom, expanded)}</div>}
          {pin}
        </nav>
      </div>
      {responsive && (
        <Dialog.Root
          open={drawerOpen}
          {...(onDrawerOpenChange === undefined ? {} : { onOpenChange: onDrawerOpenChange })}
          modal={drawerContainer === undefined}
        >
          <Dialog.Portal container={drawerContainer}>
            {drawerContainer === undefined ? (
              <Dialog.Overlay className="bg-overlay fixed inset-0 z-[var(--z-modal)] data-[state=closed]:animate-[lumen-fade-out_var(--dur-exit-base)_var(--ease-in)] data-[state=open]:animate-[lumen-fade-in_var(--dur-base)_var(--ease-out)] lg:hidden" />
            ) : (
              <div aria-hidden="true" className="bg-overlay absolute inset-0" />
            )}
            <Dialog.Content
              aria-describedby={undefined}
              aria-modal={drawerContainer === undefined ? true : undefined}
              onOpenAutoFocus={(event) => {
                if (skipDrawerFocus()) {
                  event.preventDefault();
                }
              }}
              onInteractOutside={(event) => {
                if (drawerContainer !== undefined) {
                  event.preventDefault();
                }
              }}
              className={cn(
                drawerContainer === undefined ? "fixed lg:hidden" : "absolute",
                "bg-surface border-border inset-y-0 left-0 z-[var(--z-modal)] flex w-[220px] flex-col gap-2 border-r py-2 outline-none",
                "data-[state=open]:animate-[lumen-drawer-in_var(--dur-base)_var(--ease-panel)]",
                "data-[state=closed]:animate-[lumen-drawer-out_var(--dur-exit-base)_var(--ease-in)]",
              )}
            >
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-2">
                {top !== undefined && <div className="px-2">{renderSlot(top, true)}</div>}
                <div className="min-h-0 flex-1 overflow-y-auto">{list(true)}</div>
                {bottom !== undefined && <div className="px-2">{renderSlot(bottom, true)}</div>}
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}

export interface MobileTabBarItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  active?: boolean;
}

export interface MobileTabBarProps {
  /** Five destinations: Home, Projects, Deploys, Servers, More. */
  items: MobileTabBarItem[];
  className?: string;
}

/** Phones replace the rail with this bottom bar: 56 px plus the safe area. */
export function MobileTabBar({ items, className }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "bg-surface border-border border-t pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="flex h-[56px]">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-1">
            <a
              href={item.href}
              aria-current={item.active === true ? "page" : undefined}
              className={cn(
                "focus-inset text-text-secondary relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1",
                "is-hover:text-text aria-[current=page]:text-text",
              )}
            >
              {item.active === true && (
                <span
                  aria-hidden="true"
                  className="bg-accent absolute inset-x-4 top-0 h-[2px] shadow-[0_0_12px_var(--color-accent)]"
                />
              )}
              <Icon name={item.icon} size={20} />
              <span className="text-action max-w-full truncate px-1 tracking-normal text-inherit">
                {item.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
