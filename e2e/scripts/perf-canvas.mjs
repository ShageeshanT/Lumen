// Canvas budget (Phase 1 §5 Performance): 100 service nodes at 60 fps while
// panning and zooming. Drags the pane across the grid and zooms in and out,
// records every animation frame and a Chrome trace, and writes
// docs/evidence/phase-01/perf/canvas-100.{json,trace.json.gz,png}.
//
// Usage, with the web app running:
//   E2E_WEB_PORT=3203 node e2e/scripts/perf-canvas.mjs
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

import { baseUrl, outDir, saveReadout, saveTrace, startFrames, stopFrames } from "./perf-lib.mjs";

// PERF_CANVAS_MOUNT=all mounts every node instead of only the visible ones.
const mountAll = process.env.PERF_CANVAS_MOUNT === "all";
const name = `canvas-100${process.env.PERF_CANVAS_MOUNT === "all" ? ".mount-all" : ""}${process.env.PERF_REDUCED === "1" ? ".reduced-motion" : ""}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
// PERF_REDUCED=1 measures with reduced motion (edge flow stopped) for comparison.
const reducedMotion = process.env.PERF_REDUCED === "1";
if (reducedMotion) {
  await page.emulateMedia({ reducedMotion: "reduce" });
}
await page.goto(`${baseUrl}/dev/components/canvas-perf${mountAll ? "?mount=all" : ""}`, {
  waitUntil: "networkidle",
  timeout: 180_000,
});
await page.evaluate(() => document.fonts.ready);
const pane = page.locator(".react-flow__pane");
await pane.waitFor();
await page.waitForTimeout(1000);
// Zoom out from the 100 % first view to about 60 % so a dozen or more nodes are in view while panning.
const box = await pane.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
for (let i = 0; i < 2; i += 1) {
  await page.mouse.wheel(0, 200);
}
await page.waitForTimeout(500);

const tmpTrace = resolve(outDir, `${name}.trace.tmp.json`);
const tracing = process.env.PERF_TRACE !== "0";
if (tracing) {
  await browser.startTracing(page, { path: tmpTrace, screenshots: false });
}
await startFrames(page);
// Four pans across the grid, then zoom out and back in.
const path = [
  [cx + 400, cy + 200],
  [cx - 400, cy - 250],
  [cx + 350, cy - 200],
  [cx - 350, cy + 250],
];
for (const [x, y] of path) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 60 });
  await page.mouse.up();
}
const pan = await stopFrames(page);
await startFrames(page);
for (let i = 0; i < 12; i += 1) {
  await page.mouse.wheel(0, i < 6 ? 160 : -160);
  await page.waitForTimeout(16);
}
const zoom = await stopFrames(page);
const readout = { pan, zoom };
if (tracing) {
  await browser.stopTracing();
}

const state = await page.evaluate(() => ({
  nodesInScene: 100,
  nodesMounted: document.querySelectorAll(".react-flow__node").length,
  edgesMounted: document.querySelectorAll(".react-flow__edge").length,
  zoomAfterRun: Number(
    /scale\(([\d.]+)\)/.exec(
      document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "",
    )?.[1],
  ),
}));
await page.screenshot({ path: resolve(outDir, `${name}.png`) });
const trace = tracing ? saveTrace(tmpTrace, name) : "no trace (PERF_TRACE=0)";
const file = saveReadout(tracing ? `${name}.traced` : name, {
  page: "/dev/components/canvas-perf",
  baseUrl,
  viewport: "1440x900",
  tracing,
  mountAll,
  reducedMotion,
  scenario: "4 drag pans of 60 pointer moves each, then 12 wheel zoom steps",
  ...readout,
  ...state,
  measuredAt: new Date().toISOString(),
  userAgent: await page.evaluate(() => navigator.userAgent),
});
console.log(JSON.stringify(readout), "\n", file, "\n", trace);
await browser.close();
