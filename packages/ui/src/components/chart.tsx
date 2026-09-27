"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type uPlot from "uplot";

import { cn } from "../lib/cn";
import { formatCount, formatMegabytes, formatPercent } from "../lib/format";

import { useChartSyncId } from "./chart-sync";
import { LiveRegion } from "./live-region";
import { Skeleton } from "./skeleton";
import { Tooltip } from "./tooltip";

export type ChartColor = "accent" | "violet" | "info" | "success" | "warning" | "danger";
export type ChartUnit = "%" | "MB" | "GB" | "req/min" | "ms" | "KB/s";

export interface ChartSeries {
  id: string;
  label: string;
  /** [epoch ms, value]; a null value is a gap and the line breaks there. */
  data: readonly (readonly [number, number | null])[];
  color?: ChartColor;
  /** Secondary lines, such as one replica out of several. */
  dashed?: boolean;
}

export interface ChartMarker {
  ts: number;
  label: string;
  kind: "deploy" | "oom" | "restart";
}

export interface ChartProps {
  /** What is measured: "CPU". Starts the screen-reader summary. */
  title: string;
  series: ChartSeries[];
  kind?: "line" | "area";
  unit: ChartUnit;
  /** Epoch ms. */
  range: { from: number; to: number };
  /** "last 1 hour"; derived from the range when omitted. */
  rangeLabel?: string;
  limitLine?: { value: number; label: string };
  markers?: ChartMarker[];
  /** Join a crosshair group explicitly; charts inside <ChartSyncGroup> join automatically. */
  syncId?: string;
  height?: number;
  loading?: boolean;
  /** Shown when there is no data in the range. */
  empty?: string;
  /** Overrides the generated summary. */
  summary?: string;
  className?: string;
}

const COLOR_VAR: Record<ChartColor, string> = {
  accent: "--color-accent",
  violet: "--color-violet",
  info: "--color-info",
  success: "--color-success",
  warning: "--color-warning",
  danger: "--color-danger",
};

const SWATCH: Record<ChartColor, string> = {
  accent: "bg-accent",
  violet: "bg-violet",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

// Accent then violet: blue and info-blue sat too close for a second line.
const DEFAULT_COLORS: ChartColor[] = ["accent", "violet", "success", "warning"];
const NO_MARKERS: ChartMarker[] = [];

/** "34 %", "512 MB", "1.2 GB", "1,204 req/min", "42 ms", "380 KB/s". */
export function formatChartValue(value: number, unit: ChartUnit): string {
  switch (unit) {
    case "%":
      return formatPercent(value, value < 10 && value % 1 !== 0 ? 1 : 0);
    case "MB":
      return formatMegabytes(value);
    case "GB":
      return `${String(Math.round(value * 10) / 10)} GB`;
    case "req/min":
      return `${formatCount(value)} req/min`;
    case "ms":
      return `${formatCount(value)} ms`;
    case "KB/s":
      return `${formatCount(value)} KB/s`;
  }
}

/** Short axis labels: the unit only where it fits. */
function formatAxis(value: number, unit: ChartUnit): string {
  if (unit === "%") {
    return `${String(Math.round(value))}%`;
  }
  if (Math.abs(value) >= 1000) {
    return `${String(Math.round(value / 100) / 10)}k`;
  }
  return String(Math.round(value * 10) / 10);
}

/** 0 and three or four round steps that clear `max` with a little headroom: 0 / 200 / 400 / 600. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) {
    return [0, 1];
  }
  const raw = (max * 1.05) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ??
    10 * magnitude;
  const count = Math.ceil((max * 1.05) / step);
  return Array.from({ length: count + 1 }, (_, index) => Math.round(index * step * 1000) / 1000);
}

/** Round-minute time ticks strictly inside the range, about five of them. */
export function timeTicks(from: number, to: number): number[] {
  const span = to - from;
  const minute = 60_000;
  const step =
    [1, 2, 5, 10, 15, 30, 60, 120, 360, 720, 1440]
      .map((m) => m * minute)
      .find((candidate) => span / candidate <= 6) ?? 1440 * minute;
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t < to; t += step) {
    if (t - from > step / 3 && to - t > step / 3) {
      ticks.push(t);
    }
  }
  return ticks;
}

/** "last 1 hour", "last 6 hours", "last 7 days", "last 30 minutes". */
export function describeRange(from: number, to: number): string {
  const minutes = Math.round((to - from) / 60_000);
  if (minutes < 120) {
    return minutes === 60 ? "last 1 hour" : `last ${String(minutes)} minutes`;
  }
  const hours = Math.round(minutes / 60);
  if (hours <= 48) {
    return `last ${String(hours)} hours`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "last 1 day" : `last ${String(days)} days`;
}

/**
 * The sentence screen readers get instead of the picture:
 * "CPU, last 1 hour: minimum 12 %, maximum 71 %, latest 34 %, limit 100 %; 2 deploys".
 */
export function chartSummary({
  title,
  series,
  unit,
  range,
  rangeLabel,
  limitLine,
  markers = [],
}: {
  title: string;
  series: ChartSeries[];
  unit: ChartUnit;
  range: { from: number; to: number };
  rangeLabel?: string | undefined;
  limitLine?: { value: number; label: string } | undefined;
  markers?: ChartMarker[] | undefined;
}): string {
  const when = rangeLabel ?? describeRange(range.from, range.to);
  const parts = series.map((entry) => {
    const values = entry.data.flatMap(([, value]) => (value === null ? [] : [value]));
    const latest = [...entry.data].reverse().find(([, value]) => value !== null)?.[1];
    if (values.length === 0 || latest === undefined || latest === null) {
      return series.length > 1 ? `${entry.label}: no data` : "no data";
    }
    const stats = `minimum ${formatChartValue(Math.min(...values), unit)}, maximum ${formatChartValue(Math.max(...values), unit)}, latest ${formatChartValue(latest, unit)}`;
    return series.length > 1 ? `${entry.label} ${stats}` : stats;
  });
  let text = `${title}, ${when}: ${parts.join("; ")}`;
  if (limitLine !== undefined) {
    text += `, limit ${formatChartValue(limitLine.value, unit)}`;
  }
  const counts = new Map<string, number>();
  for (const marker of markers) {
    counts.set(marker.kind, (counts.get(marker.kind) ?? 0) + 1);
  }
  const words: Record<ChartMarker["kind"], [string, string]> = {
    deploy: ["deploy", "deploys"],
    oom: ["out-of-memory restart", "out-of-memory restarts"],
    restart: ["restart", "restarts"],
  };
  const markerText = [...counts].map(([kind, count]) => {
    const [one, many] = words[kind as ChartMarker["kind"]];
    return `${String(count)} ${count === 1 ? one : many}`;
  });
  if (markerText.length > 0) {
    text += `; ${markerText.join(", ")}`;
  }
  return text;
}

/** Merges per-series samples into uPlot's aligned columns (x, then one column per series). */
export function alignSeries(series: ChartSeries[]): [number[], ...(number | null)[][]] {
  const xs = [...new Set(series.flatMap((entry) => entry.data.map(([ts]) => ts)))].sort(
    (a, b) => a - b,
  );
  const columns = series.map((entry) => {
    const byTs = new Map(entry.data.map(([ts, value]) => [ts, value]));
    return xs.map((ts) => byTs.get(ts) ?? null);
  });
  return [xs, ...columns];
}

function formatClock(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (hex === undefined) {
    return color;
  }
  const n = Number.parseInt(hex, 16);
  return `rgba(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)}, ${String(alpha)})`;
}

interface Overlay {
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  limitTop?: number;
  markers: { marker: ChartMarker; left: number }[];
}

/**
 * A time-series chart on uPlot: line or area, a dashed limit line, deploy and
 * OOM markers, a crosshair (synced across a ChartSyncGroup) with a tooltip,
 * and a legend whose items toggle series. It is focusable: arrows move the
 * crosshair a sample at a time and the reading is announced. Screen readers
 * get a generated summary instead of the picture.
 */
export function Chart({
  title,
  series,
  kind = "line",
  unit,
  range,
  rangeLabel,
  limitLine,
  markers = NO_MARKERS,
  syncId,
  height = 160,
  loading = false,
  empty = "No data for this range",
  summary,
  className,
}: ChartProps) {
  const groupSync = useChartSyncId();
  const sync = syncId ?? groupSync;
  const frameRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [cursorLeft, setCursorLeft] = useState(0);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounce = useRef(0);

  const aligned = useMemo(() => alignSeries(series), [series]);
  const xs = aligned[0];
  const hasData = series.some((entry) => entry.data.some(([, value]) => value !== null));
  const text =
    summary ?? chartSummary({ title, series, unit, range, rangeLabel, limitLine, markers });
  const colors = useMemo(
    () =>
      series.map(
        (entry, index) => entry.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length] ?? "accent",
      ),
    [series],
  );
  // Read when the canvas is built; later toggles go through setSeries so the cursor survives.
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  const limitValue = limitLine?.value;

  // Rebuild the canvas when the theme changes: canvas colors are read from tokens.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeTick((tick) => tick + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const target = plotRef.current;
    const frame = frameRef.current;
    if (target === null || frame === null || loading || !hasData) {
      return;
    }
    let cancelled = false;
    let instance: uPlot | null = null;
    let resize: ResizeObserver | null = null;

    void import("uplot").then(({ default: UPlot }) => {
      if (cancelled) {
        return;
      }
      const css = getComputedStyle(frame);
      const token = (name: string) => css.getPropertyValue(name).trim();
      const fontMono = token("--font-mono") || "monospace";
      const axisFont = `11px ${fontMono}`;
      const textSecondary = token("--color-text-secondary");
      const grid = withAlpha(token("--color-border"), 0.6);
      const maxValue = Math.max(
        ...aligned.slice(1).flatMap((column) => column.flatMap((v) => (v === null ? [] : [v]))),
        limitValue ?? 0,
      );
      const yTicks = niceTicks(maxValue);

      const measure = () => {
        const shownLeft = parseFloat(instance?.over.style.left ?? "0");
        const shownTop = parseFloat(instance?.over.style.top ?? "0");
        if (instance === null) {
          return;
        }
        const u = instance;
        setOverlay({
          plotLeft: shownLeft,
          plotTop: shownTop,
          plotWidth: u.over.clientWidth,
          plotHeight: u.over.clientHeight,
          ...(limitValue === undefined ? {} : { limitTop: u.valToPos(limitValue, "y") }),
          markers: markers
            .filter((marker) => marker.ts >= range.from && marker.ts <= range.to)
            .map((marker) => ({ marker, left: u.valToPos(marker.ts, "x") })),
        });
      };

      const options: uPlot.Options = {
        width: Math.max(frame.clientWidth, 200),
        height,
        ms: 1,
        legend: { show: false },
        padding: [8, 16, 0, 0],
        scales: {
          x: { time: true, range: () => [range.from, range.to] },
          y: { range: () => [0, yTicks.at(-1) ?? 1] },
        },
        axes: [
          {
            stroke: textSecondary,
            font: axisFont,
            size: 20,
            gap: 4,
            ticks: { show: false },
            grid: { show: false },
            // Interior ticks only: the edges would collide with the y labels and the frame.
            splits: () => timeTicks(range.from, range.to),
            values: (_u, splits) => splits.map((split) => formatClock(split).slice(0, 5)),
          },
          {
            stroke: textSecondary,
            font: axisFont,
            size: 36,
            gap: 4,
            ticks: { show: false },
            splits: () => yTicks,
            grid: { stroke: grid, width: 1 },
            values: (_u, splits) => splits.map((split) => formatAxis(split, unit)),
          },
        ],
        cursor: {
          y: false,
          drag: { x: false, y: false },
          points: { size: 6, width: 0 },
          ...(sync === undefined ? {} : { sync: { key: sync, setSeries: false } }),
        },
        focus: { alpha: 0.3 },
        series: [
          {},
          ...series.map((entry, index) => {
            const color = token(COLOR_VAR[colors[index] ?? "accent"]);
            return {
              label: entry.label,
              stroke: color,
              width: 1.5,
              show: !hiddenRef.current.has(entry.id),
              spanGaps: false,
              points: { show: false },
              ...(kind === "area" ? { fill: withAlpha(color, 0.12) } : {}),
              ...(entry.dashed === true ? { dash: [4, 4] } : {}),
            } satisfies uPlot.Series;
          }),
        ],
        hooks: {
          setCursor: [
            (u) => {
              const idx = u.cursor.idx ?? null;
              setCursorIdx(idx === null || (u.cursor.left ?? -1) < 0 ? null : idx);
              setCursorLeft(u.cursor.left ?? 0);
            },
          ],
          draw: [measure],
        },
      };
      instance = new UPlot(options, aligned, target);
      plot.current = instance;
      resize = new ResizeObserver(() => {
        if (instance !== null && frame.clientWidth > 0) {
          instance.setSize({ width: frame.clientWidth, height });
        }
      });
      resize.observe(frame);
    });

    return () => {
      cancelled = true;
      resize?.disconnect();
      instance?.destroy();
      plot.current = null;
    };
  }, [
    aligned,
    series,
    colors,
    kind,
    unit,
    range.from,
    range.to,
    limitValue,
    markers,
    sync,
    height,
    loading,
    hasData,
    themeTick,
  ]);

  const toggle = (entry: ChartSeries, index: number) => {
    setHidden((previous) => {
      const next = new Set(previous);
      const show = next.has(entry.id);
      if (show) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      plot.current?.setSeries(index + 1, { show });
      return next;
    });
  };

  const readingAt = (idx: number): string => {
    const ts = xs[idx];
    if (ts === undefined) {
      return "";
    }
    const values = series
      .map((entry, index) => {
        const value = aligned[index + 1]?.[idx];
        return hidden.has(entry.id) || value === null || value === undefined
          ? null
          : `${entry.label} ${formatChartValue(value, unit)}`;
      })
      .filter((value) => value !== null);
    return `${formatClock(ts)}: ${values.length === 0 ? "no data" : values.join(", ")}`;
  };

  const moveTo = (idx: number | null) => {
    const u = plot.current;
    if (idx === null) {
      setCursorIdx(null);
      u?.setCursor({ left: -10, top: -10 });
      return;
    }
    const clamped = Math.max(0, Math.min(xs.length - 1, idx));
    setCursorIdx(clamped);
    const ts = xs[clamped];
    if (u !== null && ts !== undefined) {
      const left = u.valToPos(ts, "x");
      setCursorLeft(left);
      u.setCursor({ left, top: u.over.clientHeight / 2 });
    }
    const now = Date.now();
    if (now - lastAnnounce.current >= 500) {
      lastAnnounce.current = now;
      setAnnouncement(readingAt(clamped));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasData || xs.length === 0) {
      return;
    }
    const current = cursorIdx ?? xs.length - 1;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveTo(cursorIdx === null ? xs.length - 1 : current - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveTo(cursorIdx === null ? 0 : current + 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(xs.length - 1);
        break;
      case "Escape":
        if (cursorIdx !== null) {
          event.preventDefault();
          moveTo(null);
        }
        break;
      default:
        break;
    }
  };

  const tooltipTs = cursorIdx === null ? undefined : xs[cursorIdx];
  const tooltipLeft = (overlay?.plotLeft ?? 0) + cursorLeft;
  const flip = overlay !== null && cursorLeft > overlay.plotWidth / 2;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div
        ref={frameRef}
        role="img"
        aria-label={text}
        tabIndex={loading || !hasData ? undefined : 0}
        onKeyDown={onKeyDown}
        className="relative w-full min-w-0"
        style={{ height }}
      >
        {loading ? (
          <ChartFrame height={height}>
            <Skeleton className="absolute inset-x-3 top-8 bottom-8" />
          </ChartFrame>
        ) : !hasData ? (
          <ChartFrame height={height}>
            <span className="text-body-secondary absolute inset-0 flex items-center justify-center">
              {empty}
            </span>
          </ChartFrame>
        ) : (
          <>
            <div ref={plotRef} aria-hidden="true" className="absolute inset-0" />
            {overlay !== null && limitLine !== undefined && overlay.limitTop !== undefined && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: overlay.plotLeft,
                  width: overlay.plotWidth,
                  top: overlay.plotTop + overlay.limitTop,
                }}
              >
                <div className="border-warning border-t border-dashed" />
                <span className="text-meta text-warning-text absolute right-1 bottom-[2px] leading-none">
                  {limitLine.label}
                </span>
              </div>
            )}
            {overlay?.markers.map(({ marker, left }) => (
              <ChartMarkerView
                key={`${marker.kind}-${String(marker.ts)}`}
                marker={marker}
                left={overlay.plotLeft + left}
                top={overlay.plotTop}
                height={overlay.plotHeight}
              />
            ))}
            {tooltipTs !== undefined && overlay !== null && (
              <div
                aria-hidden="true"
                className="border-border-strong bg-surface-raised shadow-raised rounded-card text-12 pointer-events-none absolute z-[var(--z-popover)] flex min-w-[140px] flex-col gap-1 border px-2 py-[6px] whitespace-nowrap"
                style={{
                  top: overlay.plotTop + 4,
                  left: flip ? undefined : tooltipLeft + 12,
                  right: flip ? `calc(100% - ${String(tooltipLeft - 12)}px)` : undefined,
                }}
              >
                <span className="text-meta">{formatClock(tooltipTs)}</span>
                {series.map((entry, index) => {
                  const value = cursorIdx === null ? undefined : aligned[index + 1]?.[cursorIdx];
                  if (hidden.has(entry.id)) {
                    return null;
                  }
                  return (
                    <span key={entry.id} className="flex items-center gap-2">
                      <span className={cn("size-2 shrink-0", SWATCH[colors[index] ?? "accent"])} />
                      <span className="text-text-secondary">{entry.label}</span>
                      <span className="tabular ml-auto pl-3">
                        {value === null || value === undefined
                          ? "—"
                          : formatChartValue(value, unit)}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <p className="sr-only">{text}</p>
      {series.length > 1 && !loading && (
        <div role="group" aria-label={`${title} series`} className="flex flex-wrap gap-x-3 gap-y-1">
          {series.map((entry, index) => {
            const shown = !hidden.has(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={shown}
                onClick={() => {
                  toggle(entry, index);
                }}
                onPointerEnter={() => plot.current?.setSeries(index + 1, { focus: true })}
                onPointerLeave={() => plot.current?.setSeries(null, { focus: true })}
                className={cn(
                  "rounded-kbd text-12 text-text-secondary inline-flex min-h-6 items-center gap-2 px-1",
                  "is-hover:text-text transition-colors duration-[var(--dur-fast)]",
                  !shown && "line-through opacity-60",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0",
                    SWATCH[colors[index] ?? "accent"],
                    entry.dashed === true && "opacity-60",
                  )}
                />
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
      <LiveRegion message={announcement} />
    </div>
  );
}

/** Axis frame for the loading and empty states, so nothing shifts when data arrives. */
function ChartFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div aria-hidden="true" className="relative w-full" style={{ height }}>
      <span className="bg-border absolute top-2 bottom-5 left-[36px] w-px" />
      <span className="bg-border absolute right-2 bottom-5 left-[36px] h-px" />
      {children}
    </div>
  );
}

function ChartMarkerView({
  marker,
  left,
  top,
  height,
}: {
  marker: ChartMarker;
  left: number;
  top: number;
  height: number;
}) {
  const oom = marker.kind === "oom";
  return (
    <Tooltip content={marker.label}>
      <span
        data-chart-marker={marker.kind}
        className="absolute flex w-3 -translate-x-1/2 justify-center"
        style={{ left, top, height }}
      >
        {oom ? (
          <span className="bg-danger mt-0 size-2 rounded-full" />
        ) : (
          <>
            <span
              className={cn(
                "absolute top-0 size-[6px] [clip-path:polygon(0_0,100%_0,50%_100%)]",
                marker.kind === "restart" ? "bg-warning" : "bg-text-secondary",
              )}
            />
            <span
              className={cn(
                "h-full w-px",
                marker.kind === "restart" ? "bg-warning/60" : "bg-text-secondary/60",
              )}
            />
          </>
        )}
      </span>
    </Tooltip>
  );
}
