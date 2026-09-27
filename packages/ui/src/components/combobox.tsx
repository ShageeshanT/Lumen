"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { useState, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { controlClasses, controlFrameClasses } from "./control-styles";
import { useFieldProps } from "./field";
import { Skeleton } from "./skeleton";

export interface ComboboxItem {
  value: string;
  label: string;
  /** Right-aligned meta: "Updated 2 d ago", "12.4k pulls". */
  meta?: string;
  icon?: IconName;
  group?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  items: ComboboxItem[];
  value?: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when nothing matches. */
  emptyMessage?: string;
  /** Async search: called on every keystroke; filtering then happens on the caller's side. */
  onSearch?: (query: string) => void;
  loading?: boolean;
  /** Offer to create what was typed: "Add 'my-label'". */
  creatable?: { label: (query: string) => string; onCreate: (query: string) => void } | undefined;
  /** A footer row such as "Configure GitHub access". */
  footer?: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Force the panel open without taking focus, for gallery screenshots. */
  open?: boolean | undefined;
  /** Pre-fill the search, for gallery screenshots. */
  defaultQuery?: string;
  className?: string;
}

/**
 * Pick one item from a long or remote list by typing. The trigger looks like
 * an input; the panel holds a search field and a filtered list. Arrow keys
 * move, Enter selects, Escape closes and keeps the previous value.
 */
export function Combobox({
  items,
  value,
  onValueChange,
  placeholder = "Choose…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results",
  onSearch,
  loading = false,
  creatable,
  footer,
  invalid,
  disabled,
  id,
  open: forcedOpen,
  defaultQuery = "",
  className,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const field = useFieldProps({ id, invalid, disabled });
  const [openState, setOpen] = useState(false);
  const open = forcedOpen ?? openState;
  const [query, setQuery] = useState(defaultQuery);
  const selected = items.find((item) => item.value === value);

  const groups = new Map<string, ComboboxItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const trimmed = query.trim();
  const exact = items.some((item) => item.label.toLowerCase() === trimmed.toLowerCase());

  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn(controlFrameClasses, className)}>
        <Popover.Trigger
          id={field.id}
          disabled={field.disabled}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.describedBy}
          className={controlClasses({
            invalid: field.invalid,
            className: "flex items-center gap-2 pr-8 text-left",
          })}
        >
          {selected?.icon !== undefined && (
            <Icon name={selected.icon} size={16} className="text-text-secondary" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              selected === undefined && "text-text-secondary",
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <Icon
            name="chevrons-up-down"
            size={16}
            className="text-text-secondary absolute right-[10px]"
          />
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          aria-label={ariaLabel ?? placeholder}
          onOpenAutoFocus={(event) => {
            if (forcedOpen === true) {
              event.preventDefault();
            }
          }}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "border-border-strong bg-surface-raised shadow-raised rounded-card z-[var(--z-popover)] w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden border",
            "data-[state=open]:animate-[lumen-tooltip-in_var(--dur-fast)_var(--ease-out)]",
          )}
        >
          <Command shouldFilter={onSearch === undefined} loop label={ariaLabel ?? placeholder}>
            <div className="border-border flex items-center gap-2 border-b px-3">
              <Icon name="search" size={14} className="text-text-secondary" />
              <Command.Input
                value={query}
                onValueChange={(next) => {
                  setQuery(next);
                  onSearch?.(next);
                }}
                placeholder={searchPlaceholder}
                className="text-14 text-text placeholder:text-text-muted h-[40px] w-full bg-transparent outline-none"
              />
            </div>
            {loading && (
              <div role="status" className="flex flex-col gap-2 p-3">
                <span className="sr-only">Loading results</span>
                <Skeleton variant="text" lines={3} />
              </div>
            )}
            <Command.List
              className={cn("max-h-[280px] overflow-y-auto p-1", loading && "hidden")}
              aria-busy={loading || undefined}
            >
              {loading ? null : (
                <>
                  <Command.Empty className="text-body-secondary px-3 py-6 text-center">
                    {trimmed === "" ? emptyMessage : `${emptyMessage} for “${trimmed}”`}
                  </Command.Empty>
                  {[...groups.entries()].map(([group, groupItems]) => (
                    <Command.Group
                      key={group === "" ? "_" : group}
                      heading={group === "" ? undefined : group}
                      className="[&_[cmdk-group-heading]]:text-text-secondary [&_[cmdk-group-heading]]:text-11 [&_[cmdk-group-heading]]:tracking-caps [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase"
                    >
                      {groupItems.map((item) => (
                        <Command.Item
                          key={item.value}
                          value={`${item.label} ${item.value}`}
                          disabled={item.disabled === true}
                          onSelect={() => {
                            choose(item.value);
                          }}
                          className={cn(
                            "text-14 text-text rounded-control flex min-h-8 cursor-default items-center gap-2 px-2",
                            "data-[selected=true]:bg-surface-hover data-[disabled=true]:opacity-50",
                          )}
                        >
                          {item.icon !== undefined && (
                            <Icon name={item.icon} size={16} className="text-text-secondary" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.meta !== undefined && (
                            <span className="text-meta">{item.meta}</span>
                          )}
                          {item.value === value && (
                            <Icon name="check" size={16} className="text-accent" />
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ))}
                  {creatable !== undefined && trimmed !== "" && !exact && (
                    <Command.Item
                      value={`create ${trimmed}`}
                      onSelect={() => {
                        creatable.onCreate(trimmed);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="text-14 text-accent-text data-[selected=true]:bg-surface-hover rounded-control flex min-h-8 items-center gap-2 px-2"
                    >
                      <Icon name="plus" size={16} />
                      {creatable.label(trimmed)}
                    </Command.Item>
                  )}
                </>
              )}
            </Command.List>
            {footer !== undefined && (
              <div className="border-border border-t px-3 py-2">{footer}</div>
            )}
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
