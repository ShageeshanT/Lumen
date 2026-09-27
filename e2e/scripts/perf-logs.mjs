// Log viewer budget (Phase 1 §5 Performance): 50,000 lines at 60 fps while
// scrolling, with five new lines a second streaming in. Scrolls the list for
// five seconds (steady 60 px per frame, then large jumps), records every
// animation frame and a Chrome trace, and writes
// docs/evidence/phase-01/perf/logs-50000.{json,trace.json.gz,png}.
//
// Usage, with the web app running (dev or `next start` with
// LUMEN_ENABLE_GALLERY=true):
//   E2E_WEB_PORT=3203 node e2e/scripts/perf-logs.mjs
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

import { baseUrl, outDir, saveReadout, saveTrace, startFrames, stopFrames } from "./perf-lib.mjs";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto(`${baseUrl}/dev/components/logs-perf`, {
  waitUntil: "networkidle",
  timeout: 180_000,
});
await page.evaluate(() => document.fonts.ready);
const list = page.getByRole("list", { name: "Live logs" });
await list.waitFor();
await page.waitForTimeout(1000);

const tmpTrace = resolve(outDir, "logs-50000.trace.tmp.json");
const tracing = process.env.PERF_TRACE !== "0";
if (tracing) {
  await browser.startTracing(page, { path: tmpTrace, screenshots: false });
}
await startFrames(page);
await list.evaluate(async (element) => {
  const frame = () => new Promise((done) => requestAnimationFrame(done));
  // Steady reading scroll upward from the live end: 60 px a frame for ~3 s.
  for (let i = 0; i < 180; i += 1) {
    element.scrollTop -= 60;
    await frame();
  }
});
const steady = await stopFrames(page);
await startFrames(page);
await list.evaluate(async (element) => {
  const frame = () => new Promise((done) => requestAnimationFrame(done));
  // Large jumps: the scrollbar dragged across the whole backlog.
  for (let i = 0; i < 60; i += 1) {
    element.scrollTop = ((element.scrollHeight - element.clientHeight) * ((i * 37) % 60)) / 60;
    await frame();
  }
});
const jumps = await stopFrames(page);
const readout = { steadyScroll: steady, jumps };
if (tracing) {
  await browser.stopTracing();
}

const state = await page.evaluate(() => ({
  renderedRows: document.querySelectorAll('[aria-label="Live logs"] [role="listitem"]').length,
  lines: Number(document.querySelector("[data-line-count]")?.getAttribute("data-line-count")),
  jumpToLiveVisible: document.querySelector("[data-jump-to-live]") !== null,
}));
await page.getByRole("button", { name: "Jump to live" }).click();
await page.waitForTimeout(300);
const afterJump = await list.evaluate((element) => ({
  following: element.closest("[data-following]")?.getAttribute("data-following"),
  distanceFromBottom: Math.round(element.scrollHeight - element.scrollTop - element.clientHeight),
}));

await page.screenshot({ path: resolve(outDir, "logs-50000.png") });
const trace = tracing ? saveTrace(tmpTrace, "logs-50000") : "no trace (PERF_TRACE=0)";
const file = saveReadout(tracing ? "logs-50000.traced" : "logs-50000", {
  page: "/dev/components/logs-perf",
  baseUrl,
  viewport: "1440x900",
  tracing,
  scenario: "180 frames at 60 px/frame, then 60 random jumps; 5 lines/s streaming in",
  ...readout,
  ...state,
  afterJumpToLive: afterJump,
  measuredAt: new Date().toISOString(),
  userAgent: await page.evaluate(() => navigator.userAgent),
});
console.log(JSON.stringify(readout), "\n", file, "\n", trace);
await browser.close();
