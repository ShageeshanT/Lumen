"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input, Kbd, LumenMark, Text, cn } from "@lumen/ui";

import type { GalleryGroup } from "./nav";

/**
 * The gallery's left navigation with a filter box. "/" focuses the filter
 * from anywhere on the page (the same key the app uses for search).
 */
export function GalleryNav({ groups }: { groups: readonly GalleryGroup[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (entry) =>
          needle === "" ||
          entry.label.toLowerCase().includes(needle) ||
          entry.slug.includes(needle) ||
          group.label.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <nav
      aria-label="Gallery"
      className="border-border bg-bg flex shrink-0 flex-col gap-4 border-b px-4 py-3 md:sticky md:top-0 md:h-svh md:w-[208px] md:overflow-y-auto md:border-r md:border-b-0 md:py-5"
    >
      <Link href="/dev/components" className="text-card-title flex shrink-0 items-center gap-2">
        <LumenMark size={20} />
        Lumen kit
      </Link>
      <Input
        ref={inputRef}
        type="search"
        size="sm"
        leadingIcon="search"
        placeholder="Filter"
        aria-label="Filter components"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        trailingSlot={query === "" ? <Kbd keys={["/"]} size="sm" /> : undefined}
      />
      <div className="flex gap-6 overflow-x-auto md:flex-col md:overflow-x-visible">
        {shown.map((group) => (
          <div key={group.label} className="flex shrink-0 flex-col gap-1">
            <Text variant="eyebrow" className="px-2 pb-1">
              {group.label}
            </Text>
            {group.entries.map((entry) => {
              const href = `/dev/components/${entry.slug}`;
              const current = pathname === href;
              return (
                <Link
                  key={entry.slug}
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "text-label rounded-control px-2 py-1",
                    current
                      ? "bg-surface-hover text-text"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text",
                  )}
                >
                  {entry.label}
                </Link>
              );
            })}
          </div>
        ))}
        {shown.length === 0 && (
          <p className="text-body-secondary px-2" role="status">
            No pages match “{query}”.
          </p>
        )}
      </div>
    </nav>
  );
}
