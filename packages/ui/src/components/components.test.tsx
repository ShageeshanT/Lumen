import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { COMPONENT_DOCS } from "../examples/index";
import { STATUS, STATUSES } from "../status/status";

import { Avatar, tintFor } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Kbd } from "./kbd";
import { Spinner } from "./spinner";
import { StatusMarker } from "./status-marker";
import { StatusTag } from "./status-tag";
import { Tooltip, TooltipProvider } from "./tooltip";

import * as components from "./index";

describe("Button", () => {
  it("is a real button of type button by default and activates on click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Deploy</Button>);
    const button = screen.getByRole("button", { name: "Deploy" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is busy, disabled and not clickable while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Redeploy
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Redeploy" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses a real disabled attribute so it leaves the tab order", () => {
    render(<Button disabled>Deploy</Button>);
    expect(screen.getByRole("button", { name: "Deploy" })).toBeDisabled();
  });

  it("renders its child as the element with asChild", () => {
    render(
      <Button asChild>
        <a href="#docs">Read the docs</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Read the docs" });
    expect(link).toHaveClass("text-action");
  });

  it("marks the arrow as decorative", () => {
    render(
      <Button variant="primary" arrow>
        Deploy
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Deploy" })).toHaveClass("hud");
  });
});

describe("IconButton and Tooltip", () => {
  it("is named by its label and shows the tooltip on focus", async () => {
    render(
      <TooltipProvider>
        <IconButton icon="copy" label="Copy URL" />
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Copy URL" });
    act(() => {
      button.focus();
    });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy URL");
  });

  it("announces toggle state", () => {
    render(
      <TooltipProvider>
        <IconButton icon="moon" label="Dark theme" pressed />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders a shortcut inside an open tooltip", async () => {
    render(
      <TooltipProvider>
        <Tooltip content="Search" shortcut={["mod", "K"]} open>
          <button type="button">Search</button>
        </Tooltip>
      </TooltipProvider>,
    );
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Search");
  });
});

describe("StatusTag and StatusMarker", () => {
  it.each(STATUSES)("%s shows its word; the marker and brackets are hidden", (status) => {
    const { container } = render(<StatusTag status={status} />);
    expect(container).toHaveTextContent(STATUS[status].label);
    for (const hidden of container.querySelectorAll('[aria-hidden="true"]')) {
      expect(hidden.textContent).not.toContain(STATUS[status].label);
    }
  });

  it("blinks only live states", () => {
    const { container: building } = render(<StatusMarker status="building" />);
    expect(building.querySelector(".blink")).not.toBeNull();
    const { container: active } = render(<StatusMarker status="active" />);
    expect(active.querySelector(".blink")).toBeNull();
  });

  it("names a standalone marker", () => {
    render(<StatusMarker status="failed" standalone />);
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
  });

  it("adds detail after the word", () => {
    render(<StatusTag status="crashed" detail="restarting in 8s" />);
    expect(screen.getByText(/Crashed/)).toHaveTextContent("Crashed · restarting in 8s");
  });
});

describe("Kbd", () => {
  it("spells keys out for assistive technology", () => {
    render(<Kbd keys={["mod", "K"]} platform="mac" />);
    expect(screen.getByText("Command K")).toHaveClass("sr-only");
  });

  it("uses Ctrl off Apple platforms and reads sequences with then", () => {
    const { container } = render(<Kbd keys={["mod", "K"]} platform="other" />);
    expect(container).toHaveTextContent("CtrlK");
    render(<Kbd keys={["G", "then", "P"]} />);
    expect(screen.getByText("G, then P")).toHaveClass("sr-only");
  });
});

describe("Badge, Avatar, Spinner", () => {
  it("caps counts at 99+", () => {
    const { container } = render(<Badge count={120} />);
    expect(container).toHaveTextContent("99+");
  });

  it("falls back to initials when the image fails", () => {
    render(<Avatar name="Ben Okafor" src="/missing.png" />);
    const img = screen.getByRole("img", { name: "Ben Okafor" });
    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Ben Okafor" })).toHaveTextContent("BO");
  });

  it("gives a name a stable tint", () => {
    expect(tintFor("Ana")).toBe(tintFor("Ana"));
  });

  it("announces a standalone spinner and hides a decorative one", () => {
    render(<Spinner label="Connecting" />);
    expect(screen.getByRole("status")).toHaveTextContent("Connecting");
    const { container } = render(<Spinner decorative />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe("gallery registry", () => {
  it("covers every exported component", () => {
    const covered = new Set(COMPONENT_DOCS.flatMap((doc) => doc.components));
    // Text has its own Typography page; the rest are helpers, not components.
    const exempt = new Set(["Text", "buttonVariants", "usePlatform", "tintFor"]);
    const exported = Object.keys(components).filter((name) => !exempt.has(name));
    const missing = exported.filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });

  it("has unique slugs and example ids", () => {
    const slugs = COMPONENT_DOCS.map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const doc of COMPONENT_DOCS) {
      const ids = doc.examples.map((example) => example.id);
      expect(new Set(ids).size, doc.slug).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it("renders every example without throwing", () => {
    for (const doc of COMPONENT_DOCS) {
      for (const example of doc.examples) {
        const { unmount } = render(<TooltipProvider>{example.render()}</TooltipProvider>);
        unmount();
      }
    }
  });
});
