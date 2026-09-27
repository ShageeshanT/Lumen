import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, DATABASE_URL, type Harness } from "../../test-support/harness";

import { renderInstallScript } from "./agent-script";

describe("renderInstallScript", () => {
  it("substitutes the three placeholders and strips shell metacharacters", () => {
    const out = renderInstallScript(
      'A="__LUMEN_CONTROL_PLANE__" B="__LUMEN_AGENT_VERSION__" C="__LUMEN_RELEASE_PUBKEY__" case x in __LUMEN_*__) ;; esac',
      {
        controlPlane: "https://cp.example.com",
        version: "0.2.1",
        releaseKey: 'RWQ+/=$(rm -rf /)"',
      },
    );
    expect(out).toBe(
      'A="https://cp.example.com" B="0.2.1" C="RWQ+/=rm-rf/" case x in __LUMEN_*__) ;; esac',
    );
  });
});

describe.skipIf(DATABASE_URL === undefined)("install routes", () => {
  let h: Harness;
  let releases: string;
  beforeAll(async () => {
    releases = mkdtempSync(join(tmpdir(), "releases-"));
    mkdirSync(join(releases, "0.2.1"));
    writeFileSync(join(releases, "0.2.1", "lumen-agent-linux-amd64"), "BINARY");
    writeFileSync(
      join(releases, "0.2.1", "lumen-agent-linux-amd64.sha256"),
      "abc  lumen-agent-linux-amd64\n",
    );
    h = await createHarness({
      AGENT_RELEASE_DIR: releases,
      AGENT_LATEST_VERSION: "0.2.1",
      AGENT_RELEASE_PUBKEY: "RWQtestkey",
    });
  });
  afterAll(async () => {
    await h.close();
  });

  it("serves the installer with this instance's values", async () => {
    const res = await h.app.request("/install/agent.sh");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.startsWith("#!/bin/sh")).toBe(true);
    expect(text).toContain('CONTROL_PLANE_DEFAULT="https://cp.example.com"');
    expect(text).toContain("LUMEN_AGENT_VERSION:-0.2.1");
    expect(text).toContain("RWQtestkey");
    expect(text).not.toContain("__LUMEN_CONTROL_PLANE__");
  });

  it("serves fix cards as text and falls back to the generic card", async () => {
    const oracle = await h.app.request("/install/fix/PORT_BLOCKED/oracle/cloud");
    expect(oracle.status).toBe(200);
    expect(await oracle.text()).toContain("443");
    const other = await h.app.request("/install/fix/PORT_BLOCKED/linode/os");
    expect(other.status).toBe(200);
    expect((await h.app.request("/install/fix/NOPE/oracle/cloud")).status).toBe(404);
  });

  it("serves release files and refuses anything else", async () => {
    const bin = await h.app.request("/agent/download/0.2.1/lumen-agent-linux-amd64");
    expect(bin.status).toBe(200);
    expect(await bin.text()).toBe("BINARY");
    expect(bin.headers.get("content-type")).toBe("application/octet-stream");
    expect(
      (await h.app.request("/agent/download/0.2.1/lumen-agent-linux-amd64.sha256")).status,
    ).toBe(200);
    expect((await h.app.request("/agent/download/0.2.1/lumen-agent-linux-arm64")).status).toBe(404);
    expect((await h.app.request("/agent/download/0.2.1/..%2Fsecret")).status).toBe(404);
    expect((await h.app.request("/agent/download/latest/lumen-agent-linux-amd64")).status).toBe(
      404,
    );
  });
});
