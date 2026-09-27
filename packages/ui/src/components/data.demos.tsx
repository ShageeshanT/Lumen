"use client";

import { useState } from "react";

import { formatDuration, formatRelativeTime } from "../lib/format";
import { STATUS } from "../status/status";

import { Badge } from "./badge";
import { Button } from "./button";
import { Chart } from "./chart";
import { ChartSyncGroup } from "./chart-sync";
import { DataTable, type DataTableColumn, type SortingState } from "./data-table";
import {
  auditLog,
  DEPLOY_MARKERS,
  DEPLOYMENTS,
  denseMetrics,
  GALLERY_NOW,
  HOUR,
  VARIABLES,
  type AuditEntry,
  type Deployment,
  type Variable,
} from "./data.fixtures";
import { EmptyState } from "./empty-state";
import { StatusTag } from "./status-tag";
import { TerminalFrame, type TerminalStatus } from "./terminal-frame";

/** Stateful gallery demos. Client-only so the registry can be imported on the server. */

export const DEPLOYMENT_COLUMNS: DataTableColumn<Deployment>[] = [
  {
    id: "status",
    header: "Status",
    size: 150,
    sortable: true,
    value: (row) => STATUS[row.status].label,
    cell: (row) => <StatusTag status={row.status} size="sm" brackets={false} />,
  },
  { id: "message", header: "Commit message", value: (row) => row.message, sortable: true },
  { id: "commit", header: "Commit", size: 100, mono: true, value: (row) => row.commit },
  { id: "trigger", header: "Trigger", size: 140, value: (row) => row.trigger, hideInCards: true },
  {
    id: "when",
    header: "When",
    size: 110,
    sortable: true,
    tabular: true,
    value: (row) => row.createdAt,
    cell: (row) => (
      <span className="text-meta">{formatRelativeTime(row.createdAt, GALLERY_NOW)}</span>
    ),
  },
  {
    id: "duration",
    header: "Duration",
    size: 116,
    align: "right",
    sortable: true,
    tabular: true,
    value: (row) => row.durationMs,
    cell: (row) => formatDuration(row.durationMs),
  },
];

const deploymentActions = () => [
  { label: "View logs", icon: "file-text" as const, onSelect: () => undefined },
  { label: "Redeploy", icon: "rotate-cw" as const, onSelect: () => undefined },
  { label: "Roll back to this", icon: "history" as const, onSelect: () => undefined },
];

/** Deployments with sorting, selection, keyboard row navigation and row actions. */
export function DeploymentsTableDemo({ dense = false }: { dense?: boolean }) {
  const [selected, setSelected] = useState<string[]>(["dep_c4d5e6f"]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "when", desc: true }]);
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-col gap-2">
      <DataTable
        label="Deployments"
        columns={DEPLOYMENT_COLUMNS}
        data={DEPLOYMENTS}
        rowKey={(row) => row.id}
        rowLabel={(row) => `deployment ${row.commit}`}
        sorting={sorting}
        onSortingChange={setSorting}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowActions={deploymentActions}
        onRowClick={(row) => {
          setOpened(row.commit);
        }}
        dense={dense}
      />
      <p className="text-meta" aria-live="polite">
        {selected.length} selected
        {opened === null ? "" : ` · opened ${opened}`}
      </p>
    </div>
  );
}

export const VARIABLE_COLUMNS: DataTableColumn<Variable>[] = [
  { id: "name", header: "Name", mono: true, sortable: true, value: (row) => row.name },
  {
    id: "value",
    header: "Value",
    cell: (row) =>
      row.sealed ? (
        <span className="text-text-secondary">Sealed</span>
      ) : (
        <span className="text-text-secondary font-mono">
          <span aria-hidden="true">••••••••</span>
          <span className="sr-only">Hidden value</span>
        </span>
      ),
  },
  {
    id: "source",
    header: "Source",
    size: 140,
    sortable: true,
    value: (row) => row.source,
    cell: (row) => (
      <Badge
        size="sm"
        variant={row.source === "Reference" ? "accent" : "outline"}
        {...(row.sealed ? { icon: "lock" as const } : {})}
      >
        {row.source}
      </Badge>
    ),
  },
];

const AUDIT_COLUMNS: DataTableColumn<AuditEntry>[] = [
  {
    id: "at",
    header: "Time (UTC)",
    size: 190,
    mono: true,
    tabular: true,
    sortable: true,
    value: (row) => row.at,
    cell: (row) => new Date(row.at).toISOString().slice(0, 19).replace("T", " "),
  },
  { id: "actor", header: "Actor", sortable: true, value: (row) => row.actor },
  { id: "action", header: "Action", mono: true, sortable: true, value: (row) => row.action },
  { id: "target", header: "Target", size: 120, value: (row) => row.target },
  { id: "ip", header: "IP", size: 130, mono: true, tabular: true, value: (row) => row.ip },
];

let auditCache: AuditEntry[] | undefined;

/** The 5,000-row audit log, generated once. */
export function auditRows(): AuditEntry[] {
  auditCache ??= auditLog(5000);
  return auditCache;
}

/** 5,000 rows, virtualized: only the rows in view are in the DOM. */
export function AuditLogDemo() {
  const rows = auditRows();
  return (
    <DataTable
      label="Audit log"
      columns={AUDIT_COLUMNS}
      data={rows}
      rowKey={(row) => row.id}
      rowLabel={(row) => `${row.action} by ${row.actor}`}
      onRowClick={() => undefined}
      dense
      maxHeight={420}
      defaultSorting={[{ id: "at", desc: true }]}
    />
  );
}

/** A table whose load failed, with a working Retry that shows the loading rows. */
export function ErrorTableDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <DataTable
      label="Variables"
      columns={VARIABLE_COLUMNS}
      data={loading ? VARIABLES : []}
      rowKey={(row) => row.name}
      loading={loading}
      {...(loading
        ? {}
        : {
            error: {
              message: "Couldn't load the variables. The server didn't answer in time.",
              onRetry: () => {
                setLoading(true);
              },
            },
          })}
      empty={null}
    />
  );
}

export function EmptyTable() {
  return (
    <DataTable
      label="Domains"
      columns={[
        { id: "domain", header: "Domain", mono: true },
        { id: "status", header: "Status", size: 140 },
      ]}
      data={[]}
      rowKey={() => ""}
      empty={
        <EmptyState
          icon="globe"
          title="No domains yet"
          description="Add a domain and Lumen sets up HTTPS for it automatically."
          action={{ label: "Add domain", icon: "plus", onClick: () => undefined }}
        />
      }
    />
  );
}

let denseCache: ReturnType<typeof denseMetrics> | undefined;

/** Four charts, 3,600 points each, sharing one crosshair. */
export function SyncedChartsDemo() {
  denseCache ??= denseMetrics();
  const metrics = denseCache;
  return (
    <ChartSyncGroup id="gallery-metrics">
      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.title} className="flex min-w-0 flex-col gap-2">
            <span className="text-label">{metric.title}</span>
            <Chart
              title={metric.title}
              unit={metric.unit}
              series={metric.series}
              range={HOUR}
              markers={DEPLOY_MARKERS}
              height={140}
            />
          </div>
        ))}
      </div>
    </ChartSyncGroup>
  );
}

/** Cycles connecting → connected → disconnected. */
export function TerminalDemo() {
  const [status, setStatus] = useState<TerminalStatus>("connected");
  return (
    <div className="flex w-full flex-col gap-3">
      <TerminalFrame
        label="Shell in api (replica 1)"
        status={status}
        onReconnect={() => {
          setStatus("connected");
        }}
        toolbar={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStatus("disconnected");
            }}
          >
            Disconnect
          </Button>
        }
        mode="dock"
      >
        <TerminalTranscript />
      </TerminalFrame>
    </div>
  );
}

export function TerminalTranscript() {
  return (
    <>
      <div>
        <span className="text-success-text">root@api-7f9c</span>
        <span className="text-text-secondary">:/app$ </span>
        node --version
      </div>
      <div>v22.11.0</div>
      <div>
        <span className="text-success-text">root@api-7f9c</span>
        <span className="text-text-secondary">:/app$ </span>
        ls
      </div>
      <div className="text-text-secondary">dist node_modules package.json server.js</div>
      <div>
        <span className="text-success-text">root@api-7f9c</span>
        <span className="text-text-secondary">:/app$ </span>
        <span className="bg-text inline-block h-4 w-2 align-middle" />
      </div>
    </>
  );
}
