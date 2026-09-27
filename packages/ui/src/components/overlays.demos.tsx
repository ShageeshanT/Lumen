"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { Button } from "./button";
import { CommandPalette, type CommandGroup, type CommandItem } from "./command-palette";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./context-menu";
import { Modal, type ModalProps } from "./modal";
import { Sheet, type SheetProps } from "./sheet";
import { SidePanel, type SidePanelProps } from "./side-panel";
import { StatusTag } from "./status-tag";
import { SearchButton } from "./top-bar";

/** Stateful gallery demos. Client-only so the registry can be imported on the server. */

/**
 * A framed stand-in for the page behind an overlay. Overlays rendered into it
 * are positioned inside it and leave the gallery page usable.
 */
export function Stage({
  height,
  children,
  className,
}: {
  height: number;
  children: (container: HTMLElement) => ReactNode;
  className?: string;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setElement}
      className={cn(
        "bg-grid border-border relative isolate w-full overflow-hidden border",
        className,
      )}
      style={{ height }}
    >
      {element !== null && children(element)}
    </div>
  );
}

// ─── Command palette ───────────────────────────────────────────────────────

const SERVICES: CommandItem[] = [
  { id: "svc-api", label: "api", icon: "box", meta: "acme-shop · Service" },
  { id: "svc-web", label: "web", icon: "globe", meta: "acme-shop · Service" },
  { id: "svc-worker", label: "worker", icon: "cpu", meta: "acme-shop · Service" },
  { id: "svc-postgres", label: "postgres", icon: "database", meta: "acme-shop · Database" },
];

export const PALETTE_GROUPS: CommandGroup[] = [
  {
    heading: "Projects",
    items: [
      { id: "prj-shop", label: "acme-shop", icon: "layout-grid", meta: "5 services" },
      { id: "prj-blog", label: "blog", icon: "layout-grid", meta: "2 services" },
    ],
  },
  { heading: "Services", items: SERVICES },
  {
    heading: "Actions",
    items: [
      {
        id: "act-deploy",
        label: "Deploy",
        icon: "rotate-cw",
        keywords: ["redeploy", "release"],
        groups: [{ heading: "Deploy which service?", items: SERVICES }],
      },
      { id: "act-restart", label: "Restart a service", icon: "refresh-cw" },
      { id: "act-domain", label: "Add a domain", icon: "link" },
      { id: "act-new", label: "New project", icon: "plus", shortcut: ["mod", "shift", "N"] },
      { id: "act-theme", label: "Switch theme", icon: "sun", shortcut: ["mod", "shift", "L"] },
    ],
  },
];

export const PALETTE_RECENTS: CommandItem[] = [
  { id: "svc-api", label: "api", icon: "box", meta: "acme-shop · Service" },
  { id: "act-domain", label: "Add a domain", icon: "link" },
];

/** The palette wired to ⌘K / Ctrl+K and to a Search button. */
export function PaletteInteractive() {
  const [open, setOpen] = useState(false);
  const [ran, setRan] = useState<string | null>(null);
  const groups = PALETTE_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      onSelect: () => {
        setRan(item.label);
      },
    })),
  }));
  return (
    <div className="flex flex-wrap items-center gap-4">
      <SearchButton
        onClick={() => {
          setOpen(true);
        }}
      />
      <span className="text-body-secondary" aria-live="polite">
        {ran === null ? "Press ⌘K or Ctrl+K anywhere on this page." : `Ran “${ran}”.`}
      </span>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        groups={groups}
        recents={PALETTE_RECENTS}
        hotkey
      />
    </div>
  );
}

export function PalettePreview({
  query,
  path,
  loading = false,
  height = 540,
}: {
  query?: string;
  path?: string[];
  loading?: boolean;
  height?: number;
}) {
  return (
    <Stage height={height}>
      {(container) => (
        <CommandPalette
          open
          onOpenChange={() => undefined}
          groups={PALETTE_GROUPS}
          recents={PALETTE_RECENTS}
          loading={loading}
          container={container}
          {...(query === undefined ? {} : { defaultQuery: query })}
          {...(path === undefined ? {} : { defaultPath: path })}
        />
      )}
    </Stage>
  );
}

// ─── Context menu ──────────────────────────────────────────────────────────

function NodeCard({ name = "api" }: { name?: string }) {
  return (
    <span className="hud border-border bg-surface flex h-[112px] w-[248px] flex-col gap-2 border p-3 text-left">
      <span className="flex items-center gap-2">
        <Icon name="box" size={16} />
        <span className="text-card-title flex-1">{name}</span>
        <StatusTag status="active" />
      </span>
      <span className="text-meta block truncate font-mono">
        api-production-x2p4.apps.example.com
      </span>
      <span className="text-meta">3 min ago · fix: retry on 502</span>
    </span>
  );
}

function NodeMenuItems() {
  return (
    <>
      <ContextMenuItem icon="rotate-cw">Redeploy</ContextMenuItem>
      <ContextMenuItem icon="refresh-cw">Restart</ContextMenuItem>
      <ContextMenuItem icon="file-text" shortcut={["L"]}>
        View logs
      </ContextMenuItem>
      <ContextMenuItem icon="external-link">Open URL</ContextMenuItem>
      <ContextMenuItem icon="copy" shortcut={["mod", "D"]}>
        Duplicate
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger icon="layers">Move to group</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem>Backend</ContextMenuItem>
          <ContextMenuItem>Frontend</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem icon="trash-2" destructive shortcut={["mod", "Del"]}>
        Delete
      </ContextMenuItem>
    </>
  );
}

/**
 * A context menu shown open, as if right-clicked at a point inside the node.
 * The browser's own contextmenu event opens it and re-anchors it on scroll.
 */
export function ContextMenuPreview() {
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const open = () => {
      const node = trigger.current;
      if (node === null) {
        return;
      }
      const rect = node.getBoundingClientRect();
      node.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 180,
          clientY: rect.top + 40,
        }),
      );
    };
    open();
    window.addEventListener("scroll", open, { passive: true, capture: true });
    window.addEventListener("resize", open);
    return () => {
      window.removeEventListener("scroll", open, { capture: true });
      window.removeEventListener("resize", open);
    };
  }, []);
  return (
    <div className="h-[320px] w-full">
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <button
            ref={trigger}
            type="button"
            aria-label="api, Active. Right-click or press Shift+F10 for actions"
          >
            <NodeCard />
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent
          updatePositionStrategy="always"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <NodeMenuItems />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

const LOG_LINES = [
  { level: "info", text: "GET /health 200 2ms" },
  { level: "warn", text: "Slow query: SELECT * FROM orders (812ms)" },
  { level: "error", text: "Error: connect ECONNREFUSED 10.0.0.4:6379" },
];

/** Right-click (or Shift+F10 on a focused line) for line actions. */
export function LogLineMenu() {
  const [level, setLevel] = useState("all");
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-3">
      <ul className="bg-surface border-border flex flex-col border py-1">
        {LOG_LINES.map((line) => (
          <li key={line.text}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  data-log-line={line.level}
                  className="text-log is-hover:bg-surface-hover focus-inset flex min-h-[28px] w-full items-center gap-3 px-3 text-left"
                >
                  <span
                    className={cn(
                      "w-12 shrink-0 uppercase",
                      line.level === "error"
                        ? "text-danger-text"
                        : line.level === "warn"
                          ? "text-warning-text"
                          : "text-text-secondary",
                    )}
                  >
                    {line.level}
                  </span>
                  <span className="min-w-0 truncate">{line.text}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  icon="copy"
                  onSelect={() => {
                    setCopied("line");
                  }}
                >
                  Copy line
                </ContextMenuItem>
                <ContextMenuItem
                  icon="file-code"
                  onSelect={() => {
                    setCopied("JSON");
                  }}
                >
                  Copy as JSON
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger icon="filter">Filter by level</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <ContextMenuRadioGroup value={level} onValueChange={setLevel}>
                      {["all", "info", "warn", "error"].map((value) => (
                        <ContextMenuRadioItem key={value} value={value}>
                          {value === "all" ? "All levels" : value}
                        </ContextMenuRadioItem>
                      ))}
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </ContextMenuContent>
            </ContextMenu>
          </li>
        ))}
      </ul>
      <p className="text-body-secondary" aria-live="polite">
        {copied === null
          ? `Showing ${level === "all" ? "all levels" : level}. Right-click a line.`
          : `Copied the ${copied}.`}
      </p>
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────

const CHANGES = [
  { service: "api", what: "Variable DATABASE_POOL_SIZE", from: "10", to: "20" },
  { service: "api", what: "Memory limit", from: "512 MB", to: "1 GB" },
  { service: "worker", what: "Start command", from: "node worker.js", to: "node dist/worker.js" },
  { service: "worker", what: "Replicas", from: "1", to: "2" },
  { service: "web", what: "Custom domain", from: "—", to: "shop.acme.dev" },
  { service: "web", what: "Health check path", from: "/", to: "/healthz" },
  { service: "postgres", what: "Backup schedule", from: "Daily", to: "Every 6 hours" },
  { service: "postgres", what: "Volume size", from: "5 GB", to: "10 GB" },
];

function ChangeList({ count = CHANGES.length }: { count?: number }) {
  return (
    <ul className="border-border flex flex-col border-t">
      {CHANGES.slice(0, count).map((change) => (
        <li
          key={`${change.service}-${change.what}`}
          className="border-border flex flex-col gap-1 border-b py-3"
        >
          <span className="flex items-center gap-2">
            <span className="text-card-title">{change.service}</span>
            <span className="text-body-secondary">{change.what}</span>
          </span>
          <span className="text-13 flex flex-wrap items-center gap-2 font-mono">
            <span className="text-danger-text line-through">{change.from}</span>
            <Icon name="arrow-right" size={14} className="text-text-secondary" />
            <span className="text-success-text">{change.to}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReviewFooter({ onClose }: { onClose?: () => void }) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        Keep editing
      </Button>
      <Button variant="primary" arrow onClick={onClose}>
        Deploy changes
      </Button>
    </>
  );
}

export function ModalInteractive() {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Review 3 changes"
      description="These deploy together. Nothing changes until you deploy."
      trigger={<Button leadingIcon="layers">Review changes</Button>}
      footer={<ReviewFooter onClose={close} />}
    >
      <ChangeList count={3} />
    </Modal>
  );
}

export function ModalPreview({
  height = 420,
  ...props
}: Omit<ModalProps, "container" | "open"> & { height?: number }) {
  return (
    <Stage height={height}>{(container) => <Modal open container={container} {...props} />}</Stage>
  );
}

export function ModalScrolling() {
  return (
    <ModalPreview
      height={460}
      size="md"
      title="Review 8 changes"
      description="Changes to 4 services deploy together."
      footer={<ReviewFooter />}
    >
      <ChangeList />
    </ModalPreview>
  );
}

export function ModalNested() {
  return (
    <Stage height={480}>
      {(container) => (
        <>
          <Modal
            open
            container={container}
            size="lg"
            title="Service settings"
            footer={<Button variant="primary">Save settings</Button>}
          >
            <p className="text-body-secondary">
              Danger zone: deleting api removes its deployments.
            </p>
          </Modal>
          <ConfirmDialog
            open
            container={container}
            variant="simple"
            title="Discard unsaved settings?"
            description="You changed 2 settings. They are lost if you close now."
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            onConfirm={() => undefined}
          />
        </>
      )}
    </Stage>
  );
}

// ─── Confirm dialog ────────────────────────────────────────────────────────

export const DELETE_CONSEQUENCES = [
  "api stops and its 12 deployments are deleted",
  "Its public URL api-production-x2p4.apps.example.com stops answering",
  "Services that reference ${{ api.URL }} fail to start",
];

export function ConfirmInteractive() {
  const [deleted, setDeleted] = useState(false);
  const [withVolume, setWithVolume] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ConfirmDialog
        variant="destructive"
        title="Delete api?"
        description="This can't be undone."
        consequences={DELETE_CONSEQUENCES}
        confirmText="api"
        confirmLabel="Delete service"
        checkbox={{
          label: "Also delete the volume and its 2.1 GB of data",
          checked: withVolume,
          onChange: setWithVolume,
        }}
        onConfirm={() =>
          new Promise<void>((resolve) => {
            window.setTimeout(() => {
              setDeleted(true);
              resolve();
            }, 600);
          })
        }
        trigger={
          <Button variant="danger" leadingIcon="trash-2">
            Delete service
          </Button>
        }
      />
      <span className="text-body-secondary" aria-live="polite">
        {deleted ? "api was deleted (demo)." : "Type the service name to unlock Delete."}
      </span>
    </div>
  );
}

export function ConfirmPreview({
  height = 440,
  ...props
}: Omit<ConfirmDialogProps, "container" | "open" | "onConfirm"> & { height?: number }) {
  return (
    <Stage height={height}>
      {(container) => (
        <ConfirmDialog open container={container} onConfirm={() => undefined} {...props} />
      )}
    </Stage>
  );
}

export function ConfirmWithCheckbox(
  props: Omit<ConfirmDialogProps, "container" | "open" | "onConfirm" | "checkbox"> & {
    checkboxLabel: string;
    height?: number;
  },
) {
  const { checkboxLabel, ...rest } = props;
  const [checked, setChecked] = useState(false);
  return (
    <ConfirmPreview {...rest} checkbox={{ label: checkboxLabel, checked, onChange: setChecked }} />
  );
}

// ─── Side panel ────────────────────────────────────────────────────────────

const INSPECTOR_TABS = [
  { value: "deployments", label: "Deployments", count: 12 },
  { value: "variables", label: "Variables" },
  { value: "metrics", label: "Metrics" },
  { value: "logs", label: "Logs" },
  { value: "settings", label: "Settings" },
];

const HISTORY = [
  { status: "active" as const, message: "fix: retry on 502", meta: "a1b2c3d · 3 min ago · 42s" },
  {
    status: "superseded" as const,
    message: "chore: bump dependencies",
    meta: "9f8e7d6 · 2 h ago · 51s",
  },
  { status: "failed" as const, message: "feat: rate limits", meta: "c4d5e6f · 5 h ago · 1m 12s" },
];

function InspectorBody({ tab }: { tab: string }) {
  if (tab !== "deployments") {
    return (
      <p className="text-body-secondary">
        {INSPECTOR_TABS.find((item) => item.value === tab)?.label} for api show here.
      </p>
    );
  }
  return (
    <ul className="border-border flex flex-col border-t">
      {HISTORY.map((row) => (
        <li key={row.meta} className="border-border flex items-center gap-3 border-b py-3">
          <span className="w-[120px] shrink-0">
            <StatusTag status={row.status} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-body truncate font-medium">{row.message}</span>
            <span className="text-meta truncate">{row.meta}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function InspectorActions() {
  return (
    <Button variant="primary" size="sm" leadingIcon="rotate-cw" className="max-sm:hidden">
      Redeploy
    </Button>
  );
}

/** The resizable, persisted panel beside a stand-in canvas. */
export function SidePanelInteractive() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("deployments");
  return (
    <Stage height={520}>
      {(container) => (
        <>
          <div className="p-4">
            <Button
              leadingIcon="box"
              onClick={() => {
                setOpen(true);
              }}
            >
              Open inspector
            </Button>
          </div>
          <SidePanel
            open={open}
            onOpenChange={setOpen}
            container={container}
            title="api"
            eyebrow="Service · 02"
            actions={<InspectorActions />}
            tabs={{
              items: INSPECTOR_TABS,
              value: tab,
              onValueChange: setTab,
              "aria-label": "Service sections",
            }}
          >
            <InspectorBody tab={tab} />
          </SidePanel>
        </>
      )}
    </Stage>
  );
}

export function SidePanelPreview({
  height = 460,
  ...props
}: Omit<SidePanelProps, "open" | "onOpenChange" | "container" | "title" | "children"> & {
  height?: number;
}) {
  const [tab, setTab] = useState("deployments");
  return (
    <Stage height={height}>
      {(container) => (
        <SidePanel
          open
          onOpenChange={() => undefined}
          container={container}
          title="api"
          eyebrow="Service · 02"
          actions={<InspectorActions />}
          tabs={{
            items: INSPECTOR_TABS,
            value: tab,
            onValueChange: setTab,
            "aria-label": "Service sections",
          }}
          {...props}
        >
          <InspectorBody tab={tab} />
        </SidePanel>
      )}
    </Stage>
  );
}

// ─── Sheet ─────────────────────────────────────────────────────────────────

function DeployActions() {
  return (
    <ul className="flex flex-col gap-2">
      <li>
        <Button size="lg" fullWidth leadingIcon="rotate-cw">
          Redeploy
        </Button>
      </li>
      <li>
        <Button size="lg" fullWidth leadingIcon="file-text">
          View logs
        </Button>
      </li>
      <li>
        <Button size="lg" fullWidth leadingIcon="history">
          Roll back to this deploy
        </Button>
      </li>
      <li>
        <Button size="lg" fullWidth leadingIcon="copy">
          Copy deployment ID
        </Button>
      </li>
    </ul>
  );
}

export function SheetInteractive() {
  return (
    <Sheet
      title="Deployment a1b2c3d"
      description="fix: retry on 502 · 3 min ago"
      trigger={<Button leadingIcon="ellipsis">Deployment actions</Button>}
    >
      <DeployActions />
    </Sheet>
  );
}

export function SheetPreview({
  height = 560,
  withTabs = false,
  ...props
}: Omit<SheetProps, "open" | "container" | "title" | "children"> & {
  height?: number;
  withTabs?: boolean;
}) {
  const [tab, setTab] = useState("deployments");
  return (
    <Stage height={height} className="mx-auto max-w-[420px]">
      {(container) => (
        <Sheet
          open
          container={container}
          title={withTabs ? "api" : "Deployment a1b2c3d"}
          {...(withTabs
            ? {
                tabs: {
                  items: INSPECTOR_TABS.slice(0, 4),
                  value: tab,
                  onValueChange: setTab,
                  "aria-label": "Service sections",
                },
              }
            : { description: "fix: retry on 502 · 3 min ago" })}
          {...props}
        >
          {withTabs ? <InspectorBody tab={tab} /> : <DeployActions />}
        </Sheet>
      )}
    </Stage>
  );
}
