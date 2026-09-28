import type { Status } from "../status/status";

import type { ChartMarker, ChartSeries } from "./chart";

/**
 * Hand-written, deterministic sample data for the data-display gallery pages
 * and the performance check. Nothing here talks to an API.
 */

export const GALLERY_NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

/** A small seeded generator so the "random" data is identical on every render. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

export interface Deployment {
  id: string;
  message: string;
  commit: string;
  status: Status;
  trigger: string;
  createdAt: number;
  durationMs: number;
}

export const DEPLOYMENTS: Deployment[] = [
  {
    id: "dep_a1b2c3d",
    message: "fix: retry on 502",
    commit: "a1b2c3d",
    status: "active",
    trigger: "Pushed to main",
    createdAt: GALLERY_NOW - 3 * 60_000,
    durationMs: 42_000,
  },
  {
    id: "dep_9f8e7d6",
    message: "chore: bump dependencies",
    commit: "9f8e7d6",
    status: "superseded",
    trigger: "Pushed to main",
    createdAt: GALLERY_NOW - 2 * 3_600_000,
    durationMs: 51_000,
  },
  {
    id: "dep_c4d5e6f",
    message: "feat: rate limits",
    commit: "c4d5e6f",
    status: "failed",
    trigger: "Pushed to main",
    createdAt: GALLERY_NOW - 5 * 3_600_000,
    durationMs: 72_000,
  },
  {
    id: "dep_1a2b3c4",
    message: "fix: typo in README",
    commit: "1a2b3c4",
    status: "removed",
    trigger: "Redeployed",
    createdAt: GALLERY_NOW - 26 * 3_600_000,
    durationMs: 39_000,
  },
  {
    id: "dep_7e6d5c4",
    message: "feat: checkout redesign",
    commit: "7e6d5c4",
    status: "building",
    trigger: "Preview #42",
    createdAt: GALLERY_NOW - 40_000,
    durationMs: 40_000,
  },
];

export interface Variable {
  name: string;
  source: "Service" | "Shared" | "Reference";
  sealed: boolean;
}

export const VARIABLES: Variable[] = [
  { name: "DATABASE_URL", source: "Reference", sealed: false },
  { name: "NODE_ENV", source: "Shared", sealed: false },
  { name: "PORT", source: "Service", sealed: false },
  { name: "STRIPE_SECRET_KEY", source: "Service", sealed: true },
  { name: "SESSION_SECRET", source: "Shared", sealed: true },
];

export interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  target: string;
  ip: string;
}

const ACTORS = ["ana@acme.dev", "ben@acme.dev", "chen@acme.dev", "ci-token", "dana@acme.dev"];
const ACTIONS = [
  "deploy.create",
  "variable.update",
  "variable.delete",
  "domain.add",
  "service.restart",
  "member.invite",
  "backup.run",
  "server.connect",
];
const TARGETS = ["api", "web", "worker", "postgres", "redis", "oracle-1", "hetzner-2"];

/** `count` audit rows, newest first, one every 37 seconds. */
export function auditLog(count: number): AuditEntry[] {
  const random = seeded(42);
  return Array.from({ length: count }, (_, index) => {
    const pick = <V>(list: readonly V[]): V => list[Math.floor(random() * list.length)] as V;
    return {
      id: `aud_${String(index).padStart(5, "0")}`,
      at: GALLERY_NOW - index * 37_000,
      actor: pick(ACTORS),
      action: pick(ACTIONS),
      target: pick(TARGETS),
      ip: `10.0.${String(Math.floor(random() * 255))}.${String(Math.floor(random() * 255))}`,
    };
  });
}

export const HOUR = { from: GALLERY_NOW - 3_600_000, to: GALLERY_NOW };

/** One sample per `stepS` seconds over the last hour. */
export function wave(
  seed: number,
  {
    base,
    swing,
    noise,
    stepS = 60,
    period = 900,
  }: {
    base: number;
    swing: number;
    noise: number;
    stepS?: number;
    period?: number;
  },
): [number, number][] {
  const random = seeded(seed);
  const points: [number, number][] = [];
  for (let t = HOUR.from; t <= HOUR.to; t += stepS * 1000) {
    const phase = (t - HOUR.from) / 1000 / period;
    const value = base + swing * Math.sin(phase * Math.PI * 2 + seed) + (random() - 0.5) * noise;
    points.push([t, Math.max(0, Math.round(value * 10) / 10)]);
  }
  return points;
}

export const CPU: ChartSeries[] = [
  { id: "cpu", label: "CPU", data: wave(1, { base: 38, swing: 22, noise: 10 }) },
];

export const MEMORY: ChartSeries[] = [
  { id: "memory", label: "Memory", data: wave(2, { base: 360, swing: 90, noise: 30 }) },
];

export const NETWORK: ChartSeries[] = [
  { id: "in", label: "In", data: wave(3, { base: 420, swing: 160, noise: 90 }) },
  { id: "out", label: "Out", color: "violet", data: wave(4, { base: 180, swing: 70, noise: 40 }) },
];

export const REQUESTS: ChartSeries[] = [
  { id: "requests", label: "Requests", data: wave(5, { base: 1200, swing: 500, noise: 200 }) },
];

export const REPLICAS: ChartSeries[] = [
  { id: "total", label: "All replicas", data: wave(6, { base: 44, swing: 14, noise: 6 }) },
  {
    id: "r1",
    label: "Replica 1",
    color: "violet",
    dashed: true,
    data: wave(7, { base: 24, swing: 8, noise: 4 }),
  },
  {
    id: "r2",
    label: "Replica 2",
    color: "success",
    dashed: true,
    data: wave(8, { base: 20, swing: 7, noise: 4 }),
  },
];

/** CPU with a 12-minute hole where the agent was offline: the line breaks, it is not bridged. */
export const CPU_GAP: ChartSeries[] = [
  {
    id: "cpu",
    label: "CPU",
    data: wave(9, { base: 30, swing: 15, noise: 8 }).map(([t, v]) =>
      t > HOUR.from + 25 * 60_000 && t < HOUR.from + 37 * 60_000 ? [t, null] : [t, v],
    ),
  },
];

export const DEPLOY_MARKERS: ChartMarker[] = [
  { ts: HOUR.from + 14 * 60_000, label: "Deploy a1b2c3d · fix: retry on 502", kind: "deploy" },
  {
    ts: HOUR.from + 47 * 60_000,
    label: "Deploy 9f8e7d6 · chore: bump dependencies",
    kind: "deploy",
  },
];

export const OOM_MARKERS: ChartMarker[] = [
  { ts: HOUR.from + 33 * 60_000, label: "Out of memory · restarted", kind: "oom" },
];

/** Four one-second series over an hour (3,600 points each) for the synced dashboard. */
export function denseMetrics(): {
  title: string;
  unit: "%" | "MB" | "KB/s" | "req/min";
  series: ChartSeries[];
}[] {
  return [
    {
      title: "CPU",
      unit: "%",
      series: [
        { id: "cpu", label: "CPU", data: wave(11, { base: 38, swing: 20, noise: 12, stepS: 1 }) },
      ],
    },
    {
      title: "Memory",
      unit: "MB",
      series: [
        {
          id: "mem",
          label: "Memory",
          data: wave(12, { base: 380, swing: 60, noise: 20, stepS: 1 }),
        },
      ],
    },
    {
      title: "Network",
      unit: "KB/s",
      series: [
        { id: "in", label: "In", data: wave(13, { base: 400, swing: 150, noise: 120, stepS: 1 }) },
        {
          id: "out",
          label: "Out",
          color: "violet",
          data: wave(14, { base: 160, swing: 60, noise: 50, stepS: 1 }),
        },
      ],
    },
    {
      title: "Requests",
      unit: "req/min",
      series: [
        {
          id: "req",
          label: "Requests",
          data: wave(15, { base: 1100, swing: 400, noise: 300, stepS: 1 }),
        },
      ],
    },
  ];
}
