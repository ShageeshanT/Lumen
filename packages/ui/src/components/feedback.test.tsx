import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LUMEN_ERROR_CODES, makeError, type LumenError } from "@lumen/shared/errors";

import { Alert } from "./alert";
import { AvatarStack, avatarStackLabel } from "./avatar-stack";
import { EmptyState } from "./empty-state";
import { ErrorCard, supportReport } from "./error-card";
import { ProgressSteps, type ProgressStep } from "./progress-steps";
import { activeToasts, Toast, Toaster, toast } from "./toast";
import { TooltipProvider } from "./tooltip";

function mockClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

describe("Toaster and toast()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
    vi.useRealTimers();
  });

  const mount = () =>
    render(
      <TooltipProvider>
        <Toaster />
      </TooltipProvider>,
    );

  it("renders a polite live region that announces additions", () => {
    mount();
    const region = screen.getByRole("region", { name: "Notifications" });
    const list = region.querySelector("ol");
    expect(list).toHaveAttribute("aria-live", "polite");
    expect(list).toHaveAttribute("aria-relevant", "additions");
  });

  it("shows a toast and uses role=alert only for danger", () => {
    mount();
    act(() => {
      toast({ title: "Variables saved", variant: "success" });
      toast({ title: "Deploy failed", variant: "danger" });
    });
    expect(screen.getByText("Variables saved").closest("li")).not.toHaveAttribute("role");
    expect(screen.getByRole("alert")).toHaveTextContent("Deploy failed");
  });

  it("keeps three at most: the fourth pushes the oldest out", () => {
    mount();
    act(() => {
      for (const title of ["One", "Two", "Three", "Four"]) {
        toast({ title });
      }
    });
    expect(activeToasts().map((record) => record.title)).toEqual(["Two", "Three", "Four"]);
  });

  it("closes after 8 seconds, and hovering pauses the timer", () => {
    mount();
    act(() => {
      toast({ title: "Hover me" });
      toast({ title: "Leave me" });
    });
    const hovered = screen.getByText("Hover me").closest("li");
    expect(hovered).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.pointerEnter(hovered as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(activeToasts().map((record) => record.title)).toEqual(["Hover me"]);
    fireEvent.pointerLeave(hovered as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(activeToasts()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(activeToasts()).toHaveLength(0);
  });

  it("pauses while the window is blurred", () => {
    mount();
    act(() => {
      toast({ title: "Stay" });
    });
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(activeToasts()).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(activeToasts()).toHaveLength(0);
  });

  it("F8 focuses the newest toast and Escape closes it", () => {
    mount();
    act(() => {
      toast({ title: "Older" });
      toast({ title: "Newest" });
    });
    fireEvent.keyDown(window, { key: "F8" });
    const newest = screen.getByText("Newest").closest("li");
    expect(newest).toHaveFocus();
    fireEvent.keyDown(newest as HTMLElement, { key: "Escape" });
    expect(activeToasts().map((record) => record.title)).toEqual(["Older"]);
  });

  it("Undo runs the callback and closes the toast", () => {
    mount();
    const undo = vi.fn();
    act(() => {
      toast({ title: "Variable deleted", undo });
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(activeToasts()).toHaveLength(0);
  });

  it("draws a static timer bar for docs", () => {
    const { container } = render(
      <Toast
        toast={{ id: "a", title: "Saved", variant: "success", duration: 8000 }}
        progress={0.5}
      />,
    );
    expect(container.querySelector("[data-toast-timer]")).toHaveStyle({ transform: "scaleX(0.5)" });
  });
});

describe("Alert", () => {
  it("announces info politely and warnings urgently, only when asked", () => {
    const { rerender } = render(<Alert announce>Saved</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    rerender(
      <Alert announce variant="danger">
        Failed
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
    rerender(<Alert variant="danger">Static</Alert>);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dismisses unless critical", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <Alert dismissible onDismiss={onDismiss}>
          Preview environments are on
        </Alert>
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Preview environments are on")).toBeNull();
    rerender(
      <TooltipProvider>
        <Alert dismissible critical variant="danger">
          Server offline
        </Alert>
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("renders an action as a button or a link", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Alert action={{ label: "Add them", onClick }}>Found</Alert>);
    fireEvent.click(screen.getByRole("button", { name: "Add them" }));
    expect(onClick).toHaveBeenCalled();
    rerender(<Alert action={{ label: "Review", href: "#staged" }}>Staged</Alert>);
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "#staged");
  });
});

const T0 = Date.UTC(2026, 8, 26, 12);
const STEPS: ProgressStep[] = [
  { id: "q", label: "Queued", state: "done", startedAt: T0, finishedAt: T0 + 2000 },
  { id: "b", label: "Building", state: "done", startedAt: T0 + 2000, finishedAt: T0 + 50_000 },
  { id: "d", label: "Deploying", state: "active", startedAt: T0 + 50_000 },
  { id: "h", label: "Health check", state: "pending" },
];

describe("ProgressSteps", () => {
  it("is an ordered list with aria-current on the active step", () => {
    render(<ProgressSteps steps={STEPS} now={T0 + 62_000} />);
    const list = screen.getByRole("list", { name: "Deployment progress" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(items[1]).toHaveTextContent("48s");
    expect(items[2]).toHaveTextContent("12s");
  });

  it("announces the step as words", () => {
    render(<ProgressSteps steps={STEPS} now={T0 + 62_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("Deploying, step 3 of 4");
  });

  it("ticks the active duration every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 60_000);
    render(<ProgressSteps steps={STEPS} />);
    const active = screen.getAllByRole("listitem")[2];
    expect(active).toHaveTextContent("10s");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(active).toHaveTextContent("13s");
    vi.useRealTimers();
  });

  it("marks failure and reports the total when everything is done", () => {
    const failed = STEPS.map((step) =>
      step.id === "d" ? { ...step, state: "failed" as const, finishedAt: T0 + 55_000 } : step,
    );
    render(<ProgressSteps steps={failed} now={T0} />);
    expect(screen.getByRole("status")).toHaveTextContent("Deploying failed, step 3 of 4");
  });
});

describe("EmptyState", () => {
  it("is a region named by its title with one action", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No logs yet"
        description="Your app hasn't printed anything since this deploy started."
        action={{ label: "Open docs", onClick }}
        secondary={{ label: "How logging works", href: "#logs" }}
      />,
    );
    expect(screen.getByRole("region", { name: "No logs yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open docs" }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "How logging works" })).toBeInTheDocument();
  });
});

describe("ErrorCard", () => {
  it.each(LUMEN_ERROR_CODES)("renders the %s catalog entry", (code) => {
    const error = makeError(code, { port: 443, serverName: "oracle-1", memoryMb: 512 });
    const onAction = vi.fn();
    // Command actions carry a copy button with a tooltip; the app mounts the provider at the root.
    render(
      <TooltipProvider>
        <ErrorCard error={error} onAction={onAction} url="https://lumen.test/p" />
      </TooltipProvider>,
    );
    const card = screen.getByRole("region", { name: error.title });
    expect(card).toHaveTextContent(error.explanation);
    expect(card).toHaveTextContent(error.fix);
    const { action } = error;
    if (action.kind === "button") {
      fireEvent.click(within(card).getByRole("button", { name: action.label }));
      expect(onAction).toHaveBeenCalledWith(action.actionId);
    } else if (action.kind === "link") {
      expect(within(card).getByRole("link", { name: action.label })).toHaveAttribute(
        "href",
        action.href,
      );
    }
  });

  it("folds the raw error and labels it", () => {
    const error = makeError("OOM_KILLED", { raw: "exit code 137", supportId: "sup_1" });
    render(<ErrorCard error={error} url="" />);
    const toggle = screen.getByRole("button", { name: "Show raw error" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Raw error details")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide raw error" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Raw error details")).toHaveTextContent("exit code 137");
    expect(screen.getByLabelText("Raw error details")).toHaveAttribute("tabindex", "0");
  });

  it("copies a support report with code, title, id, page and raw details", async () => {
    const writeText = mockClipboard();
    const error = makeError("CRASH_LOOP", { raw: "exit 1", supportId: "sup_9" });
    render(<ErrorCard error={error} url="https://lumen.test/p/shop" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy for support" }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(supportReport(error, "https://lumen.test/p/shop"));
    const report = supportReport(error, "https://lumen.test/p/shop");
    for (const part of [
      "CRASH_LOOP",
      error.title,
      "sup_9",
      "https://lumen.test/p/shop",
      "exit 1",
    ]) {
      expect(report).toContain(part);
    }
  });

  it("announces itself when it appears after an action, and renders commands to copy", () => {
    const error: LumenError = {
      ...makeError("AGENT_OFFLINE"),
      action: { kind: "command", label: "Reinstall command", command: "curl lumen | sh" },
    };
    render(
      <TooltipProvider>
        <ErrorCard error={error} announce />
      </TooltipProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(error.title);
    expect(screen.getByDisplayValue("curl lumen | sh")).toBeInTheDocument();
  });

  it("puts title, fix and action in one row when compact", () => {
    render(<ErrorCard error={makeError("CRASH_LOOP")} compact />);
    const card = screen.getByRole("region");
    expect(card).toHaveTextContent(makeError("CRASH_LOOP").fix);
    expect(card).not.toHaveTextContent(makeError("CRASH_LOOP").explanation);
  });
});

describe("AvatarStack", () => {
  const people = ["Ana", "Ben", "Chen", "Dana", "Eli", "Farah"].map((name) => ({ name }));

  it("shows four, then +N, and names the group", () => {
    render(<AvatarStack people={people} />);
    const group = screen.getByRole("group", { name: "Members: Ana, Ben, Chen, Dana, +2 more" });
    expect(group).toHaveTextContent("+2");
    expect(avatarStackLabel(people.slice(0, 2), 4)).toBe("Members: Ana, Ben");
  });

  it("renders nothing for nobody", () => {
    const { container } = render(<AvatarStack people={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("makes each avatar focusable when interactive", () => {
    render(
      <TooltipProvider>
        <AvatarStack people={people.slice(0, 2)} interactive />
      </TooltipProvider>,
    );
    const group = screen.getByRole("group");
    expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(2);
  });
});
