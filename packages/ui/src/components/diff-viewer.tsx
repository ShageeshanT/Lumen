"use client";

import { useId, useState } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { Badge } from "./badge";

export type DiffKind = "changed" | "added" | "removed";

export interface DiffItem {
  /** The setting: "Memory", "Start command", or a variable name. */
  field: string;
  before?: string;
  after?: string;
  kind: DiffKind;
  /** Sealed or secret values: never shown, only "value changed". */
  secret?: boolean;
  /** Variable names and commands read as identifiers. */
  mono?: boolean;
}

export interface DiffGroup {
  /** Usually the service name. */
  group: string;
  icon?: IconName;
  items: DiffItem[];
}

export interface DiffViewerProps {
  changes: DiffGroup[];
  mode?: "side-by-side" | "inline";
  /** Group headers become buttons that fold their rows. */
  collapsible?: boolean;
  /** Groups that start folded (by group name). */
  defaultCollapsed?: string[];
  className?: string;
}

/** "Memory, changed from 512 MB to 1 GB". */
export function describeChange(item: DiffItem): string {
  if (item.secret === true) {
    return `${item.field}, ${item.kind === "changed" ? "value changed" : item.kind}`;
  }
  switch (item.kind) {
    case "added":
      return `${item.field}, added: ${item.after ?? ""}`;
    case "removed":
      return `${item.field}, removed: ${item.before ?? ""}`;
    case "changed":
      return `${item.field}, changed from ${item.before ?? "nothing"} to ${item.after ?? "nothing"}`;
  }
}

function SecretValue() {
  return (
    <span className="text-body-secondary inline-flex items-center gap-1 italic">
      <Icon name="lock" size={14} />
      value changed
    </span>
  );
}

function Value({ value, tone, mono }: { value: string; tone: "removed" | "added"; mono: boolean }) {
  return (
    <span
      className={cn(
        "rounded-kbd px-1 py-[1px] [overflow-wrap:anywhere]",
        mono ? "text-13 font-mono" : "text-body",
        tone === "removed"
          ? "bg-danger-subtle text-danger-text"
          : "bg-success-subtle text-success-text",
      )}
    >
      {value}
    </span>
  );
}

function Empty() {
  return <span className="text-body-secondary">—</span>;
}

/**
 * Staged changes, reviewed before they deploy: old → new per setting, grouped
 * by service. Secret values never render; the row says "value changed".
 */
export function DiffViewer({
  changes,
  mode = "side-by-side",
  collapsible = false,
  defaultCollapsed = [],
  className,
}: DiffViewerProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(defaultCollapsed));
  const baseId = useId();
  const groups = changes.filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <div
        className={cn(
          "border-border rounded-card text-body-secondary flex min-h-[96px] items-center justify-center border border-dashed p-4",
          className,
        )}
      >
        Nothing to review
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {groups.map((group, groupIndex) => {
        const open = !collapsed.has(group.group);
        const bodyId = `${baseId}-${String(groupIndex)}`;
        const headingId = `${bodyId}-heading`;
        const heading = (
          <>
            {collapsible && (
              <Icon
                name={open ? "chevron-down" : "chevron-right"}
                size={14}
                className="text-text-secondary"
              />
            )}
            <Icon name={group.icon ?? "box"} size={16} className="text-text-secondary" />
            <span className="text-card-title truncate">{group.group}</span>
            <Badge size="sm" className="tabular ml-auto">
              {group.items.length === 1 ? "1 change" : `${String(group.items.length)} changes`}
            </Badge>
          </>
        );
        return (
          <section
            key={group.group}
            aria-labelledby={headingId}
            className="border-border bg-surface rounded-card min-w-0 border"
          >
            <h3 id={headingId} className="m-0">
              {collapsible ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? bodyId : undefined}
                  onClick={() => {
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (open) {
                        next.add(group.group);
                      } else {
                        next.delete(group.group);
                      }
                      return next;
                    });
                  }}
                  className="is-hover:bg-surface-hover flex h-[36px] w-full items-center gap-2 px-3 text-left"
                >
                  {heading}
                </button>
              ) : (
                <span className="flex h-[36px] items-center gap-2 px-3">{heading}</span>
              )}
            </h3>
            {open && (
              <table
                id={bodyId}
                aria-labelledby={headingId}
                className="border-border w-full table-fixed border-t"
              >
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Setting</th>
                    {mode === "side-by-side" ? (
                      <>
                        <th scope="col">Before</th>
                        <th scope="col">After</th>
                      </>
                    ) : (
                      <th scope="col">Change</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <DiffRow key={item.field} item={item} mode={mode} />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DiffRow({ item, mode }: { item: DiffItem; mode: "side-by-side" | "inline" }) {
  const secret = item.secret === true;
  const mono = item.mono === true;
  const field = (
    <th
      scope="row"
      className="text-13 font-regular w-[40%] px-3 py-[6px] text-left align-top font-mono [overflow-wrap:anywhere]"
    >
      {item.field}
      <span className="sr-only">, {item.kind}</span>
    </th>
  );

  if (mode === "inline") {
    return (
      <tr className="border-border border-t first:border-t-0">
        {field}
        <td className="px-3 py-[6px] align-top">
          <div className="flex flex-col gap-1">
            {secret ? (
              <span className="flex items-start gap-2">
                <span aria-hidden="true" className="text-text-secondary text-13 w-3 font-mono">
                  ~
                </span>
                <SecretValue />
              </span>
            ) : (
              <>
                {item.before !== undefined && item.kind !== "added" && (
                  <span className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="text-danger-text text-13 w-3 shrink-0 font-mono"
                    >
                      −
                    </span>
                    <span className="sr-only">Before: </span>
                    <Value value={item.before} tone="removed" mono={mono} />
                  </span>
                )}
                {item.after !== undefined && item.kind !== "removed" && (
                  <span className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="text-success-text text-13 w-3 shrink-0 font-mono"
                    >
                      +
                    </span>
                    <span className="sr-only">After: </span>
                    <Value value={item.after} tone="added" mono={mono} />
                  </span>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-border border-t first:border-t-0">
      {field}
      <td className="px-3 py-[6px] align-top">
        {secret ? (
          <span className="text-body-secondary">Sealed</span>
        ) : item.kind === "added" || item.before === undefined ? (
          <Empty />
        ) : (
          <Value value={item.before} tone="removed" mono={mono} />
        )}
      </td>
      <td className="relative py-[6px] pr-3 pl-6 align-top">
        <span aria-hidden="true" className="text-text-muted absolute top-[9px] left-1">
          <Icon name="arrow-right" size={14} />
        </span>
        {secret ? (
          <SecretValue />
        ) : item.kind === "removed" || item.after === undefined ? (
          <Empty />
        ) : (
          <Value value={item.after} tone="added" mono={mono} />
        )}
      </td>
    </tr>
  );
}
