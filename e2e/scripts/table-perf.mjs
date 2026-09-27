// Frame-timing check for the virtualized data table (5,000 rows) and the four
// synced charts (3,600 points each) on the gallery. Expects the web app to be
// running. Writes an fps readout (JSON) and a Chrome trace to
// docs/evidence/phase-01/perf/. Usage (from the repository root):
//   node e2e/scripts/table-perf.mjs [baseUrl] [label]
//   node e2e/scripts/table-perf.mjs http://localhost:3202 dev
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const [baseUrl = "http://localhost:3000", label = "dev"] = process.argv.slice(2);
const root = resolve(import.meta.dirname, "../..");
const outDir = resolve(root, "docs/evidence/phase-01/perf");
mkdirSync(outDir, { recursive: true });

/** Summarises rAF timestamps collected in the page. */
function summarise(stamps) {
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = stamps.at(-1) - stamps[0];
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    frames: deltas.length,
    durationMs: Math.round(total),
    averageFps: Math.round((deltas.length / total) * 1000 * 10) / 10,
    medianFrameMs: Math.round(pick(0.5) * 100) / 100,
    p95FrameMs: Math.round(pick(0.95) * 100) / 100,
    maxFrameMs: Math.round(sorted.at(-1) * 100) / 100,
    // A frame longer than 1.5 vsync intervals (25 ms) is a visible hitch.
    longFrames: deltas.filter((d) => d > 25).length,
  };
}

const browser = await chromium.launch({ args: ["--disable-gpu-vsync=false"] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

// --- Data table: scroll 5,000 rows top to bottom over about four seconds. ---
await page.goto(`${baseUrl}/dev/components/data-table`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const table = page.getByRole("table", { name: "Audit log" });
await table.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

await browser.startTracing(page, {
  path: resolve(outDir, `table-5000-${label}.trace.json`),
  categories: ["devtools.timeline", "disabled-by-default-devtools.timeline.frame"],
});
const tableStamps = await table.evaluate(async (element) => {
  const scroller = element.parentElement;
  const stamps = [];
  const step = 40; // px per frame: 2,400 px/s, a fast flick
  await new Promise((done) => {
    const tick = (t) => {
      stamps.push(t);
      scroller.scrollTop += step;
      if (
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 ||
        stamps.length > 240
      ) {
        done();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { stamps, domRows: element.querySelectorAll("tbody tr[data-row-index]").length };
});
await browser.stopTracing();
const tableResult = {
  what: "DataTable, 5,000 rows, dense, virtualized; scrolled 40 px per frame",
  build: label,
  domRowsAfterScroll: tableStamps.domRows,
  ...summarise(tableStamps.stamps),
};
writeFileSync(
  resolve(outDir, `table-5000-${label}.json`),
  `${JSON.stringify(tableResult, null, 2)}\n`,
);
console.log(JSON.stringify(tableResult));

// --- Charts: sweep the pointer across four synced charts (3,600 points each). ---
await page.goto(`${baseUrl}/dev/components/chart`, { waitUntil: "networkidle" });
const first = page.getByRole("img", { name: /^CPU, last 1 hour/ }).last();
await first.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const box = await first.boundingBox();
if (box === null) {
  throw new Error("chart not visible");
}
await page.evaluate(() => {
  window.__stamps = [];
  const tick = (t) => {
    window.__stamps.push(t);
    if (window.__stamps.length < 400) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
});
const y = box.y + box.height / 2;
for (let i = 0; i <= 120; i += 1) {
  await page.mouse.move(box.x + 40 + ((box.width - 60) * i) / 120, y);
}
const chartStamps = await page.evaluate(() => window.__stamps);
const syncedCursors = await page.evaluate(
  () =>
    [...document.querySelectorAll(".u-cursor-x")].filter((el) => !el.classList.contains("u-off"))
      .length,
);
const chartResult = {
  what: "Four synced Charts, 3,600 points each; pointer swept across the first",
  build: label,
  crosshairsShown: syncedCursors,
  ...summarise(chartStamps),
};
writeFileSync(
  resolve(outDir, `chart-sync-${label}.json`),
  `${JSON.stringify(chartResult, null, 2)}\n`,
);
console.log(JSON.stringify(chartResult));

await browser.close();
