import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { OpenAPIHono } from "@hono/zod-openapi";

import { getFix, isServerProvider, LumenHttpError, renderFixCardText } from "@lumen/shared";

import type { AppEnv } from "../../app";
import type { ControlPlane } from "../../context";

const SCRIPT_CANDIDATES = ["deploy/agent-install.sh", "../../deploy/agent-install.sh"];
const VERSION = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;
const FILE = /^lumen-agent-linux-(amd64|arm64)(\.sha256|\.minisig)?$/;

function loadScript(): string {
  const fromEnv = process.env["AGENT_INSTALL_SCRIPT"];
  for (const p of fromEnv === undefined ? SCRIPT_CANDIDATES : [fromEnv]) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      // try the next location
    }
  }
  throw new Error("deploy/agent-install.sh was not found; set AGENT_INSTALL_SCRIPT");
}

/** Substitutes the control plane URL, agent version and release key. */
export function renderInstallScript(
  template: string,
  values: { controlPlane: string; version: string; releaseKey: string },
): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9+/=:._\-[\]]/g, "");
  return template
    .replaceAll("__LUMEN_CONTROL_PLANE__", safe(values.controlPlane))
    .replaceAll("__LUMEN_AGENT_VERSION__", safe(values.version))
    .replaceAll("__LUMEN_RELEASE_PUBKEY__", safe(values.releaseKey));
}

/**
 * Public, unauthenticated routes servers use during install:
 * `GET /install/agent.sh` (the installer with this instance's URL, version
 * and release key filled in), `GET /install/fix/:code/:provider/:layer` (a
 * fix card as plain text for the terminal), and `GET /agent/download/...`
 * (release binaries, checksums and signatures).
 */
export function installRoutes(cp: ControlPlane): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();
  let template: string | undefined;

  app.get("/install/agent.sh", (c) => {
    if (
      cp.config.AGENT_LATEST_VERSION === undefined ||
      cp.config.AGENT_RELEASE_PUBKEY === undefined
    ) {
      throw new LumenHttpError("NOT_FOUND", { resource: "agent installer" });
    }
    template ??= loadScript();
    const controlPlane = (cp.config.PUBLIC_URL ?? new URL(c.req.url).origin).replace(/\/$/, "");
    const body = renderInstallScript(template, {
      controlPlane,
      version: cp.config.AGENT_LATEST_VERSION,
      releaseKey: cp.config.AGENT_RELEASE_PUBKEY,
    });
    return c.body(body, 200, {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    });
  });

  app.get("/install/fix/:code/:provider/:layer", (c) => {
    const { code, provider, layer } = c.req.param();
    if (
      (code !== "PORT_BLOCKED" && code !== "MESH_UNREACHABLE") ||
      (layer !== "cloud" && layer !== "os")
    ) {
      throw new LumenHttpError("NOT_FOUND", { resource: "fix card" });
    }
    const card = getFix(code, isServerProvider(provider) ? provider : "other", layer);
    return c.text(renderFixCardText(card), 200, { "cache-control": "public, max-age=300" });
  });

  app.get("/agent/download/:version/:file", (c) => {
    const { version, file } = c.req.param();
    const dir = cp.config.AGENT_RELEASE_DIR;
    if (dir === undefined || !VERSION.test(version) || !FILE.test(file)) {
      throw new LumenHttpError("NOT_FOUND", { resource: "agent release" });
    }
    let data: Buffer;
    try {
      data = readFileSync(join(resolve(dir), version, file));
    } catch {
      throw new LumenHttpError("NOT_FOUND", { resource: "agent release" });
    }
    const binary = !file.includes(".");
    return c.body(new Uint8Array(data), 200, {
      "content-type": binary ? "application/octet-stream" : "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, immutable",
    });
  });

  return app;
}
