"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { DatabaseIcon, type DatabaseEngine } from "../icons/database-icon";
import { FrameworkIcon, type Framework } from "../icons/framework-icon";
import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { formatRelativeTime } from "../lib/format";
import { useNow } from "../lib/use-now";
import { STATUS, type Status } from "../status/status";

import { Badge } from "./badge";
import { Input } from "./input";
import { Skeleton } from "./skeleton";
import { StatusTag } from "./status-tag";
import { Tooltip } from "./tooltip";
import { VolumeChip, type CanvasVolume } from "./volume-chip";

export type ServiceKind = "web" | "worker" | "cron" | "database";

export interface CanvasService {
  id: string;
  name: string;
  kind: ServiceKind;
  framework?: Framework;
  /** For kind "database": the engine mark in the header. */
  engine?: DatabaseEngine;
  status: Status;
  /** Host name without the scheme: "api.example.com". */
  publicUrl?: string;
  /** For kind "cron": replaces the URL row. "Every day at 3:00". */
  schedule?: string;
  lastDeploy?: { at: Date | number; commitMessage: string; commitSha: string };
  replicas?: number;
  server?: { name: string; region?: string };
  volume?: CanvasVolume;
}

export interface CanvasNodeProps {
  service: CanvasService;
  selected?: boolean;
  /** Part of a multi-selection: the accent frame without the glow. */
  multiSelected?: boolean;
  dragging?: boolean;
  serverOffline?: boolean;
  /** Start in rename mode (the canvas sets it after F2 or the context menu). */
  renaming?: boolean;
  onOpen?: () => void;
  onRename?: (name: string) => void;
  /** Right click, Shift+F10 or the context-menu key. The canvas opens its menu (Phase 05). */
  onContextMenu?: (event: MouseEvent | KeyboardEvent) => void;
  /** Reference time for "3 min ago"; defaults to now. */
  now?: Date | number;
  className?: string;
  /** Force a visual state for gallery screenshots: "hover". */
  "data-force"?: string;
}

function headerIcon(service: CanvasService) {
  if (service.kind === "database" && service.engine !== undefined) {
    return <DatabaseIcon engine={service.engine} size={20} />;
  }
  if (service.kind === "database") {
    return <Icon name="database" size={20} />;
  }
  if (service.kind === "cron") {
    return <Icon name="clock" size={20} />;
  }
  if (service.kind === "worker" && service.framework === undefined) {
    return <Icon name="cpu" size={20} />;
  }
  return <FrameworkIcon framework={service.framework ?? "unknown"} size={20} />;
}

/** The accessible name of a node: "api, Active, deployed 3 min ago". */
export function describeService(
  service: CanvasService,
  options: { serverOffline?: boolean; now?: Date | number } = {},
): string {
  const parts = [service.name, STATUS[service.status].label];
  parts.push(
    service.lastDeploy === undefined
      ? "not deployed yet"
      : `deployed ${formatRelativeTime(service.lastDeploy.at, options.now ?? Date.now())}`,
  );
  if (options.serverOffline === true && service.server !== undefined) {
    parts.push(`server ${service.server.name} offline`);
  }
  return parts.join(", ");
}

// Geist Mono advances 0.6 em. Name: 14 px + 0.02 em tracking; tag: 11 px + 0.08 em.
const NAME_CHAR = 14 * 0.62;
const TAG_CHAR = 11 * 0.68;
/** Header width left for name + tag: 260 − 28 padding − 20 mark − 8 gap. */
const HEADER_ROOM = 204;

/**
 * Whether the status tag fits in the header beside the whole name. When it
 * doesn't, the tag moves to the meta row so the name is never cut to a few
 * characters ("api-build…") and the status word stays visible. Mono type makes
 * the estimate exact enough to decide without measuring the DOM.
 */
export function headerHoldsStatus(name: string, status: Status, serverOffline = false): boolean {
  const room = HEADER_ROOM - (serverOffline ? 32 : 0);
  // Brackets (two glyphs), three 6 px gaps and the 6 px marker, then the word.
  const tag = 2 * TAG_CHAR + 18 + 6 + STATUS[status].label.length * TAG_CHAR;
  return name.length * NAME_CHAR + 8 + tag <= room;
}

/**
 * A service on the project canvas: 260 × 120, fixed. Header (kind or framework
 * mark, mono name, status tag), the public URL or what replaces it, the last
 * deploy, and replica and server chips. An attached volume hangs underneath.
 * Presentational: the canvas (Phase 05) owns selection, dragging and menus.
 */
export function CanvasNode({
  service,
  selected = false,
  multiSelected = false,
  dragging = false,
  serverOffline = false,
  renaming = false,
  onOpen,
  onRename,
  onContextMenu,
  now,
  className,
  "data-force": force,
}: CanvasNodeProps) {
  const [editing, setEditing] = useState(renaming);
  const [draft, setDraft] = useState(service.name);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reference = useNow(now);

  // A new `renaming` from outside wins over local editing state.
  const [renamingProp, setRenamingProp] = useState(renaming);
  if (renamingProp !== renaming) {
    setRenamingProp(renaming);
    setEditing(renaming);
  }

  const finishRename = (save: boolean) => {
    const name = draft.trim();
    if (save && name !== "" && name !== service.name) {
      onRename?.(name);
    } else {
      setDraft(service.name);
    }
    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "F2") {
      event.preventDefault();
      setDraft(service.name);
      setEditing(true);
    } else if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
      event.preventDefault();
      onContextMenu?.(event);
    }
  };

  const meta =
    service.lastDeploy === undefined
      ? "Not deployed yet"
      : `${formatRelativeTime(service.lastDeploy.at, reference)} · ${service.lastDeploy.commitMessage}`;

  const selectedAny = selected || multiSelected;
  const statusInHeader = headerHoldsStatus(service.name, service.status, serverOffline);

  return (
    <div
      role="group"
      aria-label={describeService(service, { serverOffline, now: reference })}
      data-canvas-node={service.id}
      data-status={service.status}
      data-selected={selectedAny ? "" : undefined}
      data-force={force}
      className={cn(
        "group/node hud hud-hover bg-surface rounded-card relative flex h-[120px] w-[260px] flex-col gap-[6px] border px-[14px] py-3",
        "border-border transition-[border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "is-hover:border-border-strong is-hover:[--hud-offset:3px]",
        selectedAny && "hud-accent border-accent is-hover:border-accent",
        selected && "shadow-[0_0_0_1px_var(--color-accent),var(--shadow-glow)]",
        multiSelected && !selected && "shadow-[0_0_0_1px_var(--color-accent)]",
        serverOffline && !selectedAny && "ring-warning ring-2",
        dragging && "shadow-raised opacity-90",
        className,
      )}
    >
      {selectedAny && (
        <span
          aria-hidden="true"
          className="bg-accent-subtle pointer-events-none absolute inset-0"
        />
      )}
      {/* The node itself is one button; the URL link and the offline marker sit above it. */}
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Open ${service.name}${selectedAny ? " (selected)" : ""}`}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => {
          if (onContextMenu !== undefined) {
            event.preventDefault();
            onContextMenu(event);
          }
        }}
        className="rounded-card absolute inset-0 cursor-pointer"
      />

      <div className="pointer-events-none relative flex h-5 min-w-0 items-center gap-2">
        <span className={cn("flex shrink-0", selectedAny ? "text-accent" : "text-text-secondary")}>
          {headerIcon(service)}
        </span>
        {editing ? (
          <Input
            size="sm"
            monospace
            aria-label={`Rename ${service.name}`}
            value={draft}
            // Rename mode is entered on purpose (F2 or the menu), so focus follows.
            autoFocus
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finishRename(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finishRename(false);
              }
            }}
            onBlur={() => {
              finishRename(true);
            }}
            className="pointer-events-auto relative min-w-0 flex-1"
          />
        ) : (
          <span className="text-card-title min-w-0 flex-1 truncate" title={service.name}>
            {service.name}
          </span>
        )}
        {serverOffline && service.server !== undefined && (
          <Tooltip content={`Server '${service.server.name}' is offline`}>
            <span
              role="img"
              tabIndex={0}
              aria-label={`Server '${service.server.name}' is offline`}
              className="text-warning pointer-events-auto relative -my-[2px] flex size-6 shrink-0 items-center justify-center"
            >
              <Icon name="triangle-alert" size={14} />
            </span>
          </Tooltip>
        )}
        {statusInHeader && <StatusTag status={service.status} size="sm" className="shrink-0" />}
      </div>

      <div className="text-12 text-text-secondary pointer-events-none relative flex h-[18px] min-w-0 items-center gap-[6px]">
        {service.kind === "cron" ? (
          <>
            <Icon name="calendar" size={12} className="shrink-0" />
            <span className="truncate">{service.schedule ?? "No schedule"}</span>
          </>
        ) : service.kind === "database" ? (
          <>
            <Icon name="lock" size={12} className="shrink-0" />
            <span className="truncate">Private only</span>
          </>
        ) : service.publicUrl === undefined ? (
          <>
            <Icon name="globe" size={12} className="shrink-0" />
            <span className="truncate">No public URL</span>
          </>
        ) : (
          <a
            href={`https://${service.publicUrl}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${service.publicUrl}`}
            className="hover:text-text pointer-events-auto flex min-h-6 min-w-0 items-center gap-[6px] font-mono"
          >
            <Icon name="globe" size={12} className="shrink-0" />
            <span className="truncate">{service.publicUrl}</span>
            <Icon
              name="external-link"
              size={12}
              className="shrink-0 opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover/node:opacity-100 group-data-[force~=hover]/node:opacity-100"
            />
          </a>
        )}
      </div>

      {/* When the header is tight the status shares the meta row: the commit
          message gives way (it has a tooltip), never the name or the status. */}
      <div className="pointer-events-none relative flex min-w-0 items-center gap-2">
        <p className="text-meta min-w-0 flex-1 truncate" title={meta}>
          {meta}
        </p>
        {!statusInHeader && <StatusTag status={service.status} size="sm" className="shrink-0" />}
      </div>

      <div className="pointer-events-none relative mt-auto flex min-w-0 items-center gap-[6px]">
        {service.replicas !== undefined && service.replicas > 1 && (
          <Badge variant="outline">×{service.replicas}</Badge>
        )}
        {service.server !== undefined && (
          <Badge variant="outline" icon="server" className="min-w-0 shrink overflow-hidden">
            <span className="truncate">{service.server.name}</span>
          </Badge>
        )}
      </div>

      {service.volume !== undefined && (
        <VolumeChip
          volume={service.volume}
          attached
          serverOffline={serverOffline}
          className="absolute top-[128px] left-[-1px]"
        />
      )}
    </div>
  );
}

/** The loading shape of a node: the same 260 × 120 box and rows, so nothing shifts when data lands. */
export function CanvasNodeSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-canvas-node-skeleton=""
      className={cn(
        "border-border bg-surface rounded-card flex h-[120px] w-[260px] flex-col gap-[6px] border px-[14px] py-3",
        className,
      )}
    >
      <div className="flex h-5 items-center gap-2">
        <Skeleton width={20} height={20} />
        <Skeleton width={96} height={12} />
        <span className="flex-1" />
        <Skeleton width={72} height={16} />
      </div>
      <div className="flex h-[18px] items-center">
        <Skeleton width={168} height={10} />
      </div>
      <div className="flex h-[18px] items-center">
        <Skeleton width={196} height={10} />
      </div>
      <div className="mt-auto flex gap-[6px]">
        <Skeleton width={32} height={20} />
        <Skeleton width={80} height={20} />
      </div>
    </div>
  );
}
