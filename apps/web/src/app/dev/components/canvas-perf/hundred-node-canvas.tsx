"use client";

import { useMemo, useSyncExternalStore } from "react";

import { CanvasFlow } from "@lumen/ui";
import { hundredNodeScene } from "@lumen/ui/fixtures";

function subscribe() {
  // The query string does not change while the page is open.
  return () => undefined;
}

function readMountAll() {
  return new URLSearchParams(window.location.search).get("mount") === "all";
}

/**
 * Built in the browser so the 100-node scene is not serialized into the page
 * payload. `?mount=all` mounts every node instead of only those in view, so
 * the performance script can compare both strategies.
 */
export function HundredNodeCanvas() {
  const scene = useMemo(() => hundredNodeScene(), []);
  const mountAll = useSyncExternalStore(subscribe, readMountAll, () => false);
  return (
    <CanvasFlow
      key={mountAll ? "all" : "visible"}
      nodes={scene.nodes}
      edges={scene.edges}
      height={640}
      label="Project canvas, 100 services"
      onlyRenderVisible={!mountAll}
    />
  );
}
