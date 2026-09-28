"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { controlClasses, controlFrameClasses } from "./control-styles";
import { useCopied } from "./copy-field";
import { Tooltip } from "./tooltip";

const MASK = "••••••••";
const REMASK_MS = 10_000;

/**
 * The one way a sealed value appears anywhere (field, table cell, diff): a
 * lock and "Sealed" in secondary sans. Not mono caps and never an accent
 * color, so it doesn't read as a button or a link.
 */
export function SealedValue({ className }: { className?: string }) {
  return (
    <span className={cn("text-body-secondary inline-flex items-center gap-[6px]", className)}>
      <Icon name="lock" size={14} className="shrink-0" />
      Sealed
    </span>
  );
}

export interface SecretFieldProps {
  /** The secret. Never rendered into the DOM while masked. */
  value: string;
  /** Names the secret: "DATABASE_URL". */
  label: string;
  /** Sealed values can never be revealed or copied (SPEC B7). */
  sealed?: boolean;
  copyable?: boolean;
  size?: "sm" | "md";
  onReveal?: () => void;
  className?: string;
}

/**
 * A masked secret. The DOM holds eight dots, not the value, until the user
 * reveals it; a revealed value masks itself again after 10 s. Sealed values
 * show a lock and "Sealed" and offer neither reveal nor copy.
 */
export function SecretField({
  value,
  label,
  sealed = false,
  copyable = true,
  size = "md",
  onReveal,
  className,
}: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const { copied, copy } = useCopied();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const toggle = () => {
    const next = !revealed;
    setRevealed(next);
    clearTimeout(timer.current);
    if (next) {
      onReveal?.();
      timer.current = setTimeout(() => {
        setRevealed(false);
      }, REMASK_MS);
    }
  };

  if (sealed) {
    return (
      <div
        className={cn(
          controlClasses({
            size,
            className: "read-only:bg-bg bg-bg text-text-secondary flex items-center gap-2",
          }),
          className,
        )}
        role="group"
        aria-label={`${label}, sealed`}
      >
        <SealedValue />
      </div>
    );
  }

  const buttonClass =
    "text-text-secondary is-hover:text-text is-hover:bg-surface-hover inline-flex size-[28px] items-center justify-center rounded-control";

  return (
    <div className={cn(controlFrameClasses, className)}>
      <input
        readOnly
        value={revealed ? value : MASK}
        aria-label={revealed ? label : `${label}, hidden`}
        className={controlClasses({
          size,
          monospace: true,
          className: cn(
            "read-only:text-text text-13 truncate",
            copyable ? "pr-[64px]" : "pr-8",
            !revealed && "tracking-[0.12em]",
          ),
        })}
      />
      <span className="absolute right-[2px] flex items-center">
        <Tooltip content={revealed ? "Hide · hides itself in 10s" : "Reveal"}>
          <button
            type="button"
            aria-label={`Reveal ${label}`}
            aria-pressed={revealed}
            onClick={toggle}
            className={buttonClass}
          >
            <Icon name={revealed ? "eye-off" : "eye"} size={14} />
          </button>
        </Tooltip>
        {copyable && (
          <Tooltip content={copied ? "Copied" : `Copy ${label}`}>
            <button
              type="button"
              aria-label={`Copy ${label}`}
              onClick={() => {
                void copy(value);
              }}
              className={cn(buttonClass, copied && "text-success")}
            >
              <Icon name={copied ? "check" : "copy"} size={14} />
            </button>
          </Tooltip>
        )}
        <span aria-live="polite" className="sr-only">
          {copied ? "Copied" : ""}
        </span>
      </span>
    </div>
  );
}
