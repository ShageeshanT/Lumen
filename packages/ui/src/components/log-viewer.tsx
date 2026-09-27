"use client";

import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { ansiColorClass, parseAnsi, stripAnsi, type AnsiSegment } from "./ansi";
import { Button } from "./button";
import { copyText } from "./copy-field";
import { IconButton } from "./icon-button";
import { Skeleton } from "./skeleton";

export type LogLevel = "error" | "warn" | "info" | "debug";
export type LogSource = "stdout" | "stderr" | "build" | "http";

export interface LogLine {
  id: string;
  /** Epoch milliseconds, an ISO string or a Date. */
  ts: number | string | Date;
  /** Raw text; may contain ANSI escape sequences. */
  text: string;
  level?: LogLevel;
  /** Structured payload. When absent, a line whose text is a JSON object is detected. */
  json?: unknown;
  source?: LogSource;
}

export interface LogViewerProps {
  lines: readonly LogLine[];
  /** New lines are still arriving (a running deployment). Changes "Jump to end" into "Jump to live". */
  live?: boolean;
  /** Controlled follow mode. Omit to let the viewer manage it (on by default). */
  followOutput?: boolean;
  /** Uncontrolled starting value of follow mode (default true). */
  defaultFollowOutput?: boolean;
  onFollowOutputChange?: (following: boolean) => void;
  onJumpToLive?: () => void;
  /** Search term: matches are highlighted and counted. */
  highlight?: string;
  showTimestamps?: boolean;
  wrap?: boolean;
  dense?: boolean;
  /** Defaults to copying the line's plain text. */
  onLineClick?: (line: LogLine) => void;
  emptyMessage?: string;
  emptyDescription?: string;
  loading?: boolean;
  /** Shows the offline banner: "Server offline — showing logs up to 14:02". */
  offline?: { lastLineAt: Date | number };
  /** Fixed height in px. Use `fill` to take the parent's height instead. */
  height?: number;
  fill?: boolean;
  /** IANA zone for timestamps; the viewer's local zone when omitted. */
  timeZone?: string;
  /** Accessible name of the list. */
  label?: string;
  /** Index of the first line that arrived after the reader paused (the accent boundary). */
  newSinceIndex?: number;
  /** JSON line ids that start expanded. */
  defaultExpanded?: readonly string[];
  /** ⌘F / Ctrl+F inside the list. Phase 08 focuses the filter bar with it. */
  onFindShortcut?: () => void;
  className?: string;
}

const LEVEL_TAG: Record<LogLevel, { tag: string; name: string; text: string; line: string }> = {
  error: { tag: "ERR", name: "error", text: "text-danger-text", line: "text-danger-text" },
  warn: { tag: "WRN", name: "warning", text: "text-warning-text", line: "text-warning-text" },
  info: { tag: "INF", name: "info", text: "text-text-secondary", line: "text-text" },
  debug: { tag: "DBG", name: "debug", text: "text-text-secondary", line: "text-text-secondary" },
};

const COPIED_MS = 1500;
const ANNOUNCE_EVERY_MS = 1000;

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();

/** "14:02:07.093" in the given zone (or the local one). */
export function formatLogTime(ts: LogLine["ts"], timeZone?: string): string {
  const key = timeZone ?? "";
  let formatter = formatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hourCycle: "h23",
      ...(timeZone === undefined ? {} : { timeZone }),
    });
    formatters.set(key, formatter);
  }
  const date = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(date.getTime()) ? "--:--:--.---" : formatter.format(date);
}

const plainCache = new WeakMap<LogLine, string>();
const segmentCache = new WeakMap<LogLine, AnsiSegment[]>();
const jsonCache = new WeakMap<LogLine, { value: unknown } | null>();

/** The line without escape codes: what is copied and searched. */
export function plainText(line: LogLine): string {
  let text = plainCache.get(line);
  if (text === undefined) {
    text = stripAnsi(line.text);
    plainCache.set(line, text);
  }
  return text;
}

function segmentsOf(line: LogLine): AnsiSegment[] {
  let segments = segmentCache.get(line);
  if (segments === undefined) {
    segments = parseAnsi(line.text);
    segmentCache.set(line, segments);
  }
  return segments;
}

/** The structured payload of a line, or null when it is not a JSON object. */
export function jsonOf(line: LogLine): { value: unknown } | null {
  if (line.json !== undefined) {
    return { value: line.json };
  }
  let cached = jsonCache.get(line);
  if (cached === undefined) {
    cached = null;
    const text = plainText(line).trim();
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const value: unknown = JSON.parse(text);
        if (value !== null && typeof value === "object") {
          cached = { value };
        }
      } catch {
        cached = null;
      }
    }
    jsonCache.set(line, cached);
  }
  return cached;
}

/** Splits text around case-insensitive matches of `term`. */
export function splitMatches(text: string, term: string): { text: string; match: boolean }[] {
  if (term === "") {
    return [{ text, match: false }];
  }
  const parts: { text: string; match: boolean }[] = [];
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) {
      parts.push({ text: text.slice(from, at), match: false });
    }
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) {
    parts.push({ text: text.slice(from), match: false });
  }
  return parts;
}

/** Counts occurrences of `term` in every line; returns the matching line indexes too. */
export function findMatches(
  lines: readonly LogLine[],
  term: string,
): { count: number; lineIndexes: number[] } {
  if (term === "") {
    return { count: 0, lineIndexes: [] };
  }
  const needle = term.toLowerCase();
  let count = 0;
  const lineIndexes: number[] = [];
  lines.forEach((line, index) => {
    const haystack = plainText(line).toLowerCase();
    let at = haystack.indexOf(needle);
    if (at === -1) {
      return;
    }
    lineIndexes.push(index);
    while (at !== -1) {
      count += 1;
      at = haystack.indexOf(needle, at + needle.length);
    }
  });
  return { count, lineIndexes };
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function Segments({ line, term }: { line: LogLine; term: string }) {
  const segments = segmentsOf(line);
  return (
    <>
      {segments.map((segment, index) => {
        const className = cn(
          segment.color !== undefined && ansiColorClass[segment.color],
          segment.bold === true && "font-semibold",
          segment.dim === true && "text-text-secondary",
          segment.italic === true && "italic",
          segment.underline === true && "underline",
        );
        const content =
          term === ""
            ? segment.text
            : splitMatches(segment.text, term).map((part, partIndex) =>
                part.match ? (
                  <mark key={partIndex} className="bg-warning/30 rounded-kbd text-text">
                    {part.text}
                  </mark>
                ) : (
                  <Fragment key={partIndex}>{part.text}</Fragment>
                ),
              );
        return className === "" ? (
          <Fragment key={index}>{content}</Fragment>
        ) : (
          <span key={index} className={className}>
            {content}
          </span>
        );
      })}
    </>
  );
}

function JsonValue({ value }: { value: unknown }): ReactNode {
  if (value === null || typeof value !== "object") {
    return (
      <span className="text-text">{value === undefined ? "undefined" : JSON.stringify(value)}</span>
    );
  }
  return <JsonTree value={value} />;
}

function JsonTree({ value }: { value: object }) {
  const entries: (readonly [string, unknown])[] = Array.isArray(value)
    ? value.map((item: unknown, index) => [String(index), item] as const)
    : Object.entries(value);
  return (
    <ul className="flex flex-col">
      {entries.map(([key, item]) => {
        const nested = item !== null && typeof item === "object";
        return (
          <li key={key} className={cn(nested ? "flex flex-col" : "flex gap-2")}>
            <span className="text-accent-text">{key}:</span>
            {nested ? (
              <div className="pl-4">
                <JsonTree value={item} />
              </div>
            ) : (
              <JsonValue value={item} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface RowProps {
  line: LogLine;
  index: number;
  start: number;
  height: number | undefined;
  showTimestamps: boolean;
  showLevels: boolean;
  timeZone: string | undefined;
  wrap: boolean;
  term: string;
  expanded: boolean;
  active: boolean;
  currentMatch: boolean;
  boundary: boolean;
  idPrefix: string;
  measure: ((element: Element | null) => void) | undefined;
  onClick: (index: number) => void;
  onToggle: (id: string) => void;
}

const LogRow = memo(function LogRow({
  line,
  index,
  start,
  height,
  showTimestamps,
  showLevels,
  timeZone,
  wrap,
  term,
  expanded,
  active,
  currentMatch,
  boundary,
  idPrefix,
  measure,
  onClick,
  onToggle,
}: RowProps) {
  const level = line.level === undefined ? undefined : LEVEL_TAG[line.level];
  const json = jsonOf(line);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    // Keyboard users reach every line through the list's roving focus (arrows,
    // Enter, ⌘C); the click handler is the pointer shortcut for copy.
    <div
      ref={measure}
      role="listitem"
      id={`${idPrefix}-${String(index)}`}
      data-index={index}
      data-line-index={index}
      data-level={line.level}
      data-source={line.source}
      tabIndex={-1}
      onClick={() => {
        onClick(index);
      }}
      className={cn(
        "absolute top-0 left-0 flex min-w-full flex-col pr-4 pl-3",
        wrap ? "w-full" : "w-max",
        "is-hover:bg-surface-hover cursor-default focus-visible:outline-offset-[-2px]",
        active && "bg-surface-hover",
        currentMatch && "bg-warning-subtle",
      )}
      style={{ transform: `translateY(${String(start)}px)`, height }}
    >
      {boundary && (
        <span
          aria-hidden="true"
          data-log-boundary=""
          className="bg-accent absolute top-0 right-0 left-0 h-px"
        />
      )}
      {line.source === "stderr" && (
        <span aria-hidden="true" className="bg-danger/60 absolute top-0 bottom-0 left-0 w-[2px]" />
      )}
      <div className="flex gap-3">
        {showTimestamps && (
          <span className="text-text-secondary tabular w-[88px] shrink-0 select-none">
            {formatLogTime(line.ts, timeZone)}
          </span>
        )}
        {showLevels && (
          <span
            className={cn(
              "w-[40px] shrink-0 font-medium tracking-[var(--tracking-caps)] select-none",
              level?.text,
            )}
          >
            {level?.tag}
            {level !== undefined && <span className="sr-only"> ({level.name})</span>}
          </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1",
            wrap ? "break-words whitespace-pre-wrap" : "whitespace-pre",
            level?.line ?? "text-text",
          )}
        >
          {json !== null && (
            <span
              aria-hidden="true"
              data-json-toggle=""
              onClick={(event) => {
                event.stopPropagation();
                onToggle(line.id);
              }}
              className="text-text-secondary hover:text-text mr-1 inline-flex translate-y-[2px] cursor-pointer"
            >
              <Icon
                name="chevron-right"
                size={14}
                className={cn(
                  "transition-transform duration-[var(--dur-fast)]",
                  expanded && "rotate-90",
                )}
              />
            </span>
          )}
          <Segments line={line} term={term} />
          {json !== null && (
            <span className="sr-only">
              {expanded ? ", JSON expanded" : ", JSON, press Enter to expand"}
            </span>
          )}
        </span>
      </div>
      {json !== null && expanded && (
        // Stops the row's copy-on-click inside the tree; it has no action of its own.
        <div
          className={cn("flex flex-col gap-2 py-2", showTimestamps && "pl-[100px]")}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <div className={cn(showLevels && "pl-[52px]")}>
            <JsonValue value={json.value} />
          </div>
          <div className={cn(showLevels && "pl-[52px]")}>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={copied ? "check" : "copy"}
              onClick={() => {
                void copyText(JSON.stringify(json.value, null, 2)).then((ok) => {
                  setCopied(ok);
                });
              }}
            >
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── The viewer ──────────────────────────────────────────────────────────────

/**
 * A virtualized log panel fed with an array of lines. It follows new output
 * until the reader scrolls up, then pauses and offers "Jump to live"; a thin
 * accent line marks where new lines begin. ANSI colors map to token colors,
 * JSON lines expand into a tree, search terms are highlighted and counted.
 *
 * Keyboard: the list is one tab stop. Arrow keys move between lines, Enter
 * expands JSON, ⌘/Ctrl+C copies the focused line, End jumps to live, Home goes
 * to the first line, Space pauses or resumes, ⌘/Ctrl+F calls `onFindShortcut`.
 */
export function LogViewer({
  lines,
  live = false,
  followOutput,
  defaultFollowOutput = true,
  onFollowOutputChange,
  onJumpToLive,
  highlight = "",
  showTimestamps = true,
  wrap = false,
  dense = false,
  onLineClick,
  emptyMessage = "No logs yet",
  emptyDescription = "Your app hasn't printed anything since this deploy started.",
  loading = false,
  offline,
  height = 360,
  fill = false,
  timeZone,
  label = "Logs",
  newSinceIndex,
  defaultExpanded,
  onFindShortcut,
  className,
}: LogViewerProps) {
  const idPrefix = useId().replaceAll(":", "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = dense ? 18 : 20;

  const [internalFollowing, setInternalFollowing] = useState(defaultFollowOutput);
  const following = followOutput ?? internalFollowing;
  const [pausedAt, setPausedAt] = useState<number | undefined>(undefined);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(defaultExpanded ?? []),
  );
  const [active, setActive] = useState<number | undefined>(undefined);
  const [matchCursor, setMatchCursor] = useState(0);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const setFollowing = useCallback(
    (next: boolean) => {
      if (followOutput === undefined) {
        setInternalFollowing(next);
      }
      onFollowOutputChange?.(next);
    },
    [followOutput, onFollowOutputChange],
  );

  const showLevels = useMemo(() => lines.some((line) => line.level !== undefined), [lines]);
  const matches = useMemo(() => findMatches(lines, highlight), [lines, highlight]);
  const currentMatchLine =
    matches.lineIndexes.length === 0
      ? undefined
      : matches.lineIndexes[Math.min(matchCursor, matches.lineIndexes.length - 1)];

  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      // Keep the focused line mounted so keyboard focus survives scrolling.
      if (active !== undefined && active < range.count && !indexes.includes(active)) {
        indexes.push(active);
        indexes.sort((a, b) => a - b);
      }
      return indexes;
    },
    [active],
  );

  // Stable callbacks: TanStack Virtual recomputes every item's offset when these
  // change identity, which for 50,000 lines would happen on every scroll frame.
  const estimateSize = useCallback(() => rowHeight, [rowHeight]);
  const getItemKey = useCallback((index: number) => lines[index]?.id ?? index, [lines]);
  const getScrollElement = useCallback(() => scrollRef.current, []);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns mutable functions by design; this component is not memoized by the compiler.
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: 16,
    rangeExtractor,
    initialRect: { width: 960, height: fill ? 480 : height },
  });

  // Row heights change with wrap and density: drop the cached measurements.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, wrap, dense]);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (element === null) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, []);

  // Follow: stay pinned to the newest line.
  useLayoutEffect(() => {
    if (following) {
      scrollToBottom();
    }
  }, [following, lines.length, scrollToBottom]);

  // A paused reader with a known boundary sees it on first render.
  const initialBoundary = useRef(newSinceIndex);
  useLayoutEffect(() => {
    const boundaryIndex = initialBoundary.current;
    if (!following && boundaryIndex !== undefined) {
      virtualizer.scrollToIndex(boundaryIndex, { align: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only: later boundary or follow changes must not steal the reader's position.
  }, []);

  // Announce only the newest line, at most once a second, and never the backlog.
  const seenCount = useRef(lines.length);
  const lastAnnounced = useRef(0);
  useEffect(() => {
    if (lines.length <= seenCount.current) {
      seenCount.current = lines.length;
      return;
    }
    seenCount.current = lines.length;
    const last = lines.at(-1);
    if (last === undefined || !live) {
      return;
    }
    const wait = Math.max(0, lastAnnounced.current + ANNOUNCE_EVERY_MS - Date.now());
    const timer = setTimeout(() => {
      lastAnnounced.current = Date.now();
      setAnnouncement(plainText(last));
    }, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [lines, live]);

  useEffect(() => {
    if (!copiedNotice) {
      return;
    }
    const timer = setTimeout(() => {
      setCopiedNotice(false);
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copiedNotice]);

  const pause = useCallback(() => {
    if (following) {
      setPausedAt(lines.length);
      setFollowing(false);
    }
  }, [following, lines.length, setFollowing]);

  const jumpToLive = useCallback(() => {
    setPausedAt(undefined);
    setFollowing(true);
    setActive(undefined);
    scrollToBottom();
    onJumpToLive?.();
  }, [onJumpToLive, scrollToBottom, setFollowing]);

  // Whether lines sit below the viewport: the jump pill only shows when there is somewhere to jump.
  const [hasBelow, setHasBelow] = useState(false);
  const measureBelow = useCallback(() => {
    const element = scrollRef.current;
    setHasBelow(
      element !== null && element.scrollHeight - element.scrollTop - element.clientHeight > 2,
    );
  }, []);
  useLayoutEffect(() => {
    measureBelow();
  }, [measureBelow, lines.length, expanded, wrap, dense, following]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (element === null) {
      return;
    }
    measureBelow();
    const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (following && fromBottom > rowHeight * 2) {
      pause();
    } else if (!following && fromBottom < rowHeight / 2 && pausedAt !== undefined) {
      setPausedAt(undefined);
      setFollowing(true);
    }
  };

  const copyLine = useCallback(async (line: LogLine) => {
    const ok = await copyText(plainText(line));
    if (ok) {
      setCopiedNotice(true);
    }
  }, []);

  // Read through a ref so the click handler keeps its identity while lines stream in;
  // otherwise every memoized row would re-render on each appended line.
  const linesRef = useRef(lines);
  useLayoutEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const onRowClick = useCallback(
    (index: number) => {
      const line = linesRef.current[index];
      if (line === undefined) {
        return;
      }
      setActive(index);
      // Dragging to select text is not a click-to-copy.
      const selection = typeof window === "undefined" ? null : window.getSelection();
      if (selection !== null && !selection.isCollapsed) {
        return;
      }
      if (onLineClick === undefined) {
        void copyLine(line);
      } else {
        onLineClick(line);
      }
    },
    [copyLine, onLineClick],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const focusLine = useCallback(
    (index: number) => {
      setActive(index);
      virtualizer.scrollToIndex(index, { align: "auto" });
      requestAnimationFrame(() => {
        scrollRef.current
          ?.querySelector<HTMLElement>(`[data-line-index="${String(index)}"]`)
          ?.focus({ preventScroll: true });
      });
    },
    [virtualizer],
  );

  const firstVisibleIndex = () => virtualizer.getVirtualItems()[0]?.index ?? 0;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    const last = lines.length - 1;
    if (last < 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const from = active ?? (event.key === "ArrowUp" ? last + 1 : firstVisibleIndex() - 1);
        const next = Math.min(last, Math.max(0, from + (event.key === "ArrowDown" ? 1 : -1)));
        if (event.key === "ArrowUp") {
          pause();
        }
        focusLine(next);
        return;
      }
      case "Home":
        event.preventDefault();
        pause();
        focusLine(0);
        return;
      case "End":
        event.preventDefault();
        jumpToLive();
        scrollRef.current?.focus();
        return;
      case "Enter": {
        const line = active === undefined ? undefined : lines[active];
        if (line !== undefined && jsonOf(line) !== null) {
          event.preventDefault();
          toggle(line.id);
        }
        return;
      }
      case " ":
        event.preventDefault();
        if (following) {
          pause();
        } else {
          jumpToLive();
        }
        return;
      default:
        break;
    }
    if (mod && event.key.toLowerCase() === "c") {
      const selection = window.getSelection();
      const line = active === undefined ? undefined : lines[active];
      if (line !== undefined && (selection === null || selection.isCollapsed)) {
        event.preventDefault();
        void copyLine(line);
      }
    } else if (mod && event.key.toLowerCase() === "f" && onFindShortcut !== undefined) {
      event.preventDefault();
      onFindShortcut();
    }
  };

  const goToMatch = (direction: 1 | -1) => {
    const total = matches.lineIndexes.length;
    if (total === 0) {
      return;
    }
    const next = (matchCursor + direction + total) % total;
    setMatchCursor(next);
    const index = matches.lineIndexes[next];
    if (index !== undefined) {
      pause();
      virtualizer.scrollToIndex(index, { align: "center" });
    }
  };

  const boundaryIndex = following ? undefined : (newSinceIndex ?? pausedAt);
  const measureRows = wrap || expanded.size > 0;
  const items = virtualizer.getVirtualItems();
  const empty = lines.length === 0 && !loading;

  return (
    <div
      className={cn(
        "border-border bg-bg rounded-card relative flex min-h-0 flex-col overflow-hidden border",
        fill && "h-full",
        className,
      )}
      style={fill ? undefined : { height }}
      data-following={following ? "true" : "false"}
    >
      {offline !== undefined && (
        <div className="border-warning/40 bg-warning-subtle text-body-secondary text-text flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <Icon name="triangle-alert" size={14} className="text-warning" />
          <span>
            Server offline — showing logs up to{" "}
            {formatLogTime(offline.lastLineAt, timeZone).slice(0, 5)}
          </span>
        </div>
      )}
      {highlight !== "" && (
        <div className="border-border flex h-[36px] shrink-0 items-center gap-2 border-b pr-1 pl-3">
          <span className="text-meta" aria-live="polite">
            {matches.count === 0
              ? `No matches for “${highlight}”`
              : `${String(matches.count)} ${matches.count === 1 ? "match" : "matches"}`}
          </span>
          <span className="flex-1" />
          <IconButton
            icon="chevron-down"
            label="Previous match"
            size="sm"
            className="[&_svg]:rotate-180"
            disabled={matches.count === 0}
            onClick={() => {
              goToMatch(-1);
            }}
          />
          <IconButton
            icon="chevron-down"
            label="Next match"
            size="sm"
            disabled={matches.count === 0}
            onClick={() => {
              goToMatch(1);
            }}
          />
        </div>
      )}
      {loading ? (
        <div
          aria-busy="true"
          aria-label={`${label}, loading`}
          role="status"
          className="flex flex-col gap-2 px-3 py-3"
        >
          {[72, 88, 56].map((width) => (
            <div key={width} className="flex h-5 items-center gap-3">
              {showTimestamps && <Skeleton width={88} height={12} />}
              <Skeleton height={12} className="flex-1" width={`${String(width)}%`} />
            </div>
          ))}
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <Icon name="terminal" size={20} className="text-text-secondary" />
          <p className="text-subsection pt-2">{emptyMessage}</p>
          <p className="text-body-secondary max-w-[360px]">{emptyDescription}</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          role="list"
          aria-label={label}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          className={cn(
            "relative min-h-0 flex-1 overflow-auto overscroll-contain py-2 focus-visible:outline-offset-[-2px]",
            dense ? "text-12 font-mono leading-[18px]" : "text-log",
          )}
        >
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) => {
              const line = lines[item.index];
              if (line === undefined) {
                return null;
              }
              const isExpanded = expanded.has(line.id);
              return (
                <LogRow
                  key={item.key}
                  line={line}
                  index={item.index}
                  start={item.start}
                  height={measureRows ? undefined : rowHeight}
                  showTimestamps={showTimestamps}
                  showLevels={showLevels}
                  timeZone={timeZone}
                  wrap={wrap}
                  term={highlight}
                  expanded={isExpanded}
                  active={active === item.index}
                  currentMatch={currentMatchLine === item.index}
                  boundary={boundaryIndex === item.index && item.index > 0}
                  idPrefix={idPrefix}
                  measure={measureRows ? virtualizer.measureElement : undefined}
                  onClick={onRowClick}
                  onToggle={toggle}
                />
              );
            })}
          </div>
        </div>
      )}
      {!following && hasBelow && !empty && !loading && (
        <div className="pointer-events-none absolute right-0 bottom-4 left-0 flex justify-center">
          <Button
            size="sm"
            leadingIcon="arrow-down-to-line"
            onClick={jumpToLive}
            data-jump-to-live=""
            className="bg-surface-raised shadow-raised pointer-events-auto animate-[lumen-tooltip-in_var(--dur-fast)_var(--ease-out)]"
          >
            {live ? "Jump to live" : "Jump to end"}
          </Button>
        </div>
      )}
      {copiedNotice && (
        <div className="border-border-strong bg-surface-raised text-12 shadow-raised text-text absolute right-3 bottom-4 flex items-center gap-2 border px-2 py-1">
          <Icon name="check" size={12} className="text-success" />
          Line copied
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {copiedNotice ? "Line copied" : ""}
      </div>
      <div role="log" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
