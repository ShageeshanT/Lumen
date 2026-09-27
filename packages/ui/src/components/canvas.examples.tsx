import type { ComponentDoc } from "../examples/types";
import { STATUSES } from "../status/status";

import { CanvasEdge, type CanvasPoint } from "./canvas-edge";
import { CanvasFlow } from "./canvas-flow";
import { CanvasGroup, type CanvasGroupColor } from "./canvas-group";
import { CanvasNode, CanvasNodeSkeleton, type CanvasService } from "./canvas-node";
import { CANVAS_NOW, projectScene, SERVICES } from "./canvas.fixtures";
import { VolumeChip } from "./volume-chip";

const GB = 1024 ** 3;

function Nodes({
  children,
  withVolume = false,
}: {
  children: React.ReactNode;
  withVolume?: boolean;
}) {
  return <div className={`flex flex-wrap gap-6 p-2 ${withVolume ? "pb-12" : ""}`}>{children}</div>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="text-eyebrow">{children}</span>;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Caption>{label}</Caption>
      {children}
    </div>
  );
}

/** A web service without a public domain yet. */
const ADMIN: CanvasService = {
  id: "admin",
  name: "admin",
  kind: "web",
  framework: "python",
  status: "active",
  lastDeploy: {
    at: CANVAS_NOW - 26 * 60_000,
    commitMessage: "feat: audit log export",
    commitSha: "5d2e8b1",
  },
  server: { name: "oracle-1" },
};

const SERVICE_STATUSES = STATUSES.filter((status) => status !== "online" && status !== "offline");

// ─── CanvasNode ──────────────────────────────────────────────────────────────

export const canvasNodeDoc: ComponentDoc = {
  slug: "canvas-node",
  name: "Canvas node",
  group: "Specialized",
  summary:
    "A service on the project canvas, 260 × 120: kind or framework mark, mono name, status tag, URL, last deploy, replica and server chips.",
  components: ["CanvasNode", "CanvasNodeSkeleton"],
  examples: [
    {
      id: "statuses",
      title: "Every status",
      wide: true,
      render: () => (
        <Nodes>
          {SERVICE_STATUSES.map((status) => (
            <CanvasNode
              key={status}
              service={{ ...SERVICES.api, id: status, name: `api-${status}`, status }}
              now={CANVAS_NOW}
            />
          ))}
        </Nodes>
      ),
    },
    {
      id: "selection",
      title: "Selected, multi-selected, hover, dragging",
      wide: true,
      render: () => (
        <Nodes>
          <Labelled label="Selected">
            <CanvasNode service={SERVICES.api} selected now={CANVAS_NOW} />
          </Labelled>
          <Labelled label="Multi-selected">
            <CanvasNode service={SERVICES.web} multiSelected now={CANVAS_NOW} />
          </Labelled>
          <Labelled label="Hover">
            <CanvasNode service={SERVICES.web} data-force="hover" now={CANVAS_NOW} />
          </Labelled>
          <Labelled label="Dragging">
            <CanvasNode service={SERVICES.worker} dragging now={CANVAS_NOW} />
          </Labelled>
        </Nodes>
      ),
    },
    {
      id: "offline",
      title: "Server offline",
      description: "Warning ring and a marker whose tooltip names the server.",
      render: () => (
        <Nodes>
          <CanvasNode service={SERVICES.api} serverOffline now={CANVAS_NOW} />
        </Nodes>
      ),
    },
    {
      id: "database-volume",
      title: "Database with a volume",
      render: () => (
        <Nodes withVolume>
          <CanvasNode service={SERVICES.postgres} now={CANVAS_NOW} />
        </Nodes>
      ),
    },
    {
      id: "kinds",
      title: "Cron, worker, no URL, not deployed",
      wide: true,
      render: () => (
        <Nodes>
          <CanvasNode service={SERVICES.nightly} now={CANVAS_NOW} />
          <CanvasNode service={SERVICES.worker} now={CANVAS_NOW} />
          <CanvasNode service={ADMIN} now={CANVAS_NOW} />
          <CanvasNode
            service={{
              id: "docs",
              name: "docs",
              kind: "web",
              framework: "static",
              status: "queued",
              server: { name: "oracle-1" },
            }}
            now={CANVAS_NOW}
          />
        </Nodes>
      ),
    },
    {
      id: "long-name",
      title: "Long name and URL",
      render: () => (
        <Nodes>
          <CanvasNode
            service={{
              ...SERVICES.api,
              id: "long",
              name: "payments-reconciliation-service-eu-west",
              publicUrl: "payments-reconciliation-service-eu-west-production.apps.example.com",
              lastDeploy: {
                at: CANVAS_NOW - 45 * 60_000,
                commitMessage: "refactor: split the settlement batch into per-currency queues",
                commitSha: "0c1d2e3",
              },
              replicas: 12,
              server: { name: "hetzner-falkenstein-ax102" },
            }}
            now={CANVAS_NOW}
          />
        </Nodes>
      ),
    },
    {
      id: "renaming",
      title: "Renaming",
      description: "F2 or the menu; Enter saves, Escape cancels.",
      render: () => (
        <Nodes>
          <CanvasNode service={SERVICES.api} renaming now={CANVAS_NOW} />
        </Nodes>
      ),
    },
    {
      id: "skeleton",
      title: "Loading and loaded",
      render: () => (
        <Nodes>
          <CanvasNodeSkeleton />
          <CanvasNode service={SERVICES.web} now={CANVAS_NOW} />
        </Nodes>
      ),
    },
  ],
};

// ─── VolumeChip ──────────────────────────────────────────────────────────────

export const volumeChipDoc: ComponentDoc = {
  slug: "volume-chip",
  name: "Volume chip",
  group: "Specialized",
  summary:
    "Storage on the canvas: a dashed card with the mount path, usage and a 40 px meter that turns warning above 80 % and danger above 95 %.",
  components: ["VolumeChip"],
  examples: [
    {
      id: "usage",
      title: "Attached, at each usage level",
      wide: true,
      render: () => (
        <Nodes withVolume>
          {[0.24, 0.86, 0.97].map((ratio) => (
            <CanvasNode
              key={ratio}
              service={{
                ...SERVICES.postgres,
                id: `pg-${String(ratio)}`,
                volume: { ...SERVICES.postgres.volume, usedBytes: ratio * 5 * GB },
              }}
              now={CANVAS_NOW}
            />
          ))}
        </Nodes>
      ),
    },
    {
      id: "standalone",
      title: "Detached, no limit, hover, selected",
      render: () => (
        <div className="flex flex-col gap-4">
          <VolumeChip
            attached={false}
            volume={{
              id: "uploads",
              name: "uploads",
              mountPath: "/app/uploads",
              usedBytes: 3.4 * GB,
              limitBytes: 10 * GB,
            }}
          />
          <VolumeChip
            volume={{
              id: "cache",
              name: "cache",
              mountPath: "/var/cache/app",
              usedBytes: 1.2 * GB,
            }}
            attached={false}
          />
          <VolumeChip
            attached={false}
            data-force="hover"
            volume={{
              id: "media",
              name: "media",
              mountPath: "/srv/media",
              usedBytes: 700 * 1024 ** 2,
              limitBytes: 2 * GB,
            }}
          />
          <VolumeChip
            attached={false}
            selected
            volume={{
              id: "backups",
              name: "backups",
              mountPath: "/backups",
              usedBytes: 4 * GB,
              limitBytes: 20 * GB,
            }}
          />
        </div>
      ),
    },
  ],
};

// ─── CanvasGroup ─────────────────────────────────────────────────────────────

const COLORS: CanvasGroupColor[] = ["neutral", "accent", "info", "success", "warning", "danger"];

export const canvasGroupDoc: ComponentDoc = {
  slug: "canvas-group",
  name: "Canvas group",
  group: "Specialized",
  summary:
    "A labelled region that sits under its services: dashed frame, a 4 % tint of its color, and a label tab with the member count.",
  components: ["CanvasGroup"],
  examples: [
    {
      id: "with-services",
      title: "Neutral, with two services",
      render: () => (
        <div className="pt-4">
          <CanvasGroup
            group={{ id: "backend", label: "Backend" }}
            serviceCount={2}
            width={308}
            height={360}
            onMenu={() => undefined}
          >
            <div className="absolute top-6 left-6">
              <CanvasNode service={SERVICES.api} now={CANVAS_NOW} />
            </div>
            <div className="absolute top-[216px] left-6">
              <CanvasNode service={SERVICES.worker} now={CANVAS_NOW} />
            </div>
          </CanvasGroup>
        </div>
      ),
    },
    {
      id: "colors",
      title: "Colors",
      render: () => (
        <div className="flex flex-wrap gap-x-4 gap-y-8 pt-4">
          {COLORS.map((color, index) => (
            <CanvasGroup
              key={color}
              group={{ id: color, label: color === "neutral" ? "Shared" : `${color} team`, color }}
              serviceCount={index + 1}
              width={200}
              height={96}
            />
          ))}
        </div>
      ),
    },
    {
      id: "states",
      title: "Empty, selected, drop target, hover",
      render: () => (
        <div className="flex flex-wrap gap-x-4 gap-y-8 pt-4">
          <CanvasGroup
            group={{ id: "e", label: "Frontend" }}
            serviceCount={0}
            width={200}
            height={120}
          />
          <CanvasGroup
            group={{ id: "s", label: "Payments", color: "accent" }}
            serviceCount={0}
            width={200}
            height={120}
            selected
          />
          <CanvasGroup
            group={{ id: "d", label: "Data", color: "info" }}
            serviceCount={0}
            width={200}
            height={120}
            dropTarget
          />
          <CanvasGroup
            group={{ id: "h", label: "Jobs", color: "success" }}
            serviceCount={0}
            width={200}
            height={120}
            data-force="hover"
            onMenu={() => undefined}
          />
        </div>
      ),
    },
    {
      id: "renaming",
      title: "Renaming",
      render: () => (
        <div className="pt-4">
          <CanvasGroup
            group={{ id: "r", label: "Backend", color: "accent" }}
            serviceCount={2}
            width={260}
            height={96}
            renaming
          />
        </div>
      ),
    },
  ],
};

// ─── CanvasEdge ──────────────────────────────────────────────────────────────

interface Stub {
  name: string;
  x: number;
  y: number;
}

const STUB_W = 112;
const STUB_H = 40;

function right(stub: Stub): CanvasPoint {
  return { x: stub.x + STUB_W, y: stub.y + STUB_H / 2 };
}

function left(stub: Stub): CanvasPoint {
  return { x: stub.x, y: stub.y + STUB_H / 2 };
}

/** Two or more stand-in nodes and the edges between them, in one SVG. */
function EdgeScene({
  stubs,
  height,
  children,
}: {
  stubs: Stub[];
  height: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 440 ${String(height)}`}
      width="100%"
      style={{ maxWidth: 440 }}
      className="bg-grid overflow-visible"
      role="img"
      aria-label={`Edges between ${stubs.map((stub) => stub.name).join(", ")}`}
    >
      {children}
      {stubs.map((stub) => (
        <g key={stub.name}>
          <rect
            x={stub.x}
            y={stub.y}
            width={STUB_W}
            height={STUB_H}
            className="fill-surface stroke-border-strong"
            strokeWidth={1}
          />
          <text
            x={stub.x + 12}
            y={stub.y + STUB_H / 2}
            dominantBaseline="central"
            className="fill-text text-13 font-mono"
          >
            {stub.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

const API: Stub = { name: "api", x: 16, y: 40 };
const POSTGRES: Stub = { name: "postgres", x: 312, y: 40 };
const REDIS: Stub = { name: "redis", x: 312, y: 128 };

export const canvasEdgeDoc: ComponentDoc = {
  slug: "canvas-edge",
  name: "Canvas edge",
  group: "Specialized",
  summary:
    "A variable reference between services: dashed smooth-step path with data flowing along it; hover or selection shows the variable names.",
  components: ["CanvasEdge"],
  examples: [
    {
      id: "selected",
      title: "Selected: api → postgres with DATABASE_URL",
      render: () => (
        <EdgeScene stubs={[API, POSTGRES]} height={120}>
          <CanvasEdge from={right(API)} to={left(POSTGRES)} variables={["DATABASE_URL"]} selected />
        </EdgeScene>
      ),
    },
    {
      id: "default",
      title: "Default and hover",
      render: () => (
        <EdgeScene stubs={[API, POSTGRES, REDIS]} height={200}>
          <CanvasEdge from={right(API)} to={left(POSTGRES)} variables={["DATABASE_URL"]} />
          <CanvasEdge
            from={right(API)}
            to={left(REDIS)}
            variables={["REDIS_URL", "REDIS_TLS", "REDIS_POOL"]}
            hovered
          />
        </EdgeScene>
      ),
    },
    {
      id: "fan-in",
      title: "Fan-in of three",
      description: "Edges into one node land 12 px apart.",
      render: () => {
        const web: Stub = { name: "web", x: 16, y: 8 };
        const api: Stub = { name: "api", x: 16, y: 80 };
        const worker: Stub = { name: "worker", x: 16, y: 152 };
        const pg: Stub = { name: "postgres", x: 312, y: 80 };
        return (
          <EdgeScene stubs={[web, api, worker, pg]} height={200}>
            <CanvasEdge
              from={right(web)}
              to={left(pg)}
              variables={["DATABASE_URL"]}
              targetOffset={-12}
            />
            <CanvasEdge from={right(api)} to={left(pg)} variables={["DATABASE_URL"]} />
            <CanvasEdge
              from={right(worker)}
              to={left(pg)}
              variables={["DATABASE_URL"]}
              targetOffset={12}
            />
          </EdgeScene>
        );
      },
    },
    {
      id: "dimmed",
      title: "Dimmed",
      description: "Another service is selected: unrelated edges drop to 40 %.",
      render: () => (
        <EdgeScene stubs={[API, POSTGRES, REDIS]} height={200}>
          <CanvasEdge from={right(API)} to={left(POSTGRES)} variables={["DATABASE_URL"]} dimmed />
          <CanvasEdge from={right(API)} to={left(REDIS)} variables={["REDIS_URL"]} selected />
        </EdgeScene>
      ),
    },
  ],
};

// ─── CanvasFlow ──────────────────────────────────────────────────────────────

export const canvasFlowDoc: ComponentDoc = {
  slug: "canvas",
  name: "Canvas",
  group: "Specialized",
  summary:
    "Nodes, volumes, groups and edges inside a static React Flow instance on the instrument grid. Pan and zoom work; editing arrives in Phase 05.",
  components: ["CanvasFlow"],
  examples: [
    {
      id: "project",
      title: "A project: five services, one group, one volume",
      wide: true,
      render: () => {
        const scene = projectScene();
        return <CanvasFlow nodes={scene.nodes} edges={scene.edges} height={460} />;
      },
    },
    {
      id: "selected",
      title: "api selected: unrelated edges dim",
      wide: true,
      render: () => {
        const scene = projectScene({ selected: "api" });
        return <CanvasFlow nodes={scene.nodes} edges={scene.edges} height={460} />;
      },
    },
  ],
};
