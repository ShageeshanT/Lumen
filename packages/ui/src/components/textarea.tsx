"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "../lib/cn";

import { controlClasses, controlFrameClasses } from "./control-styles";
import { useFieldProps } from "./field";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  monospace?: boolean;
  /** Minimum visible rows. Default 3. */
  rows?: number;
  /** Grows with content up to this many rows, then scrolls. Default 12. */
  maxRows?: number;
}

const LINE_HEIGHT = 21; // 14 px × 1.5
const PADDING_Y = 16; // 8 px top and bottom

/** Multi-line text that grows with its content, then scrolls. No manual resize handle. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    invalid,
    monospace = false,
    rows = 3,
    maxRows = 12,
    className,
    id,
    disabled,
    required,
    onInput,
    "aria-describedby": ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const field = useFieldProps({
    id,
    invalid,
    disabled,
    required,
    "aria-describedby": ariaDescribedBy,
  });
  const inner = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- callers read the handle after mount, when the textarea exists
  useImperativeHandle(ref, () => inner.current!);

  const fit = useCallback(() => {
    const el = inner.current;
    if (el === null) {
      return;
    }
    el.style.height = "auto";
    const max = maxRows * LINE_HEIGHT + PADDING_Y + 2;
    const min = rows * LINE_HEIGHT + PADDING_Y + 2;
    el.style.height = `${String(Math.min(max, Math.max(min, el.scrollHeight + 2)))}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
  }, [maxRows, rows]);

  useEffect(() => {
    fit();
  }, [fit, rest.value, rest.defaultValue]);

  return (
    <div className={controlFrameClasses}>
      <textarea
        ref={inner}
        id={field.id}
        rows={rows}
        disabled={field.disabled}
        required={field.required}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        onInput={(event) => {
          fit();
          onInput?.(event);
        }}
        className={controlClasses({
          invalid: field.invalid,
          monospace,
          className: cn("h-auto resize-none py-2 leading-[1.5]", monospace && "text-13", className),
        })}
        {...rest}
      />
    </div>
  );
});
