import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseIcon } from "../icons/database-icon";
import { FrameworkIcon, FRAMEWORKS } from "../icons/framework-icon";
import { ProviderMark } from "../icons/provider-mark";
import { DEVICONS } from "../icons/vendor/devicon-paths";
import { STATUS, STATUSES } from "../status/status";

import { CanvasEdge, edgeLabel } from "./canvas-edge";
import { CanvasGroup } from "./canvas-group";
import { CanvasNode, describeService } from "./canvas-node";
import { CANVAS_NOW, SERVICES } from "./canvas.fixtures";
import { decodeFrame, decodeGlyphs, DecodeText } from "./decode-text";
import { checkedAgo, DnsRecordCard, dnsStatusText } from "./dns-record-card";
import { PortCheckCard } from "./port-check-card";
import { Stepper, stepState } from "./stepper";
import { TooltipProvider } from "./tooltip";
import { describeVolumeUsage, formatVolumeUsage, VolumeChip, volumeUsageTone } from "./volume-chip";

const GB = 1024 ** 3;

function renderUi(ui: ReactElement) {
  return render(ui, { wrapper: TooltipProvider });
}

describe("CanvasNode", () => {
  it("is a group named by service, status and last deploy, with one open button", () => {
    const onOpen = vi.fn();
    renderUi(<CanvasNode service={SERVICES.api} now={CANVAS_NOW} onOpen={onOpen} />);
    const group = screen.getByRole("group", { name: "api, Active, deployed 3 min ago" });
    fireEvent.click(within(group).getByRole("button", { name: "Open api" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(within(group).getByRole("link", { name: "Open api.example.com" })).toHaveAttribute(
      "href",
      "https://api.example.com",
    );
    expect(group).toHaveTextContent("×2");
    expect(group).toHaveTextContent("oracle-1");
  });

  it.each(STATUSES.filter((status) => status !== "online" && status !== "offline"))(
    "shows the %s status word",
    (status) => {
      renderUi(<CanvasNode service={{ ...SERVICES.api, status }} now={CANVAS_NOW} />);
      expect(screen.getByRole("group")).toHaveAttribute("data-status", status);
      expect(screen.getByRole("group")).toHaveTextContent(STATUS[status].label);
    },
  );

  it("replaces the URL row by kind", () => {
    const { unmount } = renderUi(<CanvasNode service={SERVICES.postgres} now={CANVAS_NOW} />);
    expect(screen.getByText("Private only")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Volume data at \/var\/lib\/postgresql\/data/ }),
    ).toBeInTheDocument();
    unmount();
    renderUi(<CanvasNode service={SERVICES.nightly} now={CANVAS_NOW} />);
    expect(screen.getByText("Every day at 3:00")).toBeInTheDocument();
  });

  it("says when a service was never deployed", () => {
    renderUi(
      <CanvasNode
        service={{ id: "d", name: "docs", kind: "web", status: "queued" }}
        now={CANVAS_NOW}
      />,
    );
    expect(screen.getByText("Not deployed yet")).toBeInTheDocument();
    expect(screen.getByText("No public URL")).toBeInTheDocument();
  });

  it("marks selection and an offline server", () => {
    renderUi(<CanvasNode service={SERVICES.api} selected serverOffline now={CANVAS_NOW} />);
    const group = screen.getByRole("group", { name: /server oracle-1 offline/ });
    expect(group).toHaveAttribute("data-selected");
    expect(screen.getByRole("img", { name: "Server 'oracle-1' is offline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open api (selected)" })).toBeInTheDocument();
  });

  it("renames with F2: Enter saves, Escape cancels", () => {
    const onRename = vi.fn();
    renderUi(<CanvasNode service={SERVICES.api} onRename={onRename} now={CANVAS_NOW} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Open api" }), { key: "F2" });
    const input = screen.getByRole("textbox", { name: "Rename api" });
    fireEvent.change(input, { target: { value: "gateway" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("gateway");

    fireEvent.keyDown(screen.getByRole("button", { name: "Open api" }), { key: "F2" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "nope" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens the context menu from the keyboard", () => {
    const onContextMenu = vi.fn();
    renderUi(<CanvasNode service={SERVICES.api} onContextMenu={onContextMenu} now={CANVAS_NOW} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Open api" }), {
      key: "F10",
      shiftKey: true,
    });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("describes a service in one sentence", () => {
    expect(describeService(SERVICES.worker, { now: CANVAS_NOW })).toBe(
      "worker, Building, deployed 3 min ago",
    );
  });
});

describe("VolumeChip", () => {
  it("names the path and usage", () => {
    renderUi(<VolumeChip volume={SERVICES.postgres.volume} />);
    expect(
      screen.getByRole("button", {
        name: "Volume data at /var/lib/postgresql/data, 1.2 of 5 gigabytes used",
      }),
    ).toHaveAttribute("data-usage", "accent");
  });

  it("turns warning above 80 % and danger above 95 %", () => {
    expect(volumeUsageTone(4.1 * GB, 5 * GB)?.tone).toBe("warning");
    expect(volumeUsageTone(4.9 * GB, 5 * GB)?.tone).toBe("danger");
    expect(volumeUsageTone(1 * GB, 5 * GB)?.tone).toBe("accent");
    expect(volumeUsageTone(1 * GB)).toBeUndefined();
  });

  it("formats usage compactly", () => {
    expect(formatVolumeUsage(1.2 * GB, 5 * GB)).toBe("1.2 / 5 GB");
    expect(formatVolumeUsage(512 * 1024 ** 2, 5 * GB)).toBe("512 MB / 5 GB");
    expect(formatVolumeUsage(1.2 * GB)).toBe("1.2 GB");
    expect(describeVolumeUsage(512 * 1024 ** 2, 5 * GB)).toBe("512 megabytes of 5 gigabytes used");
  });

  it("drops the stem and shows the name when detached", () => {
    const { container } = renderUi(
      <VolumeChip volume={SERVICES.postgres.volume} attached={false} />,
    );
    expect(container.querySelector("[data-volume-stem]")).toBeNull();
    expect(screen.getByText("data")).toBeInTheDocument();
  });
});

describe("CanvasGroup", () => {
  it("is a group named by label and member count", () => {
    renderUi(
      <CanvasGroup
        group={{ id: "b", label: "Backend" }}
        serviceCount={2}
        width={300}
        height={200}
      />,
    );
    expect(screen.getByRole("group", { name: "Backend, 2 services" })).toBeInTheDocument();
  });

  it("invites services when empty", () => {
    renderUi(
      <CanvasGroup
        group={{ id: "b", label: "Frontend" }}
        serviceCount={0}
        width={300}
        height={200}
      />,
    );
    expect(screen.getByText("Drag services here")).toBeInTheDocument();
  });

  it("renames on F2 and removes on Delete", () => {
    const onRename = vi.fn();
    const onRemove = vi.fn();
    renderUi(
      <CanvasGroup
        group={{ id: "b", label: "Backend" }}
        serviceCount={2}
        width={300}
        height={200}
        onRename={onRename}
        onRemove={onRemove}
      />,
    );
    const label = screen.getByRole("button", { name: "Backend group, 2 services" });
    fireEvent.keyDown(label, { key: "Delete" });
    expect(onRemove).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(label, { key: "F2" });
    const input = screen.getByRole("textbox", { name: "Rename group Backend" });
    fireEvent.change(input, { target: { value: "Core" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("Core");
  });
});

describe("CanvasEdge", () => {
  it("is hidden from assistive technology and labels up to two variables", () => {
    const { container } = render(
      <svg>
        <CanvasEdge
          from={{ x: 0, y: 0 }}
          to={{ x: 200, y: 80 }}
          variables={["A", "B", "C"]}
          selected
        />
      </svg>,
    );
    expect(container.querySelector("[data-canvas-edge]")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[data-edge-label]")).toHaveTextContent("A, B +1");
    expect(edgeLabel(["DATABASE_URL"])).toBe("DATABASE_URL");
    expect(edgeLabel([])).toBe("");
  });

  it("drops the flow and dims when another node is selected", () => {
    const { container } = render(
      <svg>
        <CanvasEdge from={{ x: 0, y: 0 }} to={{ x: 200, y: 0 }} dimmed />
      </svg>,
    );
    expect(container.querySelector(".edge-flow")).toBeNull();
    expect(container.querySelector("[data-canvas-edge]")).toHaveClass("opacity-40");
  });
});

describe("Stepper", () => {
  const steps = [
    { id: "a", label: "Verify" },
    { id: "b", label: "Admin" },
    { id: "c", label: "Domain", optional: true },
  ];

  it("marks the current step with aria-current and makes only finished steps clickable", () => {
    const onStepClick = vi.fn();
    renderUi(
      <Stepper
        steps={steps}
        current="b"
        completed={["a"]}
        onStepClick={onStepClick}
        collapse="never"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Setup progress" });
    const items = within(nav).getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    // getByRole throws unless exactly one button exists: only the finished step.
    fireEvent.click(within(nav).getByRole("button"));
    expect(onStepClick).toHaveBeenCalledWith("a");
    expect(nav).toHaveTextContent("Optional");
  });

  it("collapses to Step N of M with a progress bar", () => {
    renderUi(<Stepper steps={steps} current="b" completed={["a"]} collapse="always" />);
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });

  it("derives step state", () => {
    expect(stepState({ id: "a", label: "" }, "b", ["a"])).toBe("done");
    expect(stepState({ id: "b", label: "" }, "b", ["a"])).toBe("current");
    expect(stepState({ id: "c", label: "" }, "b", ["a"])).toBe("upcoming");
  });
});

describe("DnsRecordCard", () => {
  const record = { type: "A", name: "apps", value: "198.51.100.4" } as const;

  it("is labelled by type and full name and copies each field", () => {
    renderUi(<DnsRecordCard record={record} zone="example.com" check={{ status: "ok" }} />);
    expect(
      screen.getByRole("group", { name: "DNS record A for apps.example.com" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy record value" })).toBeInTheDocument();
    expect(screen.getByText("Pointing here")).toHaveClass("text-success-text");
  });

  it("explains a mismatch and disables recheck while checking", () => {
    expect(dnsStatusText(record, { status: "mismatch", observed: "203.0.113.9" })).toBe(
      "Points to 203.0.113.9, expected 198.51.100.4",
    );
    renderUi(
      <DnsRecordCard record={record} check={{ status: "checking" }} onRecheck={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: "Recheck" })).toBeDisabled();
  });

  it("says how long ago it checked", () => {
    expect(checkedAgo(0, 20_000)).toBe("checked 20s ago");
    expect(checkedAgo(0, 180_000)).toBe("checked 3 min ago");
  });
});

describe("PortCheckCard", () => {
  const ports = [
    { port: 80, protocol: "tcp", label: "HTTP", status: "open" },
    { port: 443, protocol: "tcp", label: "HTTPS", status: "blocked" },
    { port: 51820, protocol: "udp", label: "Private network", status: "unknown" },
  ] as const;

  it("lists ports with their status in the text and toggles the fix", () => {
    const onRerun = vi.fn();
    renderUi(
      <PortCheckCard
        provider="oracle"
        ports={ports}
        fixes={{
          443: {
            title: "Open port 443",
            steps: [{ text: "Allow it", command: "sudo ufw allow 443/tcp" }],
          },
        }}
        onRerun={onRerun}
      />,
    );
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("80/tcpHTTPReachable");
    const toggle = screen.getByRole("button", { name: /443\/tcp.*Blocked/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("sudo ufw allow 443/tcp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I've done this — check again" }));
    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: "Oracle Cloud" })).toBeInTheDocument();
  });
});

describe("DecodeText", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset["reducedMotion"];
  });

  it("keeps the final text as the accessible name while decoding, and settles under 360 ms", () => {
    vi.useFakeTimers();
    render(<DecodeText text="Deployments" as="h1" />);
    const heading = screen.getByRole("heading", { level: 1 });
    // The first scrambled frame lands on the next paint.
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(heading).toHaveAttribute("data-decoding");
    expect(heading).toHaveTextContent(/^Deployments/);
    act(() => {
      vi.advanceTimersByTime(344);
    });
    expect(heading).not.toHaveAttribute("data-decoding");
    expect(heading.textContent).toBe("Deployments");
  });

  it("shows the text at once under the reduced-motion preference", () => {
    document.documentElement.dataset["reducedMotion"] = "true";
    render(<DecodeText text="Variables" as="h1" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).not.toHaveAttribute("data-decoding");
    expect(heading.textContent).toBe("Variables");
  });

  it("builds frames from the glyph set, keeping revealed characters and spaces", () => {
    const frame = decodeFrame("ab cd", 1, () => 0);
    expect(frame).toBe(
      `a${decodeGlyphs[0] ?? ""} ${decodeGlyphs[0] ?? ""}${decodeGlyphs[0] ?? ""}`,
    );
  });
});

describe("framework, database and provider icons", () => {
  it("has vendored path data for every Devicon-backed key", () => {
    for (const framework of FRAMEWORKS) {
      if (framework === "static" || framework === "unknown") {
        continue;
      }
      expect(DEVICONS[framework].paths.length).toBeGreaterThan(0);
    }
  });

  it("is decorative by default and named when labelled", () => {
    const { container } = render(<FrameworkIcon framework="go" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    render(<DatabaseIcon engine="postgres" label="PostgreSQL" />);
    expect(screen.getByRole("img", { name: "PostgreSQL" })).toBeInTheDocument();
  });

  it("uses Lucide for static and unknown builds", () => {
    const { container } = render(<FrameworkIcon framework="static" />);
    expect(container.querySelector('[data-icon="file-code"]')).not.toBeNull();
  });

  it("renders provider monograms, never trademark artwork", () => {
    render(<ProviderMark provider="aws" label />);
    expect(screen.getByRole("img", { name: "Amazon Web Services" })).toHaveTextContent("AWS");
  });
});
