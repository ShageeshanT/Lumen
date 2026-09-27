"use client";

import { useCallback, useSyncExternalStore } from "react";

function supported(): boolean {
  return typeof window.matchMedia === "function";
}

/**
 * True while the media query matches. The server render (and hydration) uses
 * `serverValue`, then the client value takes over, so markup never mismatches.
 * Environments without matchMedia (jsdom) keep `serverValue`.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!supported()) {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", callback);
      return () => {
        list.removeEventListener("change", callback);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (supported() ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}
