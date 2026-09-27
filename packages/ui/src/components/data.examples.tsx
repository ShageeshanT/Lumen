import type { ComponentDoc } from "../examples/types";

import { Button } from "./button";
import { Chart } from "./chart";
import { CodeBlock } from "./code-block";
import { DataTable } from "./data-table";
import {
  AuditLogDemo,
  DEPLOYMENT_COLUMNS,
  DeploymentsTableDemo,
  EmptyTable,
  ErrorTableDemo,
  SyncedChartsDemo,
  TerminalDemo,
  TerminalTranscript,
  VARIABLE_COLUMNS,
} from "./data.demos";
import {
  CPU,
  CPU_GAP,
  DEPLOYMENTS,
  HOUR,
  MEMORY,
  NETWORK,
  OOM_MARKERS,
  REPLICAS,
  REQUESTS,
  VARIABLES,
} from "./data.fixtures";
import { DiffViewer, type DiffGroup } from "./diff-viewer";
import { TerminalFrame } from "./terminal-frame";

const noop = () => undefined;

export const dataTableDoc: ComponentDoc = {
  slug: "data-table",
  name: "Data table",
  group: "Data display",
  summary:
    "Sortable, selectable rows with a row actions menu, sticky header and dense mode. Long lists render only the rows in view, and under 640 px rows can stack into cards.",
  components: ["DataTable"],
  examples: [
    {
      id: "deployments",
      title: "Deployment history",
      description:
        "Sort by clicking a header. Arrow keys move between rows, Enter opens one, Shift+F10 opens its actions.",
      wide: true,
      render: () => <DeploymentsTableDemo />,
    },
    {
      id: "variables",
      title: "Variables",
      wide: true,
      render: () => (
        <DataTable
          label="Variables"
          columns={VARIABLE_COLUMNS}
          data={VARIABLES}
          rowKey={(row) => row.name}
          rowActions={() => [
            { label: "Edit", icon: "pencil", onSelect: noop },
            { label: "Delete", icon: "trash-2", onSelect: noop, danger: true },
          ]}
          rowLabel={(row) => row.name}
          className="w-full"
        />
      ),
    },
    {
      id: "audit-5000",
      title: "Audit log, 5,000 rows (virtualized, dense)",
      wide: true,
      render: () => <AuditLogDemo />,
    },
    {
      id: "loading",
      title: "Loading",
      wide: true,
      render: () => (
        <DataTable
          label="Deployments"
          columns={DEPLOYMENT_COLUMNS}
          data={[]}
          rowKey={(row) => row.id}
          loading
          className="w-full"
        />
      ),
    },
    {
      id: "empty",
      title: "Empty",
      wide: true,
      render: () => <EmptyTable />,
    },
    {
      id: "error",
      title: "Failed to load, with Retry",
      wide: true,
      render: () => <ErrorTableDemo />,
    },
    {
      id: "cards",
      title: "Stacks into cards under 640 px",
      description:
        "At phone width each row becomes a card; the actions menu stays at the top right.",
      wide: true,
      render: () => (
        <DataTable
          label="Deployments"
          columns={DEPLOYMENT_COLUMNS}
          data={DEPLOYMENTS.slice(0, 3)}
          rowKey={(row) => row.id}
          rowLabel={(row) => `deployment ${row.commit}`}
          rowActions={() => [{ label: "View logs", icon: "file-text", onSelect: noop }]}
          responsive="cards"
          dense
          className="w-full"
        />
      ),
    },
  ],
};

export const chartDoc: ComponentDoc = {
  slug: "chart",
  name: "Chart",
  group: "Data display",
  summary:
    "Metrics over time. A dashed limit line, deploy and out-of-memory markers, a crosshair that can be moved with the arrow keys, and a written summary for screen readers.",
  components: ["Chart", "ChartSyncGroup"],
  examples: [
    {
      id: "cpu-limit",
      title: "CPU with limit",
      render: () => (
        <Chart
          title="CPU"
          unit="%"
          series={CPU}
          range={HOUR}
          limitLine={{ value: 100, label: "Limit 100 %" }}
          className="w-full"
        />
      ),
    },
    {
      id: "memory-oom",
      title: "Memory with limit and an OOM restart",
      render: () => (
        <Chart
          title="Memory"
          unit="MB"
          series={MEMORY}
          range={HOUR}
          limitLine={{ value: 512, label: "Limit 512 MB" }}
          markers={OOM_MARKERS}
          className="w-full"
        />
      ),
    },
    {
      id: "network",
      title: "Network in and out",
      render: () => (
        <Chart title="Network" unit="KB/s" series={NETWORK} range={HOUR} className="w-full" />
      ),
    },
    {
      id: "requests-area",
      title: "Requests per minute (area)",
      render: () => (
        <Chart
          title="Requests"
          unit="req/min"
          kind="area"
          series={REQUESTS}
          range={HOUR}
          className="w-full"
        />
      ),
    },
    {
      id: "replicas",
      title: "Replica breakdown",
      render: () => (
        <Chart title="CPU by replica" unit="%" series={REPLICAS} range={HOUR} className="w-full" />
      ),
    },
    {
      id: "gap",
      title: "A gap in the data",
      description: "The agent was offline for twelve minutes; the line breaks instead of guessing.",
      render: () => <Chart title="CPU" unit="%" series={CPU_GAP} range={HOUR} className="w-full" />,
    },
    {
      id: "loading",
      title: "Loading",
      render: () => (
        <Chart title="CPU" unit="%" series={[]} range={HOUR} loading className="w-full" />
      ),
    },
    {
      id: "empty",
      title: "No data for this range",
      render: () => <Chart title="CPU" unit="%" series={[]} range={HOUR} className="w-full" />,
    },
    {
      id: "synced",
      title: "Four synced charts, 3,600 points each, with deploys",
      wide: true,
      render: () => <SyncedChartsDemo />,
    },
  ],
};

const LUMEN_TOML = `# lumen.toml: settings that live with your code
[build]
builder = "railpack"
watch = ["src/**", "package.json"]

[deploy]
start = "node dist/server.js"
healthcheck = "/health"
replicas = 2
memory = "1 GB"  # per replica`;

const CONFIG_JSON = JSON.stringify(
  {
    service: "api",
    image: "ghcr.io/acme/api:1.4",
    replicas: 2,
    resources: { cpu: 1, memoryMb: 1024 },
    healthcheck: { path: "/health", timeoutS: 30 },
    domains: ["api.acme.dev"],
    variables: { NODE_ENV: "production", PORT: "8080" },
    volumes: [{ name: "uploads", mount: "/app/uploads", sizeGb: 5 }],
    network: { private: "api.internal", ports: [8080] },
  },
  null,
  2,
);

export const codeBlockDoc: ComponentDoc = {
  slug: "code-block",
  name: "Code block",
  group: "Data display",
  summary:
    "Commands, config files and values in mono, with a copy button. Focus it to scroll with the keyboard; Ctrl or ⌘ + C with nothing selected copies all of it.",
  components: ["CodeBlock"],
  examples: [
    {
      id: "install",
      title: "Install command",
      render: () => (
        <CodeBlock
          language="bash"
          label="Install command"
          code={"curl -fsSL https://lumen.acme.dev/install.sh | sudo sh -s -- --token lmn_4f2a9c"}
          className="w-full"
        />
      ),
    },
    {
      id: "toml",
      title: "lumen.toml, with a title bar",
      render: () => (
        <CodeBlock language="toml" title="lumen.toml" code={LUMEN_TOML} className="w-full" />
      ),
    },
    {
      id: "dns",
      title: "DNS record values, wrapped",
      render: () => (
        <CodeBlock
          language="env"
          label="DNS records"
          wrap
          code={[
            "TYPE=CNAME",
            "NAME=api",
            "VALUE=oracle-1.edge.lumen.acme.dev",
            "TXT=lumen-verify=2f0c9a41e8b7d6c5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1",
          ].join("\n")}
          className="w-full"
        />
      ),
    },
    {
      id: "json-scroll",
      title: "Config snapshot, line numbers, scrolling",
      render: () => (
        <CodeBlock
          language="json"
          title="snapshot.json"
          lineNumbers
          maxHeight={220}
          code={CONFIG_JSON}
          className="w-full"
        />
      ),
    },
  ],
};

const BANNER = "You're inside a live container. Changes are lost on redeploy.";

export const terminalFrameDoc: ComponentDoc = {
  slug: "terminal-frame",
  name: "Terminal frame",
  group: "Data display",
  summary:
    "The frame a shell lives in: status, toolbar, a warning banner and the dark screen, which stays dark in both themes.",
  components: ["TerminalFrame"],
  examples: [
    {
      id: "connected",
      title: "Connected, with banner and toolbar",
      wide: true,
      render: () => (
        <TerminalFrame
          label="Shell in api (replica 1)"
          status="connected"
          banner={BANNER}
          toolbar={
            <>
              <span className="text-meta font-mono">replica 1 · /bin/sh</span>
              <Button size="sm" variant="ghost" leadingIcon="refresh-cw">
                Reconnect
              </Button>
            </>
          }
          className="w-full"
        >
          <TerminalTranscript />
        </TerminalFrame>
      ),
    },
    {
      id: "connecting",
      title: "Connecting",
      render: () => (
        <TerminalFrame label="Shell in api (replica 1)" status="connecting" className="w-full" />
      ),
    },
    {
      id: "disconnected",
      title: "Disconnected",
      render: () => (
        <TerminalFrame
          label="Shell in api (replica 1)"
          status="disconnected"
          onReconnect={noop}
          className="w-full"
        >
          <TerminalTranscript />
        </TerminalFrame>
      ),
    },
    {
      id: "dock",
      title: "Bottom dock, 320 px",
      wide: true,
      render: () => <TerminalDemo />,
    },
    {
      id: "panel",
      title: "Full panel",
      description: "Fills the inspector's Shell tab; the screen takes all the height it is given.",
      wide: true,
      render: () => (
        <div className="flex h-[440px] w-full">
          <TerminalFrame
            label="Shell in api (replica 1)"
            status="connected"
            mode="panel"
            className="w-full flex-1"
          >
            <TerminalTranscript />
          </TerminalFrame>
        </div>
      ),
    },
  ],
};

const STAGED: DiffGroup[] = [
  {
    group: "api",
    icon: "box",
    items: [
      { field: "Memory", before: "512 MB", after: "1 GB", kind: "changed" },
      {
        field: "Start command",
        before: "node server.js",
        after: "node dist/server.js --cluster",
        kind: "changed",
        mono: true,
      },
      { field: "SENTRY_DSN", after: "https://o1.ingest.sentry.io/42", kind: "added", mono: true },
      { field: "STRIPE_SECRET_KEY", kind: "changed", secret: true },
    ],
  },
  {
    group: "worker",
    icon: "box",
    items: [
      { field: "Replicas", before: "1", after: "3", kind: "changed" },
      {
        field: "LEGACY_QUEUE",
        before: "redis://redis.internal:6379/2",
        kind: "removed",
        mono: true,
      },
    ],
  },
];

export const diffViewerDoc: ComponentDoc = {
  slug: "diff-viewer",
  name: "Diff viewer",
  group: "Data display",
  summary:
    "Staged changes before they deploy: old → new per setting, grouped by service. Secret values are never shown.",
  components: ["DiffViewer"],
  examples: [
    {
      id: "side-by-side",
      title: "Staged changes, side by side",
      wide: true,
      render: () => <DiffViewer changes={STAGED} className="w-full" />,
    },
    {
      id: "inline",
      title: "Inline",
      render: () => <DiffViewer changes={STAGED} mode="inline" className="w-full" />,
    },
    {
      id: "collapsed",
      title: "Collapsible, one group folded",
      render: () => (
        <DiffViewer changes={STAGED} collapsible defaultCollapsed={["worker"]} className="w-full" />
      ),
    },
    {
      id: "empty",
      title: "Nothing staged",
      render: () => <DiffViewer changes={[]} className="w-full" />,
    },
  ],
};
