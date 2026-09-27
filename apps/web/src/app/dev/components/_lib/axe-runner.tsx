"use client";

import type { Result } from "axe-core";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Popover, PopoverContent, PopoverTrigger } from "@lumen/ui";

/** The same rule set the CI spec enforces (e2e/lib/a11y.ts). */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; violations: Result[] }
  | { kind: "failed"; message: string };

/**
 * Runs axe-core on the current gallery page and lists what it finds, so a
 * problem shows up while building a component, not only in CI. axe-core is
 * loaded on first use and never ships outside the dev gallery.
 */
export function AxeRunner() {
  const pathname = usePathname();
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const [open, setOpen] = useState(false);

  // A result belongs to the page it ran on.
  const [ranOn, setRanOn] = useState(pathname);
  if (ranOn !== pathname) {
    setRanOn(pathname);
    setState({ kind: "idle" });
  }

  const run = async () => {
    setState({ kind: "running" });
    try {
      const { default: axe } = await import("axe-core");
      const main = document.querySelector("main");
      const results = await axe.run(main ?? document, { runOnly: { type: "tag", values: TAGS } });
      setState({ kind: "done", violations: results.violations });
    } catch (error) {
      setState({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
    }
    setOpen(true);
  };

  const count = state.kind === "done" ? state.violations.length : null;
  const label =
    state.kind === "running"
      ? "Running axe"
      : count === null
        ? "Run axe"
        : count === 0
          ? "Axe: clean"
          : `Axe: ${String(count)} ${count === 1 ? "issue" : "issues"}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          leadingIcon="shield"
          loading={state.kind === "running"}
          onClick={(event) => {
            if (state.kind === "idle" || state.kind === "failed") {
              event.preventDefault();
              void run();
            }
          }}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        title={count === 0 ? "No violations" : "Accessibility check"}
        closeButton
      >
        {state.kind === "failed" && (
          <Alert variant="danger" title="axe could not run">
            {state.message}
          </Alert>
        )}
        {state.kind === "done" && state.violations.length === 0 && (
          <p className="text-body-secondary">
            Every WCAG 2.2 AA and best-practice rule passes on this page.
          </p>
        )}
        {state.kind === "done" && state.violations.length > 0 && (
          <ul className="flex max-h-[320px] flex-col gap-3 overflow-y-auto">
            {state.violations.map((violation) => (
              <li key={violation.id} className="flex flex-col gap-1">
                <span className="text-label text-danger-text">
                  {violation.id} · {violation.impact ?? "minor"} · {violation.nodes.length}
                </span>
                <span className="text-body-secondary">{violation.help}</span>
                <code className="text-code text-text-secondary break-all">
                  {violation.nodes
                    .slice(0, 3)
                    .map((node) => node.target.join(" "))
                    .join(", ")}
                </code>
              </li>
            ))}
          </ul>
        )}
        {state.kind === "done" && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => {
              void run();
            }}
          >
            Run again
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
