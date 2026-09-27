import { generateKeyPairSync } from "node:crypto";

import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import { AckSchema, encodeFrame, sealEnvelope } from "@lumen/protocol";

import { hexEqual, randomToken, secretEqual, sha256Hex, uuidv7 } from "../lib/crypto";
import { TokenBucket, WindowLimiter } from "../lib/rate-limit";

import { GatewayMetrics } from "./metrics";
import {
  credentialMatches,
  GatewayError,
  InboundVerifier,
  inWindow,
  parseAgentBearer,
} from "./verify";

describe("crypto helpers", () => {
  it("makes 256-bit url-safe tokens and UUIDv7 op ids", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(uuidv7(0x0192f3a45b6c)).toMatch(
      /^0192f3a4-5b6c-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(hexEqual(sha256Hex("a"), sha256Hex("a"))).toBe(true);
    expect(hexEqual(sha256Hex("a"), sha256Hex("b"))).toBe(false);
    expect(hexEqual("", "")).toBe(false);
    expect(secretEqual("x", "x")).toBe(true);
  });
});

describe("parseAgentBearer and credentialMatches", () => {
  const id = "srv_01j8x9k2d3m4n5p6q7r8s9t0v1";
  it("parses <server_id>.<credential>", () => {
    expect(parseAgentBearer(`Bearer ${id}.abc`)).toEqual({ serverId: id, credential: "abc" });
    for (const bad of [
      undefined,
      "Basic x",
      `Bearer ${id}`,
      `Bearer ${id}.`,
      "Bearer ws_x.abc",
      `Bearer ${id}.${"a".repeat(200)}`,
    ]) {
      expect(parseAgentBearer(bad)).toBeNull();
    }
  });
  it("accepts the previous credential only during the grace period", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const row = {
      credentialHash: sha256Hex("new"),
      previousCredentialHash: sha256Hex("old"),
      previousCredentialExpiresAt: new Date(now.getTime() + 60_000),
    };
    expect(credentialMatches(row, "new", now)).toBe(true);
    expect(credentialMatches(row, "old", now)).toBe(true);
    expect(credentialMatches(row, "old", new Date(now.getTime() + 61_000))).toBe(false);
    expect(credentialMatches(row, "other", now)).toBe(false);
  });
});

describe("InboundVerifier", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const id = "srv_01j8x9k2d3m4n5p6q7r8s9t0v1";
  const frame = (seq: bigint, serverId = id) =>
    encodeFrame(
      sealEnvelope(privateKey, {
        serverId,
        seq,
        timestampMs: BigInt(Date.now()),
        body: { case: "ack", value: create(AckSchema, { opId: "x" }) },
      }),
    );

  it("enforces seq = previous + 1 and the server id", () => {
    const v = new InboundVerifier(publicKey, id);
    expect(v.open(frame(1n)).body.case).toBe("ack");
    expect(() => v.open(frame(1n))).toThrow(GatewayError);
    expect(() => v.open(frame(3n))).toThrow(/seq 3 after 1/);
    expect(v.open(frame(2n)).protocolVersion).toBe(1);
    expect(() =>
      new InboundVerifier(publicKey, id).open(frame(1n, "srv_01j8x9k2d3m4n5p6q7r8s9t0v2")),
    ).toThrow(/envelope for/);
    expect(() => new InboundVerifier(publicKey, id).open(new Uint8Array([0xff, 0xff]))).toThrow(
      GatewayError,
    );
  });

  it("applies the -5 min / +1 min window", () => {
    expect(inWindow(0)).toBe(true);
    expect(inWindow(-5 * 60_000)).toBe(true);
    expect(inWindow(-5 * 60_000 - 1)).toBe(false);
    expect(inWindow(60_001)).toBe(false);
  });
});

describe("rate limiters", () => {
  it("token bucket refills over time", () => {
    let t = 0;
    const b = new TokenBucket(2, 1, () => t);
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
    t = 1000;
    expect(b.take()).toBe(true);
  });
  it("window limiter reports seconds to wait", () => {
    let t = 0;
    const w = new WindowLimiter(2, 60_000, () => t);
    expect([w.hit("a"), w.hit("a"), w.hit("a")]).toEqual([0, 0, 60]);
    expect(w.hit("b")).toBe(0);
    t = 60_000;
    expect(w.hit("a")).toBe(0);
  });
});

describe("GatewayMetrics", () => {
  it("renders Prometheus text", () => {
    const m = new GatewayMetrics();
    m.message("heartbeat");
    m.heartbeatLag(0.2);
    m.signatureFailures = 3;
    const text = m.render();
    expect(text).toContain('lumen_gateway_messages_total{type="heartbeat"} 1');
    expect(text).toContain("lumen_gateway_signature_failures_total 3");
    expect(text).toContain('lumen_gateway_heartbeat_lag_seconds_bucket{le="0.25"} 1');
    expect(text).toContain('lumen_gateway_heartbeat_lag_seconds_bucket{le="0.1"} 0');
  });
});
