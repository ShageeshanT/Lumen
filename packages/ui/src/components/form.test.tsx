import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";
import { Combobox } from "./combobox";
import { CopyField } from "./copy-field";
import { Field } from "./field";
import { Input } from "./input";
import { KeyValueEditor, keyProblem, parseEnvLines, type KeyValueRow } from "./key-value-editor";
import { RadioGroup } from "./radio-group";
import { SecretField } from "./secret-field";
import { SegmentedControl } from "./segmented-control";
import { SliderWithInput } from "./slider-with-input";
import { Switch } from "./switch";
import { Textarea } from "./textarea";
import { TooltipProvider } from "./tooltip";

function withTooltips(node: React.ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

describe("Field", () => {
  it("labels the control and wires helper and error into aria-describedby", () => {
    render(
      <Field label="Start command" helper="Runs after the build." error="Add a start command.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Start command");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const text = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" | ");
    expect(text).toBe("Runs after the build. | Add a start command.");
  });

  it("does not announce an error present on mount, but announces one that appears later", () => {
    function Harness() {
      const [error, setError] = useState<string | undefined>("First");
      return (
        <>
          <Field label="Name" error={error}>
            <Input />
          </Field>
          <button
            type="button"
            onClick={() => {
              setError(error === undefined ? "Second" : undefined);
            }}
          >
            toggle
          </button>
        </>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("toggle"));
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByRole("alert")).toHaveTextContent("Second");
  });

  it("disables the control when locked by config", () => {
    withTooltips(
      <Field label="Build command" lockedBy="lumen.toml">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Build command")).toBeDisabled();
    expect(screen.getByRole("img", { name: "Managed by lumen.toml" })).toBeInTheDocument();
  });

  it("marks required controls", () => {
    render(
      <Field label="Name" required>
        <Textarea />
      </Field>,
    );
    expect(screen.getByLabelText(/Name/)).toBeRequired();
  });
});

describe("Input", () => {
  it("clears a search field with Escape", () => {
    const onChange = vi.fn();
    render(<Input type="search" aria-label="Search" defaultValue="api" onChange={onChange} />);
    const input = screen.getByLabelText<HTMLInputElement>("Search");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });
});

describe("CopyField and SecretField", () => {
  const writeText = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText } });
    writeText.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies the full value, even when the display is truncated", async () => {
    const id = "dep_01j8x9k2d3m4n5p6q7r8s9t0v1";
    withTooltips(<CopyField label="deployment id" value={id} truncate="middle" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy deployment id" }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(id);
    expect(screen.getByText("Copied", { selector: "[aria-live]" })).toBeInTheDocument();
  });

  it("copies with Ctrl+C on the field", async () => {
    withTooltips(<CopyField label="domain" value="api.lumen.internal" />);
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("domain"), { key: "c", ctrlKey: true });
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("api.lumen.internal");
  });

  it("keeps the secret out of the DOM until revealed, and masks again after 10 s", () => {
    vi.useFakeTimers();
    const secret = "postgres://app:s3cr3t@db:5432/app";
    const { container } = withTooltips(<SecretField label="DATABASE_URL" value={secret} />);
    expect(container.innerHTML).not.toContain("s3cr3t");
    const reveal = screen.getByRole("button", { name: "Reveal DATABASE_URL" });
    expect(reveal).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(reveal);
    expect(reveal).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText<HTMLInputElement>("DATABASE_URL").value).toBe(secret);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(container.innerHTML).not.toContain("s3cr3t");
  });

  it("offers neither reveal nor copy for sealed values", () => {
    withTooltips(<SecretField label="STRIPE_KEY" value="sk_live_x" sealed />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("group", { name: "STRIPE_KEY, sealed" })).toHaveTextContent("Sealed");
  });
});

describe("KeyValueEditor", () => {
  it("parses .env text", () => {
    expect(
      parseEnvLines("# comment\nexport A=1\nB=\"two words\"\n\nC='x'\nnot a line\nD=a=b"),
    ).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "two words" },
      { key: "C", value: "x" },
      { key: "D", value: "a=b" },
    ]);
  });

  it("flags malformed and duplicate names", () => {
    const rows = [
      { key: "PORT", value: "1" },
      { key: "PORT", value: "2" },
    ];
    expect(keyProblem("PORT", 1, rows)).toBe("Already used");
    expect(keyProblem("2FA", 0, [])).toBe("Names can't start with a number");
    expect(keyProblem("MY-KEY", 0, [])).toBe("Use letters, numbers and underscores only");
    expect(keyProblem("", 0, [])).toBeUndefined();
  });

  it("fills rows from a pasted block and adds a row on Enter", () => {
    function Harness() {
      const [rows, setRows] = useState<KeyValueRow[]>([]);
      return (
        <>
          <KeyValueEditor label="Variables" rows={rows} onChange={setRows} />
          <output data-testid="count">{rows.length}</output>
        </>
      );
    }
    withTooltips(<Harness />);
    fireEvent.paste(screen.getByLabelText("Name, row 1"), {
      clipboardData: { getData: () => "A=1\nB=2" },
    });
    expect(screen.getByTestId("count")).toHaveTextContent("2");
    fireEvent.keyDown(screen.getByLabelText("Value, row 2"), { key: "Enter" });
    expect(screen.getByTestId("count")).toHaveTextContent("3");
    expect(screen.getByText("Row 3 added")).toBeInTheDocument();
  });
});

describe("toggles and choices", () => {
  it("switch is a labelled switch", () => {
    const onChange = vi.fn();
    render(<Switch label="Deploy on push" onCheckedChange={onChange} />);
    const control = screen.getByRole("switch", { name: "Deploy on push" });
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("checkbox reports mixed for indeterminate", () => {
    render(<Checkbox label="Select all" checked="indeterminate" />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
  });

  it("radio group exposes its options", () => {
    render(
      <RadioGroup
        aria-label="Restart policy"
        defaultValue="always"
        options={[
          { value: "always", label: "Always" },
          { value: "never", label: "Never" },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Restart policy" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Always" })).toBeChecked();
  });

  it("segmented control keeps a value when the active segment is clicked again", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Range"
        value="1h"
        onValueChange={onChange}
        items={[
          { value: "1h", label: "1h" },
          { value: "6h", label: "6h" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "1h" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "6h" }));
    expect(onChange).toHaveBeenCalledWith("6h");
  });
});

describe("SliderWithInput", () => {
  it("clamps and snaps typed values to the step", () => {
    const onChange = vi.fn();
    render(
      <SliderWithInput
        label="Memory"
        unit="MB"
        unitName="megabytes"
        min={128}
        max={1024}
        step={128}
        value={512}
        onValueChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Memory in megabytes");
    fireEvent.change(input, { target: { value: "700" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(640);
    fireEvent.change(input, { target: { value: "99999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(1024);
  });

  it("marks values over the server limit invalid and says why", () => {
    render(
      <SliderWithInput
        label="Memory"
        unit="MB"
        unitName="megabytes"
        min={128}
        max={4096}
        step={128}
        value={4096}
        onValueChange={() => undefined}
        limit={{ value: 2048, label: "Server has 2 GB free" }}
      />,
    );
    expect(screen.getByLabelText("Memory in megabytes")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/More than Server has 2 GB free/)).toBeInTheDocument();
  });
});

describe("Combobox", () => {
  it("opens, filters and selects", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        aria-label="Repository"
        onValueChange={onChange}
        items={[
          { value: "acme/api", label: "acme/api" },
          { value: "acme/web", label: "acme/web" },
        ]}
        open
      />,
    );
    const search = screen.getByPlaceholderText("Search…");
    fireEvent.change(search, { target: { value: "web" } });
    fireEvent.click(screen.getByRole("option", { name: "acme/web" }));
    expect(onChange).toHaveBeenCalledWith("acme/web");
  });
});
