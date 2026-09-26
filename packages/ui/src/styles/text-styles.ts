/**
 * The typography usage table (docs/phases/PHASE-01-design-system.md §5). This
 * is the single source for the `.text-*` classes in text.css, the gallery
 * "Typography" page and the test that checks the rendered styles.
 */
export const TEXT_VARIANTS = [
  "display",
  "page-title",
  "section-title",
  "card-title",
  "subsection",
  "body",
  "body-secondary",
  "label",
  "meta",
  "eyebrow",
  "code",
  "log",
  "kbd",
] as const;

export type TextVariant = (typeof TEXT_VARIANTS)[number];

export interface TextStyle {
  /** Class name suffix and `<Text variant>` value. */
  name: TextVariant;
  /** Where it is used. */
  use: string;
  size: 11 | 12 | 13 | 14 | 16 | 20 | 24 | 32;
  weight: 400 | 500 | 600;
  /** Unitless line-height, or a pixel value for the log line. */
  lineHeight: 1 | 1.25 | 1.4 | 1.5 | "20px";
  /** Letter spacing in em; 0 means none. */
  tracking: -0.02 | -0.01 | 0 | 0.04;
  family: "sans" | "mono";
  color: "text" | "text-secondary";
  tabular?: boolean;
  uppercase?: boolean;
  /** Default HTML element for `<Text>`. */
  element: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "code" | "kbd";
}

export const TEXT_STYLES: readonly TextStyle[] = [
  {
    name: "display",
    use: "Wizard finish, hero empty state",
    size: 32,
    weight: 600,
    lineHeight: 1.25,
    tracking: -0.02,
    family: "sans",
    color: "text",
    element: "h1",
  },
  {
    name: "page-title",
    use: "Page title (h1)",
    size: 24,
    weight: 600,
    lineHeight: 1.25,
    tracking: -0.01,
    family: "sans",
    color: "text",
    element: "h1",
  },
  {
    name: "section-title",
    use: "Section title (h2)",
    size: 20,
    weight: 600,
    lineHeight: 1.25,
    tracking: -0.01,
    family: "sans",
    color: "text",
    element: "h2",
  },
  {
    name: "card-title",
    use: "Card and inspector title (h3)",
    size: 16,
    weight: 600,
    lineHeight: 1.25,
    tracking: 0,
    family: "sans",
    color: "text",
    element: "h3",
  },
  {
    name: "subsection",
    use: "Subsection label (h4, settings groups)",
    size: 14,
    weight: 600,
    lineHeight: 1.5,
    tracking: 0,
    family: "sans",
    color: "text",
    element: "h4",
  },
  {
    name: "body",
    use: "Body",
    size: 14,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: "sans",
    color: "text",
    element: "p",
  },
  {
    name: "body-secondary",
    use: "Body secondary, helper text",
    size: 13,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: "sans",
    color: "text-secondary",
    element: "p",
  },
  {
    name: "label",
    use: "Form label",
    size: 13,
    weight: 500,
    lineHeight: 1.5,
    tracking: 0,
    family: "sans",
    color: "text",
    element: "span",
  },
  {
    name: "meta",
    use: 'Timestamps, counts, "3 min ago"',
    size: 12,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: "sans",
    color: "text-secondary",
    tabular: true,
    element: "span",
  },
  {
    name: "eyebrow",
    use: "Menu group headers",
    size: 11,
    weight: 500,
    lineHeight: 1.5,
    tracking: 0.04,
    family: "sans",
    color: "text-secondary",
    uppercase: true,
    element: "span",
  },
  {
    name: "code",
    use: "Inline code, variable key",
    size: 13,
    weight: 400,
    lineHeight: 1.5,
    tracking: 0,
    family: "mono",
    color: "text",
    element: "code",
  },
  {
    name: "log",
    use: "Log line",
    size: 13,
    weight: 400,
    lineHeight: "20px",
    tracking: 0,
    family: "mono",
    color: "text",
    element: "span",
  },
  {
    name: "kbd",
    use: "Keyboard shortcut",
    size: 11,
    weight: 500,
    lineHeight: 1,
    tracking: 0,
    family: "mono",
    color: "text-secondary",
    element: "kbd",
  },
];
