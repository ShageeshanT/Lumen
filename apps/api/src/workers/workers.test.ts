import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ServerRow } from "@lumen/db";

import { checklistFor, toServer } from "../services/servers/view";

import { readRelease } from "./agent-update-rollout";
import { buildResult, probePort, type Prober } from "./port-check";

const nonce = "n0nce-abcdefgh";

function prober(opts: {
  connect?: boolean;
  refused?: boolean;
  body?: string;
  timeout?: boolean;
  loopbackOk?: boolean;
}): Prober {
  return {
    connect: (host) =>
      Promise.resolve(
        host === "127.0.0.1" && opts.loopbackOk === true
          ? { ok: true, ms: 1 }
          : opts.connect === false
            ? { ok: false, reason: opts.refused === true ? "refused" : "timeout" }
            : { ok: true, ms: 1 },
      ),
    get: (host) =>
      Promise.resolve(
        host === "127.0.0.1" && opts.loopbackOk === true
          ? { ok: true, body: nonce, ms: 2 }
          : opts.timeout === true
            ? { ok: false, reason: "timeout" }
            : { ok: true, body: opts.body ?? nonce, ms: 9 },
      ),
  };
}

describe("probePort", () => {
  it("classifies every outcome", async () => {
    const run = (p: Prober, listening = true, hairpin: string | null = null) =>
      probePort(p, "203.0.113.10", 443, nonce, listening, hairpin);
    expect(await run(prober({}))).toEqual({ state: "reachable", latency_ms: 9 });
    expect((await run(prober({}), false)).state).toBe("not_listening");
    expect((await run(prober({ connect: false }))).state).toBe("listening_not_reachable");
    expect((await run(prober({ connect: false, refused: true }))).state).toBe(
      "listening_not_reachable",
    );
    expect((await run(prober({ timeout: true }))).state).toBe("timeout");
    expect((await run(prober({ body: "someone else" }))).state).toBe("listening_not_reachable");
    expect((await run(prober({ connect: false, loopbackOk: true }), true, "127.0.0.1")).state).toBe(
      "reachable_hairpin_unknown",
    );
  });
});

describe("buildResult", () => {
  it("attaches both fix cards for the provider to blocked ports only", () => {
    const r = buildResult({ provider: "aws", name: "web-1" }, "op", new Date(0), [
      { port: 80, state: "reachable", latency_ms: 5, listener: "caddy" },
      { port: 443, state: "listening_not_reachable", latency_ms: null, listener: "caddy" },
    ]);
    expect(r.ports[0]?.fix).toBeNull();
    expect(r.ports[1]?.fix?.cards.map((c) => c.key)).toEqual([
      "PORT_BLOCKED.aws.cloud",
      "PORT_BLOCKED.aws.os",
    ]);
    expect(r.ports[1]?.fix?.message).toBe("Port 443 is blocked on your server");
    const unknown = buildResult({ provider: "linode", name: "x" }, "op", new Date(0), [
      { port: 443, state: "listening_not_reachable", latency_ms: null, listener: null },
    ]);
    expect(unknown.ports[0]?.fix?.cards[0]?.key).toBe("PORT_BLOCKED.other.cloud");
  });
});

describe("readRelease", () => {
  it("reads checksum and signature and rejects bad input", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel-"));
    mkdirSync(join(dir, "0.2.1"));
    writeFileSync(
      join(dir, "0.2.1", "lumen-agent-linux-arm64.sha256"),
      `${"a".repeat(64)}  lumen-agent-linux-arm64\n`,
    );
    writeFileSync(join(dir, "0.2.1", "lumen-agent-linux-arm64.minisig"), "untrusted comment: x\n");
    expect(readRelease(dir, "0.2.1", "arm64")).toEqual({
      version: "0.2.1",
      arch: "arm64",
      sha256: "a".repeat(64),
      signature: "untrusted comment: x\n",
      file: "lumen-agent-linux-arm64",
    });
    expect(readRelease(dir, "0.2.1", "amd64")).toBeNull();
    expect(readRelease(dir, "../etc", "arm64")).toBeNull();
    expect(readRelease(dir, "0.2.1", "riscv")).toBeNull();
    expect(readRelease(undefined, "0.2.1", "arm64")).toBeNull();
  });
});

function row(over: Partial<ServerRow>): ServerRow {
  const base: ServerRow = {
    id: "srv_01j8x9k2d3m4n5p6q7r8s9t0v1",
    workspaceId: "ws_01j8x9k2d3m4n5p6q7r8s9t0v1",
    name: "oracle-1",
    provider: "oracle",
    regionLabel: null,
    publicIp: "203.0.113.10",
    meshIp: null,
    containerSubnet: null,
    arch: "arm64",
    os: "ubuntu",
    osVersion: "24.04",
    kernel: null,
    hostname: null,
    cpuCores: 4,
    memoryMb: 24576,
    diskGb: 200,
    dockerVersion: "28.1.1",
    agentVersion: "0.2.0",
    agentProtocolVersion: 1,
    status: "online",
    offlineSince: null,
    lastHeartbeatAt: new Date("2026-09-27T12:00:00Z"),
    labels: [],
    wgPublicKey: null,
    monthlyCost: null,
    agentPublicKey: "pk",
    credentialHash: "h",
    previousCredentialHash: null,
    previousCredentialExpiresAt: null,
    credentialRotationRequestedAt: null,
    dockerOk: true,
    caddyOk: true,
    diskLow: false,
    containerCount: 1,
    clockSkewMs: 0,
    desiredStateVersion: 0,
    lastHostSample: null,
    portCheck: null,
    agentUpdate: null,
    gatewayNode: null,
    gatewayConnectedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  return { ...base, ...over };
}

describe("checklist and issues", () => {
  const now = new Date("2026-09-27T12:00:05Z");
  it("is green when online with probes ok and ports reachable", () => {
    const pc = buildResult({ provider: "oracle", name: "x" }, "op", now, [
      { port: 80, state: "reachable", latency_ms: 1, listener: null },
      { port: 443, state: "reachable_hairpin_unknown", latency_ms: 1, listener: null },
    ]);
    expect(checklistFor(row({ portCheck: pc }), now)).toEqual({
      connected: "ok",
      docker_ready: "ok",
      proxy_running: "ok",
      port_80: "ok",
      port_443: "ok",
      mesh: "n/a",
    });
  });

  it("goes red and lists catalog issues when offline, disk low and skewed", () => {
    const s = toServer(
      row({
        status: "offline",
        diskLow: true,
        clockSkewMs: 7 * 60_000,
        dockerOk: false,
        lastHeartbeatAt: new Date("2026-09-27T11:00:00Z"),
      }),
      now,
    );
    expect(s.checklist.connected).toBe("failed");
    expect(s.checklist.docker_ready).toBe("failed");
    expect(s.issues.map((i) => i.code)).toEqual(["AGENT_OFFLINE", "DISK_FULL", "CLOCK_SKEW"]);
    expect(s.issues[2]?.title).toBe("Your server's clock is off by 7 minutes");
  });

  it("stays pending before the first heartbeat", () => {
    const s = toServer(
      row({ status: "pending", dockerOk: null, caddyOk: null, lastHeartbeatAt: null }),
      now,
    );
    expect(Object.values(s.checklist)).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
      "n/a",
    ]);
  });
});
