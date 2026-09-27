import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no canvas, so uPlot is replaced by a recorder. Chart tests assert
// on what <Chart> derives (summary, legend, keyboard) and on the options it
// hands to uPlot, never on pixels.
vi.mock("uplot", () => {
  class FakePlot {
    static instances: FakePlot[] = [];
    readonly over: HTMLDivElement;
    readonly cursor: { idx: number | null; left: number } = { idx: null, left: -10 };
    readonly setCursorCalls: { left: number; top: number }[] = [];
    readonly setSeriesCalls: [number | null, { show?: boolean; focus?: boolean }][] = [];
    constructor(
      readonly options: unknown,
      readonly data: unknown,
      target: HTMLElement,
    ) {
      this.over = document.createElement("div");
      target.append(this.over);
      FakePlot.instances.push(this);
    }
    valToPos(value: number): number {
      return value % 1000;
    }
    setCursor(opts: { left: number; top: number }): void {
      this.setCursorCalls.push(opts);
    }
    setSeries(index: number | null, opts: { show?: boolean; focus?: boolean }): void {
      this.setSeriesCalls.push([index, opts]);
    }
    setSize(): void {
      // no layout in jsdom
    }
    destroy(): void {
      this.over.remove();
    }
  }
  return { default: FakePlot };
});

// Testing Library only auto-cleans with Vitest globals on; do it explicitly.
afterEach(() => {
  cleanup();
});

// jsdom does not implement these browser APIs; Radix and cmdk call them.
class ResizeObserverStub {
  observe(): void {
    // no layout in jsdom
  }
  unobserve(): void {
    // no layout in jsdom
  }
  disconnect(): void {
    // no layout in jsdom
  }
}
if (typeof Element !== "undefined") {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals["ResizeObserver"] ??= ResizeObserverStub;
  // No media queries in jsdom: every query reports "no match" (wide screen, motion allowed).
  globals["matchMedia"] ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const missing: Record<string, () => unknown> = {
    scrollIntoView: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  };
  for (const [name, fn] of Object.entries(missing)) {
    if (typeof proto[name] !== "function") {
      proto[name] = fn;
    }
  }
}
