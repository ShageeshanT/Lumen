/** Gallery navigation, grouped like SPEC C5. Component groups fill in as they land. */
export interface GalleryEntry {
  slug: string;
  label: string;
}

export interface GalleryGroup {
  label: string;
  entries: GalleryEntry[];
}

export const GALLERY_GROUPS: readonly GalleryGroup[] = [
  {
    label: "Foundations",
    entries: [
      { slug: "tokens", label: "Tokens" },
      { slug: "typography", label: "Typography" },
    ],
  },
];
