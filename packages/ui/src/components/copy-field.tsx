"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { truncateMiddle } from "../lib/text";

import { controlClasses, controlFrameClasses } from "./control-styles";
import { Tooltip } from "./tooltip";

const COPIED_MS = 1500;

/** Copies text and returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Shared copied-state: true for 1.5 s after a successful copy. */
export function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const copy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
      }, COPIED_MS);
    }
    return ok;
  };
  return { copied, copy };
}

export interface CopyFieldProps {
  value: string;
  /** Names the value: "install command", "private domain". */
  label: string;
  monospace?: boolean;
  size?: "sm" | "md";
  /** Where to cut long values: the end for commands, the middle for ids. */
  truncate?: "end" | "middle";
  disabled?: boolean;
  className?: string;
}

/**
 * A read-only value with a copy button. The full value is always what is
 * copied and what the tooltip shows; ⌘/Ctrl+C or Enter on the field copy too.
 */
export function CopyField({
  value,
  label,
  monospace = true,
  size = "md",
  truncate = "end",
  disabled = false,
  className,
}: CopyFieldProps) {
  const id = useId();
  const { copied, copy } = useCopied();
  const shown = truncate === "middle" ? truncateMiddle(value, 14, 10) : value;
  return (
    <div className={cn(controlFrameClasses, className)}>
      <input
        id={id}
        readOnly
        value={shown}
        title={value}
        disabled={disabled}
        aria-label={label}
        onKeyDown={(event) => {
          const mod = event.metaKey || event.ctrlKey;
          if (event.key === "Enter" || (mod && event.key.toLowerCase() === "c")) {
            event.preventDefault();
            void copy(value);
          }
        }}
        className={controlClasses({
          size,
          monospace,
          className: cn(
            "text-text read-only:text-text text-13 truncate pr-8",
            size === "sm" && "text-12",
          ),
        })}
      />
      <span className="absolute right-[2px] flex items-center">
        <Tooltip content={copied ? "Copied" : `Copy ${label}`}>
          <button
            type="button"
            aria-label={`Copy ${label}`}
            disabled={disabled}
            onClick={() => {
              void copy(value);
            }}
            className={cn(
              "text-text-secondary is-hover:text-text is-hover:bg-surface-hover rounded-control inline-flex size-[28px] items-center justify-center",
              "disabled:cursor-not-allowed",
              copied && "text-success",
            )}
          >
            <Icon name={copied ? "check" : "copy"} size={14} />
          </button>
        </Tooltip>
        <span aria-live="polite" className="sr-only">
          {copied ? "Copied" : ""}
        </span>
      </span>
    </div>
  );
}
