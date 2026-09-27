import type { ComponentDoc } from "../examples/types";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { IconButton } from "./icon-button";
import { Input } from "./input";
import {
  ConfirmInteractive,
  ConfirmPreview,
  ConfirmWithCheckbox,
  ContextMenuPreview,
  DELETE_CONSEQUENCES,
  LogLineMenu,
  ModalInteractive,
  ModalNested,
  ModalPreview,
  ModalScrolling,
  PaletteInteractive,
  PalettePreview,
  SheetInteractive,
  SheetPreview,
  SidePanelInteractive,
  SidePanelPreview,
} from "./overlays.demos";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { StatusMarker } from "./status-marker";

/** Forced-open popovers and menus must not steal focus from the gallery page. */
const keepFocus = (event: Event) => {
  event.preventDefault();
};

export const commandPaletteDoc: ComponentDoc = {
  slug: "command-palette",
  name: "Command palette",
  group: "Overlays",
  summary:
    "Search and run anything from the keyboard. ⌘K / Ctrl+K toggles it; nested pages step back with Escape or Backspace. Full screen under 640 px.",
  components: ["CommandPalette"],
  examples: [
    {
      id: "interactive",
      title: "Try it: ⌘K / Ctrl+K",
      description: "The Search button and the shortcut both open the same palette.",
      wide: true,
      render: () => <PaletteInteractive />,
    },
    {
      id: "recents",
      title: "Open with recents",
      wide: true,
      render: () => <PalettePreview />,
    },
    {
      id: "matches",
      title: "Matches across groups, highlighted",
      wide: true,
      render: () => <PalettePreview query="re" />,
    },
    {
      id: "no-matches",
      title: "No matches",
      render: () => <PalettePreview query="kubernetes" height={320} />,
    },
    {
      id: "loading",
      title: "Loading remote results",
      render: () => <PalettePreview query="bil" loading height={320} />,
    },
    {
      id: "nested",
      title: "Nested page",
      description: "Deploy › asks which service. Escape or Backspace goes back.",
      wide: true,
      render: () => <PalettePreview path={["act-deploy"]} height={400} />,
    },
  ],
};

export const dropdownMenuDoc: ComponentDoc = {
  slug: "dropdown-menu",
  name: "Dropdown menu",
  group: "Overlays",
  summary:
    "Actions behind a button. Enter, Space or ArrowDown opens it; arrows and typeahead move; Escape closes and returns focus.",
  components: [
    "DropdownMenu",
    "DropdownMenuTrigger",
    "DropdownMenuContent",
    "DropdownMenuItem",
    "DropdownMenuCheckboxItem",
    "DropdownMenuRadioGroup",
    "DropdownMenuRadioItem",
    "DropdownMenuSeparator",
    "DropdownMenuLabel",
    "DropdownMenuGroup",
    "DropdownMenuSub",
    "DropdownMenuSubTrigger",
    "DropdownMenuSubContent",
  ],
  examples: [
    {
      id: "interactive",
      title: "Try it",
      render: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button trailingIcon="chevron-down">Actions</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem icon="terminal">Open shell</DropdownMenuItem>
            <DropdownMenuItem icon="rotate-cw">Restart</DropdownMenuItem>
            <DropdownMenuItem icon="copy">Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon="trash-2" destructive>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    {
      id: "service-overflow",
      title: "Service overflow",
      render: () => (
        <div className="h-[260px] w-full">
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon="ellipsis" label="More actions for api" variant="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
            >
              <DropdownMenuItem icon="terminal" shortcut={["mod", "J"]}>
                Open shell
              </DropdownMenuItem>
              <DropdownMenuItem icon="square">Stop</DropdownMenuItem>
              <DropdownMenuItem icon="moon-star" data-force="hover">
                Sleep now
              </DropdownMenuItem>
              <DropdownMenuItem icon="copy" shortcut={["mod", "D"]}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon="trash-2" destructive>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
    {
      id: "states",
      title: "Disabled and destructive hover",
      render: () => (
        <div className="h-[220px] w-full">
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" trailingIcon="chevron-down">
                Deployment
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
            >
              <DropdownMenuLabel>Deployment a1b2c3d</DropdownMenuLabel>
              <DropdownMenuItem icon="history" disabled>
                Roll back (this is live)
              </DropdownMenuItem>
              <DropdownMenuItem icon="file-text">View build logs</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon="circle-x" destructive data-force="hover">
                Remove deployment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
    {
      id: "checkbox-items",
      title: "Checkbox items: log toggles",
      render: () => (
        <div className="h-[220px] w-full">
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" leadingIcon="settings">
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
            >
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked>Timestamps</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked>Wrap long lines</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={false}>Build logs</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={false} shortcut={["J"]}>
                Raw JSON
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
    {
      id: "radio-group",
      title: "Radio group: sort",
      render: () => (
        <div className="h-[200px] w-full">
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" leadingIcon="filter">
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
            >
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value="newest">
                <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
    {
      id: "submenu",
      title: "Submenu: move to group",
      render: () => (
        <div className="h-[220px] w-full">
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon="ellipsis" label="More actions for worker" variant="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
            >
              <DropdownMenuItem icon="pencil">Rename</DropdownMenuItem>
              <DropdownMenuSub open>
                <DropdownMenuSubTrigger icon="layers">Move to group</DropdownMenuSubTrigger>
                <DropdownMenuSubContent avoidCollisions={false} className="max-h-none">
                  <DropdownMenuRadioGroup value="backend">
                    <DropdownMenuRadioItem value="backend">Backend</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="frontend">Frontend</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon="plus">New group</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem icon="copy">Duplicate</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ],
};

export const contextMenuDoc: ComponentDoc = {
  slug: "context-menu",
  name: "Context menu",
  group: "Overlays",
  summary:
    "The same menu, opened on an area: right-click, Shift+F10 or the menu key on the focused element, or a 500 ms long-press on touch.",
  components: [
    "ContextMenu",
    "ContextMenuTrigger",
    "ContextMenuContent",
    "ContextMenuItem",
    "ContextMenuCheckboxItem",
    "ContextMenuRadioGroup",
    "ContextMenuRadioItem",
    "ContextMenuSeparator",
    "ContextMenuLabel",
    "ContextMenuGroup",
    "ContextMenuSub",
    "ContextMenuSubTrigger",
    "ContextMenuSubContent",
  ],
  examples: [
    {
      id: "canvas-node",
      title: "Canvas node, right-clicked",
      wide: true,
      render: () => <ContextMenuPreview />,
    },
    {
      id: "log-line",
      title: "Log line menu",
      description: "Right-click a line, or focus it and press Shift+F10.",
      wide: true,
      render: () => <LogLineMenu />,
    },
  ],
};

export const popoverDoc: ComponentDoc = {
  slug: "popover",
  name: "Popover",
  group: "Overlays",
  summary:
    "Interactive content anchored to a trigger. Focus moves in on open and back on close; Escape closes.",
  components: ["Popover", "PopoverTrigger", "PopoverContent", "PopoverAnchor", "PopoverClose"],
  examples: [
    {
      id: "interactive",
      title: "Try it",
      render: () => (
        <Popover>
          <PopoverTrigger asChild>
            <Button leadingIcon="clock">Last hour</Button>
          </PopoverTrigger>
          <PopoverContent title="Time range" closeButton width={280}>
            <div className="flex flex-col gap-3">
              <Input aria-label="From" monospace defaultValue="2026-09-26 11:00" />
              <Input aria-label="To" monospace defaultValue="2026-09-26 12:00" />
              <Button variant="primary" size="sm">
                Apply range
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ),
    },
    {
      id: "deploy-activity",
      title: "Deploy activity",
      render: () => (
        <div className="h-[220px] w-full">
          <Popover open>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <StatusMarker status="deploying" />
                Deploying [ 2 ]
              </Button>
            </PopoverTrigger>
            <PopoverContent
              title="Deploy activity"
              width={320}
              onOpenAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
            >
              <ul className="flex flex-col gap-3">
                {[
                  { name: "api", step: "Building", time: "1m 12s", done: 45 },
                  { name: "worker", step: "Health check", time: "18s", done: 85 },
                ].map((row) => (
                  <li key={row.name} className="flex flex-col gap-[6px]">
                    <span className="flex items-center gap-2">
                      <StatusMarker status="building" />
                      <span className="text-card-title flex-1">{row.name}</span>
                      <span className="text-meta">
                        {row.step} · {row.time}
                      </span>
                    </span>
                    <span
                      role="progressbar"
                      aria-label={`${row.name} ${row.step}`}
                      aria-valuenow={row.done}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="bg-surface-hover block h-[3px]"
                    >
                      <span
                        className="bg-warning block h-full"
                        style={{ width: `${String(row.done)}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      ),
    },
    {
      id: "variable-reference",
      title: "Variable reference, resolved",
      render: () => (
        <div className="h-[200px] w-full">
          <Popover open>
            <PopoverTrigger className="text-code is-hover:text-accent-text">
              {"${{ postgres.DATABASE_URL }}"}
            </PopoverTrigger>
            <PopoverContent
              width={340}
              onOpenAutoFocus={keepFocus}
              avoidCollisions={false}
              className="max-h-none"
              closeButton
              title="DATABASE_URL"
            >
              <div className="flex flex-col gap-2">
                <span className="text-body-secondary">From postgres, in production</span>
                <code className="text-code block truncate">
                  postgresql://app:••••••••@postgres.internal:5432/app
                </code>
                <span className="text-meta">
                  The password is hidden. Reveal it in postgres › Variables.
                </span>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      ),
    },
    {
      id: "scrolling",
      title: "Scrolled content",
      render: () => (
        <div className="h-[260px] w-full">
          <Popover open>
            <PopoverTrigger asChild>
              <Button size="sm" leadingIcon="history">
                Recent events
              </Button>
            </PopoverTrigger>
            <PopoverContent
              title="Recent events"
              width={300}
              className="max-h-none"
              onOpenAutoFocus={keepFocus}
              avoidCollisions={false}
            >
              {/* Long content scrolls in a focusable region so keyboards can scroll it. */}
              <ul
                tabIndex={0}
                aria-label="Recent events"
                className="-mx-3 flex max-h-[160px] flex-col overflow-y-auto px-3"
              >
                {[
                  "api deployed a1b2c3d",
                  "worker restarted after a crash",
                  "postgres backup finished",
                  "web domain shop.acme.dev verified",
                  "api scaled to 2 replicas",
                  "worker deployed 9f8e7d6",
                  "postgres volume grew to 10 GB",
                ].map((event) => (
                  <li key={event} className="text-13 border-border border-b py-2 last:border-b-0">
                    {event}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      ),
    },
  ],
};

export const modalDoc: ComponentDoc = {
  slug: "modal",
  name: "Modal",
  group: "Overlays",
  summary:
    "A focused task over the page: 400 / 560 / 720 px, a scrolling body under a fixed header and footer. A bottom sheet under 640 px.",
  components: ["Modal"],
  examples: [
    { id: "interactive", title: "Try it", render: () => <ModalInteractive /> },
    {
      id: "small",
      title: "Small (400)",
      wide: true,
      render: () => (
        <ModalPreview
          size="sm"
          height={320}
          title="Rename service"
          footer={
            <>
              <Button variant="ghost">Cancel</Button>
              <Button variant="primary">Rename</Button>
            </>
          }
        >
          <Input aria-label="Service name" monospace defaultValue="api" />
        </ModalPreview>
      ),
    },
    {
      id: "medium",
      title: "Medium (560)",
      wide: true,
      render: () => (
        <ModalPreview
          size="md"
          height={360}
          title="Connect a server"
          description="Run this on the VM you want to deploy to. It installs the Lumen agent."
          footer={<Button variant="primary">I ran it</Button>}
        >
          <code className="text-code block truncate">
            curl -fsSL https://get.lumen.dev | sh -s -- --token ••••••••
          </code>
        </ModalPreview>
      ),
    },
    {
      id: "large",
      title: "Large (720)",
      wide: true,
      render: () => (
        <ModalPreview
          size="lg"
          height={360}
          title="Import variables"
          description="Paste a .env file. Existing names are updated; nothing is deleted."
          footer={
            <>
              <Button variant="ghost">Cancel</Button>
              <Button variant="primary">Import 3 variables</Button>
            </>
          }
        >
          <pre
            tabIndex={0}
            className="text-log bg-surface border-border overflow-x-auto border p-3"
          >
            {"DATABASE_URL=${{ postgres.DATABASE_URL }}\nPORT=3000\nNODE_ENV=production"}
          </pre>
        </ModalPreview>
      ),
    },
    {
      id: "scrolling",
      title: "Long content scrolls; header and footer stay",
      wide: true,
      render: () => <ModalScrolling />,
    },
    {
      id: "prevent-close",
      title: "Prevent close: deploy in progress",
      wide: true,
      render: () => (
        <ModalPreview
          size="sm"
          height={300}
          preventClose
          title="Deploying api"
          description="Stay here until the health check passes. Closing is off while it runs."
        >
          <span className="flex items-center gap-2">
            <StatusMarker status="deploying" />
            <span className="text-body">Health check · 18s</span>
          </span>
        </ModalPreview>
      ),
    },
    {
      id: "nested",
      title: "Nested: a confirmation over a modal",
      wide: true,
      render: () => <ModalNested />,
    },
  ],
};

export const confirmDialogDoc: ComponentDoc = {
  slug: "confirm-dialog",
  name: "Confirm dialog",
  group: "Overlays",
  summary:
    "Asks before something that matters. Destructive ones list the consequences and unlock only when the name is typed exactly.",
  components: ["ConfirmDialog"],
  examples: [
    { id: "interactive", title: "Try it", render: () => <ConfirmInteractive /> },
    {
      id: "simple",
      title: "Simple",
      wide: true,
      render: () => (
        <ConfirmPreview
          height={280}
          title="Restart api?"
          description="api restarts on oracle-1. Requests during the restart may fail for a few seconds."
          confirmLabel="Restart"
        />
      ),
    },
    {
      id: "destructive",
      title: "Destructive, name not typed",
      wide: true,
      render: () => (
        <ConfirmWithCheckbox
          height={520}
          variant="destructive"
          title="Delete api?"
          description="This can't be undone."
          consequences={DELETE_CONSEQUENCES}
          confirmText="api"
          confirmLabel="Delete service"
          checkboxLabel="Also delete the volume and its 2.1 GB of data"
        />
      ),
    },
    {
      id: "matched",
      title: "Destructive, name matched",
      wide: true,
      render: () => (
        <ConfirmPreview
          height={440}
          variant="destructive"
          title="Delete api?"
          description="This can't be undone."
          consequences={DELETE_CONSEQUENCES}
          confirmText="api"
          confirmLabel="Delete service"
          defaultTyped="api"
        />
      ),
    },
    {
      id: "rollback",
      title: "Rollback with a checkbox",
      wide: true,
      render: () => (
        <ConfirmWithCheckbox
          height={320}
          title="Roll back api to 9f8e7d6?"
          description="The image from 2 h ago goes live. Current variables stay unless you check this."
          confirmLabel="Roll back"
          checkboxLabel="Also restore variables from that deploy"
        />
      ),
    },
    {
      id: "confirming",
      title: "Confirming",
      wide: true,
      render: () => (
        <ConfirmPreview
          height={280}
          title="Restart api?"
          description="api restarts on oracle-1."
          confirmLabel="Restart"
          loading
        />
      ),
    },
    {
      id: "error",
      title: "Failed, with retry",
      wide: true,
      render: () => (
        <ConfirmPreview
          height={340}
          title="Restart api?"
          description="api restarts on oracle-1."
          confirmLabel="Restart"
          error="oracle-1 didn't answer. Check that the server is online, then try again."
        />
      ),
    },
  ],
};

export const sidePanelDoc: ComponentDoc = {
  slug: "side-panel",
  name: "Side panel",
  group: "Overlays",
  summary:
    "The right-hand inspector. Beside the canvas at 1280 px and up, over it below that, a full-screen sheet under 768 px. Drag or arrow-key the left edge to resize; the width is remembered.",
  components: ["SidePanel"],
  examples: [
    {
      id: "interactive",
      title: "Resizable and remembered",
      description: "Drag the left edge, or focus it and use the arrow keys, Home and End.",
      wide: true,
      render: () => <SidePanelInteractive />,
    },
    {
      id: "min",
      title: "At the minimum, 480",
      wide: true,
      render: () => <SidePanelPreview width={480} mode="docked" />,
    },
    {
      id: "max",
      title: "At the maximum, 880",
      wide: true,
      render: () => <SidePanelPreview width={880} mode="docked" />,
    },
    {
      id: "resizing",
      title: "Resizing",
      wide: true,
      render: () => <SidePanelPreview width={560} mode="docked" resizing />,
    },
    {
      id: "overlay",
      title: "Overlay mode (1024–1279)",
      wide: true,
      render: () => <SidePanelPreview width={560} mode="overlay" />,
    },
    {
      id: "sheet",
      title: "Sheet mode (under 768)",
      render: () => <SidePanelPreview mode="sheet" height={560} />,
    },
  ],
};

export const sheetDoc: ComponentDoc = {
  slug: "sheet",
  name: "Sheet",
  group: "Overlays",
  summary:
    "A panel that rises from the bottom edge on phones. Drag it down to lower or dismiss; swipe the content sideways to change tabs.",
  components: ["Sheet"],
  examples: [
    { id: "interactive", title: "Try it", render: () => <SheetInteractive /> },
    {
      id: "half",
      title: "Bottom, 50 %: deploy row actions",
      render: () => <SheetPreview />,
    },
    {
      id: "full-tabs",
      title: "Full, with tabs: the phone inspector",
      render: () => <SheetPreview side="full" withTabs />,
    },
    {
      id: "tall",
      title: "Bottom, 90 %",
      render: () => <SheetPreview defaultSnap={1} />,
    },
    {
      id: "dragging",
      title: "Dragging",
      render: () => <SheetPreview defaultSnap={1} dragOffset={96} />,
    },
  ],
};
