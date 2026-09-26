import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXT_STYLES } from "../styles/text-styles";

import { Text } from "./text";

describe("Text", () => {
  it.each(TEXT_STYLES.map((style) => [style.name, style.element] as const))(
    "renders %s as <%s> with its class",
    (name, element) => {
      const { container } = render(<Text variant={name}>Sample</Text>);
      const node = container.firstElementChild;
      expect(node?.tagName.toLowerCase()).toBe(element);
      expect(node).toHaveClass(`text-${name}`);
    },
  );

  it("allows overriding the element and adds helper classes", () => {
    render(
      <Text variant="meta" as="div" tabular truncate>
        3 min ago
      </Text>,
    );
    const node = screen.getByText("3 min ago");
    expect(node.tagName).toBe("DIV");
    expect(node).toHaveClass("text-meta", "tabular", "truncate");
    expect(node).toHaveAttribute("title", "3 min ago");
  });

  it("keeps an explicit title when truncating", () => {
    render(
      <Text variant="body" truncate title="Full value">
        Short
      </Text>,
    );
    expect(screen.getByText("Short")).toHaveAttribute("title", "Full value");
  });
});
