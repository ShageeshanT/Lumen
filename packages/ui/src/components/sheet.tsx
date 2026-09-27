"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { useSkipMountFocus } from "../lib/use-skip-mount-focus";

import { Tabs, type TabItem } from "./tabs";

/** A release this fast (px per ms) dismisses or snaps, whatever the distance. */
const DRAG_VELOCITY = 0.5;
/** A horizontal swipe this fast (px per ms) moves to the next tab (SPEC C5). */
const SWIPE_VELOCITY = 0.3;

export interface SheetTabs {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label": string;
}

export interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** bottom: rises to a snap point. full: covers the screen (the mobile inspector). */
  side?: "bottom" | "full";
  title: string;
  description?: ReactNode;
  /** Fitted tabs under the header; swipe the content sideways to switch. */
  tabs?: SheetTabs;
  /** Heights as fractions of the screen, lowest first. Bottom sheets only. */
  snapPoints?: number[];
  /** Index into snapPoints to open at. */
  defaultSnap?: number;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactElement;
  /** Render inside this element without taking focus (gallery previews). */
  container?: HTMLElement | null | undefined;
  /** Freeze the sheet mid-drag by this many px, for gallery screenshots. */
  dragOffset?: number;
}

/**
 * A panel that slides up from the bottom edge (Radix Dialog), for phones. Drag
 * the handle or header down to lower it a snap point or dismiss it; it follows
 * the finger and settles on release. The handle is decorative; a Close button
 * appears for keyboard and screen-reader users. Escape closes, focus is trapped.
 */
export function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  side = "bottom",
  title,
  description,
  tabs,
  snapPoints = [0.5, 0.9],
  defaultSnap = 0,
  children,
  footer,
  trigger,
  container,
  dragOffset,
}: SheetProps) {
  const contained = container !== undefined;
  const skipFocus = useSkipMountFocus(open ?? defaultOpen, contained);
  const [openState, setOpenState] = useState(defaultOpen ?? false);
  const isOpen = open ?? openState;
  const [snap, setSnap] = useState(defaultSnap);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const setOpen = (next: boolean) => {
    if (!next) {
      setSnap(defaultSnap);
      setDragY(0);
    }
    setOpenState(next);
    onOpenChange?.(next);
  };

  const onDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, [role=tab]")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, t: event.timeStamp };
    setDragging(true);
  };

  const onDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) {
      return;
    }
    // Follow the finger downward; upward pulls only count on release.
    setDragY(Math.max(0, event.clientY - drag.current.y));
  };

  const onDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    drag.current = null;
    setDragging(false);
    setDragY(0);
    if (start === null) {
      return;
    }
    const dy = event.clientY - start.y;
    const velocity = dy / Math.max(1, event.timeStamp - start.t);
    const height = sheetRef.current?.offsetHeight ?? 1;
    if (dy > 0 && (dy > height * 0.3 || velocity > DRAG_VELOCITY)) {
      if (side === "bottom" && snap > 0) {
        setSnap(snap - 1);
      } else {
        setOpen(false);
      }
    } else if (
      side === "bottom" &&
      dy < 0 &&
      (-dy > 48 || velocity < -DRAG_VELOCITY) &&
      snap < snapPoints.length - 1
    ) {
      setSnap(snap + 1);
    }
  };

  const onSwipeEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (start === null || tabs === undefined) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const velocity = Math.abs(dx) / Math.max(1, event.timeStamp - start.t);
    if (Math.abs(dx) < 32 || Math.abs(dx) < Math.abs(dy) * 1.5 || velocity < SWIPE_VELOCITY) {
      return;
    }
    const enabled = tabs.items.filter((item) => item.disabled !== true);
    const index = enabled.findIndex((item) => item.value === tabs.value);
    const next = enabled[index + (dx < 0 ? 1 : -1)];
    if (next !== undefined) {
      tabs.onValueChange(next.value);
    }
  };

  const offset = dragOffset ?? dragY;
  const height =
    side === "full" ? "100%" : `${String(Math.round((snapPoints[snap] ?? 0.5) * 100))}%`;
  const position = contained ? "absolute" : "fixed";

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen} modal={!contained}>
      {trigger !== undefined && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal container={container}>
        {contained ? (
          <div aria-hidden="true" className="bg-overlay absolute inset-0" />
        ) : (
          <Dialog.Overlay
            className={cn(
              "bg-overlay fixed inset-0 z-[var(--z-modal)]",
              "data-[state=open]:animate-[lumen-fade-in_var(--dur-base)_var(--ease-out)]",
              "data-[state=closed]:animate-[lumen-fade-out_var(--dur-exit-base)_var(--ease-in)]",
            )}
          />
        )}
        <Dialog.Content
          ref={sheetRef}
          aria-describedby={undefined}
          data-side={side}
          data-dragging={dragging || dragOffset !== undefined || undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (skipFocus()) {
              return;
            }
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            // Focus the sheet itself: no on-screen keyboard pops up on phones.
            sheetRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected === true) {
              opener.current.focus();
            }
          }}
          onInteractOutside={(event) => {
            if (contained) {
              event.preventDefault();
            }
          }}
          className={cn(
            position,
            "inset-x-0 bottom-0 z-[var(--z-modal)] flex flex-col outline-none",
            "border-border-strong bg-surface-raised text-text shadow-raised border-t",
            side === "bottom" ? "rounded-t-panel" : "top-0",
            "pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:animate-[lumen-sheet-in_var(--dur-base)_var(--ease-panel)]",
            "data-[state=closed]:animate-[lumen-sheet-out_var(--dur-exit-base)_var(--ease-in)]",
            !dragging && "transition-transform duration-[var(--dur-base)] ease-[var(--ease-panel)]",
          )}
          style={{
            height,
            ...(offset === 0 ? {} : { transform: `translateY(${String(offset)}px)` }),
          }}
        >
          <div
            className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <div className="flex h-5 items-start justify-center pt-2">
              <span aria-hidden="true" className="bg-border-strong block h-1 w-[36px]" />
            </div>
            <div className="flex h-12 items-center gap-3 px-4">
              <Dialog.Title className="text-subsection min-w-0 flex-1 truncate">
                {title}
              </Dialog.Title>
              <Dialog.Close
                className={cn(
                  "text-action border-border bg-surface text-text inline-flex h-8 items-center border px-3",
                  "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100",
                )}
              >
                Close
              </Dialog.Close>
            </div>
            {description !== undefined && (
              <Dialog.Description className="text-body-secondary -mt-2 px-4 pb-3">
                {description}
              </Dialog.Description>
            )}
          </div>
          {tabs !== undefined && (
            <Tabs
              items={tabs.items}
              value={tabs.value}
              onValueChange={tabs.onValueChange}
              aria-label={tabs["aria-label"]}
              fitted
              className="shrink-0 px-2"
            />
          )}
          <div
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4"
            onPointerDown={(event) => {
              swipe.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
            }}
            onPointerUp={onSwipeEnd}
            onPointerCancel={() => {
              swipe.current = null;
            }}
          >
            {children}
          </div>
          {footer !== undefined && (
            <div className="border-border flex shrink-0 flex-col gap-2 border-t p-4">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
