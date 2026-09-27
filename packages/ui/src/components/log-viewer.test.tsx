import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  findMatches,
  formatLogTime,
  jsonOf,
  LogViewer,
  splitMatches,
  type LogLine,
} from "./log-viewer";
import { fiftyThousandLines, JSON_LINES, LOG_BASE_TIME, makeLogLines } from "./log-viewer.fixtures";
import { TooltipProvider } from "./tooltip";

// jsdom has no layout: give every element a 360 px box so the virtualizer has a window.
const sizes = {
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight"),
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 360,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 960,
  });
  Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get: () => 360 });
});

afterAll(() => {
  for (const [name, descriptor] of Object.entries(sizes)) {
    if (descriptor !== undefined) {
      const target = name === "clientHeight" ? Element.prototype : HTMLElement.prototype;
      Object.defineProperty(target, name, descriptor);
    }
  }
});

function rows() {
  return screen.getAllByRole("listitem");
}

describe("LogViewer virtualization", () => {
  it("renders only a window of rows for 50,000 lines", () => {
    render(<LogViewer lines={fiftyThousandLines()} timeZone="UTC" defaultFollowOutput={false} />);
    const rendered = rows().length;
    // 360 px / 20 px rows = 18 visible, plus overscan on each side.
    expect(rendered).toBeGreaterThan(10);
    expect(rendered).toBeLessThan(80);
    expect(screen.getByRole("list", { name: "Logs" })).toBeInTheDocument();
  });

  it("sizes the scroll area for every line", () => {
    const { container } = render(
      <LogViewer lines={makeLogLines(1000)} defaultFollowOutput={false} />,
    );
    const sizer = container.querySelector<HTMLElement>('[role="list"] > div');
    expect(sizer?.style.height).toBe("20000px");
  });

  it("uses 18 px rows when dense", () => {
    const { container } = render(
      <LogViewer lines={makeLogLines(100)} dense defaultFollowOutput={false} />,
    );
    const sizer = container.querySelector<HTMLElement>('[role="list"] > div');
    expect(sizer?.style.height).toBe("1800px");
  });
});

describe("LogViewer lines", () => {
  const lines: LogLine[] = [
    { id: "a", ts: LOG_BASE_TIME, text: "\u001b[32mready\u001b[0m on :3000", level: "info" },
    { id: "b", ts: LOG_BASE_TIME + 5, text: "boom", level: "error", source: "stderr" },
  ];

  it("puts the timestamp and level in each line's accessible text", () => {
    render(<LogViewer lines={lines} timeZone="UTC" />);
    const [first, second] = rows();
    expect(first).toHaveTextContent("14:02:00.000INF (info)ready on :3000");
    expect(second).toHaveTextContent("ERR (error)");
    expect(second).toHaveAttribute("data-source", "stderr");
  });

  it("renders ANSI colors as token classes, never as markup", () => {
    render(<LogViewer lines={lines} timeZone="UTC" />);
    const ready = screen.getByText("ready");
    expect(ready).toHaveClass("text-success-text");
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows the empty and loading states", () => {
    const { unmount } = render(<LogViewer lines={[]} />);
    expect(screen.getByText("No logs yet")).toBeInTheDocument();
    unmount();
    render(<LogViewer lines={[]} loading />);
    expect(screen.getByRole("status", { name: "Logs, loading" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows the offline banner", () => {
    render(<LogViewer lines={lines} timeZone="UTC" offline={{ lastLineAt: LOG_BASE_TIME }} />);
    expect(screen.getByText("Server offline — showing logs up to 14:02")).toBeInTheDocument();
  });
});

describe("LogViewer search", () => {
  it("counts and highlights matches", () => {
    render(
      <LogViewer lines={makeLogLines(16)} highlight="econnrefused" defaultFollowOutput={false} />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(document.querySelectorAll("mark")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Next match" })).toBeEnabled();
  });

  it("says when nothing matches", () => {
    render(<LogViewer lines={makeLogLines(8)} highlight="zzz" />, { wrapper: TooltipProvider });
    expect(screen.getByText("No matches for “zzz”")).toBeInTheDocument();
  });
});

describe("LogViewer follow mode", () => {
  it("pauses on Space, shows the jump pill, and resumes on End", () => {
    const onFollow = vi.fn();
    render(<LogViewer lines={makeLogLines(200)} live onFollowOutputChange={onFollow} />);
    const list = screen.getByRole("list", { name: "Logs" });
    fireEvent.keyDown(list, { key: " " });
    expect(onFollow).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(list, { key: "End" });
    expect(onFollow).toHaveBeenLastCalledWith(true);
  });

  it("offers Jump to live while paused with lines below, and it resumes following", () => {
    const onJump = vi.fn();
    const { container } = render(
      <LogViewer
        lines={makeLogLines(200)}
        live
        defaultFollowOutput={false}
        newSinceIndex={150}
        onJumpToLive={onJump}
      />,
    );
    const list = screen.getByRole("list", { name: "Logs" });
    // Simulate the reader sitting at the top of a tall list.
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 4000 });
    list.scrollTop = 0;
    fireEvent.scroll(list);
    const jump = screen.getByRole("button", { name: "Jump to live" });
    fireEvent.click(jump);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild).toHaveAttribute("data-following", "true");
  });
});

describe("LogViewer keyboard and JSON", () => {
  it("moves a roving focus with the arrows and expands JSON with Enter", () => {
    vi.useFakeTimers();
    render(<LogViewer lines={JSON_LINES} timeZone="UTC" defaultFollowOutput={false} />);
    const list = screen.getByRole("list", { name: "Logs" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    act(() => {
      vi.runAllTimers();
    });
    expect(rows()[0]).toHaveClass("bg-surface-hover");
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();
    expect(screen.getByText("duration_ms:")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("copies the focused line with ⌘/Ctrl+C", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<LogViewer lines={makeLogLines(4)} defaultFollowOutput={false} />);
    const list = screen.getByRole("list", { name: "Logs" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "c", ctrlKey: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("#0 [builder 1/5] RUN pnpm install --frozen-lockfile");
    expect(await screen.findAllByText("Line copied")).not.toHaveLength(0);
  });

  it("calls onFindShortcut for ⌘/Ctrl+F", () => {
    const onFind = vi.fn();
    render(<LogViewer lines={makeLogLines(4)} onFindShortcut={onFind} />);
    fireEvent.keyDown(screen.getByRole("list", { name: "Logs" }), { key: "f", metaKey: true });
    expect(onFind).toHaveBeenCalledTimes(1);
  });
});

describe("log helpers", () => {
  it("formats timestamps as HH:mm:ss.SSS", () => {
    expect(formatLogTime(Date.parse("2026-09-26T14:02:07.093Z"), "UTC")).toBe("14:02:07.093");
    expect(formatLogTime("not a date", "UTC")).toBe("--:--:--.---");
  });

  it("detects JSON object lines only", () => {
    expect(jsonOf({ id: "1", ts: 0, text: '{"a":1}' })).toEqual({ value: { a: 1 } });
    expect(jsonOf({ id: "2", ts: 0, text: "[1,2]" })).toBeNull();
    expect(jsonOf({ id: "3", ts: 0, text: "{not json}" })).toBeNull();
    expect(jsonOf({ id: "4", ts: 0, text: "x", json: { b: 2 } })).toEqual({ value: { b: 2 } });
  });

  it("splits and counts matches case-insensitively", () => {
    expect(splitMatches("Error: error", "error")).toEqual([
      { text: "Error", match: true },
      { text: ": ", match: false },
      { text: "error", match: true },
    ]);
    const lines = [
      { id: "1", ts: 0, text: "a b a" },
      { id: "2", ts: 0, text: "c" },
      { id: "3", ts: 0, text: "\u001b[31mA\u001b[0m" },
    ];
    expect(findMatches(lines, "a")).toEqual({ count: 3, lineIndexes: [0, 2] });
  });
});
