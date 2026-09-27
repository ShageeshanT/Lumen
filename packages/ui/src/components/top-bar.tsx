"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { buttonVariants } from "./button";
import { Kbd } from "./kbd";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { StatusMarker } from "./status-marker";

export interface TopBarProps {
  /** Breadcrumbs, and under 1024 px the menu button that opens the rail drawer. */
  left: ReactNode;
  center?: ReactNode;
  /** Environment switcher, search, deploy activity, notifications, theme; 8 px apart. */
  right?: ReactNode;
  /** Global banners (offline, update available) render above the bar. */
  banner?: ReactNode;
  /** The realtime connection dropped: a 2 px warning line sweeps the bottom edge. */
  reconnecting?: boolean;
  className?: string;
}

/**
 * The 48 px bar across the top of every page. Items are tabbable left to
 * right in DOM order. While reconnecting, a warning line sweeps its bottom
 * edge and "Reconnecting" is announced.
 */
export function TopBar({
  left,
  center,
  right,
  banner,
  reconnecting = false,
  className,
}: TopBarProps) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {banner}
      <header
        role="banner"
        className="bg-bg border-border relative flex h-12 min-w-0 shrink-0 items-center gap-4 border-b px-4"
      >
        <div className="@container flex min-w-0 flex-1 items-center gap-3">{left}</div>
        {center !== undefined && <div className="flex shrink-0 items-center">{center}</div>}
        {right !== undefined && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        {reconnecting && (
          <div className="absolute inset-x-0 -bottom-px h-[2px] overflow-hidden">
            <span role="status" className="sr-only">
              Reconnecting
            </span>
            <span aria-hidden="true" className="bg-warning progress-sweep block h-full w-2/5" />
          </div>
        )}
      </header>
    </div>
  );
}

export type SearchButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/** Opens the command palette: "Search ⌘K", icon-only under 1024 px. */
export const SearchButton = forwardRef<HTMLButtonElement, SearchButtonProps>(function SearchButton(
  { className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label="Search"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        buttonVariants({ variant: "secondary", size: "sm" }),
        "max-lg:w-[28px] max-lg:px-0",
        className,
      )}
      {...rest}
    >
      <Icon name="search" size={14} />
      <span className="max-lg:hidden">Search</span>
      <Kbd keys={["mod", "K"]} size="sm" className="max-lg:hidden" />
    </button>
  );
});

export interface DeployActivityProps {
  /** Deployments in progress. */
  count: number;
  /** The popover body: one progress row per deployment. */
  children: ReactNode;
  /** Force the popover open, for gallery screenshots. */
  open?: boolean;
  /** Popover portal target (gallery previews). */
  container?: HTMLElement | null | undefined;
}

/**
 * "DEPLOYING [ 2 ]" with a blinking marker. Opens a popover listing the
 * deployments in progress; hidden when nothing is deploying.
 */
export function DeployActivity({ count, children, open, container }: DeployActivityProps) {
  if (count <= 0) {
    return null;
  }
  const noun = count === 1 ? "deployment" : "deployments";
  return (
    <Popover {...(open === undefined ? {} : { open })}>
      <PopoverTrigger
        aria-label={`${String(count)} ${noun} in progress`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-text")}
      >
        <StatusMarker status="deploying" />
        <span className="max-md:hidden">Deploying</span>
        <span className="tabular">
          <span aria-hidden="true" className="text-text-secondary">
            [{" "}
          </span>
          {count}
          <span aria-hidden="true" className="text-text-secondary">
            {" "}
            ]
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        title="Deploy activity"
        align="end"
        width={320}
        avoidCollisions={open !== true}
        container={container}
        {...(open === true
          ? {
              onOpenAutoFocus: (event: Event) => {
                event.preventDefault();
              },
            }
          : {})}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
