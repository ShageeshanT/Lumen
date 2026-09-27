import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

export interface StepperStep {
  id: string;
  label: string;
  optional?: boolean;
}

export type StepState = "done" | "current" | "upcoming";

export interface StepperProps {
  steps: readonly StepperStep[];
  /** Id of the step in progress. */
  current: string;
  /** Ids of finished steps. Only these are clickable ("Back" is always allowed). */
  completed?: readonly string[];
  onStepClick?: (id: string) => void;
  orientation?: "horizontal" | "vertical";
  /**
   * `auto` collapses to "Step 3 of 6" with a progress bar under 640 px;
   * `always` forces the compact form; `never` keeps the full list.
   */
  collapse?: "auto" | "always" | "never";
  /** Accessible name of the navigation landmark. */
  label?: string;
  /** Gallery only: render this finished step in its hover state. */
  forcedHover?: string;
  className?: string;
}

export function stepState(
  step: StepperStep,
  current: string,
  completed: readonly string[],
): StepState {
  if (step.id === current) {
    return "current";
  }
  return completed.includes(step.id) ? "done" : "upcoming";
}

const MARKER: Record<StepState, string> = {
  done: "border-success bg-success-subtle text-success",
  current: "border-accent-fill bg-accent-fill text-accent-ink",
  upcoming: "border-border-strong bg-transparent text-text-secondary",
};

const LABEL: Record<StepState, string> = {
  done: "text-text-secondary",
  current: "text-text",
  upcoming: "text-text-secondary",
};

/**
 * Wizard progress: numbered square markers joined by 2 px rails. Current is
 * the accent fill, done steps show a check in success, upcoming steps are an
 * outline. Finished steps are buttons so going back is always one click.
 */
export function Stepper({
  steps,
  current,
  completed = [],
  onStepClick,
  orientation = "horizontal",
  collapse = "auto",
  label = "Setup progress",
  forcedHover,
  className,
}: StepperProps) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  );
  const currentStep = steps[currentIndex];
  const vertical = orientation === "vertical";

  const compact = (
    <div
      className={cn(
        "flex flex-col gap-2",
        collapse === "auto" && "sm:hidden",
        collapse === "never" && "hidden",
      )}
      data-stepper-compact=""
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-text tabular">
          Step {currentIndex + 1} of {steps.length}
        </span>
        {currentStep !== undefined && (
          <span className="text-body-secondary truncate">{currentStep.label}</span>
        )}
      </div>
      <div
        className="bg-border h-[2px] w-full"
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={currentIndex + 1}
        aria-valuetext={`Step ${String(currentIndex + 1)} of ${String(steps.length)}${currentStep === undefined ? "" : `: ${currentStep.label}`}`}
      >
        <div
          className="bg-accent h-full transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]"
          style={{ width: `${String(((currentIndex + 1) / steps.length) * 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <nav aria-label={label} className={cn("w-full", className)} data-orientation={orientation}>
      {compact}
      <ol
        className={cn(
          collapse === "auto" && "hidden sm:flex",
          collapse === "always" && "hidden",
          collapse === "never" && "flex",
          vertical ? "flex-col gap-4" : "flex-row items-start",
        )}
      >
        {steps.map((step, index) => {
          const state = stepState(step, current, completed);
          const clickable = state === "done" && onStepClick !== undefined;
          const last = index === steps.length - 1;
          const content = (
            <>
              <span
                className={cn(
                  "rounded-kbd text-12 tabular relative flex size-6 shrink-0 items-center justify-center border font-mono font-medium",
                  MARKER[state],
                )}
                aria-hidden="true"
              >
                {state === "done" ? <Icon name="check" size={14} /> : index + 1}
              </span>
              <span
                className={cn("flex min-w-0 flex-col", vertical ? "gap-0" : "items-center gap-0")}
              >
                <span
                  className={cn(
                    "text-label",
                    LABEL[state],
                    clickable &&
                      "decoration-accent group-hover/step:text-text group-data-[force~=hover]/step:text-text underline-offset-4 group-hover/step:underline group-data-[force~=hover]/step:underline",
                  )}
                >
                  {step.label}
                </span>
                {step.optional === true && <span className="text-meta">Optional</span>}
                <span className="sr-only">
                  {state === "done"
                    ? ", done"
                    : state === "current"
                      ? ", current step"
                      : ", not started"}
                </span>
              </span>
            </>
          );
          const itemClasses = cn(
            "flex gap-2",
            vertical ? "flex-row items-center" : "flex-col items-center text-center",
          );
          return (
            <li
              key={step.id}
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              className={cn(
                "relative flex",
                vertical ? "flex-row" : "min-w-0 flex-1 justify-center",
              )}
            >
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute",
                    vertical
                      ? "top-6 bottom-[-16px] left-[11px] w-[2px]"
                      : "top-[11px] left-[calc(50%+16px)] h-[2px] w-[calc(100%-32px)]",
                    state === "done" ? "bg-success" : "bg-border",
                  )}
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  data-force={forcedHover === step.id ? "hover" : undefined}
                  onClick={() => {
                    onStepClick(step.id);
                  }}
                  className={cn(itemClasses, "group/step rounded-control min-h-6 cursor-pointer")}
                >
                  {content}
                </button>
              ) : (
                <div className={itemClasses}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
