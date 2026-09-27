import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { TooltipProvider } from "@lumen/ui";

import { AxeRunner } from "./_lib/axe-runner";
import { DensityToggle } from "./_lib/density-toggle";
import { GalleryNav } from "./_lib/gallery-nav";
import { GALLERY_GROUPS } from "./_lib/nav";
import { ThemeToggle } from "./_lib/theme-toggle";

/** The component gallery. Never reachable in production unless explicitly enabled. */
export default function GalleryLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.LUMEN_ENABLE_GALLERY !== "true") {
    notFound();
  }
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col md:flex-row">
        <GalleryNav groups={GALLERY_GROUPS} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-border flex min-h-12 flex-wrap items-center justify-end gap-2 border-b px-4 py-2 md:px-6">
            <DensityToggle />
            <AxeRunner />
            <ThemeToggle />
          </header>
          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
