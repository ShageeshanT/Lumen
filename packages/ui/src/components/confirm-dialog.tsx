"use client";

import { useId, useRef, useState, type ReactElement, type ReactNode } from "react";

import { Icon } from "../icons/icon";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Modal } from "./modal";

export interface ConfirmDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** simple: a yes/no question. destructive: type the name to unlock the danger button. */
  variant?: "simple" | "destructive";
  title: string;
  description?: ReactNode;
  /** What will happen, one line each: "The volume and its 2.1 GB of data are deleted". */
  consequences?: string[];
  /** The resource name to type (destructive). Matching is exact and case-sensitive. */
  confirmText?: string;
  /** A verb: "Restart", "Roll back". Destructive defaults to "Delete". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** May return a promise: the button shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
  /** An extra choice such as "Also restore variables". */
  checkbox?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
  /** Shown above the footer when confirming failed; cleared on the next try. */
  error?: string;
  /** Force the confirming state, for gallery screenshots. */
  loading?: boolean;
  /** Prefill the typed confirmation, for gallery screenshots. */
  defaultTyped?: string;
  trigger?: ReactElement;
  container?: HTMLElement | null | undefined;
}

/**
 * Asks before doing something that matters. Simple dialogs focus Cancel (the
 * safe default). Destructive dialogs are alertdialogs that list consequences,
 * focus the name field and keep the danger button disabled until the name is
 * typed exactly; Enter confirms once it matches.
 */
export function ConfirmDialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  variant = "simple",
  title,
  description,
  consequences,
  confirmText,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  checkbox,
  error: errorProp,
  loading: loadingProp = false,
  defaultTyped = "",
  trigger,
  container,
}: ConfirmDialogProps) {
  const destructive = variant === "destructive";
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const [typed, setTyped] = useState(defaultTyped);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const consequencesId = useId();
  const inputId = useId();

  const setOpen = (next: boolean) => {
    if (!next) {
      setTyped(defaultTyped);
      setFailure(undefined);
    }
    setOpenState(next);
    onOpenChange?.(next);
  };

  const matched = !destructive || (confirmText !== undefined && typed === confirmText);
  const loading = loadingProp || pending;
  const error = failure ?? errorProp;

  const confirm = async () => {
    if (!matched || loading) {
      return;
    }
    setFailure(undefined);
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      setOpen(false);
    } catch (cause) {
      setPending(false);
      setFailure(
        cause instanceof Error && cause.message !== ""
          ? cause.message
          : "That didn't work. Check your connection and try again.",
      );
    }
  };

  const verb = confirmLabel ?? (destructive ? "Delete" : "Confirm");

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="sm"
      title={title}
      description={description}
      role={destructive ? "alertdialog" : "dialog"}
      preventClose={loading}
      initialFocusRef={destructive ? inputRef : cancelRef}
      {...(consequences === undefined ? {} : { describedBy: consequencesId })}
      {...(trigger === undefined ? {} : { trigger })}
      container={container}
      wrapBody={(content) => (
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          {content}
        </form>
      )}
      footer={
        <>
          <Button
            ref={cancelRef}
            variant="ghost"
            disabled={loading}
            onClick={() => {
              setOpen(false);
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant={destructive ? "danger-solid" : "primary"}
            disabled={!matched}
            loading={loading}
          >
            {error === undefined ? verb : `Try again`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {consequences !== undefined && consequences.length > 0 && (
          <ul id={consequencesId} className="flex flex-col gap-2">
            {consequences.map((line) => (
              <li key={line} className="text-13 text-text flex items-start gap-2">
                <Icon name="triangle-alert" size={14} className="text-warning mt-[3px] shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {destructive && confirmText !== undefined && (
          <div className="flex flex-col gap-[6px]">
            <label htmlFor={inputId} className="text-body-secondary">
              Type <span className="text-text font-mono">{confirmText}</span> to confirm
            </label>
            <Input
              ref={inputRef}
              id={inputId}
              monospace
              autoComplete="off"
              spellCheck={false}
              value={typed}
              disabled={loading}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </div>
        )}
        {checkbox !== undefined && (
          <Checkbox
            label={checkbox.label}
            checked={checkbox.checked}
            disabled={loading}
            onCheckedChange={(next) => {
              checkbox.onChange(next === true);
            }}
          />
        )}
        {error !== undefined && (
          <div
            role="alert"
            className="border-danger/40 bg-danger-subtle flex items-start gap-2 border px-3 py-2"
          >
            <Icon name="circle-alert" size={14} className="text-danger mt-[3px] shrink-0" />
            <p className="text-13 text-text min-w-0 flex-1">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
