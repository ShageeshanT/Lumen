"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "../lib/cn";
import { useSkipMountFocus } from "../lib/use-skip-mount-focus";

import { IconButton } from "./icon-button";

const WIDTH = { sm: "max-w-[400px]", md: "max-w-[560px]", lg: "max-w-[720px]" } as const;

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 400 / 560 / 720 px wide. */
  size?: "sm" | "md" | "lg";
  /** Names the dialog. Sentence case: "Review 3 changes". */
  title: string;
  description?: ReactNode;
  /** No Escape, no overlay click and no close button: work in progress must finish. */
  preventClose?: boolean;
  /** Right-aligned buttons, primary last. */
  footer?: ReactNode;
  /** An element that opens the modal; focus returns to it on close. */
  trigger?: ReactElement;
  children?: ReactNode;
  /** Where focus lands on open; defaults to the first control in the body, else Close. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Render inside this element instead of the viewport, positioned within it
   * and without taking focus or hiding the page (gallery previews).
   */
  container?: HTMLElement | null | undefined;
  /** @internal ConfirmDialog renders destructive confirmations as alertdialogs. */
  role?: "dialog" | "alertdialog";
  /** @internal Extra ids appended to aria-describedby (a consequences list). */
  describedBy?: string;
  /** @internal Wraps body and footer, such as a form for Enter-to-confirm. */
  wrapBody?: (content: ReactNode) => ReactNode;
  className?: string;
}

/**
 * A focused task over the page (Radix Dialog). Header, scrolling body and a
 * footer that stays put. Escape and an overlay click close it unless
 * `preventClose`; focus is trapped inside and returns to whatever opened it.
 * Under 640 px it becomes a bottom sheet.
 */
export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  size = "md",
  title,
  description,
  preventClose = false,
  footer,
  trigger,
  children,
  initialFocusRef,
  container,
  role = "dialog",
  describedBy,
  wrapBody,
  className,
}: ModalProps) {
  const contained = container !== undefined;
  const skipFocus = useSkipMountFocus(open ?? defaultOpen, contained);
  const bodyRef = useRef<HTMLDivElement>(null);
  // A body that scrolls must be reachable by keyboard (WCAG 2.1.1): it joins
  // the tab order only while its content overflows.
  const [scrollable, setScrollable] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const measureBody = useCallback((node: HTMLDivElement | null) => {
    bodyRef.current = node;
    observer.current?.disconnect();
    if (node === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const check = () => {
      setScrollable(node.scrollHeight > node.clientHeight + 1);
    };
    observer.current = new ResizeObserver(check);
    observer.current.observe(node);
    for (const child of node.children) {
      observer.current.observe(child);
    }
    check();
  }, []);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Whatever had focus when the modal opened gets it back on close, with or
  // without a Trigger (Radix only restores focus to its own Trigger).
  const opener = useRef<HTMLElement | null>(null);
  const descriptionId = `modal-desc-${useId()}`;

  const rootProps = {
    ...(open === undefined ? {} : { open }),
    ...(defaultOpen === undefined ? {} : { defaultOpen }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };

  const ariaDescribedBy =
    [description === undefined ? undefined : descriptionId, describedBy]
      .filter((id) => id !== undefined)
      .join(" ") || undefined;

  const position = contained ? "absolute" : "fixed";
  const body = (
    <>
      <div
        ref={measureBody}
        tabIndex={scrollable ? 0 : undefined}
        className={cn(
          "text-body min-h-0 flex-1 overflow-y-auto px-6",
          footer === undefined ? "pb-6" : "pb-5",
        )}
      >
        {children}
      </div>
      {footer !== undefined && (
        <div className="border-border flex shrink-0 flex-wrap items-center justify-end gap-3 border-t px-6 py-4">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <Dialog.Root {...rootProps} modal={!contained}>
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
          role={role}
          aria-modal={contained ? undefined : true}
          aria-describedby={ariaDescribedBy}
          data-size={size}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (skipFocus()) {
              return;
            }
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const target =
              initialFocusRef?.current ??
              bodyRef.current?.querySelector<HTMLElement>(TABBABLE) ??
              closeRef.current;
            target?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected === true) {
              opener.current.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (preventClose) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (preventClose || contained) {
              event.preventDefault();
            }
          }}
          className={cn(
            position,
            "z-[var(--z-modal)] flex flex-col outline-none",
            "border-border-strong bg-surface-raised text-text shadow-raised border",
            // Centered: inset 0 with auto margins keeps transform free for the scale-in.
            "inset-0 m-auto h-fit max-h-[calc(100%-64px)] w-[calc(100%-32px)]",
            "rounded-panel origin-center",
            WIDTH[size],
            "data-[state=open]:animate-[lumen-dialog-in_var(--dur-base)_var(--ease-panel)]",
            "data-[state=closed]:animate-[lumen-dialog-out_var(--dur-exit-base)_var(--ease-in)]",
            // Under 640 px: a bottom sheet with square bottom corners.
            "max-sm:top-auto max-sm:mb-0 max-sm:max-h-[calc(100%-48px)] max-sm:w-full max-sm:max-w-none",
            "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
            "max-sm:data-[state=open]:animate-[lumen-sheet-in_var(--dur-base)_var(--ease-panel)]",
            "max-sm:data-[state=closed]:animate-[lumen-sheet-out_var(--dur-exit-base)_var(--ease-in)]",
            className,
          )}
        >
          <div className="flex shrink-0 items-start gap-3 px-6 pt-6 pb-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Dialog.Title className="text-16 text-text leading-tight font-semibold">
                {title}
              </Dialog.Title>
              {description !== undefined && (
                <Dialog.Description id={descriptionId} className="text-body-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {!preventClose && (
              <Dialog.Close asChild>
                <IconButton
                  ref={closeRef}
                  icon="x"
                  label="Close"
                  size="sm"
                  className="-mt-3 -mr-3"
                />
              </Dialog.Close>
            )}
          </div>
          {wrapBody === undefined ? body : wrapBody(body)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
