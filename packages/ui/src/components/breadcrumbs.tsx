"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";
import { truncateEnd, truncateMiddle } from "../lib/text";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { MenuRowContent } from "./menu-parts";
import { Tooltip } from "./tooltip";

export interface BreadcrumbItem {
  label: string;
  /** Every item but the last is a link. */
  href?: string;
  /** 14 px icon before workspace and project items. */
  icon?: IconName;
  /** Names end-truncate; ids and hashes truncate in the middle. */
  truncate?: "end" | "middle";
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Above this many items the middle ones fold into a "…" menu. */
  maxItems?: number;
  /**
   * Show only the current item under 768 px (the top bar on phones), and in a
   * container query context (`@container`, such as the top bar's left slot)
   * narrower than 384 px.
   */
  collapseOnMobile?: boolean;
  className?: string;
}

/** Labels longer than this are shortened, with the full name in a tooltip. */
export const BREADCRUMB_MAX_CHARS = 24;

function shorten(item: BreadcrumbItem): string {
  if (Array.from(item.label).length <= BREADCRUMB_MAX_CHARS) {
    return item.label;
  }
  return item.truncate === "middle"
    ? truncateMiddle(item.label, 11, 12)
    : truncateEnd(item.label, BREADCRUMB_MAX_CHARS);
}

const LINK = cn(
  "text-text-secondary rounded-control inline-flex min-w-0 items-center gap-[6px] whitespace-nowrap",
  "decoration-text underline-offset-4 transition-colors duration-[var(--dur-fast)] is-hover:text-text is-hover:underline",
);

/**
 * Where you are: Workspace / Project / Service. Mono caps chrome, "/" between
 * items, the current item in full-strength text. Long names shorten with the
 * full name on hover and focus; deep paths fold the middle into a menu.
 */
export function Breadcrumbs({
  items,
  maxItems = 4,
  collapseOnMobile = true,
  className,
}: BreadcrumbsProps) {
  const overflow = items.length > maxItems && maxItems >= 2;
  const head = overflow ? items.slice(0, 1) : items;
  const hidden = overflow ? items.slice(1, items.length - (maxItems - 2)) : [];
  const tail = overflow ? items.slice(items.length - (maxItems - 2)) : [];
  const lastIndex = items.length - 1;

  const renderItem = (item: BreadcrumbItem, index: number) => {
    const current = index === lastIndex;
    const text = shorten(item);
    const truncated = text !== item.label;
    const content = (
      <>
        {item.icon !== undefined && <Icon name={item.icon} size={14} className="shrink-0" />}
        {truncated ? (
          <>
            <span aria-hidden="true" className="truncate">
              {text}
            </span>
            <span className="sr-only">{item.label}</span>
          </>
        ) : (
          <span className="truncate">{text}</span>
        )}
      </>
    );
    const element = current ? (
      <span
        aria-current="page"
        tabIndex={truncated ? 0 : undefined}
        className="text-text rounded-control inline-flex min-w-0 items-center gap-[6px] whitespace-nowrap"
      >
        {content}
      </span>
    ) : (
      <a href={item.href} className={LINK}>
        {content}
      </a>
    );
    return truncated ? <Tooltip content={item.label}>{element}</Tooltip> : element;
  };

  const separator = (hideOnMobile: boolean) => (
    <span
      aria-hidden="true"
      className={cn(
        "text-text-muted px-2",
        hideOnMobile && collapseOnMobile && "max-md:hidden @max-sm:hidden",
      )}
    >
      /
    </span>
  );

  const entries: { key: string; node: ReactNode; last: boolean }[] = [
    ...head.map((item, index) => ({
      key: `h-${String(index)}`,
      node: renderItem(item, index),
      last: index === lastIndex,
    })),
  ];
  if (overflow) {
    entries.push({
      key: "fold",
      last: false,
      node: (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Show ${String(hidden.length)} more levels`}
            className={cn(LINK, "h-6 px-1")}
          >
            …
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {hidden.map((item) => (
              <DropdownMenuItem key={`${item.label}-${item.href ?? ""}`} asChild>
                <a href={item.href}>
                  <MenuRowContent icon={item.icon}>{item.label}</MenuRowContent>
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });
    tail.forEach((item, offset) => {
      const index = items.length - tail.length + offset;
      entries.push({
        key: `t-${String(index)}`,
        node: renderItem(item, index),
        last: index === lastIndex,
      });
    });
  }

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="text-label text-text-secondary flex min-w-0 items-center">
        {entries.map((entry, position) => (
          <li
            key={entry.key}
            className={cn(
              "flex min-w-0 items-center",
              !entry.last && collapseOnMobile && "max-md:hidden @max-sm:hidden",
            )}
          >
            {position > 0 && separator(entry.last)}
            {entry.node}
          </li>
        ))}
      </ol>
    </nav>
  );
}
