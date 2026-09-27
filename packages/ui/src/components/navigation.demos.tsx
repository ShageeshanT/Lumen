"use client";

import { useState, type ReactNode } from "react";

import { cn } from "../lib/cn";

import { Alert } from "./alert";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { EnvironmentSwitcher, type Environment } from "./environment-switcher";
import { IconButton } from "./icon-button";
import { InspectorBody, PALETTE_GROUPS, PALETTE_RECENTS, Stage } from "./overlays.demos";
import { MobileTabBar, Rail, type MobileTabBarItem, type RailNavItem } from "./rail";
import { StatusMarker } from "./status-marker";
import { Tabs, TabsContent, type TabItem } from "./tabs";
import { DeployActivity, SearchButton, TopBar } from "./top-bar";
import { WorkspaceSwitcher, type Workspace } from "./workspace-switcher";

/** Stateful gallery demos. Client-only so the registry can be imported on the server. */

// ─── Data ──────────────────────────────────────────────────────────────────

export const ENVIRONMENTS: Environment[] = [
  { id: "env-prod", name: "production", kind: "production" },
  { id: "env-staging", name: "staging", kind: "staging" },
  { id: "env-pr-42", name: "pr-42-checkout-redesign", kind: "preview" },
  { id: "env-pr-57", name: "pr-57-rate-limits", kind: "preview" },
];

export const MANY_ENVIRONMENTS: Environment[] = [
  ...ENVIRONMENTS,
  ...[61, 63, 64, 70, 71, 75, 78].map((pr) => ({
    id: `env-pr-${String(pr)}`,
    name: `pr-${String(pr)}`,
    kind: "preview" as const,
  })),
];

export const WORKSPACES: Workspace[] = [
  { id: "ws-acme", name: "Acme" },
  { id: "ws-side", name: "Side projects" },
  { id: "ws-oss", name: "Open source" },
];

export const ACCOUNT = {
  name: "Shagee Tharan",
  email: "shagee@acme.dev",
  href: "#account",
};

export function railItems(active = "projects"): RailNavItem[] {
  return [
    { id: "home", label: "Home", icon: "home", href: "#home", shortcut: ["G", "then", "H"] },
    {
      id: "projects",
      label: "Projects",
      icon: "layout-grid",
      href: "#projects",
      shortcut: ["G", "then", "P"],
    },
    {
      id: "servers",
      label: "Servers",
      icon: "server",
      href: "#servers",
      shortcut: ["G", "then", "S"],
    },
    {
      id: "templates",
      label: "Templates",
      icon: "layers",
      href: "#templates",
      shortcut: ["G", "then", "T"],
    },
    { id: "activity", label: "Activity", icon: "activity", href: "#activity" },
    { id: "settings", label: "Settings", icon: "settings", href: "#settings" },
  ].map((item) => ({ ...item, active: item.id === active })) as RailNavItem[];
}

export const MOBILE_ITEMS: MobileTabBarItem[] = [
  { id: "home", label: "Home", icon: "home", href: "#home" },
  { id: "projects", label: "Projects", icon: "layout-grid", href: "#projects", active: true },
  { id: "deploys", label: "Deploys", icon: "rotate-cw", href: "#deploys" },
  { id: "servers", label: "Servers", icon: "server", href: "#servers" },
  { id: "more", label: "More", icon: "ellipsis", href: "#more" },
];

export const SERVICE_TABS: TabItem[] = [
  { value: "deployments", label: "Deployments", count: 12 },
  { value: "variables", label: "Variables" },
  { value: "metrics", label: "Metrics" },
  { value: "logs", label: "Logs" },
  { value: "settings", label: "Settings" },
];

export const DATABASE_TABS: TabItem[] = [
  { value: "data", label: "Data" },
  { value: "backups", label: "Backups", count: 14 },
  { value: "connect", label: "Connect" },
  { value: "variables", label: "Variables" },
  { value: "metrics", label: "Metrics" },
  { value: "settings", label: "Settings" },
];

// ─── Tabs ──────────────────────────────────────────────────────────────────

export function TabsDemo({
  items,
  width,
  withPanels = false,
  ...rest
}: {
  items: TabItem[];
  width?: number;
  withPanels?: boolean;
  size?: "sm" | "md";
  fitted?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState(items[0]?.value ?? "");
  return (
    <div className="w-full" style={width === undefined ? undefined : { maxWidth: width }}>
      <Tabs
        items={items}
        value={value}
        onValueChange={setValue}
        aria-label={rest.label ?? "Service sections"}
        {...(rest.size === undefined ? {} : { size: rest.size })}
        {...(rest.fitted === undefined ? {} : { fitted: rest.fitted })}
      >
        {withPanels
          ? items.map((item) => (
              <TabsContent key={item.value} value={item.value} className="pt-6">
                <InspectorBody tab={item.value} />
              </TabsContent>
            ))
          : undefined}
      </Tabs>
    </div>
  );
}

// ─── Switchers ─────────────────────────────────────────────────────────────

export function EnvironmentDemo({
  environments = ENVIRONMENTS,
  initial = "env-prod",
  open,
  height,
}: {
  environments?: Environment[];
  initial?: string;
  open?: boolean;
  height?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-full" style={height === undefined ? undefined : { height }}>
      <EnvironmentSwitcher
        environments={environments}
        value={value}
        onValueChange={setValue}
        onCreate={() => undefined}
        onManage={() => undefined}
        {...(open === undefined ? {} : { open })}
      />
    </div>
  );
}

export function WorkspaceDemo({
  workspaces = WORKSPACES,
  collapsed = false,
  open,
  height,
}: {
  workspaces?: Workspace[];
  collapsed?: boolean;
  open?: boolean;
  height?: number;
}) {
  const [value, setValue] = useState(workspaces[0]?.id ?? "");
  return (
    <div
      className={cn(collapsed ? "w-[56px]" : "w-[220px]", "bg-surface border-border border p-2")}
      style={height === undefined ? undefined : { height }}
    >
      <WorkspaceSwitcher
        workspaces={workspaces}
        value={value}
        onValueChange={setValue}
        onCreate={() => undefined}
        account={ACCOUNT}
        collapsed={collapsed}
        {...(open === undefined ? {} : { open })}
      />
    </div>
  );
}

// ─── Rail ──────────────────────────────────────────────────────────────────

function RailTop({ expanded }: { expanded: boolean }) {
  const [value, setValue] = useState("ws-acme");
  return (
    <WorkspaceSwitcher
      workspaces={WORKSPACES}
      value={value}
      onValueChange={setValue}
      onCreate={() => undefined}
      account={ACCOUNT}
      collapsed={!expanded}
    />
  );
}

function RailBottom() {
  return (
    <IconButton icon="circle-help" label="Help and docs" tooltipSide="right" className="ml-1" />
  );
}

export function RailDemo({
  active = "projects",
  pinned,
  expanded,
  height = 480,
  slots = true,
}: {
  active?: string;
  pinned?: boolean;
  expanded?: boolean;
  height?: number;
  slots?: boolean;
}) {
  return (
    // The collapsed rail is a 220 px panel clipped to 56 px; clip-path does not
    // clip layout, so the frame clips it. Otherwise it widens a phone's layout
    // viewport and every later screenshot on the page lands off target.
    <div
      className={cn(
        "border-border bg-bg-canvas flex overflow-hidden border",
        slots && "w-[260px] max-w-full",
      )}
      style={{ height }}
    >
      <Rail
        items={railItems(active)}
        responsive={false}
        {...(pinned === undefined ? {} : { pinned })}
        {...(expanded === undefined ? {} : { expanded })}
        {...(slots
          ? {
              top: (isExpanded: boolean) => <RailTop expanded={isExpanded} />,
              bottom: <RailBottom />,
            }
          : {})}
      />
    </div>
  );
}

export function RailDrawerPreview() {
  return (
    <Stage height={480} className="max-w-[420px]">
      {(container) => (
        <Rail
          items={railItems()}
          top={() => <RailTop expanded />}
          bottom={<RailBottom />}
          drawerOpen
          drawerContainer={container}
          className="hidden"
        />
      )}
    </Stage>
  );
}

// ─── Top bar ───────────────────────────────────────────────────────────────

export const CRUMBS = [
  { label: "Acme", href: "#ws", icon: "users" as const },
  { label: "acme-shop", href: "#project", icon: "layout-grid" as const },
  { label: "api" },
];

function DeployRows() {
  return (
    <ul className="flex flex-col gap-3">
      {[
        { name: "api", step: "Building", time: "1m 12s" },
        { name: "worker", step: "Health check", time: "18s" },
      ].map((row) => (
        <li key={row.name} className="flex items-center gap-2">
          <StatusMarker status="building" />
          <span className="text-card-title flex-1">{row.name}</span>
          <span className="text-meta">
            {row.step} · {row.time}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TopBarDemo({
  banner,
  reconnecting = false,
  activityOpen,
  onMenu,
  onSearch,
  height,
}: {
  banner?: ReactNode;
  reconnecting?: boolean;
  activityOpen?: boolean;
  onMenu?: () => void;
  onSearch?: () => void;
  height?: number;
}) {
  const [env, setEnv] = useState("env-prod");
  return (
    <div className="w-full" style={height === undefined ? undefined : { height }}>
      <TopBar
        banner={banner}
        reconnecting={reconnecting}
        left={
          <>
            <IconButton
              icon="menu"
              label="Open navigation"
              className="lg:hidden"
              onClick={onMenu}
            />
            <Breadcrumbs items={CRUMBS} />
          </>
        }
        right={
          <>
            <EnvironmentSwitcher
              environments={ENVIRONMENTS}
              value={env}
              onValueChange={setEnv}
              size="sm"
              onCreate={() => undefined}
              onManage={() => undefined}
              className="max-sm:hidden"
            />
            <SearchButton onClick={onSearch} />
            <DeployActivity
              count={2}
              {...(activityOpen === undefined ? {} : { open: activityOpen })}
            >
              <DeployRows />
            </DeployActivity>
            <IconButton icon="bell" label="Notifications" size="sm" />
          </>
        }
      />
    </div>
  );
}

export function OfflineBanner() {
  return (
    <Alert variant="warning" global critical>
      You’re offline. Changes sync when the connection comes back.
    </Alert>
  );
}

// ─── Shell frame ───────────────────────────────────────────────────────────

/** Rail + top bar + tabs, composed the way the app shell (Phase 5) will be. */
export function ShellFrame() {
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [tab, setTab] = useState("deployments");
  return (
    <Stage height={560} className="bg-bg">
      {(container) => (
        <div className="flex h-full min-w-0">
          <Rail
            items={railItems()}
            pinned={false}
            top={(expanded) => <RailTop expanded={expanded} />}
            bottom={<RailBottom />}
            drawerOpen={drawer}
            onDrawerOpenChange={setDrawer}
            drawerContainer={container}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBarDemo
              onMenu={() => {
                setDrawer(true);
              }}
              onSearch={() => {
                setPalette(true);
              }}
            />
            <div className="border-border flex flex-col gap-4 border-b px-6 pt-5 max-md:px-4">
              <div className="flex flex-col gap-1">
                <span className="text-eyebrow">Service · 02</span>
                <h2 className="text-section-title">api</h2>
              </div>
              <Tabs
                items={SERVICE_TABS}
                value={tab}
                onValueChange={setTab}
                aria-label="Service sections"
                className="-mx-3"
              />
            </div>
            <div className="bg-grid min-h-0 flex-1 p-6 max-md:p-4">
              <InspectorBody tab={tab} />
            </div>
            <MobileTabBar items={MOBILE_ITEMS} className="md:hidden" />
          </div>
          <CommandPalette
            open={palette}
            onOpenChange={setPalette}
            groups={PALETTE_GROUPS}
            recents={PALETTE_RECENTS}
            container={container}
          />
        </div>
      )}
    </Stage>
  );
}
