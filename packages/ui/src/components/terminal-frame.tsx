"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../lib/cn";

import { Alert } from "./alert";
import { Button } from "./button";
import { Spinner } from "./spinner";

export type TerminalStatus = "connecting" | "connected" | "disconnected";

export interface TerminalFrameProps {
  /** Names the region: "Shell in api (replica 1)". */
  label: string;
  status: TerminalStatus;
  /** A warning strip at the top: "You're inside a live container…". */
  banner?: string;
  /** Replica select, shell select, reconnect. */
  toolbar?: ReactNode;
  /** The terminal itself (the xterm mount arrives in Phase 14). */
  children?: ReactNode;
  onReconnect?: () => void;
  /** "panel" fills its parent; "dock" is the 320 px bottom dock with a resize handle. */
  mode?: "panel" | "dock";
  className?: string;
}

const STATUS_TEXT: Record<TerminalStatus, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
};

/**
 * The frame every shell lives in. Terminals stay dark in both themes, so the
 * inside of the frame is scoped to the dark tokens; in the light theme the
 * outer 1 px strong border keeps it separated from the page.
 */
export function TerminalFrame({
  label,
  status,
  banner,
  toolbar,
  children,
  onReconnect,
  mode = "panel",
  className,
}: TerminalFrameProps) {
  const screenRef = useRef<HTMLDivElement>(null);

  // Escape from the toolbar hands focus back to the terminal screen.
  const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      screenRef.current?.focus();
    }
  };

  return (
    <section
      aria-label={label}
      className={cn(
        "border-border-strong rounded-card flex min-w-0 flex-col overflow-hidden border",
        mode === "dock" ? "h-[320px]" : "min-h-[320px]",
        className,
      )}
    >
      <div data-theme="dark" className="bg-terminal-bg text-text flex min-h-0 flex-1 flex-col">
        {/* A bottom dock grows upward, so its resize grip sits on the top edge. */}
        {mode === "dock" && (
          <div
            aria-hidden="true"
            className="border-border hover:bg-accent/40 h-[6px] shrink-0 cursor-row-resize border-b"
          />
        )}
        <div
          onKeyDown={onToolbarKeyDown}
          className="border-border flex h-[36px] shrink-0 items-center gap-3 border-b px-3"
        >
          <span className="text-eyebrow flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-[6px]",
                status === "connected" && "bg-success",
                status === "connecting" && "bg-warning blink",
                status === "disconnected" && "bg-danger",
              )}
            />
            {STATUS_TEXT[status]}
          </span>
          {toolbar !== undefined && (
            <div className="ml-auto flex items-center gap-2">{toolbar}</div>
          )}
        </div>
        {banner !== undefined && (
          <Alert variant="warning" compact className="rounded-none border-x-0 border-t-0">
            {banner}
          </Alert>
        )}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={screenRef}
            tabIndex={0}
            aria-label="Terminal output"
            className="text-log min-h-0 flex-1 overflow-auto p-3 -outline-offset-2"
          >
            {status === "connected" && children}
          </div>
          {status === "connecting" && (
            <div className="text-body-secondary absolute inset-0 flex items-center justify-center gap-2">
              <Spinner size={14} decorative />
              Connecting…
            </div>
          )}
          {status === "disconnected" && (
            <div className="bg-overlay absolute inset-0 flex flex-col items-center justify-center gap-3">
              <p className="text-body">Disconnected</p>
              {onReconnect !== undefined && (
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon="refresh-cw"
                  onClick={onReconnect}
                >
                  Reconnect
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <span className="sr-only" role="status">
        {`${label}: ${STATUS_TEXT[status]}`}
      </span>
    </section>
  );
}
