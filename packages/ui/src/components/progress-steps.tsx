"use client";

import { useEffect, useState } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { formatDuration } from "../lib/format";

import { LiveRegion } from "./live-region";

export type StepState = "pending" | "active" | "done" | "failed" | "skipped";

export interface ProgressStep {
  id: string;
  label: string;
  state: StepState;
  /** Epoch milliseconds. */
  startedAt?: number;
  finishedAt?: number;
  /** One line under the label in the vertical layout: "Image pushed · 212 MB". */
  detail?: string;
  /** Makes the step a link (to its logs, for example). */
  href?: string;
}

export interface ProgressStepsProps {
  steps: ProgressStep[];
  orientation?: "horizontal" | "vertical";
  /**
   * The clock for durations, in epoch milliseconds. Leave it out and the
   * active step ticks every second on its own; pass it to freeze time.
   */
  now?: number;
  /** Names the list for assistive technology. */
  label?: string;
  className?: string;
}

/** Ticks once a second while `enabled`; returns the current time. */
function useTicker(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const tick = () => {
      setNow(Date.now());
    };
    // Catch up at once when ticking starts, then once a second.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled]);
  return now;
}

function durationOf(step: ProgressStep, now: number): string | undefined {
  if (step.startedAt === undefined) {
    return undefined;
  }
  if (step.state === "active") {
    return formatDuration(now - step.startedAt);
  }
  if (step.finishedAt !== undefined && (step.state === "done" || step.state === "failed")) {
    return formatDuration(step.finishedAt - step.startedAt);
  }
  return undefined;
}

const STATE_WORD: Record<StepState, string> = {
  pending: "not started",
  active: "in progress",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

function StepMarker({ state }: { state: StepState }) {
  return (
    <span
      aria-hidden="true"
      data-step-marker={state}
      className={cn(
        "rounded-kbd inline-flex size-5 shrink-0 items-center justify-center border",
        state === "pending" && "border-border-strong bg-surface",
        state === "active" && "border-warning bg-surface",
        state === "done" && "border-success bg-success text-bg",
        state === "failed" && "border-danger bg-danger text-bg",
        state === "skipped" && "border-border-strong bg-surface text-text-secondary border-dashed",
      )}
    >
      {state === "active" && <span className="bg-warning blink size-2" />}
      {state === "done" && <Icon name="check" size={12} />}
      {state === "failed" && <Icon name="x" size={12} />}
      {state === "skipped" && <Icon name="minus" size={12} />}
    </span>
  );
}

/**
 * The deploy timeline: Queued → Building → Pre-deploy → Deploying → Health
 * check → Live. Each step shows its state with a marker, its word and its
 * duration; the active one ticks every second and step changes are announced.
 * Under 640 px the horizontal bar keeps its markers and names only the
 * current step, so nothing wraps into unreadable fragments.
 */
export function ProgressSteps({
  steps,
  orientation = "horizontal",
  now: fixedNow,
  label = "Deployment progress",
  className,
}: ProgressStepsProps) {
  const hasActive = steps.some((step) => step.state === "active");
  const ticking = useTicker(hasActive && fixedNow === undefined);
  const now = fixedNow ?? ticking;

  const failedIndex = steps.findIndex((step) => step.state === "failed");
  const activeIndex = steps.findIndex((step) => step.state === "active");
  const currentIndex = activeIndex >= 0 ? activeIndex : failedIndex;
  const current = currentIndex >= 0 ? steps[currentIndex] : undefined;
  const allDone =
    steps.length > 0 && steps.every((s) => s.state === "done" || s.state === "skipped");

  const first = steps.find((step) => step.startedAt !== undefined)?.startedAt;
  const last = steps.at(-1)?.finishedAt ?? steps.at(-1)?.startedAt;
  const total = allDone && first !== undefined && last !== undefined ? last - first : undefined;

  const announcement =
    current === undefined
      ? allDone
        ? `Live${total === undefined ? "" : ` in ${formatDuration(total)}`}`
        : ""
      : `${current.label}${current.state === "failed" ? " failed" : ""}, step ${String(currentIndex + 1)} of ${String(steps.length)}`;

  const vertical = orientation === "vertical";

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      <ol
        aria-label={label}
        className={cn("flex min-w-0", vertical ? "flex-col" : "flex-row items-start")}
      >
        {steps.map((step, index) => {
          const duration = durationOf(step, now);
          const isLast = index === steps.length - 1;
          const dimmed = failedIndex >= 0 && index > failedIndex;
          const lineDone = step.state === "done" || step.state === "skipped";
          const isCurrent = index === currentIndex;
          const shownDuration = isLast && total !== undefined ? formatDuration(total) : duration;
          const name =
            step.href === undefined ? (
              <span>{step.label}</span>
            ) : (
              <a href={step.href} className="underline-offset-4 hover:underline">
                {step.label}
              </a>
            );
          const text = (
            <>
              <span
                className={cn(
                  "text-label",
                  step.state === "pending" || step.state === "skipped"
                    ? "text-text-secondary"
                    : "text-text",
                  step.state === "failed" && "text-danger-text",
                )}
              >
                {name}
                <span className="sr-only">, {STATE_WORD[step.state]}</span>
              </span>
              <span className="text-meta min-h-[18px]">
                {shownDuration ?? (step.state === "skipped" ? "Skipped" : " ")}
              </span>
              {vertical && step.detail !== undefined && (
                <span className="text-body-secondary">{step.detail}</span>
              )}
            </>
          );

          if (vertical) {
            return (
              <li
                key={step.id}
                aria-current={isCurrent && step.state === "active" ? "step" : undefined}
                className={cn(
                  "relative flex gap-3",
                  !isLast && "pb-4", // Only the shapes dim: the words keep 4.5:1.
                  dimmed && "[&_[aria-hidden=true]]:opacity-50",
                )}
              >
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-5 bottom-0 left-[9px] w-[2px]",
                      lineDone ? "bg-success" : "bg-border",
                    )}
                  />
                )}
                <StepMarker state={step.state} />
                <div className="flex min-w-0 flex-col gap-[2px] pt-[2px]">{text}</div>
              </li>
            );
          }

          return (
            <li
              key={step.id}
              aria-current={isCurrent && step.state === "active" ? "step" : undefined}
              className={cn(
                "relative flex min-w-0 flex-col gap-2",
                isLast ? "shrink-0" : "flex-1",
                // Only the shapes dim: the words keep 4.5:1.
                dimmed && "[&_[aria-hidden=true]]:opacity-50",
              )}
            >
              <div className="flex items-center">
                <StepMarker state={step.state} />
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn("mx-1 h-[2px] flex-1", lineDone ? "bg-success" : "bg-border")}
                  />
                )}
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-col gap-[2px] pr-2",
                  // Narrow screens: the words move to one caption line under the bar.
                  "max-sm:sr-only",
                )}
              >
                {text}
              </div>
            </li>
          );
        })}
      </ol>
      {!vertical && (current !== undefined || total !== undefined) && (
        <p aria-hidden="true" className="flex items-baseline gap-2 sm:hidden">
          <span className={cn("text-label", current?.state === "failed" && "text-danger-text")}>
            {current?.label ?? steps.at(-1)?.label}
          </span>
          <span className="text-meta">
            {current === undefined
              ? formatDuration(total ?? 0)
              : `Step ${String(currentIndex + 1)} of ${String(steps.length)}${
                  durationOf(current, now) === undefined
                    ? ""
                    : ` · ${durationOf(current, now) ?? ""}`
                }`}
          </span>
        </p>
      )}
      <LiveRegion message={announcement} />
    </div>
  );
}
