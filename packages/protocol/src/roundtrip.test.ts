import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import { EnvelopeSchema, type Envelope } from "../gen/ts/lumen/agent/v1/envelope_pb";

import {
  acceptsProtocolVersion,
  decodeFrame,
  ed25519PrivateKeyFromSeed,
  ed25519PublicKeyFromRaw,
  ed25519RawPublicKey,
  encodeFrame,
  EnvelopeError,
  openEnvelope,
  sealEnvelope,
  signingBytes,
  type EnvelopeBody,
} from "./envelope";
import { PROTOCOL_VERSION } from "./version";

// Same values as packages/protocol/roundtrip_test.go, which writes the fixtures.
const TEST_SEED = Buffer.from(
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  "hex",
);
const SERVER_ID = "srv_01j8x9k2d3m4n5p6q7r8s9t0v1";
const OP_ID = "0192f3a4-5b6c-7d8e-9fa0-b1c2d3e4f5a6";
const TS = 1790424000000n;
const meta = { opId: OP_ID, timestampMs: TS };
const GiB = 1024n * 1024n * 1024n;
const MiB = 1024n * 1024n;

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../testdata/${name}.bin`, import.meta.url))),
  );
}

// Each body built in TypeScript must encode to exactly the bytes Go produced.
const SAMPLES: Record<string, EnvelopeBody> = {
  agent_hello: {
    case: "agentHello",
    value: {
      $typeName: "lumen.agent.v1.AgentHello",
      serverId: SERVER_ID,
      agentVersion: "0.2.0",
      protocolVersion: 1,
      os: "ubuntu",
      osVersion: "24.04",
      arch: "arm64",
      cpuCores: 4,
      memoryBytes: 24n * GiB,
      diskBytes: 200n * GiB,
      dockerVersion: "28.1.1",
      publicIp: "203.0.113.10",
      hostname: "oracle-1",
      kernel: "6.8.0-1015-oracle",
      caddyRunning: true,
      capabilities: ["portcheck", "self-update"],
      provider: "oracle",
      regionLabel: "eu-frankfurt-1",
    },
  },
  control_hello: {
    case: "controlHello",
    value: {
      $typeName: "lumen.agent.v1.ControlHello",
      accepted: true,
      rejectReason: "",
      desiredStateVersion: 7n,
      negotiatedProtocolVersion: 1,
      serverTimeMs: TS,
      config: {
        $typeName: "lumen.agent.v1.AgentConfig",
        heartbeatIntervalS: 10,
        metricsIntervalS: 10,
        logRetentionDays: 7,
        caddyImage: "caddy:2@sha256:abc",
        tcpProxyPortMin: 20000,
        tcpProxyPortMax: 29999,
        rotatedCredential: "",
      },
    },
  },
  control_hello_rejected: {
    case: "controlHello",
    value: {
      $typeName: "lumen.agent.v1.ControlHello",
      accepted: false,
      rejectReason: "CLOCK_SKEW",
      desiredStateVersion: 0n,
      negotiatedProtocolVersion: 0,
      serverTimeMs: TS,
    },
  },
  heartbeat: {
    case: "heartbeat",
    value: {
      $typeName: "lumen.agent.v1.Heartbeat",
      meta: { $typeName: "lumen.agent.v1.Meta", ...meta },
      desiredStateVersionApplied: 7n,
      containerCount: 3,
      dockerOk: true,
      caddyOk: true,
    },
  },
  heartbeat_ack: {
    case: "heartbeatAck",
    value: { $typeName: "lumen.agent.v1.HeartbeatAck", opId: OP_ID, serverTimeMs: TS + 5n },
  },
  metrics_batch: {
    case: "metricsBatch",
    value: {
      $typeName: "lumen.agent.v1.MetricsBatch",
      meta: { $typeName: "lumen.agent.v1.Meta", ...meta },
      hostSample: {
        $typeName: "lumen.agent.v1.HostSample",
        tsMs: TS,
        cpuPercent: 12.5,
        load1: 0.25,
        load5: 0.5,
        load15: 0.75,
        memTotal: GiB,
        memUsed: 512n * MiB,
        memAvailable: 512n * MiB,
        swapTotal: 0n,
        swapUsed: 0n,
        disks: [
          {
            $typeName: "lumen.agent.v1.DiskSample",
            mount: "/",
            total: 50n * GiB,
            used: 10n * GiB,
            free: 40n * GiB,
            inodesFree: 3000000n,
          },
          {
            $typeName: "lumen.agent.v1.DiskSample",
            mount: "/var/lib/docker",
            total: 50n * GiB,
            used: 10n * GiB,
            free: 40n * GiB,
            inodesFree: 3000000n,
          },
        ],
        nets: [
          { $typeName: "lumen.agent.v1.NetSample", iface: "eth0", rxBytes: 1234n, txBytes: 5678n },
        ],
        uptimeS: 3600n,
        containerCount: 1,
        self: {
          $typeName: "lumen.agent.v1.AgentSelf",
          agentRssBytes: 21n * MiB,
          goroutines: 17,
          sendQueueLen: 0,
          reconnectsTotal: 2n,
        },
        diskLow: false,
      },
    },
  },
  port_check: {
    case: "portCheck",
    value: {
      $typeName: "lumen.agent.v1.PortCheck",
      meta: { $typeName: "lumen.agent.v1.Meta", ...meta },
      ports: [80, 443],
      nonce: "n0nce",
    },
  },
  port_check_result: {
    case: "portCheckResult",
    value: {
      $typeName: "lumen.agent.v1.PortCheckResult",
      opId: OP_ID,
      ports: [
        {
          $typeName: "lumen.agent.v1.PortState",
          port: 80,
          listening: true,
          listener: "caddy",
          nonceRouteInstalled: true,
        },
        {
          $typeName: "lumen.agent.v1.PortState",
          port: 443,
          listening: false,
          listener: "",
          nonceRouteInstalled: false,
        },
      ],
    },
  },
  agent_update: {
    case: "agentUpdate",
    value: {
      $typeName: "lumen.agent.v1.AgentUpdate",
      meta: { $typeName: "lumen.agent.v1.Meta", ...meta },
      version: "0.2.1",
      url: "https://cp.example.com/agent/download/0.2.1/lumen-agent-linux-arm64",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      signature: "untrusted comment: x\n",
      force: true,
    },
  },
  agent_update_result: {
    case: "agentUpdateResult",
    value: {
      $typeName: "lumen.agent.v1.AgentUpdateResult",
      opId: OP_ID,
      success: false,
      runningVersion: "0.2.0",
      error: "UPDATE_ROLLED_BACK",
    },
  },
  revoke: {
    case: "revoke",
    value: {
      $typeName: "lumen.agent.v1.Revoke",
      meta: { $typeName: "lumen.agent.v1.Meta", ...meta },
      reason: "Server removed",
    },
  },
  ack: { case: "ack", value: { $typeName: "lumen.agent.v1.Ack", opId: OP_ID } },
  op_error: {
    case: "opError",
    value: {
      $typeName: "lumen.agent.v1.OpError",
      opId: OP_ID,
      code: "CLOCK_SKEW",
      message: "clock is off",
      // Go's deterministic marshaling sorts map keys; insert them sorted too.
      details: { limit_ms: "300000", skew_ms: "420000" },
    },
  },
};

function bodyOnly(body: EnvelopeBody): Envelope {
  return create(EnvelopeSchema, { body });
}

describe("every protocol message round-trips between Go and TypeScript", () => {
  it.each(Object.keys(SAMPLES))("%s", (name) => {
    const body = SAMPLES[name];
    if (body === undefined) {
      throw new Error(`no sample for ${name}`);
    }
    const bytes = fixture(name);
    const decoded = fromBinary(EnvelopeSchema, bytes);
    expect(decoded.body.case).toBe(body.case);
    expect(decoded.body.value).toEqual(body.value);
    expect(toBinary(EnvelopeSchema, bodyOnly(body))).toEqual(bytes);
    expect(toBinary(EnvelopeSchema, decoded)).toEqual(bytes);
  });
});

describe("envelope signing", () => {
  const privateKey = ed25519PrivateKeyFromSeed(TEST_SEED);
  const publicKey = ed25519PublicKeyFromRaw(ed25519RawPublicKey(privateKey));
  const heartbeat = SAMPLES["heartbeat"] ?? { case: undefined };

  it("produces the same signed bytes as Go", () => {
    const sealed = sealEnvelope(privateKey, {
      serverId: SERVER_ID,
      seq: 42n,
      timestampMs: TS,
      body: heartbeat,
    });
    expect(encodeFrame(sealed)).toEqual(fixture("signed_heartbeat"));
  });

  it("opens the Go-signed fixture", () => {
    const envelope = decodeFrame(fixture("signed_heartbeat"));
    expect(envelope.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(envelope.seq).toBe(42n);
    const body = openEnvelope(publicKey, envelope);
    expect(body.case).toBe("heartbeat");
    expect(body.value).toEqual(heartbeat.value);
  });

  it.each([
    [
      "payload flipped",
      (e: Envelope) => {
        e.payload.set([(e.payload.at(-1) ?? 0) ^ 1], e.payload.length - 1);
      },
    ],
    ["seq changed", (e: Envelope) => void (e.seq = 43n)],
    ["server changed", (e: Envelope) => void (e.serverId = "srv_other")],
    ["time changed", (e: Envelope) => void (e.timestampMs += 1n)],
    ["unsigned", (e: Envelope) => void (e.signature = new Uint8Array())],
  ])("rejects a tampered envelope: %s", (_name, mutate) => {
    const envelope = decodeFrame(fixture("signed_heartbeat"));
    mutate(envelope);
    expect(() => openEnvelope(publicKey, envelope)).toThrow(EnvelopeError);
    try {
      openEnvelope(publicKey, envelope);
    } catch (error) {
      expect((error as EnvelopeError).kind).toBe("bad_signature");
    }
  });

  it("rejects a signature from another key", () => {
    const other = generateKeyPairSync("ed25519").publicKey;
    expect(() => openEnvelope(other, decodeFrame(fixture("signed_heartbeat")))).toThrow(
      /does not verify/,
    );
  });

  it("rejects framing violations", () => {
    const withOuterBody = decodeFrame(fixture("signed_heartbeat"));
    withOuterBody.body = heartbeat;
    expect(() => openEnvelope(publicKey, withOuterBody)).toThrow(/outer body/);
    const empty = create(EnvelopeSchema, {});
    expect(() => openEnvelope(publicKey, empty)).toThrow(/empty payload/);
    expect(() =>
      sealEnvelope(privateKey, {
        serverId: SERVER_ID,
        seq: 1n,
        timestampMs: TS,
        body: { case: undefined },
      }),
    ).toThrow(/body is empty/);
    expect(() => decodeFrame(new Uint8Array([0xff, 0xff, 0xff]))).toThrow(EnvelopeError);
  });

  it("lays out the signed bytes like Go", () => {
    expect(Array.from(signingBytes(1, "ab", 2n, 3n, new Uint8Array([9])))).toEqual([
      0, 0, 0, 1, 0, 2, 97, 98, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 9,
    ]);
  });

  it("accepts protocol N and N-1 only", () => {
    expect(acceptsProtocolVersion(PROTOCOL_VERSION)).toBe(true);
    expect(acceptsProtocolVersion(PROTOCOL_VERSION + 1)).toBe(false);
    expect(acceptsProtocolVersion(0)).toBe(false);
  });

  it("validates raw key lengths", () => {
    expect(() => ed25519PublicKeyFromRaw(new Uint8Array(31))).toThrow(EnvelopeError);
    expect(() => ed25519PrivateKeyFromSeed(new Uint8Array(31))).toThrow(EnvelopeError);
  });
});
