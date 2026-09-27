"use client";

import { useId, useState } from "react";

import { Icon, type IconName } from "../icons/icon";
import { PROVIDER_NAMES, ProviderMark, type ProviderKey } from "../icons/provider-mark";
import { cn } from "../lib/cn";

import { Button } from "./button";
import { useCopied } from "./copy-field";
import { checkedAgo } from "./dns-record-card";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

export type PortStatus = "checking" | "open" | "blocked" | "unknown";

export interface PortCheck {
  port: number;
  protocol: "tcp" | "udp";
  /** What the port is for: "HTTPS", "WireGuard mesh". */
  label: string;
  status: PortStatus;
  /** A sentence under the row: "Couldn't check from here; only needed between servers". */
  note?: string;
}

export interface PortFixStep {
  text: string;
  command?: string;
}

export interface PortFix {
  title: string;
  /** Optional sections ("In the Oracle Cloud console", "On the server"); steps number on across them. */
  sections?: { heading: string; steps: PortFixStep[] }[];
  steps?: PortFixStep[];
}

export interface PortCheckCardProps {
  ports: readonly PortCheck[];
  provider: ProviderKey;
  /** Provider-specific fixes keyed by port number. */
  fixes?: Readonly<Record<number, PortFix>>;
  onRerun?: () => void;
  running?: boolean;
  lastRunAt?: Date | number;
  now?: Date | number;
  /** Ports whose fix starts open (blocked ports only). */
  defaultExpanded?: readonly number[];
  className?: string;
}

const STATUS: Record<
  PortStatus,
  { icon: IconName | null; text: string; tone: string; word: string }
> = {
  open: {
    icon: "circle-check",
    text: "text-success-text",
    tone: "text-success",
    word: "Reachable",
  },
  blocked: { icon: "circle-x", text: "text-danger-text", tone: "text-danger", word: "Blocked" },
  checking: {
    icon: null,
    text: "text-text-secondary",
    tone: "text-text-secondary",
    word: "Checking…",
  },
  unknown: {
    icon: "circle-help",
    text: "text-text-secondary",
    tone: "text-text-secondary",
    word: "Couldn't check",
  },
};

/** A shell command with a copy button. A minimal stand-in until CodeBlock lands (overlays/data-display work). */
function CommandLine({ command }: { command: string }) {
  const { copied, copy } = useCopied();
  return (
    <div className="border-border bg-bg-canvas rounded-control flex min-h-8 items-start gap-2 border py-1 pr-1 pl-3">
      <code className="text-12 text-text min-w-0 flex-1 py-[5px] font-mono break-words whitespace-pre-wrap">
        <span aria-hidden="true" className="text-text-secondary select-none">
          ${" "}
        </span>
        {command}
      </code>
      <Tooltip content={copied ? "Copied" : "Copy command"}>
        <button
          type="button"
          aria-label="Copy command"
          onClick={() => {
            void copy(command);
          }}
          className={cn(
            "text-text-secondary is-hover:text-text is-hover:bg-surface-hover rounded-control inline-flex size-6 shrink-0 items-center justify-center",
            copied && "text-success",
          )}
        >
          <Icon name={copied ? "check" : "copy"} size={14} />
        </button>
      </Tooltip>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

function StatusCell({ status }: { status: PortStatus }) {
  const def = STATUS[status];
  return (
    <span className={cn("text-body-secondary flex shrink-0 items-center gap-2", def.text)}>
      {def.icon === null ? (
        <Spinner size={14} decorative />
      ) : (
        <Icon name={def.icon} size={16} className={def.tone} />
      )}
      {def.word}
    </span>
  );
}

function FixSteps({ fix, provider }: { fix: PortFix; provider: ProviderKey }) {
  const sections = fix.sections ?? [{ heading: "", steps: fix.steps ?? [] }];
  let number = 0;
  return (
    <div className="border-border bg-bg rounded-card flex flex-col gap-4 border p-4">
      <p className="text-body text-text flex items-center gap-2 font-medium">
        <ProviderMark provider={provider} label={PROVIDER_NAMES[provider]} />
        {fix.title}
      </p>
      {sections.map((section) => (
        <div key={section.heading} className="flex flex-col gap-2">
          {section.heading !== "" && <p className="text-eyebrow">{section.heading}</p>}
          <ol className="flex flex-col gap-3">
            {section.steps.map((step) => {
              number += 1;
              return (
                <li key={`${String(number)}-${step.text}`} className="flex gap-3">
                  <span className="text-meta tabular w-4 shrink-0 pt-px text-right">{number}.</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-body-secondary text-text">{step.text}</span>
                    {step.command !== undefined && <CommandLine command={step.command} />}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

/**
 * The ports a server needs, each with a live reachability result. A blocked
 * port opens into the fix for the user's provider: numbered steps, copyable
 * commands, and a button to check again.
 */
export function PortCheckCard({
  ports,
  provider,
  fixes = {},
  onRerun,
  running = false,
  lastRunAt,
  now,
  defaultExpanded = [],
  className,
}: PortCheckCardProps) {
  const id = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(defaultExpanded));

  const toggle = (port: number) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(port)) {
        next.delete(port);
      } else {
        next.add(port);
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "border-border bg-surface rounded-card flex w-full max-w-[640px] flex-col border",
        className,
      )}
    >
      <div className="border-border flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
        <span className="text-label flex-1">Port check</span>
        {lastRunAt !== undefined && !running && (
          <span className="text-meta">{checkedAgo(lastRunAt, now ?? Date.now())}</span>
        )}
        {onRerun !== undefined && (
          <Button size="sm" leadingIcon="refresh-cw" loading={running} onClick={onRerun}>
            Run port check
          </Button>
        )}
      </div>
      <ul role="list" className="flex flex-col">
        {ports.map((port) => {
          const name = `${String(port.port)}/${port.protocol}`;
          const fix = fixes[port.port];
          const expandable = port.status === "blocked" && fix !== undefined;
          const expanded = expandable && open.has(port.port);
          const panelId = `${id}-fix-${String(port.port)}`;
          const row = (
            <>
              {/* Phones stack the label under the port so neither is cut. */}
              <span className="flex min-w-0 flex-1 flex-col py-2 sm:flex-row sm:items-center sm:gap-3 sm:py-0">
                <span className="text-13 text-text shrink-0 font-mono sm:w-[88px]">{name}</span>
                <span className="text-body-secondary min-w-0 sm:truncate">{port.label}</span>
              </span>
              <StatusCell status={port.status} />
            </>
          );
          return (
            <li
              key={name}
              data-port={name}
              data-status={port.status}
              className="border-border flex flex-col border-b last:border-b-0"
            >
              {expandable ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => {
                    toggle(port.port);
                  }}
                  className="is-hover:bg-surface-hover flex min-h-[40px] items-center gap-3 px-4 text-left"
                >
                  {row}
                  <Icon
                    name="chevron-down"
                    size={16}
                    className={cn(
                      "text-text-secondary shrink-0 transition-transform duration-[var(--dur-fast)]",
                      expanded && "rotate-180",
                    )}
                  />
                  <span className="sr-only">
                    {expanded ? ", hide the fix" : ", show how to fix it"}
                  </span>
                </button>
              ) : (
                <div className="flex min-h-[40px] items-center gap-3 px-4">
                  {row}
                  {/* Keeps the status column aligned with expandable rows. */}
                  {Object.keys(fixes).length > 0 && (
                    <span aria-hidden="true" className="w-4 shrink-0" />
                  )}
                </div>
              )}
              {port.note !== undefined && (
                <p className="text-meta -mt-2 px-4 pb-2 sm:pl-[116px]">{port.note}</p>
              )}
              {expanded && (
                <div id={panelId} className="flex flex-col gap-3 px-4 pb-4">
                  <FixSteps fix={fix} provider={provider} />
                  {onRerun !== undefined && (
                    <div>
                      <Button size="sm" onClick={onRerun} loading={running}>
                        I've done this — check again
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
