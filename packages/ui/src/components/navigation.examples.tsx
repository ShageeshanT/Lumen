import type { ComponentDoc } from "../examples/types";

import { Breadcrumbs } from "./breadcrumbs";
import {
  CRUMBS,
  DATABASE_TABS,
  EnvironmentDemo,
  ENVIRONMENTS,
  MANY_ENVIRONMENTS,
  MOBILE_ITEMS,
  OfflineBanner,
  RailDemo,
  RailDrawerPreview,
  SERVICE_TABS,
  ShellFrame,
  TabsDemo,
  TopBarDemo,
  WorkspaceDemo,
  WORKSPACES,
} from "./navigation.demos";
import { MobileTabBar } from "./rail";

export const tabsDoc: ComponentDoc = {
  slug: "tabs",
  name: "Tabs",
  group: "Navigation",
  summary:
    "Sections of one view. The accent underline slides to the active tab; arrows, Home and End move. Overflow scrolls with fade masks; links mode is deep-linkable.",
  components: ["Tabs", "TabsContent"],
  examples: [
    {
      id: "service",
      title: "Service tabs with a count",
      wide: true,
      render: () => <TabsDemo items={SERVICE_TABS} withPanels />,
    },
    {
      id: "overflow",
      title: "Overflowing: six database tabs in 340 px",
      render: () => <TabsDemo items={DATABASE_TABS} width={340} label="Database sections" />,
    },
    {
      id: "fitted",
      title: "Fitted, as in a sheet",
      render: () => (
        <TabsDemo items={SERVICE_TABS.slice(0, 3)} width={360} fitted label="Service sections" />
      ),
    },
    {
      id: "small-disabled",
      title: "Small, with a disabled tab",
      description: "Hover Metrics to see why it's off.",
      render: () => (
        <TabsDemo
          size="sm"
          items={[
            { value: "overview", label: "Overview", icon: "layout-grid" },
            {
              value: "metrics",
              label: "Metrics",
              icon: "chart",
              disabled: true,
              disabledReason: "Metrics start after the first deploy",
            },
            { value: "logs", label: "Logs", icon: "file-text" },
          ]}
          label="Server sections"
        />
      ),
    },
    {
      id: "links",
      title: "Links mode",
      description: "Each tab is a link with aria-current; Enter navigates.",
      render: () => (
        <TabsDemo
          items={[
            { value: "general", label: "General", href: "#general" },
            { value: "members", label: "Members", href: "#members", count: 4 },
            { value: "billing", label: "Usage", href: "#usage" },
          ]}
          label="Workspace settings"
        />
      ),
    },
  ],
};

export const breadcrumbsDoc: ComponentDoc = {
  slug: "breadcrumbs",
  name: "Breadcrumbs",
  group: "Navigation",
  summary:
    "Where you are. Long names shorten with the full name on hover; deep paths fold into a menu; phones show only the current item.",
  components: ["Breadcrumbs"],
  examples: [
    { id: "one", title: "One item", render: () => <Breadcrumbs items={[{ label: "Acme" }]} /> },
    {
      id: "three",
      title: "Workspace / project / service",
      render: () => <Breadcrumbs items={CRUMBS} />,
    },
    {
      id: "truncated",
      title: "Long names truncated",
      render: () => (
        <Breadcrumbs
          items={[
            { label: "Acme", href: "#ws", icon: "users" },
            { label: "enterprise-customer-portal-2026", href: "#project", icon: "layout-grid" },
            { label: "dep_01j8x9k2d3m4n5p6q7r8s9t0v1", truncate: "middle" },
          ]}
        />
      ),
    },
    {
      id: "collapsed",
      title: "Five levels, middle collapsed",
      render: () => (
        <Breadcrumbs
          items={[
            { label: "Acme", href: "#ws", icon: "users" },
            { label: "acme-shop", href: "#project", icon: "layout-grid" },
            { label: "production", href: "#env" },
            { label: "api", href: "#service" },
            { label: "Deployments" },
          ]}
        />
      ),
    },
  ],
};

export const environmentSwitcherDoc: ComponentDoc = {
  slug: "environment-switcher",
  name: "Environment switcher",
  group: "Navigation",
  summary:
    "Which environment the project view shows. Production is green, staging blue, previews amber; the marker pulses once after a switch.",
  components: ["EnvironmentSwitcher"],
  examples: [
    {
      id: "production-only",
      title: "Production only",
      render: () => <EnvironmentDemo environments={ENVIRONMENTS.slice(0, 1)} />,
    },
    {
      id: "switch",
      title: "Try it: switch environments",
      description: "The marker pulses once after a switch.",
      render: () => <EnvironmentDemo initial="env-staging" />,
    },
    {
      id: "open",
      title: "Open: production, staging and two previews",
      render: () => <EnvironmentDemo open height={300} />,
    },
    {
      id: "many",
      title: "Many environments: the list scrolls after eight",
      render: () => <EnvironmentDemo environments={MANY_ENVIRONMENTS} open height={420} />,
    },
  ],
};

export const workspaceSwitcherDoc: ComponentDoc = {
  slug: "workspace-switcher",
  name: "Workspace switcher",
  group: "Navigation",
  summary:
    "The workspace tile at the top of the rail. Lists workspaces, creates one, and links to your account.",
  components: ["WorkspaceSwitcher"],
  examples: [
    { id: "collapsed", title: "Collapsed", render: () => <WorkspaceDemo collapsed /> },
    { id: "expanded", title: "Expanded", render: () => <WorkspaceDemo /> },
    {
      id: "open",
      title: "Open with three workspaces",
      render: () => <WorkspaceDemo open height={330} />,
    },
    {
      id: "single",
      title: "A single workspace",
      render: () => <WorkspaceDemo workspaces={WORKSPACES.slice(0, 1)} open height={200} />,
    },
  ],
};

export const railDoc: ComponentDoc = {
  slug: "rail",
  name: "Rail",
  group: "Navigation",
  summary:
    "Main navigation: icons with tooltips, opening to 220 px on hover or when pinned (remembered). A drawer under 1024 px, a bottom tab bar on phones.",
  components: ["Rail", "RailItem", "MobileTabBar"],
  examples: [
    { id: "collapsed", title: "Collapsed", render: () => <RailDemo pinned={false} /> },
    {
      id: "hover-expanded",
      title: "Expanded on hover",
      render: () => <RailDemo pinned={false} expanded />,
    },
    {
      id: "interactive",
      title: "Try it: hover, pin, arrow keys",
      description: "Tab into the rail, then use the arrow keys. The pin is remembered.",
      render: () => <RailDemo />,
    },
    {
      id: "active-states",
      title: "Active state for each destination",
      wide: true,
      render: () => (
        <div className="flex flex-wrap gap-4">
          {["home", "projects", "servers", "templates", "activity", "settings"].map((id) => (
            <RailDemo key={id} active={id} pinned={false} height={300} slots={false} />
          ))}
        </div>
      ),
    },
    {
      id: "drawer",
      title: "Drawer under 1024 px",
      render: () => <RailDrawerPreview />,
    },
    {
      id: "mobile-tab-bar",
      title: "Phones: the bottom tab bar",
      render: () => (
        <div className="w-full max-w-[390px]">
          <MobileTabBar items={MOBILE_ITEMS} />
        </div>
      ),
    },
  ],
};

export const topBarDoc: ComponentDoc = {
  slug: "top-bar",
  name: "Top bar",
  group: "Navigation",
  summary:
    "Breadcrumbs on the left; environment, search, deploy activity and notifications on the right. Search turns into an icon under 1024 px; phones keep only the current crumb.",
  components: ["TopBar", "SearchButton", "DeployActivity"],
  examples: [
    { id: "full", title: "Full", wide: true, render: () => <TopBarDemo /> },
    {
      id: "banner",
      title: "With an offline banner above",
      wide: true,
      render: () => <TopBarDemo banner={<OfflineBanner />} />,
    },
    {
      id: "reconnecting",
      title: "Reconnecting",
      wide: true,
      render: () => <TopBarDemo reconnecting />,
    },
    {
      id: "activity",
      title: "Deploy activity open",
      wide: true,
      render: () => <TopBarDemo activityOpen height={200} />,
    },
  ],
};

export const shellDoc: ComponentDoc = {
  slug: "shell",
  name: "Shell frame",
  group: "Navigation",
  summary:
    "Rail, top bar and tabs composed into the app frame. At 1024 px the rail stays collapsed; below it a menu button opens the drawer and phones get the bottom tab bar.",
  components: [],
  examples: [{ id: "frame", title: "Mock shell", wide: true, render: () => <ShellFrame /> }],
};
