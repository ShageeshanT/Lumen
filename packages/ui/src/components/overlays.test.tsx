import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { CommandPalette, highlightMatch, type CommandGroup } from "./command-palette";
import { ConfirmDialog } from "./confirm-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  LONG_PRESS_MS,
} from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Modal } from "./modal";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Sheet } from "./sheet";
import { PANEL_WIDTH_KEY, SidePanel } from "./side-panel";
import { TooltipProvider } from "./tooltip";

function withTooltips(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

function press(target: Element | Window, key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(target, { key, ...init });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Modal", () => {
  function Harness({ preventClose = false }: { preventClose?: boolean }) {
    return (
      <Modal
        title="Review 3 changes"
        description="These deploy together."
        preventClose={preventClose}
        trigger={<Button>Review changes</Button>}
        footer={<Button variant="primary">Deploy changes</Button>}
      >
        <input aria-label="Note" />
      </Modal>
    );
  }

  it("opens as a labelled modal dialog and focuses the first control in the body", async () => {
    withTooltips(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    const dialog = await screen.findByRole("dialog", { name: "Review 3 changes" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("These deploy together.");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveFocus();
  });

  it("traps Tab inside and wraps from the last control to the first", async () => {
    withTooltips(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    const dialog = await screen.findByRole("dialog");
    const deploy = within(dialog).getByRole("button", { name: "Deploy changes" });
    act(() => {
      deploy.focus();
    });
    press(deploy, "Tab");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(deploy);
  });

  it("closes on Escape and returns focus to the opener", async () => {
    withTooltips(<Harness />);
    const trigger = screen.getByRole("button", { name: "Review changes" });
    act(() => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    press(dialog, "Escape");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  it("ignores Escape and hides Close while preventClose is set", async () => {
    withTooltips(<Harness preventClose />);
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    press(dialog, "Escape");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("simple dialogs focus Cancel, the safe default", async () => {
    withTooltips(
      <ConfirmDialog
        defaultOpen
        title="Restart api?"
        confirmLabel="Restart"
        onConfirm={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Restart api?" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("destructive: an alertdialog that unlocks only on an exact, case-sensitive match", async () => {
    const onConfirm = vi.fn();
    withTooltips(
      <ConfirmDialog
        defaultOpen
        variant="destructive"
        title="Delete api?"
        consequences={["api stops and its 12 deployments are deleted"]}
        confirmText="api"
        onConfirm={onConfirm}
      />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete api?" });
    expect(dialog).toHaveAccessibleDescription(/12 deployments are deleted/);
    const input = within(dialog).getByRole("textbox", { name: "Type api to confirm" });
    expect(input).toHaveFocus();
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "API" } });
    expect(confirm).toBeDisabled();
    fireEvent.submit(input);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "api" } });
    expect(confirm).toBeEnabled();
    // Enter in the field submits the form.
    fireEvent.submit(input);
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("shows a spinner while the promise runs and an inline error with retry when it fails", async () => {
    let reject: (reason: Error) => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    withTooltips(
      <ConfirmDialog
        defaultOpen
        title="Restart api?"
        confirmLabel="Restart"
        onConfirm={onConfirm}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restart" }));
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Restart" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });
    act(() => {
      reject(new Error("oracle-1 didn't answer."));
    });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("oracle-1 didn't answer.");
    expect(within(dialog).getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("closes on Escape", async () => {
    const onOpenChange = vi.fn();
    withTooltips(
      <ConfirmDialog
        defaultOpen
        onOpenChange={onOpenChange}
        title="Restart api?"
        onConfirm={() => undefined}
      />,
    );
    press(await screen.findByRole("dialog"), "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

const GROUPS: CommandGroup[] = [
  {
    heading: "Services",
    items: [
      { id: "svc-api", label: "api" },
      { id: "svc-web", label: "web" },
    ],
  },
  {
    heading: "Actions",
    items: [
      {
        id: "act-deploy",
        label: "Deploy",
        groups: [{ heading: "Deploy which service?", items: [{ id: "d-api", label: "api" }] }],
      },
    ],
  },
];

describe("CommandPalette", () => {
  function Harness({ onRun }: { onRun?: () => void }) {
    const [open, setOpen] = useState(false);
    const groups = GROUPS.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        ...(onRun === undefined ? {} : { onSelect: onRun }),
      })),
    }));
    return (
      <>
        <button type="button">Before</button>
        <CommandPalette open={open} onOpenChange={setOpen} groups={groups} hotkey />
      </>
    );
  }

  it("⌘K / Ctrl+K toggles a named dialog and focuses the search", async () => {
    render(<Harness />);
    press(window, "k", { ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    expect(within(dialog).getByRole("combobox")).toHaveFocus();
    press(window, "k", { metaKey: true });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("filters, says when nothing matches, and runs the item on Enter", async () => {
    const onRun = vi.fn();
    render(<Harness onRun={onRun} />);
    press(window, "k", { ctrlKey: true });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "kubernetes" } });
    expect(await screen.findByText("No matches for “kubernetes”")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "web" } });
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1);
    });
    press(input, "Enter");
    expect(onRun).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("opens nested pages; Backspace on an empty query and Escape step back before closing", async () => {
    render(<Harness />);
    press(window, "k", { ctrlKey: true });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "deploy" } });
    press(input, "Enter");
    expect(await screen.findByText("Deploy which service?")).toBeInTheDocument();
    press(input, "Backspace");
    await waitFor(() => {
      expect(screen.queryByText("Deploy which service?")).toBeNull();
    });

    fireEvent.change(input, { target: { value: "deploy" } });
    press(input, "Enter");
    await screen.findByText("Deploy which service?");
    press(input, "Escape");
    await waitFor(() => {
      expect(screen.queryByText("Deploy which service?")).toBeNull();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    press(input, "Escape");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("shows loading rows as a busy status", () => {
    render(<CommandPalette open onOpenChange={() => undefined} groups={GROUPS} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading results");
  });

  it("highlights the characters that match", () => {
    const { container } = render(<span>{highlightMatch("Restart a service", "rst")}</span>);
    expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
      "R",
      "st",
    ]);
    expect(highlightMatch("api", "")).toBe("api");
    expect(highlightMatch("api", "xyz")).toBe("api");
  });
});

describe("DropdownMenu", () => {
  it("opens from the keyboard, exposes menu items and returns focus on Escape", async () => {
    withTooltips(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon="terminal">Open shell</DropdownMenuItem>
          <DropdownMenuItem icon="trash-2" destructive>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Actions" });
    act(() => {
      trigger.focus();
    });
    press(trigger, "Enter");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-destructive",
      "true",
    );
    press(menu, "Escape");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });
});

describe("ContextMenu", () => {
  function Harness() {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button type="button">api node</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem icon="rotate-cw">Redeploy</ContextMenuItem>
          <ContextMenuItem icon="trash-2" destructive>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  it("opens with Shift+F10 on the focused element", async () => {
    render(<Harness />);
    const node = screen.getByRole("button", { name: "api node" });
    press(node, "F10", { shiftKey: true });
    expect(await screen.findByRole("menuitem", { name: "Redeploy" })).toBeInTheDocument();
  });

  it("opens with the context-menu key", async () => {
    render(<Harness />);
    press(screen.getByRole("button", { name: "api node" }), "ContextMenu");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  describe("long-press", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("opens after 500 ms of touch, not before", () => {
      render(<Harness />);
      const node = screen.getByRole("button", { name: "api node" });
      fireEvent.pointerDown(node, { pointerType: "touch", clientX: 10, clientY: 10, button: 0 });
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS - 50);
      });
      expect(screen.queryByRole("menu")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });
  });
});

describe("Popover", () => {
  it("is a dialog named by its title; Escape closes and returns focus", async () => {
    withTooltips(
      <Popover>
        <PopoverTrigger asChild>
          <Button>Deploying [ 2 ]</Button>
        </PopoverTrigger>
        <PopoverContent title="Deploy activity" closeButton>
          <p>api · Building</p>
        </PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Deploying [ 2 ]" });
    act(() => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Deploy activity" });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    // Focus landed on Close, whose tooltip is the top layer: the first Escape
    // hides the tooltip, the second closes the popover.
    press(document.activeElement ?? dialog, "Escape");
    press(document.activeElement ?? dialog, "Escape");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });
});

describe("SidePanel", () => {
  function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
    const [open, setOpen] = useState(initiallyOpen);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Open inspector
        </button>
        <SidePanel open={open} onOpenChange={setOpen} title="api" mode="docked">
          <p>Deployments</p>
        </SidePanel>
      </>
    );
  }

  function open() {
    const opener = screen.getByRole("button", { name: "Open inspector" });
    act(() => {
      opener.focus();
    });
    fireEvent.click(opener);
    return opener;
  }

  it("is a labelled complementary region, not a modal dialog, and focuses its title", async () => {
    withTooltips(<Harness />);
    open();
    const panel = await screen.findByRole("complementary", { name: "Service inspector" });
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(panel).getByRole("heading", { name: "api" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    withTooltips(<Harness />);
    const opener = open();
    const panel = await screen.findByRole("complementary");
    press(panel, "Escape");
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).toBeNull();
    });
    expect(opener).toHaveFocus();
  });

  it("resizes from the keyboard between 480 and 880 and persists the width", async () => {
    withTooltips(<Harness initiallyOpen />);
    const handle = await screen.findByRole("separator", { name: "Resize panel" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "560");
    expect(handle).toHaveAttribute("aria-valuemin", "480");
    expect(handle).toHaveAttribute("aria-valuemax", "880");

    press(handle, "ArrowLeft");
    expect(handle).toHaveAttribute("aria-valuenow", "576");
    expect(window.localStorage.getItem(PANEL_WIDTH_KEY)).toBe("576");
    press(handle, "ArrowRight");
    press(handle, "ArrowRight");
    expect(handle).toHaveAttribute("aria-valuenow", "544");
    press(handle, "End");
    expect(handle).toHaveAttribute("aria-valuenow", "880");
    press(handle, "ArrowLeft");
    expect(handle).toHaveAttribute("aria-valuenow", "880");
    press(handle, "Home");
    expect(handle).toHaveAttribute("aria-valuenow", "480");
    expect(window.localStorage.getItem(PANEL_WIDTH_KEY)).toBe("480");
  });

  it("drags the edge: left widens, and the width is saved on release", async () => {
    withTooltips(<Harness initiallyOpen />);
    const handle = await screen.findByRole("separator");
    fireEvent.pointerDown(handle, { clientX: 800, button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 });
    expect(handle).toHaveAttribute("aria-valuenow", "660");
    expect(document.body.style.cursor).toBe("col-resize");
    fireEvent.pointerUp(handle, { clientX: 700, pointerId: 1 });
    expect(window.localStorage.getItem(PANEL_WIDTH_KEY)).toBe("660");
    expect(document.body.style.cursor).toBe("");
  });

  it("reads the remembered width", async () => {
    window.localStorage.setItem(PANEL_WIDTH_KEY, "720");
    withTooltips(<Harness initiallyOpen />);
    const panel = await screen.findByRole("complementary");
    expect(panel.style.width).toBe("720px");
  });

  it("becomes a modal dialog in overlay mode", async () => {
    withTooltips(
      <SidePanel open onOpenChange={() => undefined} title="api" mode="overlay">
        <p>Deployments</p>
      </SidePanel>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Service inspector" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});

describe("Sheet", () => {
  it("is a dialog with a hidden-until-focused Close button; Escape closes", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet defaultOpen onOpenChange={onOpenChange} title="Deployment a1b2c3d">
        <button type="button">Redeploy</button>
      </Sheet>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Deployment a1b2c3d" });
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
    press(dialog, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("dismisses when dragged down fast", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet defaultOpen onOpenChange={onOpenChange} title="Deployment a1b2c3d">
        <p>Actions</p>
      </Sheet>,
    );
    const title = await screen.findByText("Deployment a1b2c3d");
    const grab = title.closest("div.cursor-grab");
    expect(grab).not.toBeNull();
    if (grab !== null) {
      fireEvent.pointerDown(grab, { clientY: 100, button: 0, pointerId: 1, timeStamp: 0 });
      fireEvent.pointerMove(grab, { clientY: 300, pointerId: 1 });
      fireEvent.pointerUp(grab, { clientY: 300, pointerId: 1 });
    }
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("swipes between tabs", async () => {
    function Harness() {
      const [tab, setTab] = useState("deployments");
      return (
        <Sheet
          defaultOpen
          side="full"
          title="api"
          tabs={{
            items: [
              { value: "deployments", label: "Deployments" },
              { value: "variables", label: "Variables" },
            ],
            value: tab,
            onValueChange: setTab,
            "aria-label": "Service sections",
          }}
        >
          <p>Panel: {tab}</p>
        </Sheet>
      );
    }
    render(<Harness />);
    const body = (await screen.findByText(/Panel:/)).parentElement;
    expect(body).not.toBeNull();
    if (body !== null) {
      fireEvent.pointerDown(body, { clientX: 300, clientY: 100, timeStamp: 0 });
      fireEvent.pointerUp(body, { clientX: 150, clientY: 105, timeStamp: 100 });
    }
    expect(screen.getByText("Panel: variables")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Variables" })).toHaveAttribute("aria-selected", "true");
  });
});
