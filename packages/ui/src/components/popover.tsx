"use client";

import * as Radix from "@radix-ui/react-popover";
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";

import { cn } from "../lib/cn";

import { IconButton } from "./icon-button";

/**
 * Rich, interactive content anchored to a trigger (Radix Popover): the deploy
 * activity list, a resolved variable, a date-range picker. Focus moves inside
 * on open and returns to the trigger on close; Escape closes.
 *
 *   <Popover>
 *     <PopoverTrigger asChild><Button>2 deploying</Button></PopoverTrigger>
 *     <PopoverContent title="Deploy activity">…</PopoverContent>
 *   </Popover>
 */
export const Popover = Radix.Root;
export const PopoverTrigger = Radix.Trigger;
export const PopoverAnchor = Radix.Anchor;
export const PopoverClose = Radix.Close;

export interface PopoverContentProps extends Omit<
  ComponentPropsWithoutRef<typeof Radix.Content>,
  "title"
> {
  /** Heading (14 / 600) that also names the dialog. */
  title?: string;
  /** A close button in the top-right corner. */
  closeButton?: boolean;
  /** A fixed width in px, or "trigger" to match the trigger. Max 360 either way. */
  width?: number | "trigger";
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null | undefined;
  children: ReactNode;
}

export const PopoverContent = forwardRef<ComponentRef<typeof Radix.Content>, PopoverContentProps>(
  function PopoverContent(
    {
      title,
      closeButton = false,
      width,
      container,
      side = "bottom",
      align = "start",
      sideOffset = 6,
      collisionPadding = 8,
      className,
      style,
      children,
      ...rest
    },
    ref,
  ) {
    const titleId = useId();
    const hasHeader = title !== undefined || closeButton;
    return (
      <Radix.Portal container={container}>
        <Radix.Content
          ref={ref}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          aria-labelledby={title === undefined ? undefined : titleId}
          className={cn(
            "border-border-strong bg-surface-raised text-text shadow-raised rounded-card z-[var(--z-popover)] flex max-w-[min(360px,calc(100vw-16px))] flex-col border p-3 outline-none",
            "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto",
            "origin-(--radix-popover-content-transform-origin)",
            "data-[state=open]:animate-[lumen-pop-in_var(--dur-base)_var(--ease-panel)]",
            "data-[state=closed]:animate-[lumen-pop-out_var(--dur-exit-base)_var(--ease-in)]",
            className,
          )}
          style={{
            ...(width === "trigger"
              ? { width: "var(--radix-popover-trigger-width)" }
              : width === undefined
                ? {}
                : { width }),
            ...style,
          }}
          {...rest}
        >
          {hasHeader && (
            <div className="-mt-1 mb-2 flex min-h-6 items-center gap-2">
              {title !== undefined && (
                <h2 id={titleId} className="text-subsection min-w-0 flex-1 truncate">
                  {title}
                </h2>
              )}
              {closeButton && (
                <Radix.Close asChild>
                  <IconButton icon="x" label="Close" size="sm" className="-mr-1 ml-auto" />
                </Radix.Close>
              )}
            </div>
          )}
          {children}
        </Radix.Content>
      </Radix.Portal>
    );
  },
);
