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

export const GALLERY_GROUPS: readonly GalleryGroup[] = GROUP_ORDER.map((group) => ({
  label: group,
  entries: [
    ...(group === "Foundations" ? FOUNDATION_PAGES : []),
    ...COMPONENT_DOCS.filter((doc) => doc.group === group).map((doc) => ({
      slug: doc.slug,
      label: doc.name,
    })),
  ],
})).filter((group) => group.entries.length > 0);
