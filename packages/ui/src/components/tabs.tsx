"use client";

import * as Radix from "@radix-ui/react-tabs";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { Tooltip } from "./tooltip";

export interface TabItem {
  value: string;
  label: string;
  /** Rendered as bracket notation after the label: DEPLOYMENTS [12]. */
  count?: number;
  icon?: IconName;
  /** Link mode: when every item has an href the tabs render as navigation links. */
  href?: string;
  disabled?: boolean;
  /** One sentence on hover explaining why a tab is disabled. */
  disabledReason?: string;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 36 px (md) or 32 px (sm) tall. */
  size?: "sm" | "md";
  /** Equal widths across the container, as in sheets. */
  fitted?: boolean;
  /** Names the tab list: "Service sections". */
  "aria-label": string;
  /** TabsContent panels. Leave empty when the panel lives elsewhere. */
  children?: ReactNode;
  className?: string;
}

interface Indicator {
  x: number;
  width: number;
}

const TAB_CLASSES = cn(
  "text-label text-text-secondary group/tab relative inline-flex h-full shrink-0 items-center justify-center gap-2 px-3 whitespace-nowrap select-none",
  "focus-inset transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
  "is-hover:text-text aria-selected:text-text aria-[current=page]:text-text",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
);

function TabLabel({ item }: { item: TabItem }) {
  return (
    <>
      {item.icon !== undefined && <Icon name={item.icon} size={14} />}
      <span>{item.label}</span>
      {item.count !== undefined && (
        <span className="tabular text-text-secondary">
          <span aria-hidden="true" className="text-text-muted">
            [
          </span>
          {item.count > 999 ? "999+" : item.count}
          <span aria-hidden="true" className="text-text-muted">
            ]
          </span>
        </span>
      )}
    </>
  );
}

/**
 * Tabs with an accent underline that slides to the active tab. Arrow keys,
 * Home and End move between tabs and activate them (Radix, automatic
 * activation). The row scrolls sideways with fade masks when it overflows.
 * With an `href` on every item the tabs are links (`aria-current="page"`) so
 * each view is deep-linkable.
 */
export function Tabs({
  items,
  value: valueProp,
  defaultValue,
  onValueChange,
  size = "md",
  fitted = false,
  "aria-label": ariaLabel,
  children,
  className,
}: TabsProps) {
  const [valueState, setValueState] = useState(defaultValue ?? items[0]?.value ?? "");
  const value = valueProp ?? valueState;
  const linkMode = items.length > 0 && items.every((item) => item.href !== undefined);
  const hasPanels = children !== undefined && children !== null;

  const scroller = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLElement>());
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const [animate, setAnimate] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    const tab = tabRefs.current.get(value);
    if (el !== null) {
      setEdges({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    }
    if (tab === undefined) {
      setIndicator(null);
      return;
    }
    setIndicator((previous) => {
      const next = { x: tab.offsetLeft, width: tab.offsetWidth };
      return previous?.x === next.x && previous.width === next.width ? previous : next;
    });
  }, [value]);

  // Layout effect: position the underline before paint so it never flashes at 0.
  useLayoutEffect(() => {
    measure();
    const el = scroller.current;
    const tab = tabRefs.current.get(value);
    if (el !== null && tab !== undefined) {
      // Keep the active tab in view without scrolling the page.
      if (tab.offsetLeft < el.scrollLeft) {
        el.scrollLeft = tab.offsetLeft - 24;
      } else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth + 24;
      }
    }
  }, [measure, value]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(el);
    // Fonts arriving change tab widths.
    if ("fonts" in document) {
      void document.fonts.ready.then(() => {
        measure();
      });
    }
    // Slide only after the first placement.
    const frame = requestAnimationFrame(() => {
      setAnimate(true);
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure]);

  const select = (next: string) => {
    setValueState(next);
    onValueChange?.(next);
  };

  const register = (key: string) => (node: HTMLElement | null) => {
    if (node === null) {
      tabRefs.current.delete(key);
    } else {
      tabRefs.current.set(key, node);
    }
  };

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent 0, black 24px" : "black 0"}, ${
          edges.right ? "black calc(100% - 24px), transparent 100%" : "black 100%"
        })`
      : undefined;

  const underline = indicator !== null && (
    <span
      aria-hidden="true"
      data-tabs-indicator=""
      className={cn(
        "bg-accent pointer-events-none absolute bottom-0 left-0 h-[2px] w-px origin-left",
        animate && "transition-transform duration-[var(--dur-base)] ease-[var(--ease-panel)]",
      )}
      style={{
        transform: `translateX(${String(indicator.x)}px) scaleX(${String(indicator.width)})`,
      }}
    />
  );

  const rowClasses = cn(
    "scrollbar-none relative flex overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-border)]",
    size === "sm" ? "h-8" : "h-[36px]",
  );

  // Links: arrows still move focus along the row, like the tablist.
  const onLinkKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const links = [...tabRefs.current.values()].sort((a, b) => a.offsetLeft - b.offsetLeft);
    const index = links.indexOf(event.target as HTMLElement);
    const target =
      event.key === "ArrowRight"
        ? links[(index + 1) % links.length]
        : event.key === "ArrowLeft"
          ? links[(index - 1 + links.length) % links.length]
          : event.key === "Home"
            ? links[0]
            : event.key === "End"
              ? links.at(-1)
              : undefined;
    if (target !== undefined && index !== -1) {
      event.preventDefault();
      target.focus();
    }
  };

  if (linkMode) {
    return (
      <nav aria-label={ariaLabel} className={cn("min-w-0", className)}>
        <div
          ref={scroller}
          className={rowClasses}
          style={mask === undefined ? undefined : { maskImage: mask }}
          onScroll={measure}
        >
          <ul className="relative flex min-w-full" onKeyDown={onLinkKeyDown}>
            {items.map((item) => (
              <li key={item.value} className={cn("flex", fitted && "flex-1")}>
                <a
                  ref={register(item.value)}
                  href={item.href}
                  aria-current={item.value === value ? "page" : undefined}
                  className={cn(TAB_CLASSES, fitted && "flex-1")}
                  onClick={() => {
                    select(item.value);
                  }}
                >
                  <TabLabel item={item} />
                </a>
              </li>
            ))}
            {underline}
          </ul>
        </div>
      </nav>
    );
  }

  return (
    <Radix.Root
      value={value}
      onValueChange={select}
      activationMode="automatic"
      className={cn("flex min-w-0 flex-col", className)}
    >
      <div
        ref={scroller}
        className={rowClasses}
        style={mask === undefined ? undefined : { maskImage: mask }}
        onScroll={measure}
      >
        <Radix.List aria-label={ariaLabel} className="relative flex min-w-full">
          {items.map((item) => {
            const trigger = (
              <Radix.Trigger
                key={item.value}
                ref={register(item.value)}
                value={item.value}
                disabled={item.disabled === true}
                // Without panels there is nothing to control; a dangling id fails axe.
                {...(hasPanels ? {} : { "aria-controls": undefined })}
                className={cn(
                  TAB_CLASSES,
                  fitted && "flex-1",
                  item.disabled === true &&
                    item.disabledReason !== undefined &&
                    "pointer-events-none",
                )}
              >
                <TabLabel item={item} />
              </Radix.Trigger>
            );
            return item.disabled === true && item.disabledReason !== undefined ? (
              <Tooltip key={item.value} content={item.disabledReason}>
                <span className={cn("inline-flex h-full", fitted && "flex-1")}>{trigger}</span>
              </Tooltip>
            ) : (
              trigger
            );
          })}
          {underline}
        </Radix.List>
      </div>
      {children}
    </Radix.Root>
  );
}

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

/** The panel for one tab; only the active one renders. */
export function TabsContent({ value, children, className }: TabsContentProps) {
  return (
    <Radix.Content value={value} className={cn("outline-none", className)}>
      {children}
    </Radix.Content>
  );
}
