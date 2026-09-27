"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../lib/cn";

import { IconButton } from "./icon-button";
import { Input } from "./input";

export type CanvasGroupColor = "neutral" | "accent" | "info" | "success" | "warning" | "danger";

export interface CanvasGroupData {
  id: string;
  label: string;
  color?: CanvasGroupColor;
}

const FILL: Record<CanvasGroupColor, { rest: string; drop: string; marker: string }> = {
  neutral: { rest: "bg-surface/40", drop: "bg-surface/80", marker: "bg-text-secondary" },
  accent: { rest: "bg-accent/[0.04]", drop: "bg-accent/[0.08]", marker: "bg-accent" },
  info: { rest: "bg-info/[0.04]", drop: "bg-info/[0.08]", marker: "bg-info" },
  success: { rest: "bg-success/[0.04]", drop: "bg-success/[0.08]", marker: "bg-success" },
  warning: { rest: "bg-warning/[0.04]", drop: "bg-warning/[0.08]", marker: "bg-warning" },
  danger: { rest: "bg-danger/[0.04]", drop: "bg-danger/[0.08]", marker: "bg-danger" },
};

export interface CanvasGroupProps {
  group: CanvasGroupData;
  /** How many services sit inside; 0 shows "Drag services here". */
  serviceCount: number;
  /** Size of the region in px (the canvas computes it from the members plus 24 px padding). */
  width: number;
  height: number;
  selected?: boolean;
  /** A service is being dragged over the group. */
  dropTarget?: boolean;
  renaming?: boolean;
  onSelect?: () => void;
  onRename?: (label: string) => void;
  /** Delete on the label removes the group; the services stay (the canvas offers undo). */
  onRemove?: () => void;
  /** The "more" button: rename, color, remove (the menu itself is the canvas's, Phase 05). */
  onMenu?: () => void;
  /** Nodes rendered inside the region (gallery only; React Flow positions them itself). */
  children?: ReactNode;
  className?: string;
  "data-force"?: string;
}

/**
 * A labelled region on the canvas. Dashed frame, a faint tint of its color,
 * and a label tab on the top edge: square color marker, mono caps name,
 * member count, and a "more" button that shows on hover (always on touch).
 */
export function CanvasGroup({
  group,
  serviceCount,
  width,
  height,
  selected = false,
  dropTarget = false,
  renaming = false,
  onSelect,
  onRename,
  onRemove,
  onMenu,
  children,
  className,
  "data-force": force,
}: CanvasGroupProps) {
  const color = group.color ?? "neutral";
  const [editing, setEditing] = useState(renaming);
  const [draft, setDraft] = useState(group.label);
  const labelRef = useRef<HTMLButtonElement>(null);

  // A new `renaming` from outside wins over local editing state.
  const [renamingProp, setRenamingProp] = useState(renaming);
  if (renamingProp !== renaming) {
    setRenamingProp(renaming);
    setEditing(renaming);
  }

  const finish = (save: boolean) => {
    const label = draft.trim();
    if (save && label !== "" && label !== group.label) {
      onRename?.(label);
    } else {
      setDraft(group.label);
    }
    setEditing(false);
    requestAnimationFrame(() => labelRef.current?.focus());
  };

  const onLabelKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "F2") {
      event.preventDefault();
      setDraft(group.label);
      setEditing(true);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove?.();
    }
  };

  const count = `${String(serviceCount)} ${serviceCount === 1 ? "service" : "services"}`;

  return (
    <div
      role="group"
      aria-label={`${group.label}, ${count}`}
      data-canvas-group={group.id}
      data-color={color}
      data-force={force}
      className={cn(
        "group/cgroup rounded-card relative border border-dashed",
        "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        selected ? "border-border-strong border-solid" : "border-border-strong/60",
        dropTarget ? FILL[color].drop : FILL[color].rest,
        className,
      )}
      style={{ width, height }}
    >
      <div className="bg-bg-canvas border-border absolute -top-[14px] left-4 flex h-[28px] items-center border pr-[2px]">
        {editing ? (
          <Input
            size="sm"
            aria-label={`Rename group ${group.label}`}
            value={draft}
            // Rename mode is entered on purpose (F2 or the menu), so focus follows.
            autoFocus
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finish(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finish(false);
              }
            }}
            onBlur={() => {
              finish(true);
            }}
            className="w-[180px]"
          />
        ) : (
          <button
            ref={labelRef}
            type="button"
            onClick={onSelect}
            onKeyDown={onLabelKeyDown}
            onDoubleClick={() => {
              setDraft(group.label);
              setEditing(true);
            }}
            aria-label={`${group.label} group, ${count}`}
            className="text-label text-text flex h-[26px] items-center gap-2 pr-1 pl-2"
          >
            <span aria-hidden="true" className={cn("size-2 shrink-0", FILL[color].marker)} />
            <span className="max-w-[200px] truncate">{group.label}</span>
            <span className="text-text-secondary tabular" aria-hidden="true">
              · {String(serviceCount).padStart(2, "0")}
            </span>
          </button>
        )}
        {!editing && onMenu !== undefined && (
          <IconButton
            icon="ellipsis"
            label={`${group.label} group options`}
            size="sm"
            onClick={onMenu}
            className={cn(
              "size-[26px] opacity-0 group-focus-within/cgroup:opacity-100 group-hover/cgroup:opacity-100 [@media(hover:none)]:opacity-100",
              force?.includes("hover") === true && "opacity-100",
            )}
          />
        )}
      </div>
      {serviceCount === 0 && children === undefined && (
        <div className="text-body-secondary flex h-full items-center justify-center">
          Drag services here
        </div>
      )}
      {children}
    </div>
  );
}
