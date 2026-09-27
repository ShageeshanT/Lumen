"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";
import { durations, prefersReducedMotion, springToast } from "../tokens/motion";

import { Button } from "./button";
import { IconButton } from "./icon-button";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** A follow-up, such as "View logs". */
  action?: { label: string; onClick: () => void };
  /** Shows "Undo"; pressing it runs this and closes the toast. */
  undo?: () => void;
  /** Milliseconds before it closes on its own. Default 8000. */
  duration?: number;
  /** Reuse an id to replace a toast instead of stacking another. */
  id?: string;
}

export interface ToastRecord extends ToastOptions {
  id: string;
  variant: ToastVariant;
  duration: number;
}

export const defaultToastDuration = 8000;

/*
 * A tiny module store so `toast()` works from anywhere (event handlers,
 * mutations) without a context. The single <Toaster> in the shell renders it.
 */
let records: ToastRecord[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY: ToastRecord[] = [];

/** Shows a toast and returns its id. */
export function toast(options: ToastOptions): string {
  counter += 1;
  const id = options.id ?? `toast-${String(counter)}`;
  const record: ToastRecord = {
    ...options,
    id,
    variant: options.variant ?? "info",
    duration: options.duration ?? defaultToastDuration,
  };
  records = [...records.filter((existing) => existing.id !== id), record];
  emit();
  return id;
}

/** The toasts in the store right now, oldest first. */
export function activeToasts(): readonly ToastRecord[] {
  return records;
}

/** Closes one toast, or every toast when no id is given. */
toast.dismiss = (id?: string) => {
  records = id === undefined ? [] : records.filter((record) => record.id !== id);
  emit();
};

const VARIANT: Record<ToastVariant, { icon: IconName; color: string; bar: string }> = {
  info: { icon: "info", color: "text-info", bar: "bg-info" },
  success: { icon: "circle-check", color: "text-success", bar: "bg-success" },
  warning: { icon: "triangle-alert", color: "text-warning", bar: "bg-warning" },
  danger: { icon: "circle-alert", color: "text-danger", bar: "bg-danger" },
};

export interface ToastProps {
  toast: ToastRecord;
  onDismiss?: () => void;
  /** Freezes the timer (hover, window blur, keyboard focus). */
  paused?: boolean;
  /** Static rendering for docs: the timer bar is drawn at this fraction and never runs. */
  progress?: number;
  /** Renders the hover state (close button shown) for screenshots. */
  forceHover?: boolean;
  className?: string;
}

/**
 * One toast: variant icon, title, optional description, Undo and an action,
 * a close button on hover or focus, and a 2 px timer bar in the variant color.
 */
export function Toast({
  toast: record,
  onDismiss,
  paused = false,
  progress,
  forceHover = false,
  className,
}: ToastProps) {
  const style = VARIANT[record.variant];
  const staticBar = progress !== undefined;
  return (
    <div
      data-variant={record.variant}
      data-paused={paused || undefined}
      data-force={forceHover ? "hover" : undefined}
      className={cn(
        "group/toast bg-surface-raised border-border-strong shadow-raised rounded-card relative flex min-h-12 w-full items-start gap-3 overflow-hidden border px-4 py-3",
        className,
      )}
    >
      <span className={cn("inline-flex shrink-0 pt-[2px]", style.color)}>
        <Icon name={style.icon} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className="text-body font-medium">{record.title}</p>
        {record.description !== undefined && (
          <p className="text-body-secondary">{record.description}</p>
        )}
      </div>
      {(record.undo !== undefined || record.action !== undefined) && (
        <div className="flex shrink-0 items-center gap-1 self-center">
          {record.undo !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                record.undo?.();
                onDismiss?.();
              }}
            >
              Undo
            </Button>
          )}
          {record.action !== undefined && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                record.action?.onClick();
                onDismiss?.();
              }}
            >
              {record.action.label}
            </Button>
          )}
        </div>
      )}
      {onDismiss !== undefined && (
        <IconButton
          icon="x"
          label="Close notification"
          size="sm"
          className="-my-1 -mr-2 shrink-0 opacity-0 transition-opacity duration-[var(--dur-fast)] group-focus-within/toast:opacity-100 group-hover/toast:opacity-100 group-data-[force~=hover]/toast:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={onDismiss}
        />
      )}
      {Number.isFinite(record.duration) && (
        <span
          aria-hidden="true"
          data-toast-timer
          className={cn("absolute bottom-0 left-0 h-[2px] w-full origin-left", style.bar)}
          style={
            staticBar
              ? { transform: `scaleX(${String(progress)})` }
              : {
                  animation: `lumen-toast-timer ${String(record.duration)}ms linear forwards`,
                  animationPlayState: paused ? "paused" : "running",
                }
          }
        />
      )}
    </div>
  );
}

/** Runs the auto-close timer, pausing while `paused` is true. */
function useDismissTimer(duration: number, paused: boolean, onExpire: () => void) {
  const remaining = useRef(duration);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });
  useEffect(() => {
    if (paused || !Number.isFinite(duration)) {
      return;
    }
    const started = Date.now();
    const id = setTimeout(() => {
      onExpireRef.current();
    }, remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused, duration]);
}

function ToasterItem({
  record,
  windowBlurred,
  reduced,
  restoreFocus,
}: {
  record: ToastRecord;
  windowBlurred: boolean;
  reduced: boolean;
  restoreFocus: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  // While its exit plays, a closed toast is hidden from assistive tech and from tests.
  const present = useIsPresent();
  const paused = hovered || focused || windowBlurred;
  const expire = useCallback(() => {
    toast.dismiss(record.id);
  }, [record.id]);
  useDismissTimer(record.duration, paused, expire);

  // Closed by the user: if focus was inside, hand it back before the toast leaves.
  const dismiss = () => {
    if (itemRef.current?.contains(document.activeElement) === true) {
      restoreFocus();
    }
    toast.dismiss(record.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      dismiss();
    }
  };

  return (
    <motion.li
      ref={itemRef}
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: durations.exitFast / 1000 } }
          : { opacity: 0, y: -8, transition: { duration: durations.exitBase / 1000 } }
      }
      transition={reduced ? { duration: durations.exitFast / 1000 } : springToast}
      tabIndex={-1}
      data-toast-id={record.id}
      data-state={present ? "open" : "closing"}
      aria-hidden={present ? undefined : true}
      role={record.variant === "danger" ? "alert" : undefined}
      aria-label={record.title}
      onKeyDown={onKeyDown}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
      className="pointer-events-auto w-full outline-offset-2"
    >
      <Toast toast={record} onDismiss={dismiss} paused={paused} />
    </motion.li>
  );
}

function getSnapshot() {
  return records;
}

function getServerSnapshot() {
  return EMPTY;
}

export interface ToasterProps {
  position?: "bottom-right";
  /** How many toasts stay on screen; a new one pushes the oldest out. */
  max?: number;
  className?: string;
}

/**
 * Where toasts appear. Mount once in the shell. Bottom-right, 360 px wide
 * (full width minus 16 px gutters under 640 px), newest at the bottom, three
 * at most. Timers pause on hover, keyboard focus and when the window loses
 * focus. F8 moves focus to the newest toast; Escape closes the focused one.
 */
export function Toaster({ max = 3, className }: ToasterProps) {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const visible = all.slice(-max);
  const [windowBlurred, setWindowBlurred] = useState(false);
  const [reduced, setReduced] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // The fourth toast pushes the oldest out of the store, not just off screen.
  useEffect(() => {
    if (all.length > max) {
      for (const record of all.slice(0, all.length - max)) {
        toast.dismiss(record.id);
      }
    }
  }, [all, max]);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    const onBlur = () => {
      setWindowBlurred(true);
    };
    const onFocus = () => {
      setWindowBlurred(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "F8") {
        return;
      }
      const items = listRef.current?.querySelectorAll<HTMLElement>(
        '[data-toast-id][data-state="open"]',
      );
      const newest = items?.[items.length - 1];
      if (newest !== undefined) {
        event.preventDefault();
        if (
          document.activeElement instanceof HTMLElement &&
          !newest.contains(document.activeElement)
        ) {
          returnFocus.current = document.activeElement;
        }
        newest.focus();
      }
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const restoreFocus = useCallback(() => {
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected === true) {
      target.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  return (
    <section
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed right-4 bottom-4 left-4 z-[var(--z-toast)] sm:left-auto sm:w-[360px]",
        className,
      )}
    >
      <ol
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className="flex flex-col items-stretch gap-2"
      >
        <AnimatePresence initial={false}>
          {visible.map((record) => (
            <ToasterItem
              key={record.id}
              record={record}
              windowBlurred={windowBlurred}
              reduced={reduced}
              restoreFocus={restoreFocus}
            />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
