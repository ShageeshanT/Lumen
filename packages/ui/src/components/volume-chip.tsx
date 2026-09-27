import type { HTMLAttributes } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { formatBytes } from "../lib/format";
import { truncateMiddle } from "../lib/text";

export interface CanvasVolume {
  id: string;
  name: string;
  mountPath: string;
  usedBytes?: number;
  limitBytes?: number;
}

const UNIT_WORDS: Record<string, string> = {
  B: "bytes",
  KB: "kilobytes",
  MB: "megabytes",
  GB: "gigabytes",
  TB: "terabytes",
};

/** "1.2 / 5 GB", "512 MB / 5 GB", "1.2 GB" (no limit), or "" when nothing is known. */
export function formatVolumeUsage(usedBytes?: number, limitBytes?: number): string {
  if (usedBytes === undefined) {
    return limitBytes === undefined ? "" : formatBytes(limitBytes);
  }
  const used = formatBytes(usedBytes);
  if (limitBytes === undefined) {
    return used;
  }
  const limit = formatBytes(limitBytes);
  const [usedValue, usedUnit] = used.split(" ");
  const [, limitUnit] = limit.split(" ");
  return usedUnit === limitUnit ? `${usedValue ?? used} / ${limit}` : `${used} / ${limit}`;
}

/** Spoken usage: "1.2 of 5 gigabytes used". */
export function describeVolumeUsage(usedBytes?: number, limitBytes?: number): string {
  if (usedBytes === undefined) {
    return "";
  }
  const [usedValue = "", usedUnit = ""] = formatBytes(usedBytes).split(" ");
  if (limitBytes === undefined) {
    return `${usedValue} ${UNIT_WORDS[usedUnit] ?? usedUnit} used`;
  }
  const [limitValue = "", limitUnit = ""] = formatBytes(limitBytes).split(" ");
  const used =
    usedUnit === limitUnit ? usedValue : `${usedValue} ${UNIT_WORDS[usedUnit] ?? usedUnit}`;
  return `${used} of ${limitValue} ${UNIT_WORDS[limitUnit] ?? limitUnit} used`;
}

/** Usage tone: accent, then warning above 80 %, danger above 95 %. */
export function volumeUsageTone(usedBytes?: number, limitBytes?: number) {
  if (usedBytes === undefined || limitBytes === undefined || limitBytes <= 0) {
    return undefined;
  }
  const ratio = usedBytes / limitBytes;
  return {
    ratio: Math.min(1, ratio),
    tone: ratio > 0.95 ? "danger" : ratio > 0.8 ? "warning" : "accent",
  } as const;
}

const BAR: Record<"accent" | "warning" | "danger", string> = {
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
};

export interface VolumeChipProps extends Omit<
  HTMLAttributes<HTMLButtonElement>,
  "children" | "onClick"
> {
  volume: CanvasVolume;
  /** Attached under a service node (stem, mount path) or standalone on the canvas (name). */
  attached?: boolean;
  onOpen?: () => void;
  selected?: boolean;
  /** Inherits the node's offline ring. */
  serverOffline?: boolean;
  "data-force"?: string;
}

/**
 * A volume: a dashed card (storage, not compute) with the mount path, usage
 * and a 40 px meter. Attached volumes hang 8 px under their service on a stem.
 */
export function VolumeChip({
  volume,
  attached = true,
  onOpen,
  selected = false,
  serverOffline = false,
  className,
  ...rest
}: VolumeChipProps) {
  const usage = formatVolumeUsage(volume.usedBytes, volume.limitBytes);
  const spoken = describeVolumeUsage(volume.usedBytes, volume.limitBytes);
  const tone = volumeUsageTone(volume.usedBytes, volume.limitBytes);
  const label = `Volume ${volume.name} at ${volume.mountPath}${spoken === "" ? "" : `, ${spoken}`}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected ? true : undefined}
      onClick={onOpen}
      data-volume={volume.id}
      data-usage={tone?.tone}
      className={cn(
        "bg-surface text-text-secondary rounded-card relative flex h-[36px] w-[260px] items-center gap-2 border border-dashed px-3 text-left",
        "border-border-strong transition-[background-color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "is-hover:bg-surface-hover is-hover:text-text",
        selected && "border-accent bg-accent-subtle border-solid",
        serverOffline && "ring-warning ring-2",
        className,
      )}
      {...rest}
    >
      {attached && (
        <span
          aria-hidden="true"
          data-volume-stem=""
          className="bg-border-strong absolute -top-[9px] left-[21px] h-2 w-[2px]"
        />
      )}
      <Icon name="hard-drive" size={16} className="shrink-0" />
      <span
        className={cn("text-12 min-w-0 flex-1 truncate font-mono", !attached && "text-text")}
        title={attached ? volume.mountPath : volume.name}
      >
        {attached ? truncateMiddle(volume.mountPath, 10, 9) : volume.name}
      </span>
      {usage !== "" && <span className="text-meta shrink-0">{usage}</span>}
      {tone !== undefined && (
        <span aria-hidden="true" className="bg-border h-[3px] w-[40px] shrink-0">
          <span
            className={cn("block h-full", BAR[tone.tone])}
            style={{ width: `${String(Math.round(tone.ratio * 100))}%` }}
          />
        </span>
      )}
    </button>
  );
}
