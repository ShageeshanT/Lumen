/**
 * The typography usage table · Direction D "Signal" (docs/UI_DECISIONS.md).
 * This is the single source for the `.text-*` classes in text.css, the
 * gallery "Typography" page and the test that checks the rendered styles.
 *
 * Three voices:
 *   display (Geist Pixel)  page titles and big numbers
 *   mono caps (Geist Mono) chrome: labels, eyebrows, buttons, tags
 *   sans (Geist Sans)      anything a person reads as a sentence
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
  "action",
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
  lineHeight: 1 | 1.1 | 1.25 | 1.5 | "20px";
  /** Letter spacing in em; 0 means none. */
  tracking: 0 | 0.02 | 0.08;
  family: "display" | "sans" | "mono";
  color: "text" | "text-secondary";
  tabular?: boolean;
  uppercase?: boolean;
  /** Default HTML element for `<Text>`. */
  element: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "code" | "kbd";
}

export const TEXT_STYLES: readonly TextStyle[] = [
  {
    name: "display",
    use: "Wizard finish, hero empty state, big metric values",
    size: 32,
    weight: 500,
    lineHeight: 1.1,
    tracking: 0.02,
    family: "display",
    color: "text",
    uppercase: true,
    element: "h1",
  },
  {
    name: "page-title",
    use: "Page title (h1), inspector service name",
    size: 24,
    weight: 500,
    lineHeight: 1.1,
    tracking: 0.02,
    family: "display",
    color: "text",
    uppercase: true,
    element: "h1",
  },
  {
    name: "section-title",
    use: "Section title (h2)",
    size: 20,
    weight: 500,
    lineHeight: 1.1,
    tracking: 0.02,
    family: "display",
    color: "text",
    uppercase: true,
    element: "h2",
  },
  {
    name: "card-title",
    use: "Card title, service and node names (h3)",
    size: 14,
    weight: 500,
    lineHeight: 1.25,
    tracking: 0.02,
    family: "mono",
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
    use: "Body, commit messages, descriptions",
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
    use: "Form labels, tab labels, nav items",
    size: 11,
    weight: 500,
    lineHeight: 1.5,
    tracking: 0.08,
    family: "mono",
    color: "text",
    uppercase: true,
    element: "span",
  },
  {
    name: "action",
    use: "Button and tag labels",
    size: 11,
    weight: 500,
    lineHeight: 1,
    tracking: 0.08,
    family: "mono",
    color: "text",
    uppercase: true,
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
    use: "Section numbers and group headers (01 · History)",
    size: 11,
    weight: 500,
    lineHeight: 1.5,
    tracking: 0.08,
    family: "mono",
    color: "text-secondary",
    uppercase: true,
    element: "span",
  },
  {
    name: "code",
    use: "Inline code, variable key, identifiers",
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
