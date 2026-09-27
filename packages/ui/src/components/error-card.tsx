"use client";

import { useId, useState } from "react";

import type { ErrorActionId, LumenError } from "@lumen/shared/errors";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { Button } from "./button";
import { CodeBlock } from "./code-block";
import { CopyField, useCopied } from "./copy-field";

export interface ErrorCardProps {
  /** Heading level of the error title, so it fits the page outline. Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** A catalog error, usually from `makeError(code, context)` in @lumen/shared. */
  error: LumenError;
  /** Called with the catalog action id when the fix button is pressed. */
  onAction?: (actionId: ErrorActionId) => void;
  /** Title, fix and action in one row, for deployment rows. */
  compact?: boolean;
  /** The card appeared because something just failed: announce it. */
  announce?: boolean;
  /** Start with the raw details open. */
  defaultRawOpen?: boolean;
  /** Page address included in "Copy for support"; defaults to the current URL. */
  url?: string;
  className?: string;
}

/** The plain-text report "Copy for support" puts on the clipboard. */
export function supportReport(error: LumenError, url: string): string {
  return [
    `Code: ${error.code}`,
    `Title: ${error.title}`,
    ...(error.supportId === undefined ? [] : [`Support ID: ${error.supportId}`]),
    ...(url === "" ? [] : [`Page: ${url}`]),
    ...(error.raw === undefined ? [] : ["", "Raw error:", error.raw]),
  ].join("\n");
}

/**
 * A user-facing error from the catalog: what happened, why, and the one thing
 * to do about it. Raw details stay folded away; stack traces never appear.
 */
export function ErrorCard({
  error,
  onAction,
  compact = false,
  announce = false,
  defaultRawOpen = false,
  url,
  headingLevel = 3,
  className,
}: ErrorCardProps) {
  const Heading = `h${String(headingLevel)}` as "h2" | "h3" | "h4";
  const titleId = useId();
  const rawId = useId();
  const [rawOpen, setRawOpen] = useState(defaultRawOpen);
  const { copied, copy } = useCopied();
  const { action } = error;

  const actionControl =
    action.kind === "button" ? (
      <Button
        variant={compact ? "secondary" : "primary"}
        size={compact ? "sm" : "md"}
        onClick={() => onAction?.(action.actionId)}
      >
        {action.label}
      </Button>
    ) : action.kind === "link" ? (
      <Button asChild variant={compact ? "secondary" : "primary"} size={compact ? "sm" : "md"}>
        <a href={action.href}>
          {action.label}
          <Icon name="arrow-up-right" size={compact ? 12 : 14} />
        </a>
      </Button>
    ) : null;

  const a11y = announce
    ? { role: "alert" as const }
    : { role: "region" as const, "aria-labelledby": titleId };

  if (compact) {
    return (
      <div
        {...a11y}
        data-error-code={error.code}
        className={cn(
          "border-danger/40 bg-surface rounded-card flex flex-wrap items-center gap-x-4 gap-y-2 border px-3 py-2",
          className,
        )}
      >
        <span className="text-danger inline-flex shrink-0">
          <Icon name="circle-alert" size={16} />
        </span>
        <div className="flex min-w-[200px] flex-1 flex-col">
          <p id={titleId} className="text-body font-medium">
            {error.title}
          </p>
          <p className="text-body-secondary">{error.fix}</p>
        </div>
        {actionControl}
        {action.kind === "command" && (
          <CopyField value={action.command} label={action.label} size="sm" className="w-full" />
        )}
      </div>
    );
  }

  return (
    <div
      {...a11y}
      data-error-code={error.code}
      className={cn(
        "border-danger/40 bg-surface rounded-card flex min-w-0 flex-col gap-3 border p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-danger inline-flex shrink-0 pt-[2px]">
          <Icon name="circle-alert" size={20} />
        </span>
        <Heading id={titleId} className="text-subsection text-16 min-w-0 flex-1 leading-tight">
          {error.title}
        </Heading>
        <span className="text-eyebrow hidden shrink-0 pt-[2px] sm:inline">{error.code}</span>
      </div>
      <p className="text-body text-text-secondary">{error.explanation}</p>
      <p className="text-body flex items-start gap-2">
        <span className="text-accent inline-flex shrink-0 pt-[3px]">
          <Icon name="sparkles" size={14} />
        </span>
        <span>{error.fix}</span>
      </p>
      {action.kind === "command" && (
        <CopyField value={action.command} label={action.label} className="max-w-[520px]" />
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {actionControl}
        {error.raw !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={rawOpen}
            aria-controls={rawOpen ? rawId : undefined}
            trailingIcon={rawOpen ? "chevron-down" : "chevron-right"}
            onClick={() => {
              setRawOpen((open) => !open);
            }}
          >
            {rawOpen ? "Hide raw error" : "Show raw error"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={copied ? "check" : "copy"}
          onClick={() => {
            void copy(supportReport(error, url ?? window.location.href));
          }}
        >
          {copied ? "Copied" : "Copy for support"}
        </Button>
        {error.supportId !== undefined && (
          <span className="text-meta ml-auto font-mono">ID {error.supportId}</span>
        )}
      </div>
      {error.raw !== undefined && rawOpen && (
        <div id={rawId}>
          <CodeBlock code={error.raw} label="Raw error details" maxHeight={200} wrap copy={false} />
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied for support" : ""}
      </span>
    </div>
  );
}
