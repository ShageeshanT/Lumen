// Shared helpers for the gallery performance scripts: an in-page frame
// recorder (requestAnimationFrame timestamps) and a Chrome trace written
// gzipped next to the readout.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

export const root = resolve(import.meta.dirname, "../..");
export const outDir = resolve(root, "docs/evidence/phase-01/perf");
mkdirSync(outDir, { recursive: true });

export const baseUrl =
  process.env.PERF_BASE_URL ?? `http://localhost:${process.env.E2E_WEB_PORT ?? "3000"}`;

/** Starts recording frame timestamps in the page. */
export async function startFrames(page) {
  await page.evaluate(() => {
    const state = { frames: [], running: true };
    window.__lumenFrames = state;
    const tick = (time) => {
      state.frames.push(time);
      if (state.running) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Stops recording and summarises: fps, frame-time percentiles, long frames. */
export async function stopFrames(page) {
  const frames = await page.evaluate(() => {
    window.__lumenFrames.running = false;
    return window.__lumenFrames.frames;
  });
  const deltas = frames.slice(1).map((time, index) => time - frames[index]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const total = frames.at(-1) - frames[0];
  const round = (value) => Math.round(value * 100) / 100;
  return {
    frames: deltas.length,
    durationMs: round(total),
    averageFps: round((deltas.length / total) * 1000),
    medianFrameMs: round(pick(0.5)),
    p95FrameMs: round(pick(0.95)),
    p99FrameMs: round(pick(0.99)),
    maxFrameMs: round(sorted.at(-1) ?? 0),
    // A frame over 1.5 × 16.7 ms means at least one refresh was missed at 60 Hz.
    droppedFrames: deltas.filter((delta) => delta > 25).length,
  };
}

/** Writes a gzipped Chrome trace captured by browser.startTracing. */
export function saveTrace(tmpPath, name) {
  const target = resolve(outDir, `${name}.trace.json.gz`);
  writeFileSync(target, gzipSync(readFileSync(tmpPath)));
  rmSync(tmpPath);
  return target;
}

export function saveReadout(name, readout) {
  const target = resolve(outDir, `${name}.json`);
  writeFileSync(target, `${JSON.stringify(readout, null, 2)}\n`);
  return target;
}
