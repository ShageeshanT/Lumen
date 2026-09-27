import { getSmoothStepPath, Position } from "@xyflow/react";

import { cn } from "../lib/cn";

export interface CanvasPoint {
  x: number;
  y: number;
}

export type CanvasSide = "left" | "right" | "top" | "bottom";

const POSITION: Record<CanvasSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export interface CanvasEdgeProps {
  /** Source handle point (the referencing service). */
  from: CanvasPoint;
  /** Target handle point (the referenced service). */
  to: CanvasPoint;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  /** Variable names that create the reference: DATABASE_URL, REDIS_URL. */
  variables?: readonly string[];
  selected?: boolean;
  /** Forced hover for screenshots; real hover works through CSS. */
  hovered?: boolean;
  /** Another node is selected and this edge is not part of it. */
  dimmed?: boolean;
  /** Moving data along the edge (Signal edge flow). Stops under reduced motion. */
  flow?: boolean;
  /** Vertical offset at the target so several edges into one node fan in (12 px each). */
  targetOffset?: number;
  className?: string;
}

/** "DATABASE_URL", "DATABASE_URL, REDIS_URL", "DATABASE_URL, REDIS_URL +2". */
export function edgeLabel(variables: readonly string[]): string {
  if (variables.length === 0) {
    return "";
  }
  const shown = variables.slice(0, 2).join(", ");
  return variables.length > 2 ? `${shown} +${String(variables.length - 2)}` : shown;
}

/** Arrowhead: a 6 px triangle whose tip touches the target point. */
function arrowPath(to: CanvasPoint, side: CanvasSide): string {
  const { x, y } = to;
  switch (side) {
    case "left":
      return `M${String(x)} ${String(y)} L${String(x - 6)} ${String(y - 3.5)} L${String(x - 6)} ${String(y + 3.5)} Z`;
    case "right":
      return `M${String(x)} ${String(y)} L${String(x + 6)} ${String(y - 3.5)} L${String(x + 6)} ${String(y + 3.5)} Z`;
    case "top":
      return `M${String(x)} ${String(y)} L${String(x - 3.5)} ${String(y - 6)} L${String(x + 3.5)} ${String(y - 6)} Z`;
    case "bottom":
      return `M${String(x)} ${String(y)} L${String(x - 3.5)} ${String(y + 6)} L${String(x + 3.5)} ${String(y + 6)} Z`;
  }
}

/** Geist Mono advances 0.6 em per character; labels are 11 px. */
const CHAR_WIDTH = 6.6;

/**
 * A reference between two services, drawn as SVG (place it inside an <svg>;
 * the React Flow edge type does). A 1.5 px dashed smooth-step path with 12 px
 * corners and a 6 px arrowhead; data dashes flow along it. Hover or selection
 * turns it solid accent and shows the variable names at the midpoint. Dimmed
 * edges drop to 40 %. Decorative: the Variables tab lists the same references
 * for assistive technology, so the whole edge is aria-hidden.
 */
export function CanvasEdge({
  from,
  to,
  fromSide = "right",
  toSide = "left",
  variables = [],
  selected = false,
  hovered = false,
  dimmed = false,
  flow = true,
  targetOffset = 0,
  className,
}: CanvasEdgeProps) {
  const target = { x: to.x, y: to.y + targetOffset };
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: POSITION[fromSide],
    targetX: target.x - (toSide === "left" ? 6 : toSide === "right" ? -6 : 0),
    targetY: target.y - (toSide === "top" ? 6 : toSide === "bottom" ? -6 : 0),
    targetPosition: POSITION[toSide],
    borderRadius: 12,
  });
  const label = edgeLabel(variables);
  const active = selected || hovered;
  const labelWidth = label.length * CHAR_WIDTH + 12;

  return (
    <g
      aria-hidden="true"
      data-canvas-edge=""
      data-active={active ? "" : undefined}
      className={cn(
        "group/edge transition-opacity duration-[var(--dur-fast)]",
        dimmed && !active && "opacity-40",
        className,
      )}
    >
      {/* Wide invisible stroke: the hover target. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} pointerEvents="stroke" />
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        strokeDasharray={active ? undefined : "4 4"}
        className={cn(
          "transition-[stroke] duration-[var(--dur-fast)]",
          active
            ? "stroke-accent"
            : "stroke-text-muted group-hover/edge:stroke-accent group-hover/edge:[stroke-dasharray:none]",
        )}
      />
      {flow && !dimmed && <path d={path} fill="none" className="edge-flow" />}
      <path
        d={arrowPath(target, toSide)}
        className={cn(
          "transition-[fill] duration-[var(--dur-fast)]",
          active ? "fill-accent" : "fill-text-muted group-hover/edge:fill-accent",
        )}
      />
      {label !== "" && (
        <g
          transform={`translate(${String(labelX)} ${String(labelY)})`}
          className={cn(
            "transition-opacity duration-[var(--dur-fast)]",
            active ? "opacity-100" : "opacity-0 group-hover/edge:opacity-100",
          )}
        >
          <rect
            x={-labelWidth / 2}
            y={-10}
            width={labelWidth}
            height={20}
            rx={2}
            className="fill-bg-canvas stroke-accent"
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-text text-11 font-mono"
            data-edge-label=""
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
