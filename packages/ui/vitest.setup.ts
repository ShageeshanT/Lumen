import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const missing: Record<string, () => unknown> = {
    scrollIntoView: () => undefined,
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  };
  for (const [name, fn] of Object.entries(missing)) {
    if (typeof proto[name] !== "function") {
      proto[name] = fn;
    }
  }
}
