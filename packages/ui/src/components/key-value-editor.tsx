"use client";

import { useId, useRef, useState, type ClipboardEvent } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { Button } from "./button";
import { controlClasses, controlFrameClasses } from "./control-styles";
import { SecretField } from "./secret-field";
import { Tooltip } from "./tooltip";

export interface KeyValueRow {
  key: string;
  value: string;
  sealed?: boolean;
}

export interface KeyValueEditorProps {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  maxRows?: number;
  disabled?: boolean;
  /** Accessible name for the whole editor. */
  label: string;
  className?: string;
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses KEY=VALUE lines (comments and blanks skipped, quotes stripped). */
export function parseEnvLines(text: string): KeyValueRow[] {
  const rows: KeyValueRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const body = line.startsWith("export ") ? line.slice(7) : line;
    const eq = body.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    rows.push({ key, value });
  }
  return rows;
}

/** The problem with a key, or undefined when it is fine. */
export function keyProblem(key: string, index: number, rows: KeyValueRow[]): string | undefined {
  if (key === "") {
    return undefined;
  }
  if (!KEY_PATTERN.test(key)) {
    return /^[0-9]/.test(key)
      ? "Names can't start with a number"
      : "Use letters, numbers and underscores only";
  }
  if (rows.some((row, other) => other !== index && row.key === key)) {
    return "Already used";
  }
  return undefined;
}

/**
 * Rows of name and value. Pasting a .env block into a name field fills rows;
 * Enter in the last value adds a row; Backspace in an empty last row removes
 * it. Duplicate and malformed names are flagged inline.
 */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "NAME",
  valuePlaceholder = "value",
  addLabel = "Add variable",
  maxRows = 200,
  disabled = false,
  label,
  className,
}: KeyValueEditorProps) {
  const id = useId();
  const [announcement, setAnnouncement] = useState("");
  const keyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const shown = rows.length === 0 ? [{ key: "", value: "" }] : rows;

  const update = (index: number, patch: Partial<KeyValueRow>) => {
    onChange(shown.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const add = () => {
    if (shown.length >= maxRows) {
      return;
    }
    onChange([...shown, { key: "", value: "" }]);
    setAnnouncement(`Row ${String(shown.length + 1)} added`);
    requestAnimationFrame(() => {
      keyRefs.current[shown.length]?.focus();
    });
  };

  const remove = (index: number) => {
    const next = shown.filter((_, i) => i !== index);
    onChange(next);
    setAnnouncement(`Row ${String(index + 1)} removed`);
    requestAnimationFrame(() => {
      keyRefs.current[Math.max(0, index - 1)]?.focus();
    });
  };

  const onPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes("=") || !/\n|^[A-Za-z_].*=/.test(text)) {
      return;
    }
    const parsed = parseEnvLines(text);
    if (parsed.length === 0) {
      return;
    }
    event.preventDefault();
    const before = shown.slice(0, index).filter((row) => row.key !== "" || row.value !== "");
    const after = shown.slice(index + 1);
    onChange([...before, ...parsed, ...after].slice(0, maxRows));
    setAnnouncement(`${String(parsed.length)} variables pasted`);
  };

  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-2", className)}>
      <div aria-hidden="true" className="text-eyebrow grid grid-cols-[2fr_3fr_32px] gap-2 px-[2px]">
        <span>Name</span>
        <span>Value</span>
        <span />
      </div>
      {shown.map((row, index) => {
        const problem = keyProblem(row.key, index, shown);
        const errorId = `${id}-${String(index)}-error`;
        const isLast = index === shown.length - 1;
        return (
          <div key={index} className="flex flex-col gap-1">
            <div className="grid grid-cols-[2fr_3fr_32px] items-center gap-2">
              <div className={controlFrameClasses}>
                <input
                  ref={(el) => {
                    keyRefs.current[index] = el;
                  }}
                  value={row.key}
                  disabled={disabled}
                  placeholder={keyPlaceholder}
                  aria-label={`Name, row ${String(index + 1)}`}
                  aria-invalid={problem !== undefined || undefined}
                  aria-describedby={problem === undefined ? undefined : errorId}
                  spellCheck={false}
                  autoCapitalize="characters"
                  onPaste={(event) => {
                    onPaste(index, event);
                  }}
                  onChange={(event) => {
                    update(index, { key: event.target.value });
                  }}
                  className={controlClasses({
                    monospace: true,
                    invalid: problem !== undefined,
                    className: "text-13",
                  })}
                />
              </div>
              {row.sealed === true ? (
                <SecretField value="" label={row.key || "value"} sealed />
              ) : (
                <div className={controlFrameClasses}>
                  <input
                    value={row.value}
                    disabled={disabled}
                    placeholder={valuePlaceholder}
                    aria-label={`Value, row ${String(index + 1)}`}
                    spellCheck={false}
                    onChange={(event) => {
                      update(index, { value: event.target.value });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && isLast) {
                        event.preventDefault();
                        add();
                      }
                      if (
                        event.key === "Backspace" &&
                        isLast &&
                        shown.length > 1 &&
                        row.key === "" &&
                        row.value === ""
                      ) {
                        event.preventDefault();
                        remove(index);
                      }
                    }}
                    className={controlClasses({ monospace: true, className: "text-13" })}
                  />
                </div>
              )}
              <Tooltip content={`Remove row ${String(index + 1)}`}>
                <button
                  type="button"
                  disabled={disabled || (shown.length === 1 && row.key === "" && row.value === "")}
                  aria-label={`Remove row ${String(index + 1)}`}
                  onClick={() => {
                    remove(index);
                  }}
                  className="text-text-secondary is-hover:text-danger-text is-hover:bg-surface-hover rounded-control inline-flex size-8 items-center justify-center disabled:opacity-30"
                >
                  <Icon name="x" size={14} />
                </button>
              </Tooltip>
            </div>
            {problem !== undefined && (
              <p id={errorId} className="text-danger-text text-13 flex items-center gap-[6px]">
                <Icon name="circle-alert" size={14} />
                {problem}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          leadingIcon="plus"
          onClick={add}
          disabled={disabled || shown.length >= maxRows}
        >
          {addLabel}
        </Button>
        <span className="text-meta">Paste a .env block into a name to fill rows</span>
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
