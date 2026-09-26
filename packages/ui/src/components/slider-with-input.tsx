"use client";

import * as RadixSlider from "@radix-ui/react-slider";
import { useEffect, useId, useState } from "react";

import { cn } from "../lib/cn";

import { controlClasses } from "./control-styles";

export interface SliderMark {
  value: number;
  label: string;
}

export interface SliderWithInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Shown after the number and spoken in the value text. */
  unit: string;
  /** Spoken unit, such as "megabytes". */
  unitName: string;
  /** Visible label and accessible name for both the slider and the number. */
  label: string;
  marks?: SliderMark[];
  /** Capacity: beyond this the band turns warning and the value turns invalid. */
  limit?: { value: number; label: string };
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

function clamp(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round((value - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
}

/**
 * Memory and CPU limits: a fader with a numeric input. The track is a thin
 * rail, the thumb a square cap. Beyond the server's limit the band turns
 * warning and the value is marked invalid with a message.
 */
export function SliderWithInput({
  value,
  onValueChange,
  min,
  max,
  step,
  unit,
  unitName,
  label,
  marks = [],
  limit,
  formatValue = (v) => String(v),
  disabled = false,
  className,
}: SliderWithInputProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const over = limit !== undefined && value > limit.value;
  const atLimit = limit?.value === value;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const messageId = `${id}-message`;

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      onValueChange(clamp(parsed, min, max, step));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", disabled && "opacity-50", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={`${id}-input`} className="text-label">
          {label}
        </label>
        <span className="text-meta">
          {formatValue(min)} – {formatValue(max)}
        </span>
      </div>
      {/* The number drops below the track when there is no room for both (narrow panels, phones). */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex min-w-[160px] flex-1 flex-col gap-2 pt-2">
          <RadixSlider.Root
            value={[value]}
            onValueChange={([next]) => {
              if (next !== undefined) {
                onValueChange(next);
              }
            }}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={label}
            className="relative flex h-4 w-full touch-none items-center select-none"
          >
            <RadixSlider.Track className="bg-border-strong relative h-1 grow overflow-hidden">
              {limit !== undefined && limit.value < max && (
                <span
                  aria-hidden="true"
                  className="bg-warning/30 absolute top-0 right-0 bottom-0"
                  style={{ left: `${String(pct(limit.value))}%` }}
                />
              )}
              <RadixSlider.Range
                className={cn("absolute h-full", over ? "bg-danger" : "bg-accent")}
              />
            </RadixSlider.Track>
            <RadixSlider.Thumb
              aria-label={label}
              aria-valuetext={`${formatValue(value)} ${unitName}`}
              aria-describedby={limit === undefined ? undefined : messageId}
              className="group/thumb flex size-6 items-center justify-center outline-none"
            >
              {/* The hit area is 24 × 24 (WCAG 2.5.8); the visible cap is a 10 × 16 fader knob. */}
              <span
                aria-hidden="true"
                className={cn(
                  "bg-surface block h-4 w-[10px] rounded-[1px] border-2",
                  over ? "border-danger" : "border-accent",
                  "transition-[box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                  "group-hover/thumb:scale-y-110 group-hover/thumb:shadow-[var(--shadow-glow)]",
                  "group-focus-visible/thumb:outline-accent group-focus-visible/thumb:shadow-[var(--shadow-glow)] group-focus-visible/thumb:outline-2 group-focus-visible/thumb:outline-offset-2",
                )}
              />
            </RadixSlider.Thumb>
          </RadixSlider.Root>
          {marks.length > 0 && (
            <div aria-hidden="true" className="relative h-4">
              {marks.map((mark) => (
                <span
                  key={mark.value}
                  className="text-meta absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${String(pct(mark.value))}%` }}
                >
                  {mark.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="relative w-[96px] shrink-0">
          <input
            id={`${id}-input`}
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            aria-label={`${label} in ${unitName}`}
            aria-invalid={over || undefined}
            aria-describedby={limit === undefined ? undefined : messageId}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commit();
              }
            }}
            className={controlClasses({
              invalid: over,
              monospace: true,
              className: "tabular text-right",
            })}
            style={{ paddingRight: 16 + unit.length * 7 }}
          />
          <span className="text-meta pointer-events-none absolute top-1/2 right-[10px] -translate-y-1/2">
            {unit}
          </span>
        </div>
      </div>
      {limit !== undefined && (
        <p
          id={messageId}
          className={cn(
            "text-13",
            over ? "text-danger-text" : atLimit ? "text-warning-text" : "text-text-secondary",
          )}
        >
          {over ? `More than ${limit.label}. Lower it or move to a bigger server.` : limit.label}
        </p>
      )}
    </div>
  );
}
