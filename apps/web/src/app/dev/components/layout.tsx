import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Text } from "@lumen/ui";

import { GALLERY_GROUPS } from "./_lib/nav";
import { ThemeToggle } from "./_lib/theme-toggle";

/** The component gallery. Never reachable in production unless explicitly enabled. */
export default function GalleryLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.LUMEN_ENABLE_GALLERY !== "true") {
    notFound();
  }
  return (
    <div className="flex min-h-svh">
      <nav
        aria-label="Gallery"
        className="border-border bg-surface flex w-[200px] shrink-0 flex-col gap-6 border-r px-4 py-5"
      >
        <Link href="/dev/components" className="text-card-title">
          Lumen kit
        </Link>
        {GALLERY_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <Text variant="eyebrow" className="px-2 pb-1">
              {group.label}
            </Text>
            {group.entries.map((entry) => (
              <Link
                key={entry.slug}
                href={`/dev/components/${entry.slug}`}
                className="text-label text-text-secondary hover:bg-surface-hover hover:text-text rounded-control px-2 py-1"
              >
                {entry.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-12 items-center justify-end gap-2 border-b px-6">
          <ThemeToggle />
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
