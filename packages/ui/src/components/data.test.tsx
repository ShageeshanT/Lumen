import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  alignSeries,
  Chart,
  chartSummary,
  describeRange,
  formatChartValue,
  niceTicks,
  timeTicks,
  type ChartSeries,
} from "./chart";
import { ChartSyncGroup } from "./chart-sync";
import { CodeBlock, tokenizeLine } from "./code-block";
import { DataTable, type DataTableColumn } from "./data-table";
import { describeChange, DiffViewer, type DiffGroup } from "./diff-viewer";
import { TerminalFrame } from "./terminal-frame";
import { TooltipProvider } from "./tooltip";

interface Row {
  id: string;
  name: string;
  size: number;
}

const ROWS: Row[] = [
  { id: "b", name: "beta", size: 20 },
  { id: "a", name: "alpha", size: 300 },
  { id: "c", name: "gamma", size: 5 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", sortable: true, value: (row) => row.name },
  {
    id: "size",
    header: "Size",
    sortable: true,
    align: "right",
    tabular: true,
    value: (row) => row.size,
  },
  { id: "note", header: "Note", cell: () => "—" },
];

function names(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("DataTable", () => {
  it("names the table and marks only sortable headers with aria-sort", () => {
    render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowKey={(row) => row.id} />);
    const table = screen.getByRole("table", { name: "Files" });
    expect(table).toHaveAttribute("aria-rowcount", "4");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers[0]).toHaveAttribute("aria-sort", "none");
    expect(headers[2]).not.toHaveAttribute("aria-sort");
  });

  it("sorts with real header buttons: ascending, then descending", () => {
    render(<DataTable label="Files" columns={COLUMNS} data={ROWS} rowKey={(row) => row.id} />);
    expect(names()).toEqual(["beta", "alpha", "gamma"]);
    const sizeButton = screen.getByRole("button", { name: /Size/ });
    fireEvent.click(sizeButton);
    const sizeHeader = sizeButton.closest("th");
    const direction = sizeHeader?.getAttribute("aria-sort");
    expect(direction === "ascending" || direction === "descending").toBe(true);
    const first = names();
    fireEvent.click(sizeButton);
    expect(names()).toEqual([...first].reverse());
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(screen.getByRole("button", { name: /Name/ }).closest("th")).not.toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("reports controlled sorting changes", () => {
    const onSortingChange = vi.fn();
    render(
      <DataTable
        label="Files"
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        sorting={[{ id: "size", desc: true }]}
        onSortingChange={onSortingChange}
      />,
    );
    expect(names()).toEqual(["alpha", "beta", "gamma"]);
    expect(screen.getByRole("button", { name: /Size/ }).closest("th")).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: false }]);
  });

  it("selects rows with checkboxes and marks them aria-selected", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <DataTable
        label="Files"
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        selectable
        selectedKeys={["a"]}
        onSelectionChange={onSelectionChange}
      />,
    );
    const alphaRow = screen.getByRole("checkbox", { name: "Select alpha" }).closest("tr");
    expect(alphaRow).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("checkbox", { name: "Select beta" }).closest("tr")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select beta" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
    rerender(
      <DataTable
        label="Files"
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        selectable
        selectedKeys={["a", "b", "c"]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("is busy with eight skeleton rows while loading", () => {
    render(
      <DataTable label="Files" columns={COLUMNS} data={[]} rowKey={(row) => row.id} loading />,
    );
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(within(table).getAllByRole("row")).toHaveLength(9);
  });

  it("renders the empty slot and the error row with Retry", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <DataTable
        label="Files"
        columns={COLUMNS}
        data={[]}
        rowKey={(row) => row.id}
        empty={<p>No files yet</p>}
      />,
    );
    expect(screen.getByText("No files yet")).toBeInTheDocument();
    rerender(
      <DataTable
        label="Files"
        columns={COLUMNS}
        data={[]}
        rowKey={(row) => row.id}
        error={{ message: "Couldn't load files.", onRetry }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load files.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("virtualizes long lists: 5,000 rows, only a window in the DOM", () => {
    const many = Array.from({ length: 5000 }, (_, index) => ({
      id: String(index),
      name: `file-${String(index)}`,
      size: index,
    }));
    // jsdom has no layout: give the scroll container a real-looking 480 px viewport.
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(480);
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1000);
    render(
      <DataTable label="Files" columns={COLUMNS} data={many} rowKey={(row) => row.id} dense />,
    );
    height.mockRestore();
    width.mockRestore();
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-rowcount", "5001");
    const rendered = table.querySelectorAll("tbody tr[data-row-index]");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    expect(rendered[0]).toHaveAttribute("aria-rowindex", "2");
  });

  it("moves between rows with arrows (roving tabindex), Enter opens, Shift+F10 opens actions", async () => {
    const onRowClick = vi.fn();
    const onSelect = vi.fn();
    render(
      <DataTable
        label="Files"
        columns={COLUMNS}
        data={ROWS}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        onRowClick={onRowClick}
        rowActions={() => [{ label: "Delete", onSelect }]}
      />,
    );
    const rows = screen.getByRole("table").querySelectorAll<HTMLElement>("tbody tr");
    const [first, second] = [rows[0], rows[1]];
    if (first === undefined || second === undefined) {
      throw new Error("rows missing");
    }
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");
    act(() => {
      first.focus();
    });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    await waitFor(() => {
      expect(second).toHaveFocus();
    });
    expect(second).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(second, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.keyDown(second, { key: "F10", shiftKey: true });
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for alpha" })).toBeInTheDocument();
  });
});

const T = Date.UTC(2026, 8, 26, 11);
const RANGE = { from: T, to: T + 3_600_000 };
const CPU: ChartSeries[] = [
  {
    id: "cpu",
    label: "CPU",
    data: [
      [T, 12],
      [T + 60_000, 71],
      [T + 120_000, null],
      [T + 180_000, 34],
    ],
  },
];

describe("Chart", () => {
  it("summarises the series for screen readers", () => {
    expect(
      chartSummary({
        title: "CPU",
        series: CPU,
        unit: "%",
        range: RANGE,
        limitLine: { value: 100, label: "Limit" },
        markers: [
          { ts: T, label: "Deploy", kind: "deploy" },
          { ts: T + 1, label: "Deploy", kind: "deploy" },
        ],
      }),
    ).toBe("CPU, last 1 hour: minimum 12 %, maximum 71 %, latest 34 %, limit 100 %; 2 deploys");
  });

  it("renders the summary as the image name and in visually hidden text", () => {
    render(<Chart title="CPU" unit="%" series={CPU} range={RANGE} />);
    const image = screen.getByRole("img", { name: /CPU, last 1 hour: minimum 12 %/ });
    expect(image).toHaveAttribute("tabindex", "0");
    const hidden = screen.getByText(/CPU, last 1 hour/, { selector: "p" });
    expect(hidden).toHaveClass("sr-only");
  });

  it("toggles series from the legend with aria-pressed", () => {
    const series: ChartSeries[] = [
      { id: "in", label: "In", data: [[T, 1]] },
      { id: "out", label: "Out", color: "info", data: [[T, 2]] },
    ];
    render(<Chart title="Network" unit="KB/s" series={series} range={RANGE} />);
    const out = screen.getByRole("button", { name: "Out" });
    expect(out).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(out);
    expect(out).toHaveAttribute("aria-pressed", "false");
  });

  it("moves a crosshair with the arrow keys and announces the reading", () => {
    render(<Chart title="CPU" unit="%" series={CPU} range={RANGE} />);
    const image = screen.getByRole("img");
    fireEvent.keyDown(image, { key: "Home" });
    expect(screen.getByRole("status")).toHaveTextContent("CPU 12 %");
  });

  it("shows loading and empty states without a canvas", () => {
    const { rerender } = render(<Chart title="CPU" unit="%" series={[]} range={RANGE} loading />);
    expect(screen.getByRole("img")).not.toHaveAttribute("tabindex");
    rerender(<Chart title="CPU" unit="%" series={[]} range={RANGE} />);
    expect(screen.getByText("No data for this range")).toBeInTheDocument();
  });

  it("joins a sync group's crosshair", async () => {
    const uplot = (await import("uplot")) as unknown as {
      default: { instances: { options: { cursor?: { sync?: { key: string } } } }[] };
    };
    render(
      <ChartSyncGroup id="metrics">
        <Chart title="CPU" unit="%" series={CPU} range={RANGE} />
      </ChartSyncGroup>,
    );
    await waitFor(() => {
      expect(uplot.default.instances.at(-1)?.options.cursor?.sync?.key).toBe("metrics");
    });
  });

  it("aligns series and keeps gaps as nulls", () => {
    const [xs, a, b] = alignSeries([
      {
        id: "a",
        label: "A",
        data: [
          [1, 1],
          [3, 3],
        ],
      },
      { id: "b", label: "B", data: [[2, 2]] },
    ]);
    expect(xs).toEqual([1, 2, 3]);
    expect(a).toEqual([1, null, 3]);
    expect(b).toEqual([null, 2, null]);
  });

  it("formats values, ticks and ranges", () => {
    expect(formatChartValue(34, "%")).toBe("34 %");
    expect(formatChartValue(1536, "MB")).toBe("1.5 GB");
    expect(formatChartValue(1204, "req/min")).toBe("1,204 req/min");
    expect(niceTicks(538)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(0)).toEqual([0, 1]);
    const ticks = timeTicks(RANGE.from, RANGE.to);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.every((t) => t > RANGE.from && t < RANGE.to)).toBe(true);
    expect(describeRange(0, 3_600_000)).toBe("last 1 hour");
    expect(describeRange(0, 7 * 86_400_000)).toBe("last 7 days");
  });
});

describe("CodeBlock", () => {
  it("colors comments, strings and keys, nothing else", () => {
    expect(tokenizeLine('builder = "railpack" # fast', "toml")).toEqual([
      { text: "builder", kind: "key" },
      { text: " =", kind: "plain" },
      { text: " ", kind: "plain" },
      { text: '"railpack"', kind: "string" },
      { text: " ", kind: "plain" },
      { text: "# fast", kind: "comment" },
    ]);
    expect(tokenizeLine('  "port": 8080,', "json")[1]).toEqual({ text: '"port"', kind: "key" });
    expect(tokenizeLine("<script>", "text")).toEqual([{ text: "<script>", kind: "plain" }]);
  });

  it("is a focusable pre named by its title; line numbers are not text", () => {
    render(
      <TooltipProvider>
        <CodeBlock title="lumen.toml" code={"a = 1\nb = 2"} lineNumbers language="toml" />
      </TooltipProvider>,
    );
    const block = screen.getByLabelText("lumen.toml");
    expect(block.tagName).toBe("PRE");
    expect(block).toHaveAttribute("tabindex", "0");
    expect(block.textContent).toBe("a = 1b = 2");
  });

  it("escapes markup", () => {
    const { container } = render(
      <TooltipProvider>
        <CodeBlock code="<img src=x onerror=alert(1)>" />
      </TooltipProvider>,
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("copies everything on Ctrl+C when nothing is selected", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <TooltipProvider>
        <CodeBlock label="Install command" code="curl lumen | sh" />
      </TooltipProvider>,
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Install command"), { key: "c", ctrlKey: true });
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("curl lumen | sh");
  });
});

describe("TerminalFrame", () => {
  it("is a named region that announces its status", () => {
    const onReconnect = vi.fn();
    render(
      <TerminalFrame
        label="Shell in api (replica 1)"
        status="disconnected"
        onReconnect={onReconnect}
      />,
    );
    expect(screen.getByRole("region", { name: "Shell in api (replica 1)" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Disconnected");
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it("returns focus to the screen on Escape from the toolbar", () => {
    render(
      <TerminalFrame
        label="Shell"
        status="connected"
        toolbar={<button type="button">Replica</button>}
      >
        $ ls
      </TerminalFrame>,
    );
    const button = screen.getByRole("button", { name: "Replica" });
    act(() => {
      button.focus();
    });
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.getByLabelText("Terminal output")).toHaveFocus();
  });

  it("keeps its screen in the dark theme", () => {
    const { container } = render(<TerminalFrame label="Shell" status="connecting" />);
    expect(container.querySelector('[data-theme="dark"]')).not.toBeNull();
  });
});

const CHANGES: DiffGroup[] = [
  {
    group: "api",
    items: [
      { field: "Memory", before: "512 MB", after: "1 GB", kind: "changed" },
      {
        field: "STRIPE_SECRET_KEY",
        before: "sk_live_old",
        after: "sk_live_new",
        kind: "changed",
        secret: true,
      },
    ],
  },
  { group: "worker", items: [{ field: "Replicas", before: "1", after: "3", kind: "changed" }] },
];

describe("DiffViewer", () => {
  it("renders a table per group with Setting, Before, After headers", () => {
    render(<DiffViewer changes={CHANGES} />);
    const tables = screen.getAllByRole("table");
    expect(tables).toHaveLength(2);
    const [first] = tables;
    if (first === undefined) {
      throw new Error("table missing");
    }
    expect(
      within(first)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Setting", "Before", "After"]);
  });

  it("never renders secret values", () => {
    const { container } = render(<DiffViewer changes={CHANGES} mode="inline" />);
    expect(container).not.toHaveTextContent("sk_live");
    expect(container).toHaveTextContent("value changed");
  });

  it("folds groups from their header buttons", () => {
    render(<DiffViewer changes={CHANGES} collapsible defaultCollapsed={["worker"]} />);
    const worker = screen.getByRole("button", { name: /worker/ });
    expect(worker).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    fireEvent.click(worker);
    expect(worker).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("table")).toHaveLength(2);
  });

  it("describes changes in words and says when there is nothing", () => {
    expect(
      describeChange({ field: "Memory", before: "512 MB", after: "1 GB", kind: "changed" }),
    ).toBe("Memory, changed from 512 MB to 1 GB");
    expect(describeChange({ field: "KEY", kind: "changed", secret: true })).toBe(
      "KEY, value changed",
    );
    render(<DiffViewer changes={[]} />);
    expect(screen.getByText("Nothing to review")).toBeInTheDocument();
  });
});
