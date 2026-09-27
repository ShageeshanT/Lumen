"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Same-tab writes dispatch this so every hook reading the key re-renders. */
const LOCAL_EVENT = "lumen:storage";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be blocked (private mode, disabled cookies): behave as empty.
    return null;
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
}

/**
 * A value persisted in localStorage under `key`, shared by every component
 * reading the same key and kept in sync across tabs. The server render and the
 * first client render use `fallback`, so hydration never mismatches.
 */
export function useStoredState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string = String,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const parsed = raw === null ? undefined : parse(raw);
  const value = parsed ?? fallback;

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, serialize(next));
      } catch {
        // Not persisted when storage is unavailable; the value still applies.
      }
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key, serialize],
  );

  return [value, setValue];
}
