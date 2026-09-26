import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";

import { AgentHelloSchema, EnvelopeSchema } from "../gen/ts/lumen/agent/v1/agent_pb.js";

// Written by packages/protocol/roundtrip_test.go with deterministic marshaling.
const fixture = fileURLToPath(new URL("../testdata/agent_hello.bin", import.meta.url));

describe("Envelope{AgentHello} round trip", () => {
  it("decodes the Go fixture and re-encodes it byte for byte", () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const envelope = fromBinary(EnvelopeSchema, bytes);

    expect(envelope.opId).toBe("op_01j8x9k2d3m4n5p6q7r8s9t0v1");
    expect(envelope.timestamp).toBeDefined();
    if (envelope.timestamp === undefined) {
      throw new Error("timestamp missing");
    }
    expect(timestampDate(envelope.timestamp).toISOString()).toBe("2026-09-26T12:00:00.000Z");
    expect(envelope.payload.case).toBe("agentHello");
    if (envelope.payload.case !== "agentHello") {
      throw new Error("payload is not agentHello");
    }
    const hello = envelope.payload.value;
    expect(hello.serverId).toBe("srv_01j8x9k2d3m4n5p6q7r8s9t0v1");
    expect(hello.agentVersion).toBe("0.0.0-dev");
    expect(hello.protocolVersion).toBe(1);
    expect(hello.os).toBe("linux");
    expect(hello.arch).toBe("arm64");
    expect(hello.cpuCores).toBe(4);
    expect(hello.memoryBytes).toBe(24n * 1024n * 1024n * 1024n);
    expect(hello.diskBytes).toBe(200n * 1024n * 1024n * 1024n);
    expect(hello.dockerVersion).toBe("28.1.1");
    expect(hello.publicIp).toBe("203.0.113.10");

    expect(toBinary(EnvelopeSchema, envelope)).toEqual(bytes);
  });

  it("encodes a fresh message the same way as the fixture", () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const decoded = fromBinary(EnvelopeSchema, bytes);
    const rebuilt = create(EnvelopeSchema, {
      opId: decoded.opId,
      timestamp: decoded.timestamp,
      payload: {
        case: "agentHello",
        value: create(AgentHelloSchema, {
          serverId: "srv_01j8x9k2d3m4n5p6q7r8s9t0v1",
          agentVersion: "0.0.0-dev",
          protocolVersion: 1,
          os: "linux",
          arch: "arm64",
          cpuCores: 4,
          memoryBytes: 24n * 1024n * 1024n * 1024n,
          diskBytes: 200n * 1024n * 1024n * 1024n,
          dockerVersion: "28.1.1",
          publicIp: "203.0.113.10",
        }),
      },
    });
    expect(toBinary(EnvelopeSchema, rebuilt)).toEqual(bytes);
  });
});
