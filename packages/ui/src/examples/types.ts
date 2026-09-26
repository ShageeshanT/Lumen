import type { ReactNode } from "react";

/** One rendered state of a component, shown in the gallery and screenshotted in CI. */
export interface Example {
  /** Stable id, used for the screenshot file name. kebab-case. */
  id: string;
  title: string;
  description?: string;
  render: () => ReactNode;
  /** Wide examples span the full gallery width. */
  wide?: boolean;
}

export type ComponentGroup =
  | "Foundations"
  | "Buttons"
  | "Form controls"
  | "Overlays"
  | "Navigation"
  | "Feedback"
  | "Status"
  | "Data display"
  | "Specialized";

/** A gallery page: one component (or a tight family) with every state. */
export interface ComponentDoc {
  slug: string;
  name: string;
  group: ComponentGroup;
  /** One sentence: what it is for. */
  summary: string;
  /** Exported component names this page covers; the registry test checks coverage. */
  components: string[];
  examples: Example[];
}
