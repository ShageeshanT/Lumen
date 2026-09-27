import { COMPONENT_DOCS, type ComponentGroup } from "@lumen/ui/examples";

/** Gallery navigation, grouped like SPEC C5. Component pages come from the registry. */
export interface GalleryEntry {
  slug: string;
  label: string;
}

export interface GalleryGroup {
  label: string;
  entries: GalleryEntry[];
}

const GROUP_ORDER: readonly ComponentGroup[] = [
  "Foundations",
  "Buttons",
  "Form controls",
  "Overlays",
  "Navigation",
  "Feedback",
  "Status",
  "Data display",
  "Specialized",
];

/** Pages with bespoke layouts that are not driven by examples. */
const FOUNDATION_PAGES: GalleryEntry[] = [
  { slug: "tokens", label: "Tokens" },
  { slug: "typography", label: "Typography" },
  { slug: "signal", label: "Signal surfaces" },
];

/** Performance pages for the 60 fps budgets (Phase 1 §5 Performance). */
const SPECIALIZED_PAGES: GalleryEntry[] = [
  { slug: "logs-perf", label: "Logs · 50k lines" },
  { slug: "canvas-perf", label: "Canvas · 100 nodes" },
];

/** Every bespoke page, for registry.json (axe runs on each). */
export const BESPOKE_PAGES: readonly string[] = [...FOUNDATION_PAGES, ...SPECIALIZED_PAGES].map(
  (entry) => entry.slug,
);

export const GALLERY_GROUPS: readonly GalleryGroup[] = GROUP_ORDER.map((group) => ({
  label: group,
  entries: [
    ...(group === "Foundations" ? FOUNDATION_PAGES : []),
    ...COMPONENT_DOCS.filter((doc) => doc.group === group).map((doc) => ({
      slug: doc.slug,
      label: doc.name,
    })),
    ...(group === "Specialized" ? SPECIALIZED_PAGES : []),
  ],
})).filter((group) => group.entries.length > 0);
