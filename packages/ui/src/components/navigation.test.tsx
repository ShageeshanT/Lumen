import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Breadcrumbs } from "./breadcrumbs";
import { EnvironmentSwitcher } from "./environment-switcher";
import { MobileTabBar, Rail, RAIL_PINNED_KEY, type RailNavItem } from "./rail";
import { Tabs, TabsContent } from "./tabs";
import { TooltipProvider } from "./tooltip";
import { DeployActivity, SearchButton, TopBar } from "./top-bar";
import { WorkspaceSwitcher } from "./workspace-switcher";

function withTooltips(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Tabs", () => {
  function Harness({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState("deployments");
    return (
      <Tabs
        aria-label="Service sections"
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        items={[
          { value: "deployments", label: "Deployments", count: 12 },
          { value: "variables", label: "Variables" },
          { value: "metrics", label: "Metrics", disabled: true },
          { value: "logs", label: "Logs" },
        ]}
      >
        <TabsContent value="deployments">Deployments panel</TabsContent>
        <TabsContent value="variables">Variables panel</TabsContent>
        <TabsContent value="logs">Logs panel</TabsContent>
      </Tabs>
    );
  }

  it("renders a named tablist with tabs, a count and the active panel", () => {
    withTooltips(<Harness />);
    const list = screen.getByRole("tablist", { name: "Service sections" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveTextContent("Deployments[12]");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Deployments panel");
  });

  it("moves and activates with the arrow keys, skipping disabled tabs, and Home/End", async () => {
    const onChange = vi.fn();
    withTooltips(<Harness onChange={onChange} />);
    const tabs = screen.getAllByRole("tab");
    const [deployments, variables, , logs] = tabs;
    if (deployments === undefined || variables === undefined || logs === undefined) {
      throw new Error("missing tabs");
    }
    // Radix roving focus moves focus on the next tick.
    const key = async (from: HTMLElement, name: string, to: HTMLElement) => {
      fireEvent.keyDown(from, { key: name });
      await waitFor(() => {
        expect(to).toHaveFocus();
      });
    };
    act(() => {
      deployments.focus();
    });
    await key(deployments, "ArrowRight", variables);
    expect(onChange).toHaveBeenLastCalledWith("variables");
    await key(variables, "ArrowRight", logs);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Logs panel");
    await key(logs, "Home", deployments);
    await key(deployments, "End", logs);
  });

  it("drops aria-controls when there are no panels", () => {
    withTooltips(
      <Tabs
        aria-label="Sections"
        items={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    );
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).not.toHaveAttribute("aria-controls");
    }
  });

  it("renders links with aria-current in href mode", () => {
    withTooltips(
      <Tabs
        aria-label="Workspace settings"
        value="members"
        items={[
          { value: "general", label: "General", href: "#general" },
          { value: "members", label: "Members", href: "#members" },
        ]}
      />,
    );
    expect(screen.queryByRole("tablist")).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Workspace settings" });
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const general = within(nav).getByRole("link", { name: "General" });
    expect(general).not.toHaveAttribute("aria-current");
    act(() => {
      general.focus();
    });
    fireEvent.keyDown(general, { key: "ArrowRight" });
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveFocus();
  });
});

describe("Breadcrumbs", () => {
  it("is a labelled nav with an ordered list and the current page marked", () => {
    withTooltips(
      <Breadcrumbs
        items={[
          { label: "Acme", href: "#ws" },
          { label: "acme-shop", href: "#p" },
          { label: "api" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("list").tagName).toBe("OL");
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).getByText("api").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shortens long names but keeps the full name for assistive tech", () => {
    withTooltips(
      <Breadcrumbs
        items={[
          { label: "enterprise-customer-portal-2026", href: "#p" },
          { label: "dep_01j8x9k2d3m4n5p6q7r8s9t0v1", truncate: "middle" },
        ]}
      />,
    );
    expect(screen.getByText("enterprise-customer-por…")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("link", { name: "enterprise-customer-portal-2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("dep_01j8x9k…p6q7r8s9t0v1")).toBeInTheDocument();
    // The truncated current item is focusable so its tooltip is reachable.
    expect(screen.getByText("dep_01j8x9k…p6q7r8s9t0v1").closest("[aria-current]")).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("folds the middle of a deep path into a menu", () => {
    withTooltips(
      <Breadcrumbs
        items={[
          { label: "Acme", href: "#1" },
          { label: "acme-shop", href: "#2" },
          { label: "production", href: "#3" },
          { label: "api", href: "#4" },
          { label: "Deployments" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Show 2 more levels" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
    expect(screen.queryByText("acme-shop")).toBeNull();
    expect(screen.getByText("api")).toBeInTheDocument();
  });
});

describe("EnvironmentSwitcher", () => {
  it("names the trigger by the environment and lists environments as radio items", async () => {
    const onValueChange = vi.fn();
    const onCreate = vi.fn();
    render(
      <EnvironmentSwitcher
        environments={[
          { id: "prod", name: "production", kind: "production" },
          { id: "stg", name: "staging", kind: "staging" },
        ]}
        value="prod"
        onValueChange={onValueChange}
        onCreate={onCreate}
        onManage={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Environment: production" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    const radios = within(menu).getAllByRole("menuitemradio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitem", { name: "New environment" })).toBeInTheDocument();
    if (radios[1] !== undefined) {
      fireEvent.click(radios[1]);
    }
    expect(onValueChange).toHaveBeenCalledWith("stg");
  });
});

describe("WorkspaceSwitcher", () => {
  it("names the trigger by the workspace and links to the account", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={[
          { id: "a", name: "Acme" },
          { id: "b", name: "Side projects" },
        ]}
        value="a"
        onValueChange={() => undefined}
        onCreate={() => undefined}
        account={{ name: "Shagee", email: "shagee@acme.dev", href: "#account" }}
        collapsed
      />,
    );
    const trigger = screen.getByRole("button", { name: "Workspace: Acme" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(2);
    expect(within(menu).getByRole("menuitem", { name: /Shagee/ })).toHaveAttribute(
      "href",
      "#account",
    );
  });

  it("with one workspace offers only create and the account", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={[{ id: "a", name: "Acme" }]}
        value="a"
        onValueChange={() => undefined}
        onCreate={() => undefined}
        account={{ name: "Shagee", email: "shagee@acme.dev", href: "#account" }}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Workspace: Acme" }), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryAllByRole("menuitemradio")).toHaveLength(0);
    expect(within(menu).getByRole("menuitem", { name: "Create workspace" })).toBeInTheDocument();
  });
});

const ITEMS: RailNavItem[] = [
  { id: "home", label: "Home", icon: "home", href: "#home" },
  { id: "projects", label: "Projects", icon: "layout-grid", href: "#projects", active: true },
  { id: "servers", label: "Servers", icon: "server", href: "#servers" },
];

describe("Rail", () => {
  it("is the main nav with the current destination marked", () => {
    withTooltips(<Rail items={ITEMS} responsive={false} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("moves between items with the arrow keys, Home and End", () => {
    withTooltips(<Rail items={ITEMS} responsive={false} />);
    const home = screen.getByRole("link", { name: "Home" });
    act(() => {
      home.focus();
    });
    fireEvent.keyDown(home, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Projects" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? home, { key: "End" });
    expect(screen.getByRole("link", { name: "Servers" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? home, { key: "ArrowDown" });
    expect(home).toHaveFocus();
    fireEvent.keyDown(home, { key: "ArrowUp" });
    expect(screen.getByRole("link", { name: "Servers" })).toHaveFocus();
  });

  it("shows the label and shortcut in a tooltip while collapsed", async () => {
    withTooltips(
      <Rail
        items={[
          {
            ...ITEMS[0],
            id: "home",
            label: "Home",
            icon: "home",
            href: "#h",
            shortcut: ["G", "then", "H"],
          },
        ]}
        responsive={false}
      />,
    );
    act(() => {
      screen.getByRole("link", { name: "Home" }).focus();
    });
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Home");
    expect(tooltip).toHaveTextContent("G, then H");
  });

  it("pins open, remembers the pin and restores it", () => {
    const { unmount } = withTooltips(<Rail items={ITEMS} responsive={false} />);
    const pin = screen.getByRole("button", { name: "Pin sidebar open" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pin);
    expect(window.localStorage.getItem(RAIL_PINNED_KEY)).toBe("true");
    const rail = document.querySelector("[data-rail]");
    expect(rail).toHaveAttribute("data-pinned", "true");
    expect(rail).toHaveStyle({ width: "220px" });
    unmount();

    withTooltips(<Rail items={ITEMS} responsive={false} />);
    expect(screen.getByRole("button", { name: "Unpin sidebar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.querySelector("[data-rail]")).toHaveStyle({ width: "220px" });
  });

  it("expands after hovering 150 ms and collapses 300 ms after leaving", () => {
    vi.useFakeTimers();
    try {
      withTooltips(<Rail items={ITEMS} responsive={false} pinned={false} />);
      const nav = screen.getByRole("navigation", { name: "Main" });
      const rail = document.querySelector("[data-rail]");
      fireEvent.pointerEnter(nav, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(rail).not.toHaveAttribute("data-expanded");
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(rail).toHaveAttribute("data-expanded", "true");
      // Hover expansion overlays the page; the rail keeps its 56 px slot.
      expect(rail).toHaveStyle({ width: "56px" });
      fireEvent.pointerLeave(nav, { pointerType: "mouse" });
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(rail).toHaveAttribute("data-expanded", "true");
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(rail).not.toHaveAttribute("data-expanded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the tablet drawer as a modal navigation dialog", async () => {
    withTooltips(<Rail items={ITEMS} drawerOpen onDrawerOpenChange={() => undefined} />);
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(drawer).getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("MobileTabBar marks the current destination", () => {
    render(
      <MobileTabBar
        items={[
          { id: "home", label: "Home", icon: "home", href: "#h" },
          { id: "projects", label: "Projects", icon: "layout-grid", href: "#p", active: true },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
  });
});

describe("TopBar", () => {
  it("is the banner landmark and announces reconnecting", () => {
    withTooltips(<TopBar left={<span>crumbs</span>} right={<SearchButton />} reconnecting />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+K Control+K",
    );
  });

  it("names the deploy activity button and opens its popover", async () => {
    render(
      <DeployActivity count={2}>
        <p>api · Building</p>
      </DeployActivity>,
    );
    const button = screen.getByRole("button", { name: "2 deployments in progress" });
    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "Deploy activity" })).toHaveTextContent(
      "api · Building",
    );
  });

  it("hides deploy activity when nothing is deploying", () => {
    const { container } = render(
      <DeployActivity count={0}>
        <p>none</p>
      </DeployActivity>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders banners above the bar", async () => {
    withTooltips(<TopBar left={<span>crumbs</span>} banner={<div role="status">Offline</div>} />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Offline");
    });
  });
});
