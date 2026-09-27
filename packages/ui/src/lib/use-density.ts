"use client";

import { useSyncExternalStore } from "react";

export type Density = "comfortable" | "compact";

/** Where the preference is stored; the account setting (Phase 15) writes the same key. */
export const DENSITY_STORAGE_KEY = "lumen.density";

function readDensity(): Density {
  return document.documentElement.dataset["density"] === "compact" ? "compact" : "comfortable";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-density"],
  });
  return () => {
    observer.disconnect();
  };
}

/**
 * The global density preference, read live from `data-density` on `<html>`.
 * Tables, list rows and menu items follow it; CSS-only components use the
 * `density-compact:` variant instead. Comfortable on the server.
 */
export function useDensity(): Density {
  return useSyncExternalStore(subscribe, readDensity, () => "comfortable");
}

/** Applies and persists a density choice. */
export function setDensity(density: Density): void {
  if (density === "compact") {
    document.documentElement.dataset["density"] = "compact";
  } else {
    delete document.documentElement.dataset["density"];
  }
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Blocked storage: the choice still applies to this page.
  }
}
