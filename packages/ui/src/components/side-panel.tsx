"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { useMediaQuery } from "../lib/use-media-query";
import { useSkipMountFocus } from "../lib/use-skip-mount-focus";
import { useStoredState } from "../lib/use-stored-state";

import { IconButton } from "./icon-button";
import { Sheet, type SheetTabs } from "./sheet";
import { Tabs } from "./tabs";

/** localStorage key for the inspector width (SPEC C7.7). */
export const PANEL_WIDTH_KEY = "lumen.panel.width";
export const PANEL_MIN_WIDTH = 480;
export const PANEL_MAX_WIDTH = 880;
export const PANEL_DEFAULT_WIDTH = 560;
/** Arrow keys on the resize handle move it by this much. */
export const PANEL_KEY_STEP = 16;

/**
 * docked   ≥ 1280: beside the canvas, which stays usable (not a dialog)
 * overlay  1024–1279: over the canvas with a 20 % scrim (a dialog)
 * full     768–1023: full width (a dialog)
 * sheet    < 768: a full-screen Sheet
 */
export type SidePanelMode = "docked" | "overlay" | "full" | "sheet";

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The heading; focus lands on it when the panel opens. */
  title: string;
  /** Mono caps line above the title: "Service · 02". */
  eyebrow?: string;
  /** Buttons in the header, before Close. */
  actions?: ReactNode;
  /** Tabs pinned under the header. */
  tabs?: SheetTabs;
  /** Accessible name of the region. */
  label?: string;
  /** Controlled width in px. Without it the width persists in localStorage. */
  width?: number;
  onWidthChange?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  /** Override the breakpoint-driven layout. */
  mode?: SidePanelMode | "auto";
  /** Render inside this element instead of the viewport (gallery previews). */
  container?: HTMLElement | null | undefined;
  /** Show the handle mid-drag, for gallery screenshots. */
  resizing?: boolean;
  children?: ReactNode;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function useAutoMode(): SidePanelMode {
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const tablet = useMediaQuery("(min-width: 768px)", true);
  return wide ? "docked" : desktop ? "overlay" : tablet ? "full" : "sheet";
}

/**
 * The right-hand inspector. On wide screens it sits beside the canvas as a
 * complementary region: the canvas stays operable and Tab can leave it. Below
 * 1280 px it covers the canvas as a dialog with a focus trap; below 768 px it
 * becomes a full-screen Sheet. Escape closes it, focus moves to the title on
 * open and back to the opener on close. Drag the left edge (or focus it and
 * use the arrow keys, Home and End) to resize between 480 and 880 px; the
 * width is remembered.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  eyebrow,
  actions,
  tabs,
  label = "Service inspector",
  width: widthProp,
  onWidthChange,
  minWidth = PANEL_MIN_WIDTH,
  maxWidth = PANEL_MAX_WIDTH,
  mode: modeProp = "auto",
  container,
  resizing = false,
  children,
}: SidePanelProps) {
  const autoMode = useAutoMode();
  const mode = modeProp === "auto" ? autoMode : modeProp;
  const contained = container !== undefined;
  const skipFocus = useSkipMountFocus(open, contained);
  const [stored, setStored] = useStoredState(PANEL_WIDTH_KEY, PANEL_DEFAULT_WIDTH, (raw) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  });
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const width = clamp(dragWidth ?? widthProp ?? stored, minWidth, maxWidth);

  const commit = (next: number) => {
    const value = clamp(next, minWidth, maxWidth);
    if (widthProp === undefined) {
      setStored(value);
    }
    onWidthChange?.(value);
  };

  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setDragWidth(width);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) {
      return;
    }
    // Right-anchored: moving the edge left makes the panel wider.
    setDragWidth(clamp(drag.current.width + drag.current.x - event.clientX, minWidth, maxWidth));
  };

  const onHandleUp = () => {
    if (drag.current === null) {
      return;
    }
    drag.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    if (dragWidth !== null) {
      commit(dragWidth);
    }
    setDragWidth(null);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowLeft"
        ? width + PANEL_KEY_STEP
        : event.key === "ArrowRight"
          ? width - PANEL_KEY_STEP
          : event.key === "Home"
            ? minWidth
            : event.key === "End"
              ? maxWidth
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      commit(next);
    }
  };

  if (mode === "sheet") {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        side="full"
        title={title}
        container={container}
        {...(eyebrow === undefined ? {} : { eyebrow })}
        {...(tabs === undefined ? {} : { tabs })}
      >
        {children}
      </Sheet>
    );
  }

  const docked = mode === "docked";
  const modal = !docked && !contained;
  const isResizing = dragWidth !== null || resizing;
  const position = contained ? "absolute" : "fixed";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Dialog.Portal container={container}>
        {!docked &&
          (modal ? (
            <Dialog.Overlay className="bg-overlay/30 fixed inset-x-0 top-12 bottom-0 z-[var(--z-panel)] data-[state=closed]:animate-[lumen-fade-out_var(--dur-exit-base)_var(--ease-in)] data-[state=open]:animate-[lumen-fade-in_var(--dur-base)_var(--ease-out)]" />
          ) : (
            <div aria-hidden="true" className="bg-overlay/30 absolute inset-0" />
          ))}
        <Dialog.Content
          role={docked ? "complementary" : "dialog"}
          aria-label={label}
          aria-labelledby={undefined}
          aria-describedby={undefined}
          aria-modal={modal || undefined}
          data-mode={mode}
          data-resizing={isResizing || undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (skipFocus()) {
              return;
            }
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected === true) {
              opener.current.focus();
            }
          }}
          onInteractOutside={(event) => {
            // Docked, the canvas beside the panel stays usable and never closes it.
            if (docked || contained) {
              event.preventDefault();
            }
          }}
          className={cn(
            position,
            contained ? "top-0" : "top-12",
            "right-0 bottom-0 z-[var(--z-panel)] flex max-w-full flex-col outline-none",
            "border-border bg-surface text-text border-l",
            "data-[state=open]:animate-[lumen-panel-in_var(--dur-base)_var(--ease-panel)]",
            "data-[state=closed]:animate-[lumen-panel-out_var(--dur-exit-base)_var(--ease-in)]",
            isResizing && "will-change-[width]",
          )}
          style={{ width: mode === "full" ? "100%" : width }}
        >
          {mode !== "full" && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              aria-valuenow={width}
              aria-valuemin={minWidth}
              aria-valuemax={maxWidth}
              tabIndex={0}
              data-panel-handle=""
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              onKeyDown={onHandleKey}
              className="group/handle focus-inset absolute inset-y-0 -left-[3px] z-[var(--z-sticky)] flex w-[6px] cursor-col-resize touch-none items-center justify-center outline-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "bg-border-strong h-6 w-[2px] opacity-0 transition-opacity duration-[var(--dur-fast)]",
                  "group-focus-visible/handle:bg-accent group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100",
                  isResizing && "bg-accent opacity-100",
                )}
              />
            </div>
          )}
          <div className="border-border bg-surface sticky top-0 z-[var(--z-sticky)] flex h-[56px] shrink-0 items-center gap-3 border-b pr-3 pl-6">
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              {eyebrow !== undefined && <span className="text-eyebrow truncate">{eyebrow}</span>}
              <Dialog.Title
                ref={titleRef}
                tabIndex={-1}
                className="text-section-title min-w-0 truncate outline-none"
              >
                {title}
              </Dialog.Title>
            </div>
            {actions !== undefined && (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            )}
            <Dialog.Close asChild>
              <IconButton icon="x" label="Close panel" size="sm" />
            </Dialog.Close>
          </div>
          {tabs !== undefined && (
            <Tabs
              items={tabs.items}
              value={tabs.value}
              onValueChange={tabs.onValueChange}
              aria-label={tabs["aria-label"]}
              className="bg-surface sticky top-[56px] z-[var(--z-sticky)] shrink-0 px-3"
            />
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
