import {
  createElement,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from "react";

import { cn } from "../lib/cn";
import { TEXT_STYLES, type TextVariant } from "../styles/text-styles";

const DEFAULT_ELEMENT = Object.fromEntries(
  TEXT_STYLES.map((style) => [style.name, style.element]),
) as Record<TextVariant, ElementType>;

export interface TextProps extends ComponentPropsWithoutRef<"span"> {
  variant: TextVariant;
  /** Override the element; the variant's default is semantic (h1, p, code, kbd). */
  as?: ElementType;
  /** Tabular numerals for values, durations, counts and ids. */
  tabular?: boolean;
  /** End-truncate with an ellipsis; the full text is exposed through `title`. */
  truncate?: boolean;
  children?: ReactNode;
}

/** Renders one of the named text styles so pages never set a raw font size. */
export function Text({
  variant,
  as,
  tabular = false,
  truncate = false,
  className,
  children,
  title,
  ...rest
}: TextProps) {
  const element = as ?? DEFAULT_ELEMENT[variant];
  const fullTitle =
    truncate && title === undefined && typeof children === "string" ? children : title;
  return createElement(
    element,
    {
      ...rest,
      title: fullTitle,
      className: cn(`text-${variant}`, tabular && "tabular", truncate && "truncate", className),
    },
    children,
  );
}
