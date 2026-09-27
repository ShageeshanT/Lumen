import { STATUSES, type Status } from "../status/status";

import type { CanvasFlowEdge, CanvasFlowNode } from "./canvas-flow";
import type { CanvasService } from "./canvas-node";

/**
 * Hand-written canvas scenes for the gallery and the 100-node performance
 * page. Relative dates use CANVAS_NOW so every render reads the same.
 */
export const CANVAS_NOW = Date.parse("2026-09-26T12:00:00.000Z");
const MIN = 60_000;

const GB = 1024 ** 3;

export const SERVICES = {
  web: {
    id: "web",
    name: "web",
    kind: "web",
    framework: "node",
    status: "active",
    publicUrl: "web-production-k3n8.apps.example.com",
    lastDeploy: {
      at: CANVAS_NOW - 2 * MIN,
      commitMessage: "feat: checkout redesign",
      commitSha: "4be1c09",
    },
    server: { name: "oracle-1" },
  },
  api: {
    id: "api",
    name: "api",
    kind: "web",
    framework: "go",
    status: "active",
    publicUrl: "api.example.com",
    lastDeploy: {
      at: CANVAS_NOW - 3 * MIN,
      commitMessage: "fix: retry on 502",
      commitSha: "a91f3d2",
    },
    replicas: 2,
    server: { name: "oracle-1" },
  },
  worker: {
    id: "worker",
    name: "worker",
    kind: "worker",
    status: "building",
    lastDeploy: {
      at: CANVAS_NOW - 3 * MIN,
      commitMessage: "fix: retry on 502",
      commitSha: "a91f3d2",
    },
    server: { name: "oracle-1" },
  },
  postgres: {
    id: "postgres",
    name: "postgres",
    kind: "database",
    engine: "postgres",
    status: "active",
    lastDeploy: {
      at: CANVAS_NOW - 12 * 24 * 60 * MIN,
      commitMessage: "postgres:16",
      commitSha: "",
    },
    server: { name: "oracle-1" },
    volume: {
      id: "vol-pg",
      name: "data",
      mountPath: "/var/lib/postgresql/data",
      usedBytes: 1.2 * GB,
      limitBytes: 5 * GB,
    },
  },
  redis: {
    id: "redis",
    name: "redis",
    kind: "database",
    engine: "redis",
    status: "active",
    lastDeploy: { at: CANVAS_NOW - 12 * 24 * 60 * MIN, commitMessage: "redis:7", commitSha: "" },
    server: { name: "oracle-1" },
  },
  nightly: {
    id: "nightly",
    name: "nightly-report",
    kind: "cron",
    status: "sleeping",
    schedule: "Every day at 3:00",
    lastDeploy: {
      at: CANVAS_NOW - 9 * 60 * MIN,
      commitMessage: "chore: bump pdfkit",
      commitSha: "77c0e1a",
    },
    server: { name: "hetzner-fsn1" },
  },
} satisfies Record<string, CanvasService>;

/** The five-service project from the direction pages: web, api, worker, postgres + volume, redis. */
export function projectScene(options: { selected?: string } = {}): {
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
} {
  const selected = options.selected;
  const service = (key: keyof typeof SERVICES, x: number, y: number): CanvasFlowNode => ({
    id: key,
    type: "service",
    position: { x, y },
    zIndex: 1,
    data: { service: SERVICES[key], selected: selected === key, now: CANVAS_NOW },
  });
  const related = (edge: { source: string; target: string }) =>
    selected === undefined || edge.source === selected || edge.target === selected;
  const edges: CanvasFlowEdge[] = [
    {
      id: "api-postgres",
      source: "api",
      target: "postgres",
      variables: ["DATABASE_URL"],
      offset: 0,
    },
    { id: "api-redis", source: "api", target: "redis", variables: ["REDIS_URL"], offset: 0 },
    {
      id: "worker-postgres",
      source: "worker",
      target: "postgres",
      variables: ["DATABASE_URL"],
      offset: 12,
    },
    {
      id: "web-api",
      source: "web",
      target: "api",
      variables: ["API_URL", "API_KEY", "API_TIMEOUT"],
      offset: 0,
    },
  ].map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "reference",
    selected: selected !== undefined && edge.source === selected && edge.target === "postgres",
    data: {
      variables: edge.variables,
      dimmed: !related(edge),
      targetOffset: edge.offset,
    },
  }));
  return {
    nodes: [
      {
        id: "backend",
        type: "group",
        position: { x: 336, y: 40 },
        width: 308,
        height: 360,
        zIndex: 0,
        data: { group: { id: "backend", label: "Backend", color: "accent" }, serviceCount: 2 },
      },
      service("web", 0, 64),
      service("api", 360, 64),
      service("worker", 360, 256),
      service("postgres", 720, 64),
      service("redis", 720, 304),
    ],
    edges,
  };
}

/** A 10 × 10 grid of services with references between neighbours: the 60 fps budget case. */
export function hundredNodeScene(): { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } {
  const nodes: CanvasFlowNode[] = [];
  const edges: CanvasFlowEdge[] = [];
  const kinds: CanvasService["kind"][] = ["web", "worker", "web", "database", "cron"];
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      const index = row * 10 + col;
      const kind = kinds[index % kinds.length] ?? "web";
      const status: Status = STATUSES[index % STATUSES.length] ?? "active";
      const id = `svc-${String(index)}`;
      const service: CanvasService = {
        id,
        name: `service-${String(index).padStart(3, "0")}`,
        kind,
        status,
        lastDeploy: {
          at: CANVAS_NOW - (index + 1) * 7 * MIN,
          commitMessage: `feat: change number ${String(index)}`,
          commitSha: index.toString(16).padStart(7, "0"),
        },
        server: { name: `node-${String((index % 4) + 1)}` },
        ...(kind === "web"
          ? { framework: "node" as const, publicUrl: `${id}.apps.example.com` }
          : {}),
        ...(kind === "database" ? { engine: "postgres" as const } : {}),
        ...(kind === "cron" ? { schedule: "Every hour" } : {}),
        ...(index % 3 === 0 ? { replicas: 2 } : {}),
      };
      nodes.push({
        id,
        type: "service",
        position: { x: col * 340, y: row * 200 },
        zIndex: 1,
        data: { service, now: CANVAS_NOW },
      });
      if (col < 9) {
        edges.push({
          id: `e-${id}`,
          source: id,
          target: `svc-${String(index + 1)}`,
          type: "reference",
          data: { variables: [`SERVICE_${String(index + 1)}_URL`] },
        });
      }
    }
  }
  return { nodes, edges };
}
