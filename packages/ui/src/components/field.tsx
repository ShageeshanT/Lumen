"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { Tooltip } from "./tooltip";

/** What a control inside a Field inherits: its id, descriptions and state. */
export interface FieldState {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  disabled: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldState | null>(null);

/** Controls call this to pick up Field wiring; outside a Field it returns null. */
export function useField(): FieldState | null {
  return useContext(FieldContext);
}

/** Merges explicit props over the Field context so a control works inside or outside a Field. */
export function useFieldProps(props: {
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  invalid?: boolean | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
}) {
  const field = useField();
  const describedBy =
    [field?.describedBy, props["aria-describedby"]]
      .filter((v) => v !== undefined && v !== "")
      .join(" ") || undefined;
  return {
    id: props.id ?? field?.id,
    describedBy,
    invalid: props.invalid ?? field?.invalid ?? false,
    disabled: props.disabled ?? field?.disabled ?? false,
    required: props.required ?? field?.required ?? false,
  };
}

export interface FieldProps {
  label: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  helper?: ReactNode;
  /** Error message; renders in danger text and marks the control invalid. */
  error?: string | undefined;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  /** "lumen.toml" when config-as-code manages this setting: the control locks. */
  lockedBy?: string;
  /** Link after the label, such as "What's this?". */
  hint?: { label: string; href: string };
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control, helper and error in one column with a 6 px rhythm. The
 * control inherits its id, aria-describedby, invalid and disabled state.
 * An error that appears after mount is announced; one present on mount is not.
 */
export function Field({
  label,
  hideLabel = false,
  helper,
  error,
  required = false,
  optional = false,
  disabled = false,
  lockedBy,
  hint,
  id,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `field-${autoId}`;
  const helperId = `${controlId}-helper`;
  const errorId = `${controlId}-error`;
  const hasError = error !== undefined && error !== "";
  const locked = lockedBy !== undefined;

  // Only errors that appear after the first render get role="alert".
  const mounted = useRef(false);
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    if (mounted.current) {
      setAnnounce(hasError);
    }
    mounted.current = true;
  }, [hasError]);

  const describedBy = [helper === undefined ? undefined : helperId, hasError ? errorId : undefined]
    .filter((v) => v !== undefined)
    .join(" ");

  const state: FieldState = {
    id: controlId,
    describedBy: describedBy === "" ? undefined : describedBy,
    invalid: hasError,
    disabled: disabled || locked,
    required,
  };

  return (
    <FieldContext.Provider value={state}>
      <div className={cn("flex flex-col gap-[6px]", className)} data-field={controlId}>
        <div className={cn("flex items-center gap-2", hideLabel && "sr-only")}>
          <label htmlFor={controlId} className="text-label">
            {label}
            {required && (
              <span aria-hidden="true" className="text-danger-text">
                {" "}
                *
              </span>
            )}
          </label>
          {optional && <span className="text-meta">Optional</span>}
          {locked && (
            <Tooltip content={`Managed by ${lockedBy} — edit the file to change it`}>
              <span tabIndex={0} className="text-text-secondary rounded-control inline-flex">
                <Icon name="lock" size={14} label={`Managed by ${lockedBy}`} />
              </span>
            </Tooltip>
          )}
          {hint !== undefined && (
            <a href={hint.href} className="text-meta text-accent-text ml-auto hover:underline">
              {hint.label}
            </a>
          )}
        </div>
        {children}
        {helper !== undefined && (
          <p id={helperId} className="text-body-secondary">
            {helper}
          </p>
        )}
        {hasError && (
          <p
            id={errorId}
            role={announce ? "alert" : undefined}
            className="text-danger-text text-13 flex items-start gap-[6px]"
          >
            <Icon name="circle-alert" size={14} className="mt-[3px] shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
