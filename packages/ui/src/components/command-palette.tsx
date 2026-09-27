"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";
import { useSkipMountFocus } from "../lib/use-skip-mount-focus";

import { Kbd, type KbdKey } from "./kbd";
import { Skeleton } from "./skeleton";

export interface CommandItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: KbdKey[];
  /** Right-aligned context: "Service", "acme / shop", "Production". */
  meta?: string;
  /** Extra words that should match this item. */
  keywords?: string[];
  onSelect?: () => void;
  /** Selecting opens a nested page with these groups ("Deploy ›"). */
  groups?: CommandGroup[];
}

export interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
  /** Shown first while the query is empty. */
  recents?: CommandItem[];
  placeholder?: string;
  /** Remote search in flight: three skeleton rows replace the results. */
  loading?: boolean;
  /** Async search. When set, the caller filters `groups`; the palette does not. */
  onQueryChange?: (query: string) => void;
  /** Listen for ⌘K / Ctrl+K on the window and toggle. Mount one palette with this. */
  hotkey?: boolean;
  /** Prefill the query, for gallery screenshots. */
  defaultQuery?: string;
  /** Start on a nested page (ids of the items to open, in order), for gallery screenshots. */
  defaultPath?: string[];
  /** Render inside this element without taking focus (gallery previews). */
  container?: HTMLElement | null | undefined;
}

interface Page {
  label: string;
  groups: CommandGroup[];
}

/**
 * Marks the characters of `label` that match `query` as a subsequence, the
 * way the fuzzy filter reads it: contiguous runs are preferred at each step.
 */
export function highlightMatch(label: string, query: string): ReactNode {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return label;
  }
  const hay = label.toLowerCase();
  const marks = new Array<boolean>(label.length).fill(false);
  let from = 0;
  for (const char of needle) {
    if (char === " ") {
      continue;
    }
    const at = hay.indexOf(char, from);
    if (at === -1) {
      return label;
    }
    marks[at] = true;
    from = at + 1;
  }
  const parts: ReactNode[] = [];
  let run = "";
  let runMarked = marks[0] ?? false;
  const flush = (key: number) => {
    if (run !== "") {
      parts.push(
        runMarked ? (
          <mark key={key} className="text-accent-text bg-transparent">
            {run}
          </mark>
        ) : (
          run
        ),
      );
    }
  };
  for (let index = 0; index < label.length; index += 1) {
    const marked = marks[index] ?? false;
    if (marked !== runMarked) {
      flush(index);
      run = "";
      runMarked = marked;
    }
    run += label[index] ?? "";
  }
  flush(label.length);
  return parts;
}

function pageFromPath(groups: CommandGroup[], path: string[]): Page[] {
  const pages: Page[] = [];
  let current = groups;
  for (const id of path) {
    const item = current.flatMap((group) => group.items).find((entry) => entry.id === id);
    if (item?.groups === undefined) {
      break;
    }
    pages.push({ label: item.label, groups: item.groups });
    current = item.groups;
  }
  return pages;
}

/** cmdk renders group headings itself; style them as eyebrows (mono caps 11). */
const HEADING = cn(
  "[&_[cmdk-group-heading]]:text-text-secondary [&_[cmdk-group-heading]]:text-11 [&_[cmdk-group-heading]]:tracking-caps",
  "[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase",
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1",
);

/**
 * The command palette (Radix Dialog + cmdk). ⌘K / Ctrl+K toggles, arrows move,
 * Enter runs, Escape closes or steps back out of a nested page, Backspace on an
 * empty query steps back too. Tab stays inside. Full screen under 640 px.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  recents = [],
  placeholder = "Search or run a command…",
  loading = false,
  onQueryChange,
  hotkey = false,
  defaultQuery = "",
  defaultPath = [],
  container,
}: CommandPaletteProps) {
  const contained = container !== undefined;
  const skipFocus = useSkipMountFocus(open, contained);
  const [query, setQuery] = useState(defaultQuery);
  const [pages, setPages] = useState<Page[]>(() => pageFromPath(groups, defaultPath));
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const page = pages.at(-1);
  const shownGroups = page?.groups ?? groups;
  const trimmed = query.trim();

  useEffect(() => {
    if (!hotkey) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [hotkey, open, onOpenChange]);

  const reset = () => {
    setQuery(defaultQuery);
    setPages(pageFromPath(groups, defaultPath));
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    onQueryChange?.(next);
  };

  const run = (item: CommandItem) => {
    if (item.groups !== undefined) {
      setPages((stack) => [...stack, { label: item.label, groups: item.groups ?? [] }]);
      changeQuery("");
      return;
    }
    onOpenChange(false);
    item.onSelect?.();
  };

  const popPage = () => {
    setPages((stack) => stack.slice(0, -1));
    changeQuery("");
  };

  const renderItem = (item: CommandItem, valuePrefix: string) => (
    <Command.Item
      key={`${valuePrefix}${item.id}`}
      value={`${valuePrefix}${item.id}`}
      keywords={[
        item.label,
        ...(item.keywords ?? []),
        ...(item.meta === undefined ? [] : [item.meta]),
      ]}
      onSelect={() => {
        run(item);
      }}
      className={cn(
        "text-14 text-text rounded-control flex h-[36px] cursor-default items-center gap-3 px-2 select-none",
        "data-[selected=true]:bg-surface-hover data-[disabled=true]:opacity-50",
      )}
    >
      {item.icon !== undefined && (
        <Icon name={item.icon} size={16} className="text-text-secondary shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{highlightMatch(item.label, trimmed)}</span>
      {item.meta !== undefined && <span className="text-meta shrink-0">{item.meta}</span>}
      {item.shortcut !== undefined && <Kbd keys={item.shortcut} size="sm" />}
      {item.groups !== undefined && (
        <Icon name="chevron-right" size={14} className="text-text-secondary shrink-0" />
      )}
    </Command.Item>
  );

  const position = contained ? "absolute" : "fixed";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      modal={!contained}
    >
      <Dialog.Portal container={container}>
        {contained ? (
          <div aria-hidden="true" className="bg-overlay absolute inset-0" />
        ) : (
          <Dialog.Overlay
            className={cn(
              "bg-overlay fixed inset-0 z-[var(--z-palette)]",
              "data-[state=open]:animate-[lumen-fade-in_var(--dur-base)_var(--ease-out)]",
              "data-[state=closed]:animate-[lumen-fade-out_var(--dur-exit-base)_var(--ease-in)]",
            )}
          />
        )}
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (!skipFocus()) {
              opener.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
              inputRef.current?.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected === true) {
              opener.current.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (pages.length > 0) {
              event.preventDefault();
              popPage();
            }
          }}
          onInteractOutside={(event) => {
            if (contained) {
              event.preventDefault();
            }
          }}
          className={cn(
            position,
            "z-[var(--z-palette)] flex flex-col overflow-hidden outline-none",
            "border-border-strong bg-surface-raised text-text shadow-raised rounded-panel border",
            "inset-x-0 top-[15%] mx-auto max-h-[480px] w-[calc(100%-32px)] max-w-[640px]",
            "data-[state=open]:animate-[lumen-dialog-in_var(--dur-base)_var(--ease-panel)]",
            "data-[state=closed]:animate-[lumen-dialog-out_var(--dur-exit-base)_var(--ease-in)]",
            "max-sm:inset-0 max-sm:top-0 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:rounded-none max-sm:border-0",
          )}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command
            label="Command palette"
            shouldFilter={onQueryChange === undefined}
            loop
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-border flex h-[44px] shrink-0 items-center gap-3 border-b px-4">
              <Icon name="search" size={16} className="text-text-secondary shrink-0" />
              {page !== undefined && (
                <span className="text-action border-border bg-surface text-text-secondary inline-flex h-6 shrink-0 items-center gap-1 border px-2">
                  {page.label}
                  <span aria-hidden="true">›</span>
                </span>
              )}
              <Command.Input
                ref={inputRef}
                value={query}
                onValueChange={changeQuery}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && query === "" && pages.length > 0) {
                    event.preventDefault();
                    popPage();
                  }
                }}
                placeholder={page === undefined ? placeholder : `Search ${page.label}…`}
                className="text-14 text-text placeholder:text-text-muted h-full min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            {loading && (
              <div role="status" className="flex flex-col p-2">
                <span className="sr-only">Loading results</span>
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex h-[36px] items-center gap-3 px-2">
                    <Skeleton width={16} height={16} />
                    <Skeleton height={10} width={row === 1 ? "40%" : "56%"} />
                  </div>
                ))}
              </div>
            )}
            <Command.List
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain p-2",
                loading && "hidden",
              )}
              aria-busy={loading || undefined}
            >
              {!loading && (
                <>
                  <Command.Empty className="text-body-secondary px-3 py-8 text-center">
                    No matches for “{trimmed}”
                  </Command.Empty>
                  {page === undefined && trimmed === "" && recents.length > 0 && (
                    <Command.Group heading="Recent" className={HEADING}>
                      {recents.map((item) => renderItem(item, "recent:"))}
                    </Command.Group>
                  )}
                  {shownGroups.map((group) => (
                    <Command.Group key={group.heading} heading={group.heading} className={HEADING}>
                      {group.items.map((item) => renderItem(item, ""))}
                    </Command.Group>
                  ))}
                </>
              )}
            </Command.List>
            <div
              aria-hidden="true"
              className="border-border text-eyebrow flex h-8 shrink-0 items-center gap-4 border-t px-4 max-sm:hidden"
            >
              <span className="flex items-center gap-1">
                <Kbd keys="↑" size="sm" />
                <Kbd keys="↓" size="sm" /> Move
              </span>
              <span className="flex items-center gap-1">
                <Kbd keys="enter" size="sm" /> Run
              </span>
              <span className="flex items-center gap-1">
                <Kbd keys="esc" size="sm" /> {page === undefined ? "Close" : "Back"}
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
