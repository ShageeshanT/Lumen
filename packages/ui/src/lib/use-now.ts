"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared clock for relative times ("checked 12s ago"). Every subscriber
 * reads the same value, which moves once a second while anything listens,
 * so a screen full of timestamps re-renders together and never drifts apart.
 */
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (timer === undefined) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const listener of listeners) {
        listener();
      }
    }, 1000);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function snapshot(): number {
  return current;
}

/** The current time in ms, ticking once a second. Pass `fixed` to pin it (gallery, tests). */
export function useNow(fixed?: Date | number): number {
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (fixed === undefined) {
    return now;
  }
  return typeof fixed === "number" ? fixed : fixed.getTime();
}
